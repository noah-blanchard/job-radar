import { pino } from "pino";
import { describe, expect, it } from "vitest";
import {
  backoffDelay,
  HttpShared,
  memoryValidatorStore,
  parseRetryAfter,
  PoliteHttpClient,
  type RawRequest,
  type RawResponse,
} from "../src/http/client";
import { HttpError } from "../src/http/types";

const log = pino({ level: "silent" });

function fakeTransport(responses: Array<RawResponse | Error>) {
  const calls: RawRequest[] = [];
  return {
    calls,
    transport: async (req: RawRequest) => {
      calls.push(req);
      const next = responses.shift();
      if (!next) throw new Error("no more responses");
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

const ok = (body: unknown, headers: Record<string, string> = {}): RawResponse => ({
  status: 200,
  headers,
  body: JSON.stringify(body),
});

function setup(
  responses: Array<RawResponse | Error>,
  extra: Partial<ConstructorParameters<typeof HttpShared>[0]> = {},
) {
  const t = fakeTransport(responses);
  const sleeps: number[] = [];
  const validators = memoryValidatorStore();
  const shared = new HttpShared({
    userAgent: "JobRadar/1.0 (+contact: test@example.com)",
    log,
    transport: t.transport,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
    validators,
    ...extra,
  });
  return { ...t, sleeps, validators, client: new PoliteHttpClient(shared) };
}

describe("PoliteHttpClient", () => {
  it("sends the JobRadar user agent and parses JSON", async () => {
    const { client, calls } = setup([ok({ a: 1 })]);
    const res = await client.json<{ a: number }>("https://x.test/a");
    expect(res.notModified).toBe(false);
    expect(!res.notModified && res.data.a).toBe(1);
    expect(calls[0]!.headers["user-agent"]).toBe("JobRadar/1.0 (+contact: test@example.com)");
  });

  it("retries 5xx and 429 with backoff, then succeeds", async () => {
    const { client, calls, sleeps } = setup([
      { status: 503, headers: {}, body: "" },
      { status: 429, headers: {}, body: "" },
      ok({ ok: true }),
    ]);
    await client.json("https://x.test/a");
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([
      backoffDelay(0, 500, 30_000, () => 0.5),
      backoffDelay(1, 500, 30_000, () => 0.5),
    ]);
  });

  it("honours Retry-After", async () => {
    const { client, sleeps } = setup([
      { status: 429, headers: { "retry-after": "7" }, body: "" },
      ok({}),
    ]);
    await client.json("https://x.test/a");
    expect(sleeps).toEqual([7000]);
  });

  it("gives up when Retry-After is too long", async () => {
    const { client } = setup([{ status: 429, headers: { "retry-after": "3600" }, body: "" }]);
    await expect(client.json("https://x.test/a")).rejects.toThrow(/Retry-After too long/);
  });

  it("does not retry 4xx", async () => {
    const { client, calls } = setup([{ status: 404, headers: {}, body: "" }]);
    await expect(client.json("https://x.test/a")).rejects.toBeInstanceOf(HttpError);
    expect(calls).toHaveLength(1);
  });

  it("retries network errors and fails after maxRetries", async () => {
    const err = new Error("ECONNRESET");
    const { client, calls } = setup([err, err, err], { maxRetries: 2 });
    await expect(client.json("https://x.test/a")).rejects.toThrow("ECONNRESET");
    expect(calls).toHaveLength(3);
  });

  it("stages validators and only persists them on commit", async () => {
    const { client, validators, calls } = setup([
      ok({ v: 1 }, { etag: '"abc"' }),
      { status: 304, headers: {}, body: "" },
    ]);
    await client.json("https://x.test/a", { cacheKey: "k" });
    expect(validators.data.size).toBe(0);
    await client.commitValidators();
    expect(validators.data.get("k")).toEqual({ etag: '"abc"', lastModified: undefined });

    const res = await client.json("https://x.test/a", { cacheKey: "k" });
    expect(calls[1]!.headers["if-none-match"]).toBe('"abc"');
    expect(res.notModified).toBe(true);
  });

  it("paces requests per host", async () => {
    const { client, sleeps } = setup([ok({}), ok({}), ok({})], {
      minIntervalMs: (h) => (h === "slow.test" ? 1000 : 0),
    });
    await client.json("https://slow.test/a");
    await client.json("https://slow.test/b");
    await client.json("https://fast.test/c");
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBeGreaterThan(900);
  });

  it("serializes POST bodies as JSON", async () => {
    const { client, calls } = setup([ok({})]);
    await client.json("https://x.test/a", { method: "POST", body: { limit: 20 } });
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.body).toBe('{"limit":20}');
    expect(calls[0]!.headers["content-type"]).toBe("application/json");
  });
});

describe("helpers", () => {
  it("parseRetryAfter handles seconds and dates", () => {
    expect(parseRetryAfter("5")).toBe(5000);
    expect(
      parseRetryAfter("Wed, 21 Oct 2015 07:28:10 GMT", Date.parse("Wed, 21 Oct 2015 07:28:00 GMT")),
    ).toBe(10_000);
    expect(parseRetryAfter(undefined)).toBeUndefined();
  });
  it("backoffDelay grows and is capped", () => {
    expect(backoffDelay(0, 500, 30_000, () => 0)).toBe(250);
    expect(backoffDelay(3, 500, 30_000, () => 1)).toBe(4000);
    expect(backoffDelay(20, 500, 30_000, () => 1)).toBe(30_000);
  });
});

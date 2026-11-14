import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { buildHealthReport, createHealthHandler, type HealthDeps } from "../src/health";

const T0 = new Date("2026-11-13T12:00:00Z");

function deps(over: Partial<HealthDeps> = {}): HealthDeps {
  return {
    startedAt: T0,
    now: () => new Date(T0.getTime() + 60_000),
    getLastTick: () => new Date(T0.getTime() + 30_000),
    pingDb: async () => {},
    getFailingSources: async () => [],
    ...over,
  };
}

describe("buildHealthReport", () => {
  it("is ok with a fresh tick and a reachable db", async () => {
    const r = await buildHealthReport(deps());
    expect(r.ok).toBe(true);
    expect(r.db).toBe("ok");
    expect(r.lastTick).toBe("2026-11-13T12:00:30.000Z");
  });

  it("is not ok when the db is down", async () => {
    const r = await buildHealthReport(
      deps({
        pingDb: async () => {
          throw new Error("ECONNREFUSED");
        },
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.db).toBe("error");
    expect(r.error).toBe("ECONNREFUSED");
  });

  it("is not ok when the last tick is stale", async () => {
    const r = await buildHealthReport(deps({ now: () => new Date(T0.getTime() + 10 * 60_000) }));
    expect(r.ok).toBe(false);
  });

  it("is ok right after start, before the first tick", async () => {
    const r = await buildHealthReport(deps({ getLastTick: () => undefined }));
    expect(r.ok).toBe(true);
    expect(r.lastTick).toBeNull();
  });

  it("lists failing sources without failing the check", async () => {
    const r = await buildHealthReport(deps({ getFailingSources: async () => ["lever"] }));
    expect(r.ok).toBe(true);
    expect(r.failingSources).toEqual(["lever"]);
  });
});

describe("createHealthHandler", () => {
  let server: Server | undefined;
  afterEach(() => server?.close());

  async function start(d: HealthDeps): Promise<string> {
    server = createServer(createHealthHandler(d));
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  it("serves 200 JSON on /healthz", async () => {
    const base = await start(deps());
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  });

  it("serves 503 when unhealthy", async () => {
    const base = await start(
      deps({
        pingDb: async () => {
          throw new Error("down");
        },
      }),
    );
    expect((await fetch(`${base}/healthz`)).status).toBe(503);
  });

  it("404s other paths", async () => {
    const base = await start(deps());
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });
});

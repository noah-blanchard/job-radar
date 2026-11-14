import { companies, eq, jobs, jobSources, sourceRuns, type AnyDb } from "@jobradar/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Connector, RawJob } from "../src/connectors/types";
import { greenhouse } from "../src/connectors/greenhouse";
import { HttpShared, memoryValidatorStore, type RawResponse } from "../src/http/client";
import { ingestJob } from "../src/pipeline/ingest";
import { dbQuota, torontoDay } from "../src/pipeline/quota";
import { runSource } from "../src/pipeline/run";
import { fixture, silentLog, testDb } from "./helpers";

let db: AnyDb;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ db, close } = await testDb());
});
afterEach(async () => {
  await close();
});

/** Connector yielding a mutable list of jobs (or throwing / reporting 304). */
function scripted() {
  const state: { jobs: RawJob[]; fail?: string; unchanged?: boolean } = { jobs: [] };
  const connector: Connector = {
    id: "fake",
    kind: "ats",
    needsCompany: true,
    async *fetch(ctx) {
      if (state.fail) throw new Error(state.fail);
      if (state.unchanged) return ctx.markUnchanged();
      yield* state.jobs;
    },
  };
  return { state, connector };
}

const raw = (id: string, title: string, over: Partial<RawJob> = {}): RawJob => ({
  source: "fake",
  sourceJobId: id,
  companyName: "Acme",
  title,
  url: `https://jobs.example.com/acme/${id}`,
  locationRaw: "Montréal, QC",
  ...over,
});

async function seedCompany(name = "Acme") {
  const [c] = await db
    .insert(companies)
    .values({ name, nameKey: name.toLowerCase(), ats: "fake", atsKey: "acme" })
    .returning();
  return {
    id: c!.id,
    name: c!.name,
    ats: c!.ats,
    atsKey: c!.atsKey,
    careersUrl: null,
    priority: "normal" as const,
  };
}

function deps(clock: { t: number }) {
  return {
    db,
    log: silentLog,
    http: new HttpShared({
      userAgent: "test",
      log: silentLog,
      transport: async () => ({ status: 500, headers: {}, body: "" }),
    }),
    now: () => new Date(clock.t),
  };
}

describe("runSource", () => {
  it("inserts jobs, records the run, and never duplicates on re-run", async () => {
    const company = await seedCompany();
    const { state, connector } = scripted();
    state.jobs = [
      raw("1", "Software Engineer, New Grad"),
      raw("2", "Data Engineer I", { locationRaw: "Toronto, ON" }),
    ];
    const clock = { t: Date.parse("2026-11-13T12:00:00Z") };

    const r1 = await runSource(deps(clock), connector, company);
    expect(r1).toMatchObject({ status: "ok", fetched: 2, nbNew: 2 });
    clock.t += 6 * 3600_000;
    const r2 = await runSource(deps(clock), connector, company);
    expect(r2).toMatchObject({ status: "ok", fetched: 2, nbNew: 0 });

    const all = await db.select().from(jobs);
    expect(all).toHaveLength(2);
    expect(all.find((j) => j.sourceJobId === "1")).toMatchObject({
      city: "Montréal",
      region: "QC",
      country: "CA",
    });
    expect((await db.select().from(jobSources)).length).toBe(2);
    const runs = await db.select().from(sourceRuns);
    expect(runs.map((r) => r.status)).toEqual(["ok", "ok"]);
    expect(runs[0]).toMatchObject({ nbFetched: 2, nbNew: 2, companyId: company.id });
    const [c] = await db.select().from(companies);
    expect(c).toMatchObject({ atsStatus: "ok", consecutiveFailures: 0 });
  });

  it("closes a job after 2 complete runs without it, and reopens it if it comes back", async () => {
    const company = await seedCompany();
    const { state, connector } = scripted();
    const clock = { t: Date.parse("2026-11-13T00:00:00Z") };
    state.jobs = [raw("1", "Backend Developer"), raw("2", "Frontend Developer")];
    await runSource(deps(clock), connector, company);

    state.jobs = [raw("1", "Backend Developer")];
    clock.t += 3600_000;
    expect((await runSource(deps(clock), connector, company)).closed).toBe(0);
    let [gone] = await db.select().from(jobs).where(eq(jobs.sourceJobId, "2"));
    expect(gone).toMatchObject({ missedRuns: 1, closedAt: null });

    clock.t += 3600_000;
    expect((await runSource(deps(clock), connector, company)).closed).toBe(1);
    [gone] = await db.select().from(jobs).where(eq(jobs.sourceJobId, "2"));
    expect(gone!.closedAt).toEqual(new Date(clock.t));

    state.jobs = [raw("1", "Backend Developer"), raw("2", "Frontend Developer")];
    clock.t += 3600_000;
    await runSource(deps(clock), connector, company);
    [gone] = await db.select().from(jobs).where(eq(jobs.sourceJobId, "2"));
    expect(gone).toMatchObject({ closedAt: null, missedRuns: 0 });
  });

  it("does not close anything on a failed run", async () => {
    const company = await seedCompany();
    const { state, connector } = scripted();
    const clock = { t: Date.parse("2026-11-13T00:00:00Z") };
    state.jobs = [raw("1", "Backend Developer")];
    await runSource(deps(clock), connector, company);
    state.fail = "boom";
    for (let i = 0; i < 3; i++) {
      clock.t += 3600_000;
      await runSource(deps(clock), connector, company);
    }
    const [j] = await db.select().from(jobs);
    expect(j).toMatchObject({ closedAt: null, missedRuns: 0 });
  });

  it("treats 304 as 'everything still open'", async () => {
    const company = await seedCompany();
    const { state, connector } = scripted();
    const clock = { t: Date.parse("2026-11-13T00:00:00Z") };
    state.jobs = [raw("1", "Backend Developer")];
    await runSource(deps(clock), connector, company);
    state.unchanged = true;
    for (let i = 0; i < 3; i++) {
      clock.t += 3600_000;
      expect((await runSource(deps(clock), connector, company)).unchanged).toBe(true);
    }
    const [j] = await db.select().from(jobs);
    expect(j).toMatchObject({ closedAt: null, missedRuns: 0, lastSeenAt: new Date(clock.t) });
  });

  it("marks the company broken after 3 consecutive failures, and recovers", async () => {
    const company = await seedCompany();
    const { state, connector } = scripted();
    const clock = { t: Date.parse("2026-11-13T00:00:00Z") };
    state.fail = "HTTP 521";
    const results = [];
    for (let i = 0; i < 3; i++) results.push(await runSource(deps(clock), connector, company));
    expect(results.map((r) => r.becameBroken)).toEqual([false, false, true]);
    let [c] = await db.select().from(companies);
    expect(c).toMatchObject({ atsStatus: "broken", consecutiveFailures: 3 });
    const runs = await db.select().from(sourceRuns);
    expect(runs.every((r) => r.status === "error" && r.error === "HTTP 521")).toBe(true);

    state.fail = undefined;
    await runSource(deps(clock), connector, company);
    [c] = await db.select().from(companies);
    expect(c).toMatchObject({ atsStatus: "ok", consecutiveFailures: 0 });
  });

  it("runs the real greenhouse connector end-to-end on its fixture, with ETag handling", async () => {
    const company = { ...(await seedCompany("Stripe")), atsKey: "stripe" };
    const data = fixture("greenhouse/stripe.jobs.json");
    const responses: RawResponse[] = [
      { status: 200, headers: { etag: '"v1"' }, body: JSON.stringify(data) },
      { status: 304, headers: {}, body: "" },
    ];
    const seen: Array<Record<string, string>> = [];
    const validators = memoryValidatorStore();
    const http = new HttpShared({
      userAgent: "test",
      log: silentLog,
      validators,
      transport: async (req) => {
        seen.push(req.headers);
        return responses.shift()!;
      },
    });
    const clock = { t: Date.parse("2026-11-13T00:00:00Z") };
    const r1 = await runSource(
      { db, http, log: silentLog, now: () => new Date(clock.t) },
      greenhouse,
      company,
    );
    // The fixture has two "Abuse Investigator" postings in Dublin (distinct req ids): same
    // company+title+city fingerprint, so they merge into one job with two job_sources.
    expect(r1).toMatchObject({ status: "ok", fetched: 3, nbNew: 2 });
    expect(await db.select().from(jobSources)).toHaveLength(3);
    expect(validators.data.get("greenhouse:stripe")?.etag).toBe('"v1"');

    clock.t += 6 * 3600_000;
    const r2 = await runSource(
      { db, http, log: silentLog, now: () => new Date(clock.t) },
      greenhouse,
      company,
    );
    expect(seen[1]!["if-none-match"]).toBe('"v1"');
    expect(r2).toMatchObject({ status: "ok", unchanged: true, fetched: 0 });
    const rows = await db.select().from(jobs);
    expect(rows).toHaveLength(2);
    expect(rows.every((j) => j.descriptionText && j.descriptionText.length > 100)).toBe(true);
    expect(rows.every((j) => j.lang === "en")).toBe(true);
  });
});

describe("ingestJob dedup", () => {
  it("merges the same offer seen on two sources into one job", async () => {
    const t = new Date("2026-11-13T00:00:00Z");
    const a = await ingestJob(db, raw("1", "Software Engineer, New Grad"), null, t);
    const b = await ingestJob(
      db,
      raw("gh-99", "software engineer - new grad", {
        source: "other",
        companyName: "Acme Inc.",
        url: "https://elsewhere.example/x",
        locationRaw: "Montreal, Quebec, Canada",
      }),
      null,
      t,
    );
    expect(b).toEqual({ jobId: a.jobId, isNew: false });
    expect(await db.select().from(jobs)).toHaveLength(1);
    expect(await db.select().from(jobSources)).toHaveLength(2);
  });

  it("matches on canonical URL when the fingerprint differs", async () => {
    const t = new Date("2026-11-13T00:00:00Z");
    const a = await ingestJob(
      db,
      raw("1", "SWE New Grad", { url: "https://jobs.example.com/acme/1?utm_source=x" }),
      null,
      t,
    );
    const b = await ingestJob(
      db,
      raw("x", "Software Engineer (New Grad)", {
        source: "other",
        url: "https://www.jobs.example.com/acme/1/",
      }),
      null,
      t,
    );
    expect(b.jobId).toBe(a.jobId);
  });

  it("keeps distinct cities as distinct jobs", async () => {
    const t = new Date("2026-11-13T00:00:00Z");
    await ingestJob(db, raw("1", "Software Engineer"), null, t);
    await ingestJob(db, raw("2", "Software Engineer", { locationRaw: "Toronto, ON" }), null, t);
    expect(await db.select().from(jobs)).toHaveLength(2);
  });
});

describe("dbQuota", () => {
  it("never exceeds the daily maximum, and resets the next day", async () => {
    let now = new Date("2026-11-13T15:00:00Z");
    const q = dbQuota(db, "jsearch", 3, () => now);
    const taken = await Promise.all(Array.from({ length: 5 }, () => q.take()));
    expect(taken.filter(Boolean)).toHaveLength(3);
    expect(await q.remaining()).toBe(0);
    expect(await q.take()).toBe(false);

    now = new Date("2026-11-14T15:00:00Z");
    expect(await q.remaining()).toBe(3);
    expect(await q.take()).toBe(true);
  });

  it("uses the Toronto calendar day", () => {
    // 03:00 UTC on the 14th is still the 13th in Toronto.
    expect(torontoDay(new Date("2026-11-14T03:00:00Z"))).toBe("2026-11-13");
  });

  it("refuses everything with a zero quota", async () => {
    expect(await dbQuota(db, "x", 0).take()).toBe(false);
  });
});

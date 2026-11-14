import { apiUsage, companies, eq, jobs, jobSources, type AnyDb } from "@jobradar/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adzuna } from "../src/connectors/adzuna";
import { githubSimplifyNewgrad } from "../src/connectors/github";
import { jsearch } from "../src/connectors/jsearch";
import type { Connector, RawJob } from "../src/connectors/types";
import { HttpShared, type RawResponse, type Transport } from "../src/http/client";
import { dbQuota } from "../src/pipeline/quota";
import { runSource } from "../src/pipeline/run";
import { fixture, profile, silentLog, testDb, testEnv } from "./helpers";

let db: AnyDb;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ db, close } = await testDb());
});
afterEach(async () => {
  await close();
});

/** Transport answering every request with `body`, counting calls. */
function countingTransport(body: unknown) {
  const calls: string[] = [];
  const transport: Transport = async (req): Promise<RawResponse> => {
    calls.push(req.url);
    return { status: 200, headers: {}, body: JSON.stringify(body) };
  };
  return { calls, transport };
}

function deps(transport: Transport, over: { secrets?: string[] } = {}) {
  return {
    db,
    log: silentLog,
    http: new HttpShared({
      userAgent: "test",
      log: silentLog,
      transport,
      sleep: async () => {},
      secrets: over.secrets,
    }),
    env: testEnv(),
    profile,
  };
}

describe("discovery during runs", () => {
  it("registers boards found in SimplifyJobs URLs and links the jobs to them", async () => {
    const { transport } = countingTransport(fixture("github/simplify.listings.json"));
    const r = await runSource(deps(transport), githubSimplifyNewgrad);
    expect(r.status).toBe("ok");
    // greenhouse, ashby, workday, lever, workable, oracle_rc boards in the fixture.
    expect(r.discovered).toBe(6);

    const rows = await db.select().from(companies).orderBy(companies.id);
    expect(rows.map((c) => [c.ats, c.atsKey, c.origin])).toEqual([
      ["greenhouse", "genevatrading", "discovered"],
      ["ashby", "uncountable", "discovered"],
      ["workday", "caci/wd1/external", "discovered"],
      ["lever", "ivo", "discovered"],
      ["workable", "tickpick", "discovered"],
      ["oracle_rc", "eedu.fa.em3.oraclecloud.com/CX_1003", "discovered"],
    ]);
    const linked = await db.select({ c: jobs.companyId }).from(jobs);
    expect(linked.every((j) => j.c !== null)).toBe(true);

    // Second run: nothing new, no duplicate company.
    const again = await runSource(deps(transport), githubSimplifyNewgrad);
    expect(again.discovered).toBe(0);
    expect(again.nbNew).toBe(0);
    expect(await db.select().from(companies)).toHaveLength(6);
  });

  it("fills the ATS of a known company that had none (seed target)", async () => {
    await db.insert(companies).values({ name: "Geneva Trading", nameKey: "geneva trading" });
    const { transport } = countingTransport(fixture("github/simplify.listings.json"));
    await runSource(deps(transport), githubSimplifyNewgrad);
    const [c] = await db.select().from(companies).where(eq(companies.nameKey, "geneva trading"));
    expect(c).toMatchObject({ ats: "greenhouse", atsKey: "genevatrading", origin: "seed" });
    expect(await db.select().from(companies)).toHaveLength(6);
  });

  it("finds boards in relatedUrls (e.g. HN comment links)", async () => {
    const connector: Connector = {
      id: "feedx",
      kind: "feed",
      needsCompany: false,
      async *fetch() {
        yield {
          source: "feedx",
          sourceJobId: "1",
          companyName: "Acme Audio",
          title: "Audio Software Engineer",
          url: "https://news.ycombinator.com/item?id=1",
          relatedUrls: ["https://jobs.ashbyhq.com/acmeaudio", "https://example.com/careers"],
        };
      },
    };
    const r = await runSource(deps(countingTransport({}).transport), connector);
    expect(r.discovered).toBe(1);
    const [c] = await db.select().from(companies);
    expect(c).toMatchObject({ name: "Acme Audio", ats: "ashby", atsKey: "acmeaudio" });
    // The job is attached to the company by name.
    const [j] = await db.select().from(jobs);
    expect(j!.companyId).toBe(c!.id);
  });
});

describe("aggregators never undo an ATS closure", () => {
  it("a sighting from a feed does not reopen a closed job", async () => {
    const raw: RawJob = {
      source: "ats1",
      sourceJobId: "a",
      companyName: "Acme",
      title: "Software Engineer",
      url: "https://jobs.example.com/a",
      locationRaw: "Toronto, ON",
    };
    const ats: Connector = {
      id: "ats1",
      kind: "ats",
      needsCompany: false,
      fetch: async function* () {
        yield raw;
      },
    };
    const t = countingTransport({}).transport;
    await runSource(deps(t), ats);
    await db.update(jobs).set({ closedAt: new Date("2026-11-01"), missedRuns: 2 });

    const feed: Connector = {
      id: "feed1",
      kind: "feed",
      needsCompany: false,
      fetch: async function* () {
        yield { ...raw, source: "feed1", sourceJobId: "x", url: "https://feed.example.com/x" };
      },
    };
    await runSource(deps(t), feed);
    const [j] = await db.select().from(jobs);
    expect(j!.closedAt).not.toBeNull();
    expect(j!.missedRuns).toBe(2);
    expect(await db.select().from(jobSources)).toHaveLength(2);
  });

  it("keeps the richer description when an ATS sees a job first seen as a snippet", async () => {
    const t = countingTransport({}).transport;
    const base: RawJob = {
      source: "agg",
      sourceJobId: "1",
      companyName: "Acme",
      title: "Junior Developer",
      url: "https://agg.example.com/1",
      locationRaw: "Montreal, QC",
      descriptionText: "Short snippet…",
    };
    const agg: Connector = {
      id: "agg",
      kind: "aggregator",
      needsCompany: false,
      fetch: async function* () {
        yield base;
      },
    };
    const full = "Full description ".repeat(50);
    const ats: Connector = {
      id: "atsx",
      kind: "ats",
      needsCompany: false,
      fetch: async function* () {
        yield {
          ...base,
          source: "atsx",
          url: "https://ats.example.com/1",
          descriptionHtml: `<p>${full}</p>`,
          descriptionText: undefined,
        };
      },
    };
    await runSource(deps(t), agg);
    await runSource(deps(t), ats);
    const [j] = await db.select().from(jobs);
    expect(j!.descriptionText!.length).toBeGreaterThan(500);
    expect(j!.descriptionHtml).toContain("<p>");
  });
});

describe("quotas are never exceeded (dbQuota + real connectors)", () => {
  const now = () => new Date("2026-11-13T15:00:00Z");

  it("adzuna stops at ADZUNA_DAILY_MAX_CALLS, across runs", async () => {
    const { calls, transport } = countingTransport(fixture("adzuna/ca.search.json"));
    const quota = dbQuota(db, "adzuna", 7, now);
    const r1 = await runSource({ ...deps(transport), quota }, adzuna);
    expect(r1.status).toBe("ok");
    expect(calls).toHaveLength(7);
    // Same day: the next run makes no call at all.
    const r2 = await runSource({ ...deps(transport), quota }, adzuna);
    expect(r2.status).toBe("ok");
    expect(calls).toHaveLength(7);
    const [u] = await db.select().from(apiUsage).where(eq(apiUsage.source, "adzuna"));
    expect(u!.calls).toBe(7);
  });

  it("two concurrent runs share the quota without exceeding it", async () => {
    const { calls, transport } = countingTransport(fixture("jsearch/search-v2.json"));
    const quota = dbQuota(db, "jsearch", 3, now);
    await Promise.all([
      runSource({ ...deps(transport), quota }, jsearch),
      runSource({ ...deps(transport), quota }, jsearch),
    ]);
    expect(calls).toHaveLength(3);
    const [u] = await db.select().from(apiUsage).where(eq(apiUsage.source, "jsearch"));
    expect(u!.calls).toBe(3);
  });

  it("a zero quota makes no call", async () => {
    const { calls, transport } = countingTransport(fixture("adzuna/ca.search.json"));
    await runSource({ ...deps(transport), quota: dbQuota(db, "adzuna", 0, now) }, adzuna);
    expect(calls).toHaveLength(0);
  });
});

describe("secrets never leak into run errors", () => {
  it("masks API keys in HTTP error messages", async () => {
    const transport: Transport = async () => ({ status: 403, headers: {}, body: "" });
    const r = await runSource(
      { ...deps(transport, { secrets: ["test-key", "test-id"] }), quota: dbQuota(db, "adzuna", 1) },
      adzuna,
    );
    expect(r.status).toBe("error");
    expect(r.error).toContain("HTTP 403");
    expect(r.error).not.toContain("test-key");
    expect(r.error).not.toContain("test-id");
    expect(r.error).toContain("app_key=***");
  });
});

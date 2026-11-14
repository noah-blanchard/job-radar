import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { companies, eq, jobs, kvGet, type AnyDb } from "@jobradar/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LlmClassifier, LlmVerdict } from "../src/classify/llm";
import { createAnthropicClassifier } from "../src/classify/llm";
import { parseProfile } from "../src/config";
import type { Connector, RawJob } from "../src/connectors/types";
import { HttpShared } from "../src/http/client";
import { ingestJob } from "../src/pipeline/ingest";
import { dbQuota } from "../src/pipeline/quota";
import { runSource } from "../src/pipeline/run";
import { loadProfileFile, PROFILE_KV_KEY, type AppliedProfile } from "../src/score/profile";
import { rescoreJobs, staleFreshJobIds, syncProfileScores } from "../src/score/rescore";
import {
  compileProfile,
  profileHash,
  scoreJob,
  type NewGradInfo,
  type ScoreBreakdown,
  type ScoreInput,
} from "../src/score/score";
import { CONFIG_DIR, profile, silentLog, testDb } from "./helpers";

const NOW = new Date("2026-11-13T12:00:00Z");
const cp = compileProfile(profile);

const job = (over: Partial<ScoreInput> = {}): ScoreInput => ({
  title: "Software Engineer",
  descriptionText: null,
  companyName: "Acme",
  companyPriority: "normal",
  city: null,
  region: null,
  country: null,
  remote: "unknown",
  locationRaw: null,
  lang: null,
  salaryMin: null,
  salaryMax: null,
  firstSeenAt: new Date(NOW.getTime() - 3 * 86_400_000),
  ...over,
});
const ng = (value: boolean | null): NewGradInfo => ({
  value,
  seniority: null,
  reason: "test",
  source: "rules",
});
const part = (b: ScoreBreakdown, key: string) => b.parts.find((p) => p.key === key)?.points;

describe("scoreJob (config/profile.yaml)", () => {
  it("gives the weight of the first matching location rule", () => {
    const mtl = scoreJob(job({ city: "Montréal", country: "CA" }), ng(null), cp, NOW);
    expect(part(mtl.breakdown, "location")).toBe(30);
    expect(mtl.breakdown.parts[0]!.detail).toBe("Montréal|Montreal");
    const tor = scoreJob(job({ city: "Toronto", country: "CA" }), ng(null), cp, NOW);
    expect(part(tor.breakdown, "location")).toBe(25);
    const van = scoreJob(job({ city: "Vancouver", country: "CA" }), ng(null), cp, NOW);
    expect(part(van.breakdown, "location")).toBe(22);
    const us = scoreJob(job({ country: "US" }), ng(null), cp, NOW);
    expect(part(us.breakdown, "location")).toBe(10);
    const remote = scoreJob(job({ remote: "remote" }), ng(null), cp, NOW);
    expect(part(remote.breakdown, "location")).toBe(10);
    const de = scoreJob(job({ country: "DE" }), ng(null), cp, NOW);
    expect(part(de.breakdown, "location")).toBe(0);
  });

  it("counts domain keywords twice in the title and once in the description", () => {
    const r = scoreJob(
      job({
        title: "Full Stack Developer",
        descriptionText: "We use React and TypeScript. Some Kafka.",
      }),
      ng(null),
      cp,
      NOW,
    );
    // full-stack (title, x2) + react + typescript (fullstack) + kafka (data_eng) = 5 hits x 3.
    expect(part(r.breakdown, "domains")).toBe(15);
    expect(r.breakdown.domains.fullstack).toEqual([
      "full[- ]?stack (titre)",
      "react",
      "typescript",
    ]);
    // data_eng has a single description keyword: matched but not tagged.
    expect(r.domains).toEqual(["fullstack"]);
  });

  it("does not match keywords inside other words", () => {
    const r = scoreJob(
      job({ title: "Gamer Relations", descriptionText: "nodes, reactor" }),
      ng(null),
      cp,
      NOW,
    );
    expect(part(r.breakdown, "domains")).toBe(0);
    expect(r.domains).toEqual([]);
  });

  it("rewards new grad, priority, freshness, salary and the profile languages", () => {
    const r = scoreJob(
      job({
        city: "Montreal",
        country: "CA",
        companyPriority: "high",
        firstSeenAt: new Date(NOW.getTime() - 3_600_000),
        salaryMin: 80000,
        lang: "fr",
      }),
      ng(true),
      cp,
      NOW,
    );
    expect(r.breakdown.parts.map((p) => [p.key, p.points])).toEqual([
      ["location", 30],
      ["newGrad", 25],
      ["domains", 0],
      ["language", 5],
      ["priority", 10],
      ["freshness", 5],
      ["salary", 3],
    ]);
    expect(r.score).toBe(78);
  });

  it("caps jobs that are not new grad at 20", () => {
    const r = scoreJob(
      job({ city: "Montreal", country: "CA", title: "Senior React Engineer" }),
      ng(false),
      cp,
      NOW,
    );
    expect(r.breakdown.raw).toBeGreaterThan(20);
    expect(r.score).toBe(20);
    expect(r.breakdown.capped).toContain("plafonné à 20");
  });

  it("zeroes excluded titles and companies", () => {
    const sales = scoreJob(job({ title: "Sales Engineer", country: "CA" }), ng(true), cp, NOW);
    expect(sales.score).toBe(0);
    expect(sales.breakdown.excluded).toBe("titre exclu : « Sales »");
    const cp2 = compileProfile(parseProfile({ ...profile, exclude_companies: ["Evil Corp"] }));
    expect(scoreJob(job({ companyName: "Evil Corp, Inc." }), ng(true), cp2, NOW).score).toBe(0);
  });

  it("penalizes a language outside the profile", () => {
    const r = scoreJob(job(), { ...ng(null), languagesRequired: ["de"] }, cp, NOW);
    expect(part(r.breakdown, "language")).toBe(-10);
  });

  it("hashes the profile text together with the scoring version", () => {
    expect(profileHash("a: 1\n")).toBe(profileHash("a: 1\r\n"));
    expect(profileHash("a: 1\n")).not.toBe(profileHash("a: 2\n"));
  });
});

// ---------- database: batched rescore, profile changes, run hook, LLM ----------

let db: AnyDb;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ db, close } = await testDb());
});
afterEach(async () => {
  await close();
});

const raw = (id: string, title: string, over: Partial<RawJob> = {}): RawJob => ({
  source: "fake",
  sourceJobId: id,
  companyName: "Acme",
  title,
  url: `https://jobs.example.com/acme/${id}`,
  locationRaw: "Montréal, QC",
  ...over,
});

async function seed(n: number) {
  for (let i = 0; i < n; i++) {
    const kind = i % 3;
    await ingestJob(
      db,
      raw(
        String(i),
        kind === 0
          ? `Junior React Developer - ref ${i}`
          : kind === 1
            ? `Senior Engineer - ref ${i}`
            : `Engineer - ref ${i}`,
        { locationRaw: i % 2 ? "Toronto, ON" : "Paris, France" },
      ),
      null,
      NOW,
    );
  }
}

const allJobs = () => db.select().from(jobs).orderBy(jobs.id);

describe("rescoreJobs", () => {
  it("scores every job in batches with one update per batch", async () => {
    await seed(25);
    const r = await rescoreJobs(
      db,
      { kind: "all" },
      { profile, log: silentLog, now: () => NOW, batchSize: 10 },
    );
    expect(r).toMatchObject({ scanned: 25, updated: 25, llmCalls: 0 });
    const rows = await allJobs();
    expect(rows.every((j) => j.score !== null && j.scoreBreakdown !== null)).toBe(true);
    const junior = rows.find((j) => j.title === "Junior React Developer - ref 0")!;
    expect(junior).toMatchObject({ isNewGrad: true, seniority: "entry", domains: ["fullstack"] });
    expect(junior.isNewGradReason).toBe("titre : « Junior »");
    const senior = rows.find((j) => j.title === "Senior Engineer - ref 1")!;
    expect(senior).toMatchObject({ isNewGrad: false, seniority: "senior" });
    expect(senior.score).toBeLessThanOrEqual(20);
    expect(rows.find((j) => j.title === "Engineer - ref 2")!.isNewGrad).toBeNull();

    // Nothing changed: nothing rewritten.
    const again = await rescoreJobs(
      db,
      { kind: "all" },
      { profile, log: silentLog, now: () => NOW },
    );
    expect(again).toMatchObject({ scanned: 25, updated: 0 });
  });

  it("rescores only the given ids or one company", async () => {
    await seed(6);
    const [c] = await db
      .insert(companies)
      .values({ name: "Acme", nameKey: "acme", priority: "high" })
      .returning();
    await db.update(jobs).set({ companyId: c!.id }).where(eq(jobs.sourceJobId, "0"));
    const ids = (await allJobs()).slice(0, 2).map((j) => j.id);
    expect((await rescoreJobs(db, { kind: "ids", ids }, { profile, log: silentLog })).scanned).toBe(
      2,
    );
    expect((await allJobs()).filter((j) => j.score !== null)).toHaveLength(2);
    const r = await rescoreJobs(
      db,
      { kind: "company", companyId: c!.id },
      { profile, log: silentLog },
    );
    expect(r.scanned).toBe(1);
    const b = (await allJobs())[0]!.scoreBreakdown as ScoreBreakdown;
    expect(b.parts.find((p) => p.key === "priority")?.points).toBe(10);
  });

  it("finds jobs whose freshness bonus expired", async () => {
    await seed(3);
    await rescoreJobs(db, { kind: "all" }, { profile, log: silentLog, now: () => NOW });
    expect(await staleFreshJobIds(db, NOW)).toEqual([]);
    const later = new Date(NOW.getTime() + 25 * 3_600_000);
    expect(await staleFreshJobIds(db, later)).toHaveLength(3);
    await rescoreJobs(
      db,
      { kind: "ids", ids: await staleFreshJobIds(db, later) },
      { profile, log: silentLog, now: () => later },
    );
    expect(await staleFreshJobIds(db, later)).toEqual([]);
  });
});

describe("profile.yaml changes", () => {
  it("recomputes every score when profile.yaml changes, and only then", async () => {
    await seed(9);
    const dir = mkdtempSync(join(tmpdir(), "jobradar-profile-"));
    const file = join(dir, "profile.yaml");
    writeFileSync(file, "locations:\n  - { match: Toronto, weight: 30 }\ndomains: {}\n");

    const first = await syncProfileScores(db, loadProfileFile(dir), {
      log: silentLog,
      now: () => NOW,
    });
    expect(first).toMatchObject({ changed: true, previous: null });
    expect(first.rescore?.scanned).toBe(9);
    const before = new Map((await allJobs()).map((j) => [j.id, j.score]));
    const stored = await kvGet<AppliedProfile>(db, PROFILE_KV_KEY);
    expect(stored?.hash).toBe(first.hash);
    expect(stored?.text).toContain("Toronto");

    // Same file: no rescore.
    expect((await syncProfileScores(db, loadProfileFile(dir), { log: silentLog })).changed).toBe(
      false,
    );

    // Paris is now worth more than Toronto: every score is recomputed.
    writeFileSync(
      file,
      "locations:\n  - { match: Paris, weight: 30 }\n  - { match: Toronto, weight: 5 }\ndomains: {}\n",
    );
    const second = await syncProfileScores(db, loadProfileFile(dir), {
      log: silentLog,
      now: () => NOW,
    });
    expect(second).toMatchObject({ changed: true, previous: first.hash });
    const after = await allJobs();
    for (const j of after) {
      const loc = (j.scoreBreakdown as ScoreBreakdown).parts.find((p) => p.key === "location")!;
      expect(loc.points).toBe(j.locationRaw?.startsWith("Paris") ? 30 : 5);
    }
    expect(after.some((j) => j.score !== before.get(j.id))).toBe(true);
  });

  it("loads the real config/profile.yaml", () => {
    const p = loadProfileFile(CONFIG_DIR);
    expect(Object.keys(p.profile.domains)).toContain("audio_dsp");
    expect(p.hash).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("runSource hook", () => {
  it("scores the jobs touched by a run", async () => {
    const connector: Connector = {
      id: "fake",
      kind: "feed",
      needsCompany: false,
      async *fetch() {
        yield raw("a", "New Grad Software Engineer", { seniorityHint: "entry" });
        yield raw("b", "Software Engineer", { seniorityHint: "entry" });
      },
    };
    const http = new HttpShared({ userAgent: "test", log: silentLog });
    const r = await runSource(
      { db, http, log: silentLog, profile, rescore: {}, now: () => NOW },
      connector,
    );
    expect(r.status).toBe("ok");
    const rows = await allJobs();
    expect(rows.map((j) => [j.isNewGrad, j.seniorityHint])).toEqual([
      [true, "entry"],
      [true, "entry"],
    ]);
    expect(rows[1]!.isNewGradReason).toBe("source : offre listée comme new grad / entry-level");
    expect(rows.every((j) => (j.score ?? 0) >= 50)).toBe(true);
  });
});

describe("optional LLM pass", () => {
  const verdict: LlmVerdict = {
    is_new_grad: true,
    seniority: "entry",
    years_required: 0,
    visa_or_work_auth_notes: null,
    language_required: ["en"],
  };
  function fakeLlm() {
    const calls: string[] = [];
    const classifier: LlmClassifier = {
      async classify(j) {
        calls.push(j.title);
        return verdict;
      },
    };
    return { classifier, calls };
  }

  it("is only asked about ambiguous jobs, within the daily cap, then cached", async () => {
    await seed(9); // 3 junior (rules: true), 3 senior (false), 3 ambiguous
    const { classifier, calls } = fakeLlm();
    const llm = { classifier, quota: dbQuota(db, "llm", 2, () => NOW) };
    const ids = (await allJobs()).map((j) => j.id);
    const r = await rescoreJobs(
      db,
      { kind: "ids", ids },
      { profile, log: silentLog, now: () => NOW, llm },
    );
    expect(r.llmCalls).toBe(2);
    expect(calls.every((t) => t.startsWith("Engineer - ref"))).toBe(true);
    const viaLlm = (await allJobs()).filter(
      (j) => (j.scoreBreakdown as ScoreBreakdown).newGrad.source === "llm",
    );
    expect(viaLlm).toHaveLength(2);
    expect(viaLlm[0]!.isNewGrad).toBe(true);
    expect(viaLlm[0]!.isNewGradReason).toMatch(/^IA : new grad/);

    // Quota exhausted today: no new call, cached verdicts still applied.
    const r2 = await rescoreJobs(
      db,
      { kind: "ids", ids },
      { profile, log: silentLog, now: () => NOW, llm },
    );
    expect(r2.llmCalls).toBe(0);
    expect(calls).toHaveLength(2);
    // A full rescore never calls the model but keeps the cached verdicts.
    const { classifier: c3, calls: calls3 } = fakeLlm();
    const tomorrow = new Date(NOW.getTime() + 86_400_000);
    await rescoreJobs(
      db,
      { kind: "all" },
      {
        profile,
        log: silentLog,
        now: () => tomorrow,
        llm: { classifier: c3, quota: dbQuota(db, "llm", 100, () => tomorrow) },
      },
    );
    expect(calls3).toHaveLength(0);
    expect(
      (await allJobs()).filter(
        (j) => (j.scoreBreakdown as ScoreBreakdown).newGrad.source === "llm",
      ),
    ).toHaveLength(2);
  });

  it("builds a strict JSON request for claude-haiku-5-5 (fake SDK client, no network)", async () => {
    const seen: unknown[] = [];
    const client = {
      messages: {
        parse: async (params: unknown) => {
          seen.push(params);
          return { stop_reason: "end_turn", parsed_output: verdict };
        },
      },
    } as unknown as Parameters<typeof createAnthropicClassifier>[0]["client"];
    const c = createAnthropicClassifier({
      apiKey: "x",
      model: "claude-haiku-5-5",
      log: silentLog,
      client,
    });
    expect(
      await c.classify({
        title: "Engineer",
        companyName: "Acme",
        locationRaw: null,
        descriptionText: "d",
      }),
    ).toEqual(verdict);
    const params = seen[0] as {
      model: string;
      output_config: { effort: string; format: { type: string } };
    };
    expect(params.model).toBe("claude-haiku-5-5");
    expect(params.output_config.effort).toBe("low");
    expect(params.output_config.format.type).toBe("json_schema");
  });
});

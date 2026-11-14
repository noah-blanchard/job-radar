import { and, companies, companyPrefs, eq, jobs, jobScores, users, type AnyDb } from "@jobradar/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LlmClassifier, LlmVerdict } from "../src/classify/llm";
import { createAnthropicClassifier } from "../src/classify/llm";
import { parseProfile } from "../src/config";
import type { Connector, RawJob } from "../src/connectors/types";
import { HttpShared } from "../src/http/client";
import { ingestJob } from "../src/pipeline/ingest";
import { dbQuota } from "../src/pipeline/quota";
import { runSource } from "../src/pipeline/run";
import {
  listProfileTemplates,
  loadProfilePrompt,
  loadProfileFile,
  loadUserProfiles,
  parseProfileText,
} from "../src/score/profile";
import { rescoreJobs, staleFreshJobIds, syncProfileScores } from "../src/score/rescore";
import {
  compileProfile,
  profileHash,
  profileProblems,
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

describe("scoreJob (fixture profile)", () => {
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

  it("scores the targeted levels (target_seniority)", () => {
    const mid = compileProfile(parseProfile({ ...profile, target_seniority: ["entry", "mid"] }));
    const ca = job({ city: "Montreal", country: "CA" });
    const midJob = { ...ng(false), seniority: "mid" };
    const r = scoreJob(ca, midJob, mid, NOW);
    expect(part(r.breakdown, "newGrad")).toBe(25);
    expect(r.breakdown.parts[1]!.detail).toBe("niveau intermédiaire (visé)");
    expect(r.breakdown.capped).toBeUndefined();
    const senior = scoreJob(ca, { ...ng(false), seniority: "senior" }, mid, NOW);
    expect(senior.score).toBe(20);
    expect(senior.breakdown.capped).toBe("niveau hors cible (senior) : score plafonné à 20");
    // Default profile (entry only): a mid-level job stays "pas new grad", capped.
    expect(scoreJob(ca, midJob, cp, NOW).breakdown.capped).toContain("pas new grad");
  });

  it("caps jobs outside the profile's domains when require_domain is set", () => {
    const strict = compileProfile(parseProfile({ ...profile, require_domain: true }));
    const byTitle = compileProfile(parseProfile({ ...profile, require_domain: "title" }));
    const ca = job({ city: "Montreal", country: "CA", title: "Account Coordinator" });
    // One keyword in a long description is not enough.
    const oneDesc = { ...ca, descriptionText: "We use React internally." };
    const r = scoreJob(oneDesc, ng(true), strict, NOW);
    expect(r.breakdown.raw).toBeGreaterThan(20);
    expect(r.score).toBe(20);
    expect(r.breakdown.capped).toBe("hors des domaines du profil : score plafonné à 20");
    // Two description keywords pass "true" but not "title".
    const twoDesc = { ...ca, descriptionText: "React and Node.js on the front and back." };
    expect(scoreJob(twoDesc, ng(true), strict, NOW).breakdown.capped).toBeUndefined();
    expect(scoreJob(twoDesc, ng(true), byTitle, NOW).breakdown.capped).toBe(
      "aucun mot-clé du profil dans le titre : score plafonné à 20",
    );
    const title = { ...ca, title: "Junior React Developer" };
    expect(scoreJob(title, ng(true), byTitle, NOW).breakdown.capped).toBeUndefined();
  });

  it("gives the priority bonus to the profile's priority_companies", () => {
    const p = compileProfile(
      parseProfile({ ...profile, priority_companies: ["Banque Nationale"] }),
    );
    const r = scoreJob(job({ companyName: "Banque Nationale Inc." }), ng(true), p, NOW);
    expect(r.breakdown.parts.find((x) => x.key === "priority")).toEqual({
      key: "priority",
      points: 10,
      detail: "entreprise prioritaire (profil)",
    });
    expect(part(scoreJob(job(), ng(true), p, NOW).breakdown, "priority")).toBeUndefined();
  });

  it("lists the invalid patterns of a profile", () => {
    const p = parseProfile({
      locations: [{ match: "Montr(eal", weight: 30 }],
      domains: { web: ["react", "node(js"] },
      exclude_title: ["[sales"],
    });
    const problems = profileProblems(p);
    expect(problems).toHaveLength(3);
    expect(problems[1]).toMatch(/^domaine web : « node\(js » n'est pas valide/);
    expect(profileProblems(profile)).toEqual([]);
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

/** The owner (user 1, created by the migration). */
const OWNER = 1;
const profiles = [{ userId: OWNER, profile }];

/** Jobs with one user's score columns. */
async function allJobs(userId = OWNER) {
  const rows = await db
    .select()
    .from(jobs)
    .leftJoin(jobScores, and(eq(jobScores.jobId, jobs.id), eq(jobScores.userId, userId)))
    .orderBy(jobs.id);
  return rows.map((r) => ({
    ...r.jobs,
    score: r.job_scores?.score ?? null,
    scoreBreakdown: r.job_scores?.scoreBreakdown ?? null,
    domains: r.job_scores?.domains ?? null,
  }));
}

describe("rescoreJobs", () => {
  it("scores every job in batches with one update per batch", async () => {
    await seed(25);
    const r = await rescoreJobs(
      db,
      { kind: "all" },
      { profiles, log: silentLog, now: () => NOW, batchSize: 10 },
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
      { profiles, log: silentLog, now: () => NOW },
    );
    expect(again).toMatchObject({ scanned: 25, updated: 0 });
  });

  it("rescores only the given ids or one company", async () => {
    await seed(6);
    const [c] = await db
      .insert(companies)
      .values({ name: "Acme", nameKey: "acme", priority: "normal" })
      .returning();
    await db.insert(companyPrefs).values({ userId: OWNER, companyId: c!.id, priority: "high" });
    await db.update(jobs).set({ companyId: c!.id }).where(eq(jobs.sourceJobId, "0"));
    const ids = (await allJobs()).slice(0, 2).map((j) => j.id);
    expect(
      (await rescoreJobs(db, { kind: "ids", ids }, { profiles, log: silentLog })).scanned,
    ).toBe(2);
    expect((await allJobs()).filter((j) => j.score !== null)).toHaveLength(2);
    const r = await rescoreJobs(
      db,
      { kind: "company", companyId: c!.id },
      { profiles, log: silentLog },
    );
    expect(r.scanned).toBe(1);
    const b = (await allJobs())[0]!.scoreBreakdown as ScoreBreakdown;
    expect(b.parts.find((p) => p.key === "priority")?.points).toBe(10);
  });

  it("finds jobs whose freshness bonus expired", async () => {
    await seed(3);
    await rescoreJobs(db, { kind: "all" }, { profiles, log: silentLog, now: () => NOW });
    expect(await staleFreshJobIds(db, NOW)).toEqual([]);
    const later = new Date(NOW.getTime() + 25 * 3_600_000);
    expect(await staleFreshJobIds(db, later)).toHaveLength(3);
    await rescoreJobs(
      db,
      { kind: "ids", ids: await staleFreshJobIds(db, later) },
      { profiles, log: silentLog, now: () => later },
    );
    expect(await staleFreshJobIds(db, later)).toEqual([]);
  });
});

describe("profile changes", () => {
  const setProfile = (id: number, text: string) =>
    db.update(users).set({ profileYaml: text }).where(eq(users.id, id));

  it("recomputes a user's scores when their profile changes, and only then", async () => {
    await seed(9);
    await setProfile(OWNER, "locations:\n  - { match: Toronto, weight: 30 }\ndomains: {}\n");

    const first = await syncProfileScores(db, { log: silentLog, now: () => NOW });
    expect(first).toMatchObject({ changed: true, users: [OWNER] });
    expect(first.rescore?.scanned).toBe(9);
    const before = new Map((await allJobs()).map((j) => [j.id, j.score]));
    const [p1] = (await loadUserProfiles(db)).profiles;
    expect(p1?.scoredHash).toBe(p1?.hash);

    // Same profile: no rescore.
    expect((await syncProfileScores(db, { log: silentLog })).changed).toBe(false);

    // Paris is now worth more than Toronto: every score is recomputed.
    await setProfile(
      OWNER,
      "locations:\n  - { match: Paris, weight: 30 }\n  - { match: Toronto, weight: 5 }\ndomains: {}\n",
    );
    const second = await syncProfileScores(db, { log: silentLog, now: () => NOW });
    expect(second).toMatchObject({ changed: true, users: [OWNER] });
    const after = await allJobs();
    for (const j of after) {
      const loc = (j.scoreBreakdown as ScoreBreakdown).parts.find((p) => p.key === "location")!;
      expect(loc.points).toBe(j.locationRaw?.startsWith("Paris") ? 30 : 5);
    }
    expect(after.some((j) => j.score !== before.get(j.id))).toBe(true);
  });

  it("keeps each user's scores apart and rescores only the user who changed", async () => {
    await seed(6);
    await setProfile(OWNER, "locations:\n  - { match: Toronto, weight: 30 }\ndomains: {}\n");
    const [other] = await db
      .insert(users)
      .values({
        email: "b@example.com",
        profileYaml: "locations:\n  - { match: Paris, weight: 30 }\ndomains: {}\n",
      })
      .returning();
    const all = await syncProfileScores(db, { log: silentLog, now: () => NOW });
    expect(all.users.sort()).toEqual([OWNER, other!.id].sort());
    const loc = (rows: Awaited<ReturnType<typeof allJobs>>, place: string) =>
      rows
        .filter((j) => j.locationRaw?.startsWith(place))
        .map((j) => (j.scoreBreakdown as ScoreBreakdown).parts[0]!.points);
    expect(loc(await allJobs(OWNER), "Toronto")).toEqual([30, 30, 30]);
    expect(loc(await allJobs(OWNER), "Paris")).toEqual([0, 0, 0]);
    expect(loc(await allJobs(other!.id), "Paris")).toEqual([30, 30, 30]);

    await setProfile(other!.id, "locations: []\ndomains: {}\n");
    const again = await syncProfileScores(db, { log: silentLog, now: () => NOW });
    expect(again.users).toEqual([other!.id]);

    // An invalid profile is reported and skipped, the others are still scored.
    await setProfile(other!.id, "locations: 12\n");
    const bad = await syncProfileScores(db, { log: silentLog, force: true });
    expect(bad.users).toEqual([OWNER]);
    expect(bad.invalid.map((i) => i.userId)).toEqual([other!.id]);
  });

  it("loads the real config/profile.yaml", () => {
    const p = loadProfileFile(CONFIG_DIR);
    expect(p.profile.locations.length).toBeGreaterThan(0);
    expect(Object.keys(p.profile.domains).length).toBeGreaterThan(0);
    expect(p.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(profileProblems(p.profile)).toEqual([]);
  });

  it.each(listProfileTemplates(CONFIG_DIR).map((t) => [t.id, t]))(
    "ships a valid starter profile: %s",
    (_id, t) => {
      const p = parseProfileText(t.text);
      expect(profileProblems(p.profile)).toEqual([]);
      expect(Object.keys(p.profile.domains).length).toBeGreaterThan(0);
      expect(p.profile.require_domain).toBe("title");
    },
  );

  it("ships an interview prompt whose example profile is valid", () => {
    const example = loadProfilePrompt(CONFIG_DIR)?.match(/```yaml\n([\s\S]*?)```/)?.[1];
    expect(example).toBeDefined();
    const p = parseProfileText(example!);
    expect(profileProblems(p.profile)).toEqual([]);
    expect(Object.keys(p.profile.domains).length).toBeGreaterThan(0);
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
      { db, http, log: silentLog, profile, rescore: { profiles: () => profiles }, now: () => NOW },
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
      { profiles, log: silentLog, now: () => NOW, llm },
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
      { profiles, log: silentLog, now: () => NOW, llm },
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
        profiles,
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

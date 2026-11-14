/**
 * (Re)classifies and (re)scores jobs in batches. Per batch: one SELECT, one set-based UPDATE of
 * the classification (`jobs`, shared by every user) and one upsert of the scores of every
 * profile (`job_scores`, one row per user and job). Never one query per job.
 */
import { kvSet, queryRows, sql, users, type AnyDb } from "@jobradar/db";
import { classifyNewGrad } from "../classify/rules";
import { isFatalLlmError, type LlmClassifier, type LlmVerdict } from "../classify/llm";
import type { Profile } from "../config";
import type { QuotaCounter } from "../connectors/types";
import type { Logger } from "../logger";
import {
  compileProfile,
  FRESH_MS,
  scoreJob,
  type CompiledProfile,
  type NewGradInfo,
  type ScoreInput,
} from "./score";
import { loadUserProfiles, type UserProfile } from "./profile";

export const RESCORE_BATCH = 1000;
const llmKey = (fingerprint: string) => `llm:${fingerprint}`;

export interface LlmOptions {
  classifier: LlmClassifier;
  quota: QuotaCounter;
}

/** One user's profile to score with. */
export interface ScoringProfile {
  userId: number;
  profile: Profile;
}

export interface RescoreOptions {
  /** Users to score (none: classification only). */
  profiles: readonly ScoringProfile[];
  log: Logger;
  now?: () => Date;
  /** Optional LLM pass for ambiguous jobs (new calls only for targeted rescores). */
  llm?: LlmOptions;
  batchSize?: number;
}

export interface RescoreResult {
  scanned: number;
  /** Score rows written or changed (one per user and job). */
  updated: number;
  llmCalls: number;
  ms: number;
}

interface Row extends Record<string, unknown> {
  id: number;
  fingerprint: string;
  company_id: number | null;
  title: string;
  description_text: string | null;
  employment_type: string | null;
  seniority_hint: string | null;
  company_name: string;
  city: string | null;
  region: string | null;
  country: string | null;
  remote: ScoreInput["remote"];
  location_raw: string | null;
  lang: string | null;
  salary_min: number | null;
  salary_max: number | null;
  first_seen_at: Date | string;
}

/** Which jobs to rescore. */
export type RescoreTarget =
  { kind: "all" } | { kind: "ids"; ids: number[] } | { kind: "company"; companyId: number };

function fromLlm(v: LlmVerdict, rulesReason: string): NewGradInfo {
  return {
    value: v.is_new_grad,
    seniority: v.seniority,
    reason: `IA : ${v.is_new_grad === null ? "indécis" : v.is_new_grad ? "new grad" : "pas new grad"}${v.years_required !== null ? ` (${v.years_required} ans demandés)` : ""} ; règles : ${rulesReason}`,
    source: "llm",
    yearsRequired: v.years_required,
    visaNotes: v.visa_or_work_auth_notes,
    languagesRequired: v.language_required,
  };
}

async function selectBatch(db: AnyDb, target: RescoreTarget, afterId: number, limit: number) {
  const where =
    target.kind === "ids"
      ? sql`j.id = any(${`{${target.ids.join(",")}}`}::bigint[])`
      : target.kind === "company"
        ? sql`j.company_id = ${target.companyId}`
        : sql`true`;
  return queryRows<Row>(
    db,
    sql`
    select j.id, j.fingerprint, j.company_id, j.title,
      left(j.description_text, 20000) as description_text,
      j.employment_type, j.seniority_hint, j.company_name,
      j.city, j.region, j.country, j.remote, j.location_raw, j.lang,
      j.salary_min, j.salary_max, j.first_seen_at
    from jobs j
    where ${where} and j.id > ${afterId}
    order by j.id
    limit ${limit}`,
  );
}

async function cachedLlm(db: AnyDb, fingerprints: string[]): Promise<Map<string, LlmVerdict>> {
  if (fingerprints.length === 0) return new Map();
  const keys = `{${fingerprints.map((f) => `"${llmKey(f)}"`).join(",")}}`;
  const rows = await queryRows<{ key: string; value: LlmVerdict }>(
    db,
    sql`select key, value from kv where key = any(${keys}::text[])`,
  );
  return new Map(rows.map((r) => [r.key.slice(4), r.value]));
}

/** "userId:companyId" of the companies each user marked high priority, for this batch. */
async function highPriority(db: AnyDb, rows: Row[], userIds: number[]): Promise<Set<string>> {
  const companyIds = [
    ...new Set(rows.map((r) => r.company_id).filter((c): c is number => c !== null)),
  ];
  if (companyIds.length === 0 || userIds.length === 0) return new Set();
  const prefs = await queryRows<{ user_id: number; company_id: number }>(
    db,
    sql`select user_id, company_id from company_prefs
        where priority = 'high'
          and user_id = any(${`{${userIds.join(",")}}`}::int[])
          and company_id = any(${`{${companyIds.join(",")}}`}::int[])`,
  );
  return new Set(prefs.map((p) => `${p.user_id}:${p.company_id}`));
}

interface Compiled {
  userId: number;
  cp: CompiledProfile;
}

async function processBatch(
  db: AnyDb,
  rows: Row[],
  compiled: Compiled[],
  opts: RescoreOptions,
  allowLlmCalls: boolean,
  llmState: { calls: number; stopped: boolean },
): Promise<number> {
  const now = (opts.now ?? (() => new Date()))();
  const inputs = rows.map((r) => {
    const rules = classifyNewGrad({
      title: r.title,
      descriptionText: r.description_text,
      employmentType: r.employment_type,
      seniorityHint: r.seniority_hint,
    });
    const job: ScoreInput = {
      title: r.title,
      descriptionText: r.description_text,
      companyName: r.company_name,
      companyPriority: null,
      city: r.city,
      region: r.region,
      country: r.country,
      remote: r.remote,
      locationRaw: r.location_raw,
      lang: r.lang,
      salaryMin: r.salary_min,
      salaryMax: r.salary_max,
      firstSeenAt: new Date(r.first_seen_at),
    };
    const newGrad: NewGradInfo = {
      value: rules.isNewGrad,
      seniority: rules.seniority,
      reason: rules.reason,
      source: "rules",
      yearsRequired: rules.yearsRequired,
    };
    return { row: r, job, newGrad };
  });

  // Optional LLM: only ambiguous jobs, cache first, then new calls (best provisional score first).
  if (opts.llm) {
    const ambiguous = inputs.filter((x) => x.newGrad.value === null);
    const cache = await cachedLlm(
      db,
      ambiguous.map((x) => x.row.fingerprint),
    );
    const misses: typeof ambiguous = [];
    for (const x of ambiguous) {
      const hit = cache.get(x.row.fingerprint);
      if (hit) x.newGrad = fromLlm(hit, x.newGrad.reason);
      else misses.push(x);
    }
    if (allowLlmCalls && !llmState.stopped) {
      // Best provisional score for any user first: the daily quota goes where it matters.
      const best = (x: (typeof misses)[number]) =>
        Math.max(0, ...compiled.map((c) => scoreJob(x.job, x.newGrad, c.cp, now).score));
      const order = new Map(misses.map((x) => [x, best(x)]));
      misses.sort((a, b) => order.get(b)! - order.get(a)!);
      for (const x of misses) {
        if (llmState.stopped || !(await opts.llm.quota.take())) {
          llmState.stopped = true;
          break;
        }
        try {
          llmState.calls++;
          const verdict = await opts.llm.classifier.classify({
            title: x.row.title,
            companyName: x.row.company_name,
            locationRaw: x.row.location_raw,
            descriptionText: x.row.description_text,
          });
          if (!verdict) continue;
          await kvSet(db, llmKey(x.row.fingerprint), verdict);
          x.newGrad = fromLlm(verdict, x.newGrad.reason);
        } catch (err) {
          opts.log.warn({ err: String(err), jobId: x.row.id }, "llm classification failed");
          if (isFatalLlmError(err)) llmState.stopped = true;
        }
      }
    }
  }

  if (inputs.length === 0) return 0;
  // Classification: shared by every user, written on `jobs` (unchanged rows are not rewritten).
  const classes = inputs.map(({ row, newGrad }) => ({
    id: row.id,
    is_new_grad: newGrad.value,
    is_new_grad_reason: newGrad.reason,
    seniority: newGrad.seniority,
  }));
  await db.execute(sql`
    update jobs j set
      is_new_grad = v.is_new_grad,
      is_new_grad_reason = v.is_new_grad_reason,
      seniority = v.seniority
    from jsonb_to_recordset(${JSON.stringify(classes)}::jsonb) as v(
      id bigint, is_new_grad boolean, is_new_grad_reason text, seniority text)
    where j.id = v.id
      and (j.is_new_grad is distinct from v.is_new_grad
        or j.is_new_grad_reason is distinct from v.is_new_grad_reason
        or j.seniority is distinct from v.seniority)`);

  if (compiled.length === 0) return 0;
  const high = await highPriority(
    db,
    rows,
    compiled.map((c) => c.userId),
  );
  const scores = compiled.flatMap(({ userId, cp }) =>
    inputs.map(({ row, job, newGrad }) => {
      const priority =
        row.company_id !== null && high.has(`${userId}:${row.company_id}`) ? "high" : null;
      const s = scoreJob({ ...job, companyPriority: priority }, newGrad, cp, now);
      return {
        user_id: userId,
        job_id: row.id,
        score: s.score,
        score_breakdown: s.breakdown,
        domains: s.domains,
      };
    }),
  );
  // One upsert per batch for every user; rows whose values did not change are not rewritten.
  const updated = await queryRows<{ job_id: number }>(
    db,
    sql`
    insert into job_scores (user_id, job_id, score, score_breakdown, domains)
    select v.user_id, v.job_id, v.score, v.score_breakdown, v.domains
    from jsonb_to_recordset(${JSON.stringify(scores)}::jsonb) as v(
      user_id int, job_id bigint, score smallint, score_breakdown jsonb, domains text[])
    on conflict (user_id, job_id) do update set
      score = excluded.score,
      score_breakdown = excluded.score_breakdown,
      domains = excluded.domains
    where job_scores.score is distinct from excluded.score
      or job_scores.score_breakdown is distinct from excluded.score_breakdown
      or job_scores.domains is distinct from excluded.domains
    returning job_id`,
  );
  return updated.length;
}

/** Classifies and scores the targeted jobs, batch by batch (keyset pagination on id). */
export async function rescoreJobs(
  db: AnyDb,
  target: RescoreTarget,
  opts: RescoreOptions,
): Promise<RescoreResult> {
  const t0 = Date.now();
  const compiled = opts.profiles.map((p) => ({
    userId: p.userId,
    cp: compileProfile(p.profile),
  }));
  const batch = opts.batchSize ?? RESCORE_BATCH;
  const llmState = { calls: 0, stopped: false };
  // New LLM calls only for targeted rescores (after a run); a full rescore uses the cache only.
  const allowLlmCalls = target.kind !== "all";
  let scanned = 0;
  let updated = 0;

  if (target.kind === "ids") {
    const ids = [...new Set(target.ids)].sort((a, b) => a - b);
    for (let i = 0; i < ids.length; i += batch) {
      const rows = await selectBatch(db, { kind: "ids", ids: ids.slice(i, i + batch) }, 0, batch);
      scanned += rows.length;
      updated += await processBatch(db, rows, compiled, opts, allowLlmCalls, llmState);
    }
  } else {
    let afterId = 0;
    for (;;) {
      const rows = await selectBatch(db, target, afterId, batch);
      if (rows.length === 0) break;
      afterId = Number(rows[rows.length - 1]!.id);
      scanned += rows.length;
      updated += await processBatch(db, rows, compiled, opts, allowLlmCalls, llmState);
    }
  }
  return { scanned, updated, llmCalls: llmState.calls, ms: Date.now() - t0 };
}

/** Jobs whose freshness bonus has expired for some user (first seen more than 24 h ago). */
export async function staleFreshJobIds(db: AnyDb, now = new Date()): Promise<number[]> {
  const cutoff = new Date(now.getTime() - FRESH_MS).toISOString();
  const rows = await queryRows<{ id: number }>(
    db,
    sql`
    select distinct s.job_id as id from job_scores s join jobs j on j.id = s.job_id
    where j.first_seen_at < ${cutoff}::timestamptz
      and s.score_breakdown @> '{"parts":[{"key":"freshness"}]}'::jsonb`,
  );
  return rows.map((r) => Number(r.id));
}

export interface ProfileSyncResult {
  changed: boolean;
  /** Users rescored by this call. */
  users: number[];
  /** Users whose profile does not parse (not scored). */
  invalid: { userId: number; error: string }[];
  rescore?: RescoreResult;
}

/**
 * Full rescore of the users whose profile (or the scoring code version) changed since their
 * stored scores were computed: one pass over the jobs scores all of them at once. A user's hash
 * is recorded only after the rescore succeeded, and only if the profile was not edited meanwhile.
 * `force` rescores every user (`userIds` narrows it).
 */
export async function syncProfileScores(
  db: AnyDb,
  opts: Omit<RescoreOptions, "profiles"> & { force?: boolean; userIds?: number[] },
): Promise<ProfileSyncResult> {
  const { profiles, invalid } = await loadUserProfiles(db);
  const stale = profiles.filter(
    (p) =>
      (!opts.userIds || opts.userIds.includes(p.userId)) && (opts.force || p.scoredHash !== p.hash),
  );
  if (stale.length === 0) return { changed: false, users: [], invalid };
  opts.log.info(
    { users: stale.map((p) => ({ userId: p.userId, previous: p.scoredHash, hash: p.hash })) },
    "full rescore",
  );
  const rescore = await rescoreJobs(db, { kind: "all" }, { ...opts, profiles: stale });
  for (const p of stale) await markScored(db, p);
  opts.log.info(rescore, "full rescore done");
  return { changed: true, users: stale.map((p) => p.userId), invalid, rescore };
}

async function markScored(db: AnyDb, p: UserProfile) {
  await db
    .update(users)
    .set({ scoredHash: p.hash, scoredAt: new Date() })
    .where(sql`${users.id} = ${p.userId} and ${users.profileYaml} = ${p.text}`);
}

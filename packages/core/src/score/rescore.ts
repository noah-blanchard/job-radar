/**
 * (Re)classifies and (re)scores jobs in batches: one SELECT and one set-based UPDATE per batch
 * (`UPDATE jobs FROM jsonb_to_recordset(...)`), never one query per job.
 */
import { kvGet, kvSet, queryRows, sql, type AnyDb } from "@jobradar/db";
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
import { PROFILE_KV_KEY, type AppliedProfile, type LoadedProfile } from "./profile";

export const RESCORE_BATCH = 1000;
const llmKey = (fingerprint: string) => `llm:${fingerprint}`;

export interface LlmOptions {
  classifier: LlmClassifier;
  quota: QuotaCounter;
}

export interface RescoreOptions {
  profile: Profile;
  log: Logger;
  now?: () => Date;
  /** Optional LLM pass for ambiguous jobs (new calls only for targeted rescores). */
  llm?: LlmOptions;
  batchSize?: number;
}

export interface RescoreResult {
  scanned: number;
  updated: number;
  llmCalls: number;
  ms: number;
}

interface Row extends Record<string, unknown> {
  id: number;
  fingerprint: string;
  title: string;
  description_text: string | null;
  employment_type: string | null;
  seniority_hint: string | null;
  company_name: string;
  company_priority: "low" | "normal" | "high" | null;
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
    select j.id, j.fingerprint, j.title, left(j.description_text, 20000) as description_text,
      j.employment_type, j.seniority_hint, j.company_name, c.priority as company_priority,
      j.city, j.region, j.country, j.remote, j.location_raw, j.lang,
      j.salary_min, j.salary_max, j.first_seen_at
    from jobs j left join companies c on c.id = j.company_id
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

async function processBatch(
  db: AnyDb,
  rows: Row[],
  cp: CompiledProfile,
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
      companyPriority: r.company_priority,
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
      misses.sort(
        (a, b) =>
          scoreJob(b.job, b.newGrad, cp, now).score - scoreJob(a.job, a.newGrad, cp, now).score,
      );
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

  const values = inputs.map(({ row, job, newGrad }) => {
    const s = scoreJob(job, newGrad, cp, now);
    return {
      id: row.id,
      score: s.score,
      score_breakdown: s.breakdown,
      domains: s.domains,
      is_new_grad: newGrad.value,
      is_new_grad_reason: newGrad.reason,
      seniority: newGrad.seniority,
    };
  });
  if (values.length === 0) return 0;
  // One UPDATE per batch; rows whose values did not change are not rewritten.
  const updated = await queryRows<{ id: number }>(
    db,
    sql`
    update jobs j set
      score = v.score,
      score_breakdown = v.score_breakdown,
      domains = v.domains,
      is_new_grad = v.is_new_grad,
      is_new_grad_reason = v.is_new_grad_reason,
      seniority = v.seniority
    from jsonb_to_recordset(${JSON.stringify(values)}::jsonb) as v(
      id bigint, score smallint, score_breakdown jsonb, domains text[],
      is_new_grad boolean, is_new_grad_reason text, seniority text)
    where j.id = v.id
      and (j.score is distinct from v.score
        or j.score_breakdown is distinct from v.score_breakdown
        or j.domains is distinct from v.domains
        or j.is_new_grad is distinct from v.is_new_grad
        or j.is_new_grad_reason is distinct from v.is_new_grad_reason
        or j.seniority is distinct from v.seniority)
    returning j.id`,
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
  const cp = compileProfile(opts.profile);
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
      updated += await processBatch(db, rows, cp, opts, allowLlmCalls, llmState);
    }
  } else {
    let afterId = 0;
    for (;;) {
      const rows = await selectBatch(db, target, afterId, batch);
      if (rows.length === 0) break;
      afterId = Number(rows[rows.length - 1]!.id);
      scanned += rows.length;
      updated += await processBatch(db, rows, cp, opts, allowLlmCalls, llmState);
    }
  }
  return { scanned, updated, llmCalls: llmState.calls, ms: Date.now() - t0 };
}

/** Jobs whose freshness bonus has expired (first seen more than 24 h ago). */
export async function staleFreshJobIds(db: AnyDb, now = new Date()): Promise<number[]> {
  const cutoff = new Date(now.getTime() - FRESH_MS).toISOString();
  const rows = await queryRows<{ id: number }>(
    db,
    sql`
    select id from jobs
    where first_seen_at < ${cutoff}::timestamptz
      and score_breakdown @> '{"parts":[{"key":"freshness"}]}'::jsonb`,
  );
  return rows.map((r) => Number(r.id));
}

export interface ProfileSyncResult {
  changed: boolean;
  hash: string;
  previous: string | null;
  rescore?: RescoreResult;
}

/**
 * Full rescore when profile.yaml (or the scoring code version) changed since the stored scores
 * were computed. The hash is written only after the rescore succeeded.
 */
export async function syncProfileScores(
  db: AnyDb,
  loaded: LoadedProfile,
  opts: Omit<RescoreOptions, "profile"> & { force?: boolean },
): Promise<ProfileSyncResult> {
  const stored = await kvGet<{ hash: string }>(db, PROFILE_KV_KEY);
  if (!opts.force && stored?.hash === loaded.hash)
    return { changed: false, hash: loaded.hash, previous: stored.hash };
  opts.log.info(
    { previous: stored?.hash ?? null, hash: loaded.hash, forced: !!opts.force },
    "full rescore",
  );
  const rescore = await rescoreJobs(db, { kind: "all" }, { ...opts, profile: loaded.profile });
  const applied: AppliedProfile = {
    hash: loaded.hash,
    appliedAt: new Date().toISOString(),
    text: loaded.text,
    jobs: rescore.scanned,
    ms: rescore.ms,
  };
  await kvSet(db, PROFILE_KV_KEY, applied);
  opts.log.info(rescore, "full rescore done");
  return { changed: true, hash: loaded.hash, previous: stored?.hash ?? null, rescore };
}

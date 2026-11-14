import {
  and,
  companies,
  desc,
  eq,
  inArray,
  isNull,
  jobs,
  jobSources,
  lt,
  sourceRuns,
  sql,
  type AnyDb,
} from "@jobradar/db";
import { isClearlyNotNewGrad } from "../classify/rules";
import type { Company, Connector, FetchCtx, QuotaCounter } from "../connectors/types";
import { HttpShared, PoliteHttpClient } from "../http/client";
import type { Logger } from "../logger";
import { ingestJob } from "./ingest";

export const BROKEN_AFTER_FAILURES = 3;
export const CLOSE_AFTER_MISSED_RUNS = 2;

export interface RunDeps {
  db: AnyDb;
  http: HttpShared;
  log: Logger;
  quota?: QuotaCounter;
  now?: () => Date;
  /** Hard cap for one source/company run. */
  timeoutMs?: number;
}

export interface RunSummary {
  runId: number;
  source: string;
  companyId: number | null;
  status: "ok" | "error";
  fetched: number;
  nbNew: number;
  closed: number;
  unchanged: boolean;
  error?: string;
  /** True when this failure flipped the company to `broken` (health alert). */
  becameBroken?: boolean;
}

export const unlimitedQuota: QuotaCounter = {
  remaining: async () => Number.POSITIVE_INFINITY,
  take: async () => true,
};

const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;

async function openSourceJobIds(db: AnyDb, source: string, companyId: number | null) {
  const rows = await db
    .select({ id: jobSources.sourceJobId })
    .from(jobSources)
    .innerJoin(jobs, eq(jobs.id, jobSources.jobId))
    .where(
      and(
        eq(jobSources.source, source),
        isNull(jobs.closedAt),
        companyId === null ? undefined : eq(jobs.companyId, companyId),
      ),
    );
  return new Set(rows.map((r) => r.id));
}

async function lastSuccess(db: AnyDb, source: string, companyId: number | null) {
  const [row] = await db
    .select({ at: sourceRuns.finishedAt })
    .from(sourceRuns)
    .where(
      and(
        eq(sourceRuns.source, source),
        eq(sourceRuns.status, "ok"),
        companyId === null ? isNull(sourceRuns.companyId) : eq(sourceRuns.companyId, companyId),
      ),
    )
    .orderBy(desc(sourceRuns.startedAt))
    .limit(1);
  return row?.at ?? undefined;
}

/** Jobs of (source, company) not seen since `runStart`. */
function staleJobIds(db: AnyDb, source: string, companyId: number, runStart: Date) {
  return db
    .select({ id: jobSources.jobId })
    .from(jobSources)
    .innerJoin(jobs, eq(jobs.id, jobSources.jobId))
    .where(
      and(
        eq(jobSources.source, source),
        lt(jobSources.lastSeenAt, runStart),
        eq(jobs.companyId, companyId),
        isNull(jobs.closedAt),
      ),
    );
}

/** A job missing from its ATS for CLOSE_AFTER_MISSED_RUNS complete runs gets closed_at. */
async function closeMissing(
  db: AnyDb,
  source: string,
  companyId: number,
  runStart: Date,
  now: Date,
) {
  const rows = await db
    .update(jobs)
    .set({
      missedRuns: sql`${jobs.missedRuns} + 1`,
      closedAt: sql`case when ${jobs.missedRuns} + 1 >= ${CLOSE_AFTER_MISSED_RUNS} then ${ts(now)} else null end`,
    })
    .where(inArray(jobs.id, staleJobIds(db, source, companyId, runStart)))
    .returning({ closedAt: jobs.closedAt });
  return rows.filter((r) => r.closedAt !== null).length;
}

/** 304 Not Modified: every open job of the source is still there. */
async function touchAllOpen(
  db: AnyDb,
  source: string,
  companyId: number,
  runStart: Date,
  now: Date,
) {
  const ids = staleJobIds(db, source, companyId, runStart);
  await db.update(jobs).set({ lastSeenAt: now, missedRuns: 0 }).where(inArray(jobs.id, ids));
  await db
    .update(jobSources)
    .set({ lastSeenAt: now })
    .where(
      and(
        eq(jobSources.source, source),
        inArray(
          jobSources.jobId,
          db
            .select({ id: jobs.id })
            .from(jobs)
            .where(and(eq(jobs.companyId, companyId), isNull(jobs.closedAt))),
        ),
      ),
    );
}

/** Runs one connector (for one company when it is an ATS) and records a `source_runs` row. */
export async function runSource(
  deps: RunDeps,
  connector: Connector,
  company?: Company,
): Promise<RunSummary> {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());
  const companyId = company?.id ?? null;
  const log = deps.log.child({ source: connector.id, company: company?.name });
  const startedAt = now();

  const [run] = await db
    .insert(sourceRuns)
    .values({ source: connector.id, companyId, startedAt, status: "running" })
    .returning({ id: sourceRuns.id });
  const runId = run!.id;

  const abort = new AbortController();
  const timer = setTimeout(
    () => abort.abort(new Error("run timeout")),
    deps.timeoutMs ?? 15 * 60_000,
  );
  const http = new PoliteHttpClient(deps.http, abort.signal);
  let unchanged = false;
  let fetched = 0;
  let nbNew = 0;
  let closed = 0;

  try {
    const ctx: FetchCtx = {
      http,
      quota: deps.quota ?? unlimitedQuota,
      log,
      since: await lastSuccess(db, connector.id, companyId),
      signal: abort.signal,
      knownIds: await openSourceJobIds(db, connector.id, companyId),
      wantDetails: (title) => !isClearlyNotNewGrad(title),
      markUnchanged: () => {
        unchanged = true;
      },
    };

    for await (const raw of connector.fetch(ctx, company)) {
      fetched++;
      const r = await ingestJob(db, raw, companyId, now());
      if (r.isNew) nbNew++;
    }

    if (connector.needsCompany && companyId !== null) {
      if (unchanged) await touchAllOpen(db, connector.id, companyId, startedAt, now());
      else closed = await closeMissing(db, connector.id, companyId, startedAt, now());
    }
    await http.commitValidators();

    await db
      .update(sourceRuns)
      .set({ status: "ok", finishedAt: now(), nbFetched: fetched, nbNew })
      .where(eq(sourceRuns.id, runId));
    if (companyId !== null) {
      await db
        .update(companies)
        .set({ consecutiveFailures: 0, atsStatus: "ok", lastOkAt: now() })
        .where(eq(companies.id, companyId));
    }
    log.info(
      { fetched, nbNew, closed, unchanged, ms: now().getTime() - startedAt.getTime() },
      "run ok",
    );
    return {
      runId,
      source: connector.id,
      companyId,
      status: "ok",
      fetched,
      nbNew,
      closed,
      unchanged,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(sourceRuns)
      .set({
        status: "error",
        finishedAt: now(),
        nbFetched: fetched,
        nbNew,
        error: message.slice(0, 2000),
      })
      .where(eq(sourceRuns.id, runId));

    let becameBroken = false;
    if (companyId !== null) {
      const [c] = await db
        .update(companies)
        .set({
          consecutiveFailures: sql`${companies.consecutiveFailures} + 1`,
          atsStatus: sql`case when ${companies.consecutiveFailures} + 1 >= ${BROKEN_AFTER_FAILURES} then 'broken'::ats_status else ${companies.atsStatus} end`,
        })
        .where(eq(companies.id, companyId))
        .returning({ failures: companies.consecutiveFailures });
      becameBroken = c?.failures === BROKEN_AFTER_FAILURES;
      if (becameBroken) {
        log.error({ alert: "health", failures: c?.failures }, "company ATS marked broken");
      }
    }
    log.error({ err: message, fetched }, "run failed");
    return {
      runId,
      source: connector.id,
      companyId,
      status: "error",
      fetched,
      nbNew,
      closed,
      unchanged,
      error: message,
      becameBroken,
    };
  } finally {
    clearTimeout(timer);
  }
}

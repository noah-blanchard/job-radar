import {
  rescoreJobs,
  staleFreshJobIds,
  syncProfileScores,
  type ProfileSyncResult,
} from "@jobradar/core";
import { withAdvisoryLock } from "./lock";
import type { Runtime } from "./runtime";

/**
 * Re-reads config/profile.yaml and, when its hash (or the scoring version) differs from the one
 * stored in `kv`, rescores every job. Under an advisory lock: never two full rescores at once.
 * An invalid profile.yaml is logged and the previous one is kept.
 */
export async function ensureProfileScores(
  rt: Runtime,
  opts: { force?: boolean } = {},
): Promise<ProfileSyncResult | undefined> {
  try {
    rt.reloadProfile();
  } catch (err) {
    rt.log.error({ err: String(err) }, "invalid config/profile.yaml: keeping the previous one");
  }
  const out = await withAdvisoryLock(rt.lockSql, "rescore:full", () =>
    syncProfileScores(rt.db, rt.profileFile, { log: rt.log, llm: rt.llm, force: opts.force }),
  );
  if (out === undefined) rt.log.info("full rescore already running elsewhere, skipped");
  return out;
}

/** Drops the < 24 h freshness bonus of jobs first seen more than 24 h ago. */
export async function refreshExpiredFreshness(rt: Runtime) {
  const ids = await staleFreshJobIds(rt.db);
  if (ids.length === 0) return;
  const r = await rescoreJobs(rt.db, { kind: "ids", ids }, { profile: rt.profile, log: rt.log });
  rt.log.info({ ...r, reason: "freshness expired" }, "jobs rescored");
}

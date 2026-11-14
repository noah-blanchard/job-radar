import {
  rescoreJobs,
  staleFreshJobIds,
  syncProfileScores,
  type ProfileSyncResult,
} from "@jobradar/core";
import { withAdvisoryLock } from "./lock";
import type { Runtime } from "./runtime";

/**
 * Reloads the users' profiles and fully rescores the users whose profile (or the scoring
 * version) differs from the one their stored scores reflect. Under an advisory lock: never two
 * full rescores at once (a call while one runs returns undefined). An invalid profile is logged
 * and that user keeps their previous scores.
 */
export async function ensureProfileScores(
  rt: Runtime,
  opts: { force?: boolean; userIds?: number[] } = {},
): Promise<ProfileSyncResult | undefined> {
  const out = await withAdvisoryLock(rt.lockSql, "rescore:full", async () => {
    const { invalid } = await rt.reloadProfiles();
    for (const i of invalid)
      rt.log.error(i, "invalid profile: keeping this user's previous scores");
    return syncProfileScores(rt.db, {
      log: rt.log,
      llm: rt.llm,
      force: opts.force,
      userIds: opts.userIds,
    });
  });
  if (out === undefined) rt.log.debug("full rescore already running elsewhere, skipped");
  return out;
}

/** Drops the < 24 h freshness bonus of jobs first seen more than 24 h ago. */
export async function refreshExpiredFreshness(rt: Runtime) {
  const ids = await staleFreshJobIds(rt.db);
  if (ids.length === 0) return;
  const r = await rescoreJobs(rt.db, { kind: "ids", ids }, { profiles: rt.profiles, log: rt.log });
  rt.log.info({ ...r, reason: "freshness expired" }, "jobs rescored");
}

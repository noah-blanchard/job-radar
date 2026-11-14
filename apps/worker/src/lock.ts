import type { Sql } from "@jobradar/db";

/**
 * Runs `fn` under a Postgres session advisory lock (never two runs of the same source at once,
 * even across processes). Returns `undefined` without running when the lock is already held.
 */
export async function withAdvisoryLock<T>(
  sql: Sql,
  name: string,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  // Session locks belong to a connection: reserve one for the whole critical section.
  const conn = await sql.reserve();
  try {
    const [row] = await conn<
      { locked: boolean }[]
    >`select pg_try_advisory_lock(hashtext(${name})) as locked`;
    if (!row?.locked) return undefined;
    try {
      return await fn();
    } finally {
      await conn`select pg_advisory_unlock(hashtext(${name}))`;
    }
  } finally {
    conn.release();
  }
}

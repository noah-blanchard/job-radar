import type { SQL } from "drizzle-orm";
import type { AnyDb } from "./types";

/**
 * Raw SQL returning rows, whatever the driver: postgres-js returns an array, PGlite an object
 * with `rows`. Bigint columns come back as strings with postgres-js: convert with Number().
 */
export async function queryRows<T extends Record<string, unknown>>(
  db: AnyDb,
  query: SQL,
): Promise<T[]> {
  const res = (await db.execute(query)) as unknown;
  if (Array.isArray(res)) return res as T[];
  return ((res as { rows?: T[] }).rows ?? []) as T[];
}

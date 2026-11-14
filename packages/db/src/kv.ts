import { eq, sql } from "drizzle-orm";
import { kv } from "./schema";
import type { AnyDb } from "./types";

export async function kvSet(db: AnyDb, key: string, value: unknown): Promise<void> {
  await db
    .insert(kv)
    .values({ key, value })
    .onConflictDoUpdate({ target: kv.key, set: { value, updatedAt: sql`now()` } });
}

export async function kvGet<T = unknown>(db: AnyDb, key: string): Promise<T | undefined> {
  const rows = await db.select().from(kv).where(eq(kv.key, key)).limit(1);
  return rows[0]?.value as T | undefined;
}

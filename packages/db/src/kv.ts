import { eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { kv } from "./schema";

export async function kvSet(db: Db, key: string, value: unknown): Promise<void> {
  await db
    .insert(kv)
    .values({ key, value })
    .onConflictDoUpdate({ target: kv.key, set: { value, updatedAt: sql`now()` } });
}

export async function kvGet<T = unknown>(db: Db, key: string): Promise<T | undefined> {
  const rows = await db.select().from(kv).where(eq(kv.key, key)).limit(1);
  return rows[0]?.value as T | undefined;
}

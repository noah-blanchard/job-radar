import "server-only";
import { createDb, type Db } from "@jobradar/db";

const globalForDb = globalThis as unknown as { __jobradarDb?: Db };

/** Lazily-created singleton (survives dev hot reloads). */
export function getDb(): Db {
  if (!globalForDb.__jobradarDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.__jobradarDb = createDb(url, { max: 5 }).db;
  }
  return globalForDb.__jobradarDb;
}

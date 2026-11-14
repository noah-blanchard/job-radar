import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client";

export async function runMigrations(url: string, migrationsFolder: string): Promise<void> {
  const { db, close } = createDb(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await close();
  }
}

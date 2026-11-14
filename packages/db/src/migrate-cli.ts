import { fileURLToPath } from "node:url";
import { runMigrations } from "./migrate";

// In dev (tsx) migrations live at ../migrations; in the bundled image MIGRATIONS_DIR is set.
const folder =
  process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL("../migrations", import.meta.url));
const url = process.env.DATABASE_URL;

function log(level: "info" | "error", msg: string, extra: Record<string, unknown> = {}) {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    service: "migrate",
    msg,
    ...extra,
  });
  if (level === "error") console.error(line);
  else console.log(line);
}

if (!url) {
  log("error", "DATABASE_URL is required");
  process.exit(1);
}

const started = Date.now();
runMigrations(url, folder)
  .then(() => {
    log("info", "migrations applied", { folder, ms: Date.now() - started });
    process.exit(0);
  })
  .catch((err: unknown) => {
    log("error", "migration failed", { err: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });

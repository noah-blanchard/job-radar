import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = fileURLToPath(new URL("../migrations", import.meta.url));
const sqlText = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(`${dir}/${f}`, "utf8"))
  .join("\n");

describe("generated migrations", () => {
  it.each([
    "companies",
    "jobs",
    "job_sources",
    "job_status",
    "source_runs",
    "api_usage",
    "alerts_sent",
    "kv",
  ])("creates table %s", (table) => {
    expect(sqlText).toContain(`CREATE TABLE "${table}"`);
  });

  it("has the required jobs indexes", () => {
    expect(sqlText).toMatch(/CREATE UNIQUE INDEX "jobs_fingerprint_uq"/);
    expect(sqlText).toMatch(/"jobs_tsv_idx" ON "jobs" USING gin \("tsv"\)/);
    expect(sqlText).toMatch(/"jobs_first_seen_idx" ON "jobs" USING btree \("first_seen_at" DESC/);
    expect(sqlText).toMatch(/"jobs_score_idx" ON "jobs" USING btree \("score" DESC/);
    expect(sqlText).toMatch(/"jobs_country_idx"/);
  });

  it("makes tsv a stored generated column", () => {
    expect(sqlText).toMatch(/"tsv" "tsvector" GENERATED ALWAYS AS \(.*\) STORED/);
  });

  it("deduplicates alerts", () => {
    expect(sqlText).toMatch(/CREATE UNIQUE INDEX "alerts_sent_dedup_uq"/);
  });
});

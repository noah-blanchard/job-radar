import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { companies, eq, type AnyDb } from "@jobradar/db";
import { parse } from "yaml";
import { z } from "zod";
import { companyKey } from "./normalize/text";

/** CONFIG_DIR, else the nearest `config/` folder above the cwd (works from apps/* in dev). */
export function findConfigDir(start = process.cwd()): string {
  if (process.env.CONFIG_DIR) return resolve(process.env.CONFIG_DIR);
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, "config", "sources.yaml"))) return join(dir, "config");
    const up = dirname(dir);
    if (up === dir) throw new Error(`config/ not found above ${start} (set CONFIG_DIR)`);
    dir = up;
  }
}

const SourceEntry = z.object({
  enabled: z.boolean().default(false),
  status: z.enum(["verified", "disabled", "unverified"]).default("unverified"),
  schedule: z.enum(["ats", "aggregators", "feeds"]),
  min_interval_ms: z.number().int().nonnegative().optional(),
  quota_env: z.string().optional(),
});
const SourcesFile = z.object({
  ats: z.record(z.string(), SourceEntry).default({}),
  aggregators: z.record(z.string(), SourceEntry).default({}),
  feeds: z.record(z.string(), SourceEntry).default({}),
});
export type SourceConfig = z.infer<typeof SourceEntry> & { id: string };

export function loadSourcesConfig(dir = findConfigDir()): SourceConfig[] {
  const raw = SourcesFile.parse(parse(readFileSync(join(dir, "sources.yaml"), "utf8")));
  return [
    ...Object.entries(raw.ats),
    ...Object.entries(raw.aggregators),
    ...Object.entries(raw.feeds),
  ].map(([id, v]) => ({ id, ...v }));
}

const SeedCompany = z.object({
  name: z.string().min(1),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  ats: z.string().nullish(),
  ats_key: z.string().nullish(),
  careers_url: z.string().nullish(),
  note: z.string().nullish(),
});
const SeedFile = z.object({ companies: z.array(SeedCompany) });
export type SeedCompany = z.infer<typeof SeedCompany>;

export function loadCompanySeed(dir = findConfigDir()): SeedCompany[] {
  return SeedFile.parse(parse(readFileSync(join(dir, "companies.seed.yaml"), "utf8"))).companies;
}

/**
 * Idempotent seed sync: inserts missing companies (origin=seed) and fills/updates ATS info and
 * priority from the seed. Never deletes, never touches discovered companies' priority.
 */
export async function syncCompanySeed(db: AnyDb, seed: SeedCompany[]) {
  let inserted = 0;
  let updated = 0;
  for (const s of seed) {
    const nameKey = companyKey(s.name);
    const [existing] = await db
      .select()
      .from(companies)
      .where(eq(companies.nameKey, nameKey))
      .limit(1);
    if (!existing) {
      await db
        .insert(companies)
        .values({
          name: s.name,
          nameKey,
          ats: s.ats ?? null,
          atsKey: s.ats_key ?? null,
          careersUrl: s.careers_url ?? null,
          priority: s.priority,
          origin: "seed",
        })
        .onConflictDoNothing();
      inserted++;
      continue;
    }
    const patch: Partial<typeof companies.$inferInsert> = {};
    if (s.ats && (s.ats !== existing.ats || s.ats_key !== existing.atsKey)) {
      patch.ats = s.ats;
      patch.atsKey = s.ats_key ?? null;
      patch.atsStatus = "unknown";
      patch.consecutiveFailures = 0;
    }
    if (s.careers_url && s.careers_url !== existing.careersUrl) patch.careersUrl = s.careers_url;
    // A priority edited in the dashboard (priority_manual) wins over the seed file.
    if (existing.origin === "seed" && !existing.priorityManual && s.priority !== existing.priority)
      patch.priority = s.priority;
    if (Object.keys(patch).length > 0) {
      await db.update(companies).set(patch).where(eq(companies.id, existing.id));
      updated++;
    }
  }
  return { inserted, updated };
}

const ProfileLocation = z.object({
  match: z.string().optional(),
  country: z.string().optional(),
  remote: z.boolean().optional(),
  weight: z.number(),
});
const ProfileFile = z.object({
  grad_date: z.union([z.string(), z.date()]).optional(),
  seniority: z.string().optional(),
  locations: z.array(ProfileLocation).default([]),
  domains: z.record(z.string(), z.array(z.string())).default({}),
  languages: z.array(z.string()).default([]),
  work_auth_note: z.string().nullish(),
  exclude_companies: z.array(z.string()).default([]),
  exclude_title: z.array(z.string()).default([]),
});
export type Profile = z.infer<typeof ProfileFile>;

export function parseProfile(raw: unknown): Profile {
  return ProfileFile.parse(raw ?? {});
}

export function loadProfile(dir = findConfigDir()): Profile {
  return parseProfile(parse(readFileSync(join(dir, "profile.yaml"), "utf8")));
}

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { asc, users, type AnyDb } from "@jobradar/db";
import { parse } from "yaml";
import { findConfigDir, parseProfile, type Profile } from "../config";
import { profileHash } from "./score";

export interface LoadedProfile {
  profile: Profile;
  text: string;
  hash: string;
}

/** Profile YAML text -> parsed profile and hash. Throws on invalid YAML or schema. */
export function parseProfileText(text: string): LoadedProfile {
  return { profile: parseProfile(parse(text)), text, hash: profileHash(text) };
}

/** config/profile.yaml (the owner's starting profile): parsed profile, raw text and hash. */
export function loadProfileFile(dir = findConfigDir()): LoadedProfile {
  return parseProfileText(readFileSync(join(dir, "profile.yaml"), "utf8"));
}

/** A user's profile, as the scorer needs it. */
export interface UserProfile extends LoadedProfile {
  userId: number;
  /** Hash the stored `job_scores` of this user reflect (null: never scored). */
  scoredHash: string | null;
}

export interface UserProfiles {
  profiles: UserProfile[];
  /** Users whose profile does not parse: not scored, shown in their /settings. */
  invalid: { userId: number; error: string }[];
}

/** Every user with a non-empty profile, parsed. An invalid profile never blocks the others. */
export async function loadUserProfiles(db: AnyDb): Promise<UserProfiles> {
  const rows = await db
    .select({ id: users.id, text: users.profileYaml, scoredHash: users.scoredHash })
    .from(users)
    .orderBy(asc(users.id));
  const out: UserProfiles = { profiles: [], invalid: [] };
  for (const r of rows) {
    if (!r.text.trim()) continue;
    try {
      out.profiles.push({ ...parseProfileText(r.text), userId: r.id, scoredHash: r.scoredHash });
    } catch (err) {
      out.invalid.push({ userId: r.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}

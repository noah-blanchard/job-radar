import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { findConfigDir, parseProfile, type Profile } from "../config";
import { profileHash } from "./score";

/** kv key holding the hash of the profile (and scoring version) the stored scores reflect. */
export const PROFILE_KV_KEY = "profile_hash";

/** Value stored under PROFILE_KV_KEY once a full rescore succeeded. */
export interface AppliedProfile {
  hash: string;
  appliedAt: string;
  text: string;
  jobs: number;
  ms: number;
}

export interface LoadedProfile {
  profile: Profile;
  text: string;
  hash: string;
}

/** config/profile.yaml: parsed profile, raw text and hash. */
export function loadProfileFile(dir = findConfigDir()): LoadedProfile {
  const text = readFileSync(join(dir, "profile.yaml"), "utf8");
  return { profile: parseProfile(parse(text)), text, hash: profileHash(text) };
}

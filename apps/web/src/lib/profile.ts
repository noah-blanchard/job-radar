import "server-only";
import { loadProfileFile, type LoadedProfile } from "@jobradar/core/score";

/**
 * config/profile.yaml as seen by the dashboard (CONFIG_DIR in Docker). Read on every call: the
 * file is tiny and edits must show up without a restart. Null when the file is missing/invalid.
 */
export function readProfile(): (LoadedProfile & { error?: undefined }) | { error: string } {
  try {
    return loadProfileFile();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export function profileDomains(): string[] {
  const p = readProfile();
  return "profile" in p ? Object.keys(p.profile.domains) : [];
}

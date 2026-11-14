import "server-only";
import { parseProfileText, type LoadedProfile } from "@jobradar/core/score";
import { getUser } from "@jobradar/core/users";
import { getDb } from "./db";

export type ProfileState =
  /** No profile yet: nothing is scored for this user. */
  | { state: "empty"; text: ""; scoredAt: Date | null }
  /** Does not parse: the user keeps their previous scores. */
  | { state: "invalid"; text: string; error: string; scoredAt: Date | null }
  /** Saved, the worker has not rescored with it yet (within a minute, ~1 min per 100k jobs). */
  | ({ state: "pending"; scoredAt: Date | null } & LoadedProfile)
  /** The stored scores reflect this profile. */
  | ({ state: "ok"; scoredAt: Date | null } & LoadedProfile);

/** A user's profile (stored in the database) and whether their scores reflect it. */
export async function readProfile(userId: number): Promise<ProfileState> {
  const u = await getUser(getDb(), userId);
  const text = u?.profileYaml ?? "";
  const scoredAt = u?.scoredAt ?? null;
  if (!text.trim()) return { state: "empty", text: "", scoredAt };
  try {
    const loaded = parseProfileText(text);
    return { ...loaded, state: u?.scoredHash === loaded.hash ? "ok" : "pending", scoredAt };
  } catch (err) {
    return {
      state: "invalid",
      text,
      error: err instanceof Error ? err.message : String(err),
      scoredAt,
    };
  }
}

/** Domains of a user's profile (Inbox domain filter). */
export async function profileDomains(userId: number): Promise<string[]> {
  const p = await readProfile(userId);
  return "profile" in p ? Object.keys(p.profile.domains) : [];
}

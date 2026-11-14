"use server";

import { ALERT_TEST_REQUEST_KEY } from "@jobradar/core/alerts/keys";
import {
  createInvite,
  deleteUser,
  findUserByEmail,
  getUser,
  hashPassword,
  MIN_PASSWORD_LENGTH,
  verifyPassword,
} from "@jobradar/core/users";
import { parseProfileText, profileProblems } from "@jobradar/core/score";
import { eq, kvSet, users } from "@jobradar/db";
import { revalidatePath } from "next/cache";
import { currentUser, sessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

/**
 * "Tester les canaux": the dashboard never sends anything itself. It records a request in `kv`
 * that the worker claims at its one-minute tick; the outcome comes back in `alert_test_result`.
 * The env channels are the owner's: admins only.
 */
export async function requestAlertTest(): Promise<{ ok: boolean }> {
  if ((await sessionUser())?.role !== "admin") return { ok: false };
  await kvSet(getDb(), ALERT_TEST_REQUEST_KEY, { requestedAt: new Date().toISOString() });
  revalidatePath("/settings");
  return { ok: true };
}

export interface FormState {
  ok?: string;
  error?: string;
  /** Invitation / reset link, shown once. */
  link?: string;
}

const linkFor = (token: string) =>
  `${(process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "")}/invite/${token}`;

/** Admin: invitation link for a new e-mail, or reset link for an existing account. */
export async function inviteUser(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await sessionUser();
  if (admin?.role !== "admin") return { error: "Réservé à l'admin." };
  const email = String(form.get("email") ?? "").trim();
  try {
    const existing = await findUserByEmail(getDb(), email);
    const inv = await createInvite(getDb(), { email, createdBy: admin.id });
    revalidatePath("/settings");
    return {
      ok: existing
        ? `Lien de réinitialisation du mot de passe pour ${email} (valable 7 jours) :`
        : `Invitation pour ${email} (valable 7 jours, un seul usage) :`,
      link: linkFor(inv.token),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Admin: deletes an account and its scores, statuses and priorities. */
export async function removeUser(id: number): Promise<{ ok: boolean; error?: string }> {
  const admin = await sessionUser();
  if (admin?.role !== "admin") return { ok: false, error: "réservé à l'admin" };
  if (id === admin.id) return { ok: false, error: "impossible de supprimer ton propre compte" };
  try {
    await deleteUser(getDb(), id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath("/settings");
  return { ok: true };
}

/** Any user: changes their own password (current password required). */
export async function changePassword(_prev: FormState, form: FormData): Promise<FormState> {
  const me = await currentUser();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("password") ?? "");
  if (next.length < MIN_PASSWORD_LENGTH)
    return { error: `${MIN_PASSWORD_LENGTH} caractères minimum.` };
  if (next !== String(form.get("confirm") ?? ""))
    return { error: "Les deux mots de passe diffèrent." };
  const db = getDb();
  const u = await getUser(db, me.id);
  if (!(await verifyPassword(current, u?.passwordHash)))
    return { error: "Mot de passe actuel incorrect." };
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next) })
    .where(eq(users.id, me.id));
  return { ok: "Mot de passe modifié." };
}

export interface ProfileFormState {
  ok?: string;
  errors?: string[];
}

const MAX_PROFILE_BYTES = 100_000;

/** Readable lines from a YAML or schema error ("locations.0.weight : nombre attendu"). */
function profileErrors(err: unknown): string[] {
  if (err && typeof err === "object" && "issues" in err && Array.isArray(err.issues))
    return (err.issues as { path: PropertyKey[]; message: string }[]).map(
      (i) => `${i.path.map(String).join(".") || "profil"} : ${i.message}`,
    );
  return [err instanceof Error ? err.message : String(err)];
}

/**
 * Saves the signed-in user's profile after checking the YAML, the schema and every pattern.
 * The worker sees the new hash at its next tick and rescores this user (about a minute).
 */
export async function saveProfile(
  _prev: ProfileFormState,
  form: FormData,
): Promise<ProfileFormState> {
  const me = await currentUser();
  const text = String(form.get("profile") ?? "").replace(/\r\n/g, "\n");
  if (!text.trim()) return { errors: ["Le profil est vide."] };
  if (Buffer.byteLength(text) > MAX_PROFILE_BYTES)
    return { errors: ["Profil trop long (100 Ko au plus)."] };
  let parsed;
  try {
    parsed = parseProfileText(text);
  } catch (err) {
    return { errors: profileErrors(err) };
  }
  const problems = profileProblems(parsed.profile);
  if (problems.length > 0) return { errors: problems };
  if (parsed.profile.locations.length === 0 && Object.keys(parsed.profile.domains).length === 0)
    return { errors: ["Ajoute au moins un lieu (locations) ou un domaine (domains)."] };
  await getDb()
    .update(users)
    .set({ profileYaml: text, profileUpdatedAt: new Date() })
    .where(eq(users.id, me.id));
  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: "Profil enregistré : tes scores sont recalculés dans la minute." };
}

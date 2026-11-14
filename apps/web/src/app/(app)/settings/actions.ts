"use server";

import { alertTestRequestKey } from "@jobradar/core/alerts/keys";
import {
  createInvite,
  deleteUser,
  findUserByEmail,
  getUser,
  hashPassword,
  isValidEmail,
  MIN_PASSWORD_LENGTH,
  ownerUser,
  verifyPassword,
} from "@jobradar/core/users";
import { parseProfileText, profileProblems, type ProfileProblem } from "@jobradar/core/score";
import { eq, kvSet, users } from "@jobradar/db";
import { revalidatePath } from "next/cache";
import { parseLocale } from "@/i18n/config";
import type { T } from "@/i18n/messages";
import { getT, rememberLocale } from "@/i18n/server";
import { currentUser, sessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

/**
 * "Test the channels": the dashboard never sends anything itself. It records a request in `kv`
 * (`alert_test_request:<user id>`) that the worker claims at its one-minute tick; it sends a
 * [TEST] digest on this user's channels and stores the outcome in `alert_test_result:<user id>`.
 */
export async function requestAlertTest(): Promise<{ ok: boolean }> {
  const me = await currentUser();
  await kvSet(getDb(), alertTestRequestKey(me.id), { requestedAt: new Date().toISOString() });
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
  const t = await getT();
  if (admin?.role !== "admin") return { error: t("common.adminOnly") };
  const email = String(form.get("email") ?? "").trim();
  if (!isValidEmail(email)) return { error: t("settings.accounts.invalidEmail") };
  try {
    const existing = await findUserByEmail(getDb(), email);
    const inv = await createInvite(getDb(), { email, createdBy: admin.id });
    revalidatePath("/settings");
    return {
      ok: existing
        ? t("settings.accounts.resetLink", { email })
        : t("settings.accounts.inviteLink", { email }),
      link: linkFor(inv.token),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Admin: deletes an account and its scores, statuses and priorities. */
export async function removeUser(id: number): Promise<{ ok: boolean; error?: string }> {
  const admin = await sessionUser();
  const t = await getT();
  if (admin?.role !== "admin") return { ok: false, error: t("common.adminOnly") };
  if (id === admin.id) return { ok: false, error: t("settings.accounts.cannotDeleteSelf") };
  if ((await ownerUser(getDb()))?.id === id)
    return { ok: false, error: t("settings.accounts.cannotDeleteOwner") };
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
  const t = await getT();
  if (next.length < MIN_PASSWORD_LENGTH)
    return { error: t("settings.password.tooShort", { min: MIN_PASSWORD_LENGTH }) };
  if (next !== String(form.get("confirm") ?? "")) return { error: t("settings.password.mismatch") };
  const db = getDb();
  const u = await getUser(db, me.id);
  if (!(await verifyPassword(current, u?.passwordHash)))
    return { error: t("settings.password.wrong") };
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next) })
    .where(eq(users.id, me.id));
  return { ok: t("settings.password.changed") };
}

export interface ProfileFormState {
  ok?: string;
  errors?: string[];
}

const MAX_PROFILE_BYTES = 100_000;

/** Readable lines from a YAML or schema error ("locations.0.weight: expected number"). */
function profileErrors(err: unknown, root: string): string[] {
  if (err && typeof err === "object" && "issues" in err && Array.isArray(err.issues))
    return (err.issues as { path: PropertyKey[]; message: string }[]).map(
      (i) => `${i.path.map(String).join(".") || root}: ${i.message}`,
    );
  return [err instanceof Error ? err.message : String(err)];
}

/** "domain web: “node(js” is not valid (Unterminated group)", in the interface language. */
function problemLine({ where, pattern, reason }: ProfileProblem, t: T): string {
  const place =
    where.field === "locations"
      ? t("settings.profile.problem.location", { n: where.position })
      : where.field === "domains"
        ? t("settings.profile.problem.domain", { name: where.name })
        : where.field;
  return t("settings.profile.problem.invalidPattern", { where: place, pattern, reason });
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
  const t = await getT();
  if (!text.trim()) return { errors: [t("settings.profile.empty")] };
  if (Buffer.byteLength(text) > MAX_PROFILE_BYTES)
    return { errors: [t("settings.profile.tooLong")] };
  let parsed;
  try {
    parsed = parseProfileText(text);
  } catch (err) {
    return { errors: profileErrors(err, t("settings.profile.root")) };
  }
  const problems = profileProblems(parsed.profile);
  if (problems.length > 0) return { errors: problems.map((p) => problemLine(p, t)) };
  if (parsed.profile.locations.length === 0 && Object.keys(parsed.profile.domains).length === 0)
    return { errors: [t("settings.profile.needOne")] };
  await getDb()
    .update(users)
    .set({ profileYaml: text, profileUpdatedAt: new Date() })
    .where(eq(users.id, me.id));
  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: t("settings.profile.saved") };
}

const score = (v: FormDataEntryValue | null): number | null | "invalid" => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : "invalid";
};

/**
 * The signed-in user's alert settings. The owner's channels are the .env ones; everyone else
 * sets their own e-mail address and ntfy topic. Empty thresholds = the server defaults.
 */
export async function saveAlertSettings(_prev: FormState, form: FormData): Promise<FormState> {
  const me = await currentUser();
  const db = getDb();
  const owner = await ownerUser(db);
  const digestMinScore = score(form.get("digestMinScore"));
  const instantMinScore = score(form.get("instantMinScore"));
  const t = await getT();
  if (digestMinScore === "invalid" || instantMinScore === "invalid")
    return { error: t("settings.alerts.scoreRange") };
  const patch: Partial<typeof users.$inferInsert> = {
    digestEnabled: form.get("digestEnabled") === "on",
    digestMinScore,
    instantEnabled: form.get("instantEnabled") === "on",
    instantMinScore,
  };
  if (owner?.id !== me.id) {
    const email = String(form.get("alertEmail") ?? "").trim();
    const topic = String(form.get("ntfyTopic") ?? "").trim();
    if (email && !isValidEmail(email)) return { error: t("settings.alerts.invalidEmail") };
    if (topic && !/^[A-Za-z0-9_-]{8,64}$/.test(topic))
      return { error: t("settings.alerts.invalidTopic") };
    // A disabled field (no SMTP server) is not submitted: keep the stored address.
    if (form.has("alertEmail")) patch.alertEmail = email || null;
    patch.ntfyTopic = topic || null;
  }
  await db.update(users).set(patch).where(eq(users.id, me.id));
  revalidatePath("/settings");
  return { ok: t("common.saved") };
}

/**
 * The signed-in user's interface language: on the account (every device) and in a cookie, so
 * the login page keeps it after logout. Every page re-renders in the new language.
 */
export async function setLocale(code: string): Promise<{ ok: boolean }> {
  const me = await currentUser();
  const locale = parseLocale(code);
  if (!locale) return { ok: false };
  await getDb().update(users).set({ locale }).where(eq(users.id, me.id));
  await rememberLocale(locale);
  return { ok: true };
}

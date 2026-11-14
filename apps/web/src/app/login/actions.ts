"use server";

import {
  acceptInvite,
  ensureOwner,
  findUserByEmail,
  MIN_PASSWORD_LENGTH,
  verifyPassword,
} from "@jobradar/core/users";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LOCALE_COOKIE, parseLocale } from "@/i18n/config";
import { getT } from "@/i18n/server";
import { getDb } from "@/lib/db";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, safeNextPath, signSession } from "@/lib/session";

export interface LoginState {
  error?: string;
}

const FAIL_DELAY_MS = 750;

/** Unset, empty, or only a comment (compose reads `KEY=   # comment` as "# comment"). */
function envValue(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v && !/^#(\s|$)/.test(v) ? v : undefined;
}

function cookieSecure(): boolean {
  return (process.env.PUBLIC_BASE_URL ?? "").startsWith("https://");
}

async function startSession(userId: number) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession(process.env.AUTH_SECRET!, userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const next = safeNextPath(String(form.get("next") ?? "/"));
  const t = await getT();
  if (!process.env.AUTH_SECRET) return { error: t("login.misconfigured") };
  const db = getDb();
  // First start: the owner account gets its e-mail and password from the env (idempotent).
  await ensureOwner(db, {
    ADMIN_EMAIL: envValue("ADMIN_EMAIL"),
    CONTACT_EMAIL: envValue("CONTACT_EMAIL"),
    DASHBOARD_PASSWORD: envValue("DASHBOARD_PASSWORD"),
  });

  const user = email ? await findUserByEmail(db, email) : undefined;
  // Always hash once, so an unknown e-mail takes as long as a wrong password.
  const ok = await verifyPassword(password, user?.passwordHash ?? "scrypt$16384$8$1$AA==$AA==");
  if (!user || !ok) {
    await new Promise((r) => setTimeout(r, FAIL_DELAY_MS));
    return { error: t("login.wrong") };
  }
  await startSession(user.id);
  redirect(next);
}

export async function logout(): Promise<never> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

/** Signed-out pages (login, invite): the language lives in this browser's cookie only. */
export async function setGuestLocale(code: string): Promise<void> {
  const locale = parseLocale(code);
  if (!locale) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}

export interface InviteState {
  error?: string;
}

/** Invitation (new account) or reset link: sets the password, then signs in. */
export async function acceptInviteAction(_prev: InviteState, form: FormData): Promise<InviteState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const t = await getT();
  if (password !== String(form.get("confirm") ?? ""))
    return { error: t("settings.password.mismatch") };
  if (!process.env.AUTH_SECRET) return { error: t("login.misconfigured") };
  const r = await acceptInvite(getDb(), {
    token,
    password,
    name: String(form.get("name") ?? ""),
  });
  if (!r.ok) return { error: t(`invite.error.${r.error}`, { min: MIN_PASSWORD_LENGTH }) };
  await startSession(r.userId);
  redirect("/settings");
}

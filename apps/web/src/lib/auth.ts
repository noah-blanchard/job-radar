import "server-only";
import { getUser } from "@jobradar/core/users";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { parseLocale, type Locale } from "@/i18n/config";
import { getDb } from "./db";
import { SESSION_COOKIE, verifySession } from "./session";

export interface SessionUser {
  id: number;
  email: string | null;
  name: string | null;
  role: "admin" | "user";
  /** Chosen interface language; null = follow the browser. */
  locale: Locale | null;
}

/** The signed-in user, or null (no cookie, bad signature, deleted account). */
export const sessionUser = cache(async (): Promise<SessionUser | null> => {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const id = await verifySession((await cookies()).get(SESSION_COOKIE)?.value, secret);
  if (id === null) return null;
  const u = await getUser(getDb(), id);
  if (!u || !u.passwordHash) return null;
  return { id: u.id, email: u.email, name: u.name, role: u.role, locale: parseLocale(u.locale) };
});

/**
 * The signed-in user; redirects to /login otherwise. Every page, action and route handler that
 * reads or writes per-user data (scores, statuses, priorities, profile) goes through this.
 */
export async function currentUser(): Promise<SessionUser> {
  const u = await sessionUser();
  if (!u) redirect("/login");
  return u;
}

/** Admin-only pages and actions (accounts, manual runs, global alert channels). */
export async function requireAdmin(): Promise<SessionUser> {
  const u = await currentUser();
  if (u.role !== "admin") redirect("/");
  return u;
}

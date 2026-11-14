"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword } from "@/lib/password";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, safeNextPath, signSession } from "@/lib/session";

export interface LoginState {
  error?: string;
}

const FAIL_DELAY_MS = 750;

function cookieSecure(): boolean {
  return (process.env.PUBLIC_BASE_URL ?? "").startsWith("https://");
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const password = String(form.get("password") ?? "");
  const next = safeNextPath(String(form.get("next") ?? "/"));
  const secret = process.env.AUTH_SECRET;

  if (!secret || !process.env.DASHBOARD_PASSWORD) {
    return { error: "Serveur mal configuré : DASHBOARD_PASSWORD et AUTH_SECRET sont requis." };
  }
  if (!checkPassword(password, process.env.DASHBOARD_PASSWORD)) {
    // Slow down brute force a little; single-user app, no lockout needed.
    await new Promise((r) => setTimeout(r, FAIL_DELAY_MS));
    return { error: "Mot de passe incorrect." };
  }

  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession(secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  redirect(next);
}

export async function logout(): Promise<never> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

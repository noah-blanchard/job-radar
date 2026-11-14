"use server";

import { detectAts, registerCompany } from "@jobradar/core/discovery";
import { and, companies, companyPrefs, eq, kvSet } from "@jobradar/db";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export interface AddCompanyState {
  ok?: string;
  error?: string;
}

/**
 * Adds a company from a careers/board URL. Detection is URL-based only (no network call from the
 * dashboard); `pnpm detect-ats <url>` also probes the public board APIs.
 */
export async function addCompany(_prev: AddCompanyState, form: FormData): Promise<AddCompanyState> {
  const url = String(form.get("url") ?? "").trim();
  const name = String(form.get("name") ?? "").trim();
  if (!url) return { error: "URL requise." };
  const d = detectAts(url);
  if (!d) {
    return {
      error:
        "ATS non reconnu dans cette URL. Colle l'URL du board (ex. jobs.lever.co/acme) ou lance `pnpm detect-ats <url>` pour sonder les API publiques.",
    };
  }
  const companyName = name || d.atsKey.split(/[/:]/).pop()!;
  const r = await registerCompany(getDb(), {
    name: companyName,
    ats: d.ats,
    atsKey: d.atsKey,
    careersUrl: url,
    origin: "manual",
  });
  revalidatePath("/companies");
  if (r.created) return { ok: `Ajoutée : ${companyName} (${d.ats} ${d.atsKey}).` };
  if (r.updated) return { ok: `${companyName} utilise maintenant ${d.ats} ${d.atsKey}.` };
  return { ok: `Déjà connue (${d.ats} ${d.atsKey}).` };
}

const PRIORITIES = ["low", "normal", "high"] as const;
type Priority = (typeof PRIORITIES)[number];

/**
 * Edits the signed-in user's priority for a company (`company_prefs`: "normal" removes it). A
 * rescore request makes the worker update their "entreprise prioritaire" bonus within a minute.
 * The sweep order (`companies.priority`) is not touched: a "high" from any user already puts
 * the company first in the ATS sweep.
 */
export async function setCompanyPriority(
  companyId: number,
  priority: Priority,
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isSafeInteger(companyId) || companyId <= 0 || !PRIORITIES.includes(priority))
    return { ok: false, error: "requête invalide" };
  const db = getDb();
  const user = await currentUser();
  const [company] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company) return { ok: false, error: "entreprise introuvable" };
  if (priority === "normal")
    await db
      .delete(companyPrefs)
      .where(and(eq(companyPrefs.userId, user.id), eq(companyPrefs.companyId, companyId)));
  else
    await db
      .insert(companyPrefs)
      .values({ userId: user.id, companyId, priority })
      .onConflictDoUpdate({
        target: [companyPrefs.userId, companyPrefs.companyId],
        set: { priority },
      });
  await kvSet(db, `rescore_request:company:${companyId}:${user.id}`, {
    requestedAt: new Date().toISOString(),
  });
  revalidatePath("/companies");
  return { ok: true };
}

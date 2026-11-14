"use server";

import { detectAts, registerCompany } from "@jobradar/core/discovery";
import { companies, eq, kvSet } from "@jobradar/db";
import { revalidatePath } from "next/cache";
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
 * Edits a company's priority. `priority_manual` keeps the seed sync from reverting it, and a
 * rescore request makes the worker update the "entreprise prioritaire" bonus within a minute.
 */
export async function setCompanyPriority(
  companyId: number,
  priority: Priority,
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isSafeInteger(companyId) || companyId <= 0 || !PRIORITIES.includes(priority))
    return { ok: false, error: "requête invalide" };
  const db = getDb();
  const rows = await db
    .update(companies)
    .set({ priority, priorityManual: true })
    .where(eq(companies.id, companyId))
    .returning({ id: companies.id });
  if (rows.length === 0) return { ok: false, error: "entreprise introuvable" };
  await kvSet(db, `rescore_request:company:${companyId}`, {
    requestedAt: new Date().toISOString(),
  });
  revalidatePath("/companies");
  return { ok: true };
}

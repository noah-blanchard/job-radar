"use server";

import { detectAts, registerCompany } from "@jobradar/core/discovery";
import { and, companies, companyPrefs, eq, kvSet } from "@jobradar/db";
import { revalidatePath } from "next/cache";
import { getT } from "@/i18n/server";
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
  const t = await getT();
  if (!url) return { error: t("companies.urlRequired") };
  const d = detectAts(url);
  if (!d) return { error: t("companies.atsUnknown") };
  const companyName = name || d.atsKey.split(/[/:]/).pop()!;
  const r = await registerCompany(getDb(), {
    name: companyName,
    ats: d.ats,
    atsKey: d.atsKey,
    careersUrl: url,
    origin: "manual",
  });
  revalidatePath("/companies");
  const params = { name: companyName, ats: d.ats, key: d.atsKey };
  if (r.created) return { ok: t("companies.added", params) };
  if (r.updated) return { ok: t("companies.updated", params) };
  return { ok: t("companies.known", params) };
}

const PRIORITIES = ["low", "normal", "high"] as const;
type Priority = (typeof PRIORITIES)[number];

/**
 * Edits the signed-in user's priority for a company (`company_prefs`: "normal" removes it). A
 * rescore request makes the worker update their priority bonus within a minute.
 * The sweep order (`companies.priority`) is not touched: a "high" from any user already puts
 * the company first in the ATS sweep.
 */
export async function setCompanyPriority(
  companyId: number,
  priority: Priority,
): Promise<{ ok: boolean; error?: string }> {
  const t = await getT();
  if (!Number.isSafeInteger(companyId) || companyId <= 0 || !PRIORITIES.includes(priority))
    return { ok: false, error: t("common.invalidRequest") };
  const db = getDb();
  const user = await currentUser();
  const [company] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company) return { ok: false, error: t("companies.notFound") };
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

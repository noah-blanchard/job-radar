"use server";

import { loadSourcesConfig } from "@jobradar/core/config";
import { kvSet } from "@jobradar/db";
import { revalidatePath } from "next/cache";
import { getT } from "@/i18n/server";
import { sessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

/**
 * "Run now": the dashboard never runs a connector itself. It records a request in `kv`
 * (run_request:<source>) that the worker claims at its one-minute tick.
 */
export async function requestRun(source: string): Promise<{ ok: boolean; error?: string }> {
  const t = await getT();
  if ((await sessionUser())?.role !== "admin") return { ok: false, error: t("common.adminOnly") };
  const cfg = loadSourcesConfig().find((s) => s.id === source);
  if (!cfg) return { ok: false, error: t("sources.unknownSource") };
  if (!cfg.enabled) return { ok: false, error: t("sources.disabledSource") };
  await kvSet(getDb(), `run_request:${source}`, { requestedAt: new Date().toISOString() });
  revalidatePath("/sources");
  return { ok: true };
}

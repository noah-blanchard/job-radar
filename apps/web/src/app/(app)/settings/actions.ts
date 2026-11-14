"use server";

import { ALERT_TEST_REQUEST_KEY } from "@jobradar/core/alerts/keys";
import { kvSet } from "@jobradar/db";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";

/**
 * "Tester les canaux": the dashboard never sends anything itself. It records a request in `kv`
 * that the worker claims at its one-minute tick; the outcome comes back in `alert_test_result`.
 */
export async function requestAlertTest(): Promise<{ ok: boolean }> {
  await kvSet(getDb(), ALERT_TEST_REQUEST_KEY, { requestedAt: new Date().toISOString() });
  revalidatePath("/settings");
  return { ok: true };
}

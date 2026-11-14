import { and, apiUsage, eq, lt, sql, type AnyDb } from "@jobradar/db";
import type { QuotaCounter } from "../connectors/types";

/** Calendar day in America/Toronto (YYYY-MM-DD). */
export function torontoDay(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Daily quota backed by `api_usage`. `take()` is atomic: the increment only happens while
 * calls < dailyMax, so concurrent runs can never exceed the quota.
 */
export function dbQuota(
  db: AnyDb,
  source: string,
  dailyMax: number,
  now: () => Date = () => new Date(),
): QuotaCounter {
  return {
    async remaining() {
      const [row] = await db
        .select({ calls: apiUsage.calls })
        .from(apiUsage)
        .where(and(eq(apiUsage.source, source), eq(apiUsage.day, torontoDay(now()))));
      return Math.max(0, dailyMax - (row?.calls ?? 0));
    },
    async take() {
      if (dailyMax <= 0) return false;
      const day = torontoDay(now());
      const rows = await db
        .insert(apiUsage)
        .values({ source, day, calls: 1 })
        .onConflictDoUpdate({
          target: [apiUsage.source, apiUsage.day],
          set: { calls: sql`${apiUsage.calls} + 1` },
          setWhere: lt(apiUsage.calls, dailyMax),
        })
        .returning({ calls: apiUsage.calls });
      return rows.length > 0;
    },
  };
}

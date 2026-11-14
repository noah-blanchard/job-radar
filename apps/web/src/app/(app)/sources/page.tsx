import { loadSourcesConfig, type SourceConfig } from "@jobradar/core/config";
import { queryRows, sql } from "@jobradar/db";
import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { PageFrame, PageHeader, PageScroll } from "@/components/placeholder";
import { getFormat, getT } from "@/i18n/server";
import { getDb } from "@/lib/db";
import { cn } from "@/lib/utils";
import { RunButton } from "./run-button";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("nav.sources") };
}
export const dynamic = "force-dynamic";

interface SourceHealthRow extends Record<string, unknown> {
  source: string;
  last_started_at: Date;
  last_status: "running" | "ok" | "error" | "skipped";
  last_duration_ms: number | null;
  last_fetched: number;
  last_new: number;
  last_error: string | null;
  runs_24h: number;
  errors_24h: number;
}

async function loadSourceHealth() {
  const db = getDb();
  // Latest run per source (for ATS sources: the latest company run) + 24 h counters.
  const health = await queryRows<SourceHealthRow>(
    db,
    sql`
    with latest as (
      select distinct on (source)
        source, started_at, status, nb_fetched, nb_new, error,
        (extract(epoch from (finished_at - started_at)) * 1000)::int as duration_ms
      from source_runs
      order by source, started_at desc
    ),
    agg as (
      select source,
        count(*)::int as runs_24h,
        count(*) filter (where status = 'error')::int as errors_24h
      from source_runs
      where started_at > now() - interval '24 hours'
      group by source
    )
    select l.source,
      l.started_at as last_started_at,
      l.status as last_status,
      l.duration_ms as last_duration_ms,
      l.nb_fetched as last_fetched,
      l.nb_new as last_new,
      l.error as last_error,
      coalesce(a.runs_24h, 0) as runs_24h,
      coalesce(a.errors_24h, 0) as errors_24h
    from latest l
    left join agg a using (source)`,
  );
  const usage = await queryRows<{ source: string; calls: number }>(
    db,
    sql`select source, calls from api_usage
        where day = (now() at time zone 'America/Toronto')::date`,
  );
  const requests = await queryRows<{ key: string; value: { requestedAt: string } }>(
    db,
    sql`select key, value from kv where key like 'run_request:%'`,
  );
  return {
    health: new Map(health.map((r) => [r.source, r])),
    usage: new Map(usage.map((u) => [u.source, u.calls])),
    requests: new Map(requests.map((r) => [r.key.slice("run_request:".length), r.value])),
  };
}

const STATUS_CLASS = {
  ok: "text-success",
  error: "text-destructive",
  running: "text-info",
  skipped: "text-muted-foreground",
} as const;

/** Daily cap of a source from its `quota_env` variable (same env as the worker). */
function dailyMax(cfg: SourceConfig): number | null {
  if (!cfg.quota_env) return null;
  const n = Number(process.env[cfg.quota_env]);
  return Number.isFinite(n) && process.env[cfg.quota_env] !== "" ? n : null;
}

const GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 md:grid-cols-[minmax(10rem,1.3fr)_6rem_7rem_4rem_5.5rem_8rem_6rem]";

export default async function SourcesPage() {
  const config = loadSourcesConfig();
  const { health, usage, requests } = await loadSourceHealth();
  const llmMax = Number(process.env.LLM_DAILY_MAX_CALLS ?? 200);
  const llmEnabled = process.env.LLM_ENABLED === "true";
  const [t, format] = await Promise.all([getT(), getFormat()]);

  // Configured + seen-only sources; problems first, then enabled, then disabled.
  const ids = [...new Set([...config.map((c) => c.id), ...health.keys()])];
  const rows = ids.map((id) => {
    const cfg = config.find((c) => c.id === id);
    const r = health.get(id);
    const max = cfg ? dailyMax(cfg) : null;
    const used = usage.get(id) ?? 0;
    const exhausted = max !== null && max > 0 && used >= max;
    const problem = r?.last_status === "error" || exhausted;
    const rank = cfg && !cfg.enabled ? 3 : problem ? 0 : (r?.errors_24h ?? 0) > 0 ? 1 : 2;
    return { id, cfg, r, max, used, exhausted, problem, rank };
  });
  rows.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  const problems = rows.filter((r) => r.problem).length;

  return (
    <PageFrame>
      <PageHeader
        title={t("nav.sources")}
        description={problems ? t("sources.problems", { count: problems }) : t("sources.allGood")}
      />
      <PageScroll className="px-4 md:px-6">
        <div
          className={cn(
            GRID,
            "label-caps bg-background sticky top-0 z-10 hidden h-9 border-b md:grid",
          )}
        >
          <span>{t("sources.colSource")}</span>
          <span>{t("sources.colStatus")}</span>
          <span>{t("sources.colLastRun")}</span>
          <span className="text-right">{t("sources.colNew")}</span>
          <span className="text-right">{t("sources.colErrors")}</span>
          <span>{t("sources.colQuota")}</span>
          <span />
        </div>
        {rows.map(({ id, cfg, r, max, used, exhausted, problem }) => {
          const st = r
            ? { cls: STATUS_CLASS[r.last_status], label: t(`sources.status.${r.last_status}`) }
            : null;
          return (
            <details
              key={id}
              className={cn(
                "group border-border-soft border-b",
                cfg && !cfg.enabled && "opacity-50",
              )}
              open={problem && !!r?.last_error}
            >
              <summary
                className={cn(
                  GRID,
                  "min-h-12 cursor-pointer list-none py-2 [&::-webkit-details-marker]:hidden",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ChevronRight
                    className="text-muted-foreground size-3.5 shrink-0 transition-transform duration-[var(--dur)] group-open:rotate-90"
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{id}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {cfg ? t(`sources.schedule.${cfg.schedule}`) : t("sources.notInYaml")}
                      {cfg && !cfg.enabled ? t("sources.disabled") : ""}
                      <span className="md:hidden">
                        {" · "}
                        {st ? <span className={st.cls}>{st.label}</span> : t("sources.neverRun")}
                      </span>
                    </span>
                  </span>
                </span>
                <span
                  className={cn(
                    "hidden items-center gap-1.5 text-[13px] md:flex",
                    st?.cls ?? "text-muted-foreground",
                  )}
                >
                  {st ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
                  {st?.label ?? t("sources.neverRun")}
                </span>
                <span
                  className="text-muted-foreground hidden text-[13px] md:block"
                  title={r ? format.dateTime(new Date(r.last_started_at)) : undefined}
                >
                  {r ? t("sources.ago", { age: format.age(new Date(r.last_started_at)) }) : "—"}
                </span>
                <span className="hidden text-right tabular-nums md:block">
                  {r?.last_new ?? "—"}
                </span>
                <span
                  className={cn(
                    "hidden text-right tabular-nums md:block",
                    (r?.errors_24h ?? 0) > 0 ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {r?.errors_24h ?? 0}
                </span>
                <span className="hidden md:block">
                  {max !== null ? (
                    <span
                      className="flex items-center gap-2"
                      title={t("sources.quotaTitle", { used, left: Math.max(0, max - used) })}
                    >
                      <span className="bg-ledger-track h-[5px] w-14 overflow-hidden rounded-[1px]">
                        <span
                          className={cn(
                            "block h-full",
                            exhausted ? "bg-destructive" : "bg-[var(--ledger-2)]",
                          )}
                          style={{ width: `${Math.min(100, (used / Math.max(1, max)) * 100)}%` }}
                        />
                      </span>
                      <span
                        className={cn(
                          "text-xs tabular-nums",
                          exhausted ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {used}/{max}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">{t("sources.noQuota")}</span>
                  )}
                </span>
                <span className="flex justify-end">
                  {cfg?.enabled ? (
                    <RunButton source={id} pendingSince={requests.get(id)?.requestedAt} />
                  ) : null}
                </span>
              </summary>
              <div className="text-muted-foreground grid gap-x-8 gap-y-1 pb-3 pl-6 text-xs sm:grid-cols-[repeat(4,auto)_1fr]">
                <span>
                  {t("sources.duration")}{" "}
                  <span className="text-foreground">{format.duration(r?.last_duration_ms)}</span>
                </span>
                <span>
                  {t("sources.fetched")}{" "}
                  <span className="text-foreground tabular-nums">{r?.last_fetched ?? "—"}</span>
                </span>
                <span>
                  {t("sources.runs24h")}{" "}
                  <span className="text-foreground tabular-nums">{r?.runs_24h ?? 0}</span>
                </span>
                <span>
                  {t("sources.lastRun")}{" "}
                  <span className="text-foreground">
                    {r ? format.dateTime(new Date(r.last_started_at)) : "—"}
                  </span>
                </span>
                {r?.last_error ? (
                  <p className="text-destructive col-span-full mt-1 font-mono text-[11.5px] leading-relaxed break-all whitespace-pre-wrap">
                    {r.last_error}
                  </p>
                ) : null}
              </div>
            </details>
          );
        })}
        <p className="text-muted-foreground py-4 text-xs">
          {t("sources.llm")}{" "}
          {llmEnabled
            ? t("sources.llmOn", { used: usage.get("llm") ?? 0, max: llmMax })
            : t("sources.llmOff")}{" "}
          {t("sources.runHelp")}
        </p>
      </PageScroll>
    </PageFrame>
  );
}

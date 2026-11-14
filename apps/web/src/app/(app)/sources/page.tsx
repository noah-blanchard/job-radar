import { loadSourcesConfig, type SourceConfig } from "@jobradar/core/config";
import { queryRows, sql } from "@jobradar/db";
import type { Metadata } from "next";
import { PageHeader } from "@/components/placeholder";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDb } from "@/lib/db";
import { cn, formatDateTime, formatDuration } from "@/lib/utils";
import { RunButton } from "./run-button";

export const metadata: Metadata = { title: "Sources" };
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

const STATUS_VARIANT = {
  ok: "success",
  error: "destructive",
  running: "secondary",
  skipped: "outline",
} as const;

const SCHEDULE_LABEL: Record<SourceConfig["schedule"], string> = {
  ats: "ATS (6 h)",
  aggregators: "agrégateur (1/j)",
  feeds: "flux (6 h)",
};

/** Daily cap of a source from its `quota_env` variable (same env as the worker). */
function dailyMax(cfg: SourceConfig): number | null {
  if (!cfg.quota_env) return null;
  const n = Number(process.env[cfg.quota_env]);
  return Number.isFinite(n) && process.env[cfg.quota_env] !== "" ? n : null;
}

export default async function SourcesPage() {
  const config = loadSourcesConfig();
  const { health, usage, requests } = await loadSourceHealth();
  // Configured sources first (enabled, then disabled), then sources only seen in runs.
  const ids = [
    ...config.filter((c) => c.enabled).map((c) => c.id),
    ...[...health.keys()].filter((id) => !config.some((c) => c.id === id)),
    ...config.filter((c) => !c.enabled).map((c) => c.id),
  ];
  const llmMax = Number(process.env.LLM_DAILY_MAX_CALLS ?? 200);
  const llmEnabled = process.env.LLM_ENABLED === "true";

  return (
    <>
      <PageHeader
        title="Sources"
        description="Santé de chaque source : dernier run, volumes, erreurs, quota du jour (heure de Toronto). « Lancer » enregistre une demande que le worker exécute dans la minute."
      />
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Dernier run</TableHead>
              <TableHead className="text-right">Durée</TableHead>
              <TableHead className="text-right">Récup.</TableHead>
              <TableHead className="text-right">Nouv.</TableHead>
              <TableHead className="text-right">Runs 24 h</TableHead>
              <TableHead className="text-right">Erreurs 24 h</TableHead>
              <TableHead className="text-right">Quota (jour)</TableHead>
              <TableHead>Dernière erreur</TableHead>
              <TableHead>
                <span className="sr-only">Lancer</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ids.map((id) => {
              const cfg = config.find((c) => c.id === id);
              const r = health.get(id);
              const max = cfg ? dailyMax(cfg) : null;
              const used = usage.get(id) ?? 0;
              return (
                <TableRow key={id} className={cn(cfg && !cfg.enabled && "opacity-50")}>
                  <TableCell className="font-medium">
                    {id}
                    <div className="text-muted-foreground text-xs font-normal">
                      {cfg ? SCHEDULE_LABEL[cfg.schedule] : "hors sources.yaml"}
                      {cfg && !cfg.enabled ? " · désactivée" : ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    {r ? (
                      <Badge variant={STATUS_VARIANT[r.last_status]}>{r.last_status}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">jamais lancée</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r ? formatDateTime(new Date(r.last_started_at)) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatDuration(r?.last_duration_ms)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r?.last_fetched ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r?.last_new ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r?.runs_24h ?? 0}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      (r?.errors_24h ?? 0) > 0 && "text-destructive",
                    )}
                  >
                    {r?.errors_24h ?? 0}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {max !== null ? (
                      <span
                        className={cn(used >= max && "text-destructive")}
                        title={`${used} appels utilisés, ${Math.max(0, max - used)} restants`}
                      >
                        {used} / {max}
                        <span className="text-muted-foreground block text-xs">
                          {Math.max(0, max - used)} restants
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell
                    className="text-muted-foreground max-w-xs truncate"
                    title={r?.last_error ?? undefined}
                  >
                    {r?.last_error ?? "—"}
                  </TableCell>
                  <TableCell>
                    {cfg?.enabled ? (
                      <RunButton source={id} pendingSince={requests.get(id)?.requestedAt} />
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-muted-foreground mt-3 text-xs">
        LLM (classification des offres ambiguës) :{" "}
        {llmEnabled
          ? `activé, ${usage.get("llm") ?? 0} / ${llmMax} appels aujourd'hui`
          : "désactivé (LLM_ENABLED=false) : classification par règles uniquement"}
        .
      </p>
    </>
  );
}

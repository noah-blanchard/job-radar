import { sql } from "@jobradar/db";
import type { Metadata } from "next";
import { PageHeader } from "@/components/placeholder";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/lib/db";
import { formatDateTime, formatDuration } from "@/lib/utils";

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
  calls_today: number | null;
}

async function loadSourceHealth(): Promise<SourceHealthRow[]> {
  const rows = await getDb().execute<SourceHealthRow>(sql`
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
      coalesce(a.errors_24h, 0) as errors_24h,
      u.calls as calls_today
    from latest l
    left join agg a using (source)
    left join api_usage u
      on u.source = l.source
     and u.day = (now() at time zone 'America/Toronto')::date
    order by l.source`);
  return rows.map((r) => ({ ...r, last_started_at: new Date(r.last_started_at) }));
}

const STATUS_VARIANT = {
  ok: "success",
  error: "destructive",
  running: "secondary",
  skipped: "outline",
} as const;

export default async function SourcesPage() {
  const rows = await loadSourceHealth();
  return (
    <>
      <PageHeader title="Sources" description="Santé de chaque source : dernier run, volumes, erreurs, quota du jour." />
      {rows.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-sm">
          Aucun run enregistré pour l&apos;instant. Les connecteurs arrivent au jalon M1 ; chaque exécution
          apparaîtra ici.
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Dernier run</TableHead>
                <TableHead className="text-right">Durée</TableHead>
                <TableHead className="text-right">Récupérées</TableHead>
                <TableHead className="text-right">Nouvelles</TableHead>
                <TableHead className="text-right">Runs 24 h</TableHead>
                <TableHead className="text-right">Erreurs 24 h</TableHead>
                <TableHead className="text-right">Appels API (jour)</TableHead>
                <TableHead>Dernière erreur</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.source}>
                  <TableCell className="font-medium">{r.source}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.last_status]}>{r.last_status}</Badge>
                  </TableCell>
                  <TableCell>{formatDateTime(r.last_started_at)}</TableCell>
                  <TableCell className="text-right">{formatDuration(r.last_duration_ms)}</TableCell>
                  <TableCell className="text-right">{r.last_fetched}</TableCell>
                  <TableCell className="text-right">{r.last_new}</TableCell>
                  <TableCell className="text-right">{r.runs_24h}</TableCell>
                  <TableCell className="text-right">{r.errors_24h}</TableCell>
                  <TableCell className="text-right">{r.calls_today ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground max-w-xs truncate" title={r.last_error ?? undefined}>
                    {r.last_error ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}

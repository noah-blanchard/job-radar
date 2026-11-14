import type { ScoreBreakdown } from "@jobradar/core/score";
import { queryRows, sql } from "@jobradar/db";
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NewGradMark, ScoreBadge } from "@/components/score-badge";
import { SafeHtml } from "@/components/safe-html";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/lib/db";
import type { JobStatus } from "@/lib/filters";
import { cn, formatAge, formatDate, formatDateTime, placeLabel } from "@/lib/utils";
import { JobStatusControls } from "./status-controls";

export const dynamic = "force-dynamic";

interface JobRow extends Record<string, unknown> {
  id: number;
  title: string;
  company_name: string;
  company_id: number | null;
  company_priority: string | null;
  location_raw: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  remote: string;
  employment_type: string | null;
  seniority: string | null;
  is_new_grad: boolean | null;
  is_new_grad_reason: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  posted_at: Date | null;
  first_seen_at: Date;
  last_seen_at: Date;
  closed_at: Date | null;
  url: string;
  apply_url: string | null;
  description_html: string | null;
  description_text: string | null;
  score: number | null;
  score_breakdown: ScoreBreakdown | null;
  domains: string[];
  status: JobStatus | null;
  notes: string | null;
}

async function loadJob(id: number) {
  const db = getDb();
  const [job] = await queryRows<JobRow>(
    db,
    sql`
    select j.*, c.priority as company_priority, s.status, s.notes
    from jobs j
    left join companies c on c.id = j.company_id
    left join job_status s on s.job_id = j.id
    where j.id = ${id}`,
  );
  if (!job) return null;
  const sources = await queryRows<{
    source: string;
    url: string;
    first_seen_at: Date;
    last_seen_at: Date;
  }>(
    db,
    sql`select source, url, first_seen_at, last_seen_at from job_sources
        where job_id = ${id} order by first_seen_at`,
  );
  return { job, sources };
}

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const id = parseId((await params).id);
  const data = id ? await loadJob(id) : null;
  return { title: data ? data.job.title : "Offre" };
}

const PART_LABEL: Record<string, string> = {
  location: "Lieu",
  newGrad: "New grad",
  domains: "Domaines",
  language: "Langue",
  priority: "Priorité entreprise",
  freshness: "Fraîcheur",
  salary: "Salaire",
};

function Breakdown({ b }: { b: ScoreBreakdown }) {
  return (
    <div className="text-sm">
      <table className="w-full">
        <tbody>
          {b.parts.map((p) => (
            <tr key={p.key} className="border-b last:border-0">
              <td className="text-muted-foreground py-1 pr-2 align-top whitespace-nowrap">
                {PART_LABEL[p.key] ?? p.key}
              </td>
              <td className="py-1 pr-2 align-top break-words">{p.detail}</td>
              <td
                className={cn(
                  "py-1 text-right align-top font-medium tabular-nums",
                  p.points > 0 ? "text-success" : p.points < 0 ? "text-destructive" : "",
                )}
              >
                {p.points > 0 ? `+${p.points}` : p.points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-baseline justify-between border-t pt-2">
        <span className="text-muted-foreground">Total</span>
        <span className="font-semibold tabular-nums">
          {b.raw !== b.total ? (
            <span className="text-muted-foreground mr-2 line-through">{b.raw}</span>
          ) : null}
          {b.total} / 100
        </span>
      </div>
      {b.excluded ? <p className="text-destructive mt-1 text-xs">{b.excluded}</p> : null}
      {b.capped ? <p className="text-warning mt-1 text-xs">{b.capped}</p> : null}
      <p className="text-muted-foreground mt-2 text-xs">
        New grad ({b.newGrad.source === "llm" ? "IA" : "règles"}) : {b.newGrad.reason}
        {b.newGrad.visaNotes ? ` · Autorisation de travail : ${b.newGrad.visaNotes}` : ""}
      </p>
    </div>
  );
}

function money(n: number, currency: string | null) {
  try {
    return new Intl.NumberFormat("fr-CA", {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${n} ${currency ?? ""}`;
  }
}

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const id = parseId((await params).id);
  const data = id ? await loadJob(id) : null;
  if (!data) notFound();
  const { job, sources } = data;
  const salary =
    job.salary_min || job.salary_max
      ? [job.salary_min, job.salary_max]
          .filter((n): n is number => n != null)
          .map((n) => money(n, job.salary_currency))
          .join(" – ")
      : null;

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> Inbox
      </Link>

      <div className="mb-4 flex items-start gap-3">
        <ScoreBadge score={job.score} className="mt-0.5 h-8 w-11 text-sm" />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg leading-snug font-semibold tracking-tight">{job.title}</h1>
          <p className="text-muted-foreground text-sm">
            {job.company_name}
            {job.company_priority === "high" ? " · prioritaire" : ""} · {placeLabel(job)}
            {job.location_raw && job.location_raw !== job.city ? ` (${job.location_raw})` : ""}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            <NewGradMark value={job.is_new_grad} />
            {job.seniority ? <Badge variant="outline">{job.seniority}</Badge> : null}
            {job.employment_type ? <Badge variant="outline">{job.employment_type}</Badge> : null}
            {job.domains.map((d) => (
              <Badge key={d} variant="secondary">
                {d}
              </Badge>
            ))}
            {salary ? <Badge variant="success">{salary}</Badge> : null}
            {job.closed_at ? (
              <Badge variant="destructive">fermée le {formatDate(job.closed_at)}</Badge>
            ) : null}
          </div>
        </div>
        <a
          href={job.apply_url ?? job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
        >
          Postuler <ExternalLink className="size-4" />
        </a>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="order-2 min-w-0 lg:order-1">
          <Card className="gap-0 py-4">
            <CardContent>
              {job.description_html ? (
                <SafeHtml
                  html={job.description_html}
                  className="prose-job text-sm leading-relaxed"
                />
              ) : job.description_text ? (
                <p className="text-sm leading-relaxed whitespace-pre-line">
                  {job.description_text}
                </p>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Pas de description fournie par la source : voir l&apos;offre.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="order-1 flex flex-col gap-4 lg:order-2">
          <Card className="gap-3 py-4">
            <CardHeader>
              <CardTitle className="text-sm">Statut et notes</CardTitle>
            </CardHeader>
            <CardContent>
              <JobStatusControls jobId={job.id} status={job.status ?? "new"} notes={job.notes} />
            </CardContent>
          </Card>

          <Card className="gap-3 py-4">
            <CardHeader>
              <CardTitle className="text-sm">Score</CardTitle>
            </CardHeader>
            <CardContent>
              {job.score_breakdown ? (
                <Breakdown b={job.score_breakdown} />
              ) : (
                <p className="text-muted-foreground text-sm">Pas encore scorée.</p>
              )}
            </CardContent>
          </Card>

          <Card className="gap-3 py-4">
            <CardHeader>
              <CardTitle className="text-sm">Sources ({sources.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-1.5 text-sm">
                {sources.map((s) => (
                  <li key={`${s.source}:${s.url}`} className="flex items-baseline gap-2">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium hover:underline"
                    >
                      {s.source}
                    </a>
                    <span className="text-muted-foreground text-xs">
                      vue {formatAge(s.first_seen_at)} · revue {formatDateTime(s.last_seen_at)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground mt-2 text-xs">
                Première vue {formatDateTime(job.first_seen_at)}
                {job.posted_at ? ` · publiée le ${formatDate(job.posted_at)}` : ""}
              </p>
            </CardContent>
          </Card>

          {/* Phase 2 (CV generation) will add its buttons here. */}
          <Card className="gap-3 border-dashed py-4" aria-label="Actions">
            <CardHeader>
              <CardTitle className="text-sm">Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-xs">
                Réservé à la phase 2 (génération de CV).
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

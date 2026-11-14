"use client";

import type { ScoreBreakdown } from "@jobradar/core/score";
import { ArrowUpRight } from "lucide-react";
import { FollowUpControl } from "@/components/job/follow-up";
import { NotesField } from "@/components/job/notes-field";
import { SafeNodes } from "@/components/safe-nodes";
import { Ledger, NewGradMark, PART_LABEL } from "@/components/score-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { STATUS_LABEL, type JobStatus } from "@/lib/filters";
import type { JobDetail as Job } from "@/lib/job-detail";
import { cn, formatAge, formatDate, formatDateTime, placeLabel } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "saved", label: STATUS_LABEL.saved, title: "Sauvegarder (s)" },
  { value: "applied", label: STATUS_LABEL.applied, title: "Postulé (a)" },
  { value: "interview", label: STATUS_LABEL.interview },
  { value: "rejected", label: STATUS_LABEL.rejected },
  { value: "ignored", label: STATUS_LABEL.ignored, title: "Ignorer (x)" },
] as const satisfies readonly { value: JobStatus; label: string; title?: string }[];

/** The itemized score: one line per part, then the total (the transcript's record). */
export function ScoreRecord({ b, score }: { b: ScoreBreakdown | null; score: number | null }) {
  if (!b)
    return <p className="text-muted-foreground text-[13px]">Pas encore scorée par le worker.</p>;
  return (
    <div className="text-[13px]">
      <div className="mb-2 flex items-center gap-3">
        <span className="text-xl leading-none font-semibold tracking-[-0.02em] tabular-nums">
          {score ?? b.total}
        </span>
        <Ledger
          parts={b.parts.map((p) => [p.key, p.points])}
          total={score ?? b.total}
          className="h-[6px] w-[144px]"
        />
        <span className="text-muted-foreground text-xs">/ 100</span>
      </div>
      <dl>
        {b.parts.map((p) => (
          <div
            key={p.key}
            className="border-border-soft grid grid-cols-[7.5rem_1fr_2.5rem] gap-3 border-b py-[5px] last:border-0"
          >
            <dt className="text-muted-foreground">{PART_LABEL[p.key] ?? p.key}</dt>
            <dd className="min-w-0 break-words">{p.detail}</dd>
            <dd
              className={cn(
                "text-right font-medium tabular-nums",
                p.points > 0
                  ? "text-success"
                  : p.points < 0
                    ? "text-destructive"
                    : "text-muted-foreground",
              )}
            >
              {p.points > 0 ? `+${p.points}` : p.points}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-1 flex items-baseline justify-between border-t border-[#33414c] pt-1.5 font-semibold">
        <span>Total</span>
        <span className="tabular-nums">
          {b.raw !== b.total ? (
            <span className="text-muted-foreground mr-2 font-normal line-through">{b.raw}</span>
          ) : null}
          {b.total} / 100
        </span>
      </div>
      {b.excluded ? <p className="text-destructive mt-1.5 text-xs">{b.excluded}</p> : null}
      {b.capped ? <p className="text-warning mt-1.5 text-xs">{b.capped}</p> : null}
      <p className="text-muted-foreground mt-2 text-xs">
        New grad ({b.newGrad.source === "llm" ? "IA" : "règles"}) : {b.newGrad.reason}
        {b.newGrad.visaNotes ? ` · Autorisation de travail : ${b.newGrad.visaNotes}` : ""}
      </p>
    </div>
  );
}

function Description({ job }: { job: Job }) {
  if (job.description)
    return (
      <SafeNodes nodes={job.description} className="prose-job text-[13.5px] leading-relaxed" />
    );
  if (job.description_text)
    return (
      <p className="prose-job text-[13.5px] leading-relaxed whitespace-pre-line">
        {job.description_text}
      </p>
    );
  return (
    <p className="text-muted-foreground text-[13px]">
      La source ne fournit pas de description :{" "}
      <a
        href={job.apply_url ?? job.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-info underline"
      >
        voir l&apos;offre
      </a>
      .
    </p>
  );
}

function Sources({ job }: { job: Job }) {
  return (
    <div className="text-[13px]">
      <ul className="flex flex-col gap-1">
        {job.sources.map((s) => (
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
              vue il y a {formatAge(s.first_seen_at)} · revue {formatDateTime(s.last_seen_at)}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-1.5 text-xs">
        Première vue {formatDateTime(job.first_seen_at)}
        {job.posted_at ? ` · publiée le ${formatDate(job.posted_at)}` : ""}
      </p>
    </div>
  );
}

export interface JobDetailControls {
  status: JobStatus;
  nextActionAt: string | null;
  onStatus: (s: JobStatus) => void;
  onNextAction: (iso: string | null) => void;
  onNotesSaved?: (notes: string) => void;
  notesRef?: React.Ref<HTMLTextAreaElement>;
  followOpen?: boolean;
  onFollowOpen?: (o: boolean) => void;
  onApplyClick?: () => void;
}

/** Job detail shared by the reading pane (`pane`) and the job page (`page`). */
export function JobDetailView({
  job,
  variant,
  status,
  nextActionAt,
  onStatus,
  onNextAction,
  onNotesSaved,
  notesRef,
  followOpen,
  onFollowOpen,
  onApplyClick,
}: { job: Job; variant: "pane" | "page" } & JobDetailControls) {
  const facts = (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <NewGradMark value={job.is_new_grad} />
      {job.seniority ? <Badge variant="secondary">{job.seniority}</Badge> : null}
      {job.employment_type ? <Badge variant="secondary">{job.employment_type}</Badge> : null}
      {job.domains.map((d) => (
        <Badge key={d} variant="outline">
          {d}
        </Badge>
      ))}
      {job.salary ? <Badge variant="success">{job.salary}</Badge> : null}
      {job.closed_at ? (
        <Badge variant="destructive">fermée le {formatDate(job.closed_at)}</Badge>
      ) : null}
    </div>
  );

  const actions = (
    <div className="mt-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={job.apply_url ?? job.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onApplyClick}
          title="Ouvrir l'offre d'origine (o)"
          className={buttonVariants({ variant: "default" })}
        >
          Postuler <ArrowUpRight className="size-4" aria-hidden />
        </a>
        <FollowUpControl
          at={nextActionAt}
          onChange={onNextAction}
          open={followOpen}
          onOpenChange={onFollowOpen}
        />
        {/* Phase 2: the "Générer CV.tex" action joins this row. */}
      </div>
      <Segmented
        label="Statut"
        size="sm"
        value={status === "new" ? null : status}
        options={STATUS_OPTIONS}
        onChange={(s) => onStatus(s === status ? "new" : s)}
      />
    </div>
  );

  const header = (
    <header>
      <h1
        className={cn(
          "font-semibold tracking-[-0.015em] text-balance",
          variant === "page" ? "text-[20px] leading-tight" : "text-[19px] leading-snug",
        )}
      >
        {job.title}
      </h1>
      <p className="text-muted-foreground mt-1 text-[13px]">
        <span className="text-foreground">{job.company_name}</span>
        {job.company_priority === "high" ? " · prioritaire" : ""} · {placeLabel(job)}
        {job.location_raw && job.location_raw !== job.city ? ` (${job.location_raw})` : ""} · vue il
        y a {formatAge(job.first_seen_at)}
      </p>
      {facts}
      {actions}
    </header>
  );

  const notes = (
    <section>
      <h2 className="label-caps mb-1.5">Notes</h2>
      <NotesField
        key={job.id}
        jobId={job.id}
        initial={job.notes}
        onSaved={onNotesSaved}
        ref={notesRef}
      />
    </section>
  );
  const record = (
    <section>
      <h2 className="label-caps mb-2">Relevé du score</h2>
      <ScoreRecord b={job.score_breakdown} score={job.score} />
    </section>
  );
  const sources = (
    <section>
      <h2 className="label-caps mb-1.5">Sources ({job.sources.length})</h2>
      <Sources job={job} />
    </section>
  );

  if (variant === "pane")
    return (
      <article className="flex flex-col gap-6">
        {header}
        {record}
        {notes}
        <section>
          <h2 className="label-caps mb-2">Description</h2>
          <Description job={job} />
        </section>
        {sources}
      </article>
    );

  return (
    <article>
      {header}
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="order-2 min-w-0 lg:order-1">
          <h2 className="label-caps mb-2">Description</h2>
          <Description job={job} />
        </section>
        <aside className="order-1 flex flex-col gap-7 lg:order-2">
          {notes}
          {record}
          {sources}
        </aside>
      </div>
    </article>
  );
}

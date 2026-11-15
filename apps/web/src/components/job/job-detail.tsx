"use client";

import type { ScoreBreakdown } from "@jobradar/core/score";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { FollowUpControl } from "@/components/job/follow-up";
import { NotesField } from "@/components/job/notes-field";
import { SafeNodes } from "@/components/safe-nodes";
import { Ledger, NewGradMark, partLabel } from "@/components/score-badge";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { useFormat, useT } from "@/i18n/client";
import type { T } from "@/i18n/messages";
import type { JobStatus } from "@/lib/filters";
import { jobToMarkdown } from "@/lib/job-copy";
import type { JobDetail as Job } from "@/lib/job-detail";
import { cn } from "@/lib/utils";

const statusOptions = (t: T) =>
  [
    { value: "saved", label: t("status.saved"), title: t("job.saveTitle") },
    { value: "applied", label: t("status.applied"), title: t("job.appliedTitle") },
    { value: "interview", label: t("status.interview") },
    { value: "rejected", label: t("status.rejected") },
    { value: "ignored", label: t("status.ignored"), title: t("job.ignoreTitle") },
  ] as const satisfies readonly { value: JobStatus; label: string; title?: string }[];

/**
 * The itemized score: one line per part, then the total (the transcript's record). The detail
 * lines and the new-grad reason are stored in French by the worker and shown as they are.
 */
export function ScoreRecord({ b, score }: { b: ScoreBreakdown | null; score: number | null }) {
  const t = useT();
  if (!b) return <p className="text-muted-foreground text-[13px]">{t("job.notScored")}</p>;
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
            <dt className="text-muted-foreground">{partLabel(p.key, t)}</dt>
            <dd className="min-w-0 break-words">{p.detail}</dd>
            <dd
              className={cn(
                "text-right font-medium tabular-nums",
                p.points > 0
                  ? "text-positive"
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
      <div className="mt-1 flex items-baseline justify-between border-t border-input pt-1.5 font-semibold">
        <span>{t("job.total")}</span>
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
        {t("job.newGradReason", {
          by: b.newGrad.source === "llm" ? t("job.byLlm") : t("job.byRules"),
          reason: b.newGrad.reason,
        })}
        {b.newGrad.visaNotes ? t("job.workAuth", { notes: b.newGrad.visaNotes }) : ""}
      </p>
    </div>
  );
}

function Description({ job }: { job: Job }) {
  const t = useT();
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
      {t("job.noDescription")}{" "}
      <a
        href={job.apply_url ?? job.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-info underline"
      >
        {t("job.seeOffer")}
      </a>
      .
    </p>
  );
}

function Sources({ job }: { job: Job }) {
  const t = useT();
  const format = useFormat();
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
              {t("job.seenAgo", {
                age: format.age(s.first_seen_at),
                date: format.dateTime(s.last_seen_at),
              })}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-1.5 text-xs">
        {t("job.firstSeen", { date: format.dateTime(job.first_seen_at) })}
        {job.posted_at ? t("job.postedOn", { date: format.date(job.posted_at) }) : ""}
      </p>
    </div>
  );
}

/** Copies the whole offer as Markdown, to paste into an AI assistant (CV, cover letter). */
function CopyOfferButton({ job }: { job: Job }) {
  const t = useT();
  const format = useFormat();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2_000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      // Missing outside a secure context (plain http on a LAN address).
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(jobToMarkdown(job, t, format));
      setCopied(true);
      toast({ message: t("job.offerCopied") });
    } catch {
      toast({ message: t("job.offerCopyFailed"), tone: "error" });
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => void copy()}
      title={t("job.copyOfferTitle")}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? t("common.copied") : t("job.copyOffer")}
    </Button>
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
  const t = useT();
  const format = useFormat();
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
        <Badge variant="destructive">
          {t("job.closedOn", { date: format.date(job.closed_at) })}
        </Badge>
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
          title={t("job.openOrigin")}
          className={buttonVariants({ variant: "default" })}
        >
          {t("job.apply")} <ArrowUpRight className="size-4" aria-hidden />
        </a>
        <FollowUpControl
          at={nextActionAt}
          onChange={onNextAction}
          open={followOpen}
          onOpenChange={onFollowOpen}
        />
        <CopyOfferButton key={job.id} job={job} />
        {/* Phase 2: the "Generate CV.tex" action joins this row. */}
      </div>
      <Segmented
        label={t("job.status")}
        size="sm"
        value={status === "new" ? null : status}
        options={statusOptions(t)}
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
        {job.company_priority === "high" ? t("job.priority") : ""} · {format.place(job)}
        {job.location_raw && job.location_raw !== job.city ? ` (${job.location_raw})` : ""}
        {t("job.seenAgoShort", { age: format.age(job.first_seen_at) })}
      </p>
      {facts}
      {actions}
    </header>
  );

  const notes = (
    <section>
      <h2 className="label-caps mb-1.5">{t("job.notes")}</h2>
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
      <h2 className="label-caps mb-2">{t("job.scoreRecord")}</h2>
      <ScoreRecord b={job.score_breakdown} score={job.score} />
    </section>
  );
  const sources = (
    <section>
      <h2 className="label-caps mb-1.5">{t("job.sources", { count: job.sources.length })}</h2>
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
          <h2 className="label-caps mb-2">{t("job.description")}</h2>
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
          <h2 className="label-caps mb-2">{t("job.description")}</h2>
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

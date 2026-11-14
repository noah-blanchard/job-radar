"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { setNextAction } from "@/app/(app)/jobs/actions";
import { statusColor } from "@/components/score-badge";
import { toast } from "@/components/ui/toast";
import { pushUndo, removeUndo, type UndoEntry } from "@/lib/undo";
import { useSoftRefresh } from "@/lib/use-soft-refresh";
import { useFormat, useT } from "@/i18n/client";
import type { T } from "@/i18n/messages";
import type { Problem, Today } from "@/lib/today";
import { cn } from "@/lib/utils";

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

function problemLabel(p: Problem, t: T): string {
  switch (p.kind) {
    case "source":
      return t("today.problem.source", { count: p.count });
    case "quota":
      return t("today.problem.quota", { sources: p.sources.join(", ") });
    case "silent":
      return t("today.problem.silent", { hours: p.hours });
    case "no-profile":
      return t("today.problem.noProfile");
    case "invalid-profile":
      return t("today.problem.invalidProfile");
    case "rescoring":
      return t("today.problem.rescoring");
  }
}

function Fact({
  n,
  label,
  tone,
  href,
  onClick,
  expanded,
}: {
  n: number;
  label: string;
  tone?: "due" | "quiet";
  href?: string;
  onClick?: () => void;
  expanded?: boolean;
}) {
  const format = useFormat();
  const body = (
    <>
      <span
        className={cn(
          "text-[20px] leading-none font-semibold tracking-[-0.02em] tabular-nums",
          tone === "due" && n > 0 && "text-warning",
          n === 0 && "text-muted-foreground",
        )}
      >
        {format.number(n)}
      </span>
      <span className="text-muted-foreground">{label}</span>
      {onClick && n > 0 ? (
        <ChevronDown
          className={cn(
            "text-muted-foreground size-3.5 self-center transition-transform duration-[var(--dur)]",
            expanded && "rotate-180",
          )}
          aria-hidden
        />
      ) : null}
    </>
  );
  const cls =
    "group inline-flex items-baseline gap-1.5 rounded-md -mx-1.5 px-1.5 py-1 transition-colors hover:bg-secondary/70";
  if (href)
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  if (onClick && n > 0)
    return (
      <button type="button" onClick={onClick} aria-expanded={expanded} className={cls}>
        {body}
      </button>
    );
  return <span className="inline-flex items-baseline gap-1.5 py-1">{body}</span>;
}

/** The day as one record line: what to triage, what's due, where applications stand, what's broken. */
export function TodayStrip({ today, triageHref }: { today: Today; triageHref: string }) {
  const [open, setOpen] = useState(false);
  const softRefresh = useSoftRefresh();
  const t = useT();
  const format = useFormat();
  const [due, setDue] = useState(today.due);
  const [seen, setSeen] = useState(today.due);
  if (seen !== today.due) {
    setSeen(today.due);
    setDue(today.due);
  }

  const postpone = (id: number, days: number | null) => {
    const item = due.find((x) => x.id === id);
    if (!item) return;
    const undoFailed = () => toast({ tone: "error", message: t("today.undoFailed") });
    const restore = () =>
      setDue((d) =>
        d.some((x) => x.id === id)
          ? d
          : [...d, item].sort((a, b) => a.next_action_at.localeCompare(b.next_action_at)),
      );
    setDue((d) => d.filter((x) => x.id !== id));
    const iso = days === null ? null : inDays(days);
    const undo: UndoEntry = {
      label: item.title,
      run: () => {
        restore();
        void setNextAction(id, item.next_action_at).then(
          (r) => (r.ok ? softRefresh() : undoFailed()),
          undoFailed,
        );
      },
    };
    pushUndo(undo);
    toast({
      message:
        days === null
          ? t("today.followUpRemoved", { title: item.title })
          : t("today.followUpIn", { days, title: item.title }),
      action: { label: t("common.undo"), hint: "z", run: () => (removeUndo(undo), undo.run()) },
    });
    const rollback = () => {
      restore();
      removeUndo(undo);
      toast({ tone: "error", message: t("today.followUpFailed") });
    };
    void setNextAction(id, iso).then((r) => (r.ok ? softRefresh() : rollback()), rollback);
  };
  const dueCount = today.dueCount - (today.due.length - due.length);

  return (
    <section aria-label={t("today.title")} className="shrink-0 border-b">
      <div className="flex flex-wrap items-center gap-x-7 gap-y-1 px-4 pt-4 pb-3 text-[13px] md:px-6">
        <h1 className="text-[15px] font-semibold">{t("today.title")}</h1>
        <Fact
          n={today.triage}
          label={
            t("today.toTriage", { min: String(today.minScore) }) +
            (today.triageFresh ? t("today.fresh", { count: today.triageFresh }) : "")
          }
          href={triageHref}
        />
        <Fact
          n={dueCount}
          label={t("today.dueFollowUps", { count: dueCount })}
          tone="due"
          onClick={() => setOpen((o) => !o)}
          expanded={open}
        />
        <Fact n={today.applied} label={t("today.awaiting")} href="/pipeline" />
        <Fact
          n={today.interview}
          label={t("today.interviews", { count: today.interview })}
          href="/pipeline"
        />
        {today.problems.length ? (
          <Link
            href="/sources"
            className="text-destructive hover:bg-secondary/70 -mx-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 md:ml-auto"
            title={today.problems.map((p) => problemLabel(p, t)).join(" · ")}
          >
            <span className="bg-destructive size-1.5 rounded-full" aria-hidden />
            {today.problems.length === 1
              ? problemLabel(today.problems[0]!, t)
              : t("today.machineProblems", { count: today.problems.length })}
          </Link>
        ) : null}
      </div>

      {open && due.length > 0 ? (
        <ul className="animate-in fade-in-0 max-h-[40vh] overflow-y-auto border-t px-4 pb-1 duration-150 md:px-6">
          {due.map((d) => (
            <li
              key={d.id}
              className="border-border-soft flex flex-wrap items-center gap-x-4 gap-y-1 border-b py-2 text-[13px] last:border-0"
            >
              <span className={cn("w-20 shrink-0 text-xs", statusColor(d.status))}>
                {t(`status.${d.status}`)}
              </span>
              <Link href={`/jobs/${d.id}`} className="min-w-0 flex-1 truncate hover:underline">
                <span className="font-medium">{d.title}</span>
                <span className="text-muted-foreground"> · {d.company_name}</span>
              </Link>
              <span className="text-warning text-xs">{format.dueDate(d.next_action_at)}</span>
              <span className="flex gap-1">
                <button
                  type="button"
                  onClick={() => postpone(d.id, 7)}
                  className="border-input hover:bg-secondary h-7 rounded-md border px-2 text-xs"
                  title={t("today.doneTitle")}
                >
                  {t("today.done")}
                </button>
                <button
                  type="button"
                  onClick={() => postpone(d.id, 2)}
                  className="text-muted-foreground hover:bg-secondary hover:text-foreground h-7 rounded-md px-2 text-xs"
                >
                  {t("today.postpone")}
                </button>
                <button
                  type="button"
                  onClick={() => postpone(d.id, null)}
                  className="text-muted-foreground hover:bg-secondary hover:text-foreground h-7 rounded-md px-2 text-xs"
                >
                  {t("today.remove")}
                </button>
              </span>
            </li>
          ))}
          {dueCount > due.length && due.length === today.due.length ? (
            <li className="py-2 text-xs">
              <Link href="/pipeline" className="text-info hover:underline">
                {t("today.allFollowUps")}
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}

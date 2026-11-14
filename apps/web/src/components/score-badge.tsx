import { STATUS_LABEL, type JobStatus } from "@/lib/filters";
import { cn } from "@/lib/utils";

export const PART_LABEL: Record<string, string> = {
  location: "Lieu",
  newGrad: "New grad",
  domains: "Domaines",
  language: "Langue",
  priority: "Priorité entreprise",
  freshness: "Fraîcheur",
  salary: "Salaire",
};

const RAMP = ["var(--ledger-1)", "var(--ledger-2)", "var(--ledger-3)", "var(--ledger-4)"];

/**
 * The score ledger: one fixed scale (the full bar is 100 points) everywhere it appears. Positive
 * parts fill in breakdown order on the ink ramp up to the score; points lost to penalties
 * follow in red. The fill does the ranking, so the figure next to it stays one weight.
 */
export function Ledger({
  parts,
  total,
  className,
}: {
  parts: [string, number][];
  total: number | null;
  className?: string;
}) {
  const score = Math.max(0, Math.min(100, total ?? 0));
  const pos = parts.filter(([, p]) => p > 0);
  const posSum = pos.reduce((a, [, p]) => a + p, 0);
  const neg = Math.min(
    100 - score,
    parts.filter(([, p]) => p < 0).reduce((a, [, p]) => a - p, 0),
  );
  const title = parts.length
    ? parts.map(([k, p]) => `${PART_LABEL[k] ?? k} ${p > 0 ? "+" : ""}${p}`).join(" · ")
    : undefined;
  return (
    <span
      className={cn(
        "bg-ledger-track flex h-[5px] w-[72px] overflow-hidden rounded-[1px]",
        className,
      )}
      title={title}
      aria-hidden
    >
      {posSum > 0
        ? pos.map(([k, p], i) => (
            <span
              key={k}
              className="h-full"
              style={{ width: `${(p / posSum) * score}%`, background: RAMP[i % RAMP.length] }}
            />
          ))
        : score > 0 && (
            <span className="h-full" style={{ width: `${score}%`, background: RAMP[1] }} />
          )}
      {neg > 0 ? (
        <span className="bg-destructive h-full opacity-80" style={{ width: `${neg}%` }} />
      ) : null}
    </span>
  );
}

/** Score figure over its ledger (list rows, pipeline cards). */
export function ScoreMark({
  score,
  parts = [],
  dim,
  className,
}: {
  score: number | null;
  parts?: [string, number][];
  dim?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex w-[72px] shrink-0 flex-col gap-[5px]", className)}>
      <span
        className={cn(
          "text-[15px] leading-none font-semibold tracking-[-0.01em] tabular-nums",
          dim && "text-muted-foreground",
        )}
      >
        <span className="sr-only">Score </span>
        {score ?? "—"}
        <span className="sr-only"> sur 100</span>
      </span>
      <Ledger parts={parts} total={score} />
    </span>
  );
}

/** New-grad verdict: NG yes, struck NG no, ? unknown. */
export function NewGradMark({ value }: { value: boolean | null }) {
  if (value === true)
    return (
      <span className="text-success text-[11px] font-semibold" title="new grad">
        NG
      </span>
    );
  if (value === false)
    return (
      <span className="text-muted-foreground text-[11px] line-through" title="pas new grad">
        NG
      </span>
    );
  return (
    <span className="text-muted-foreground text-[11px]" title="new grad : inconnu">
      NG ?
    </span>
  );
}

const STATUS_COLOR: Record<JobStatus, string> = {
  new: "text-st-new",
  saved: "text-st-saved",
  applied: "text-st-applied",
  interview: "text-st-interview",
  rejected: "text-st-rejected",
  ignored: "text-st-ignored",
};

/** Status label in its committed colour, with a matching dot. */
export function StatusPill({ status, className }: { status: JobStatus; className?: string }) {
  if (status === "new") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] leading-4 font-medium whitespace-nowrap",
        STATUS_COLOR[status],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function statusColor(status: JobStatus): string {
  return STATUS_COLOR[status];
}

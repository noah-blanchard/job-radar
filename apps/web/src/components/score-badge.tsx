import { cn } from "@/lib/utils";

/** Score pill: green >= 70, amber >= 50, muted below. */
export function ScoreBadge({ score, className }: { score: number | null; className?: string }) {
  const s = score ?? 0;
  return (
    <span
      className={cn(
        "inline-flex h-6 w-9 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums",
        s >= 70
          ? "bg-success/20 text-success"
          : s >= 50
            ? "bg-warning/20 text-warning"
            : "bg-secondary text-muted-foreground",
        className,
      )}
      title={`Score ${score ?? "—"}/100`}
    >
      {score ?? "—"}
    </span>
  );
}

/** New-grad verdict: ✓ yes, ✗ no, ? unknown. */
export function NewGradMark({ value }: { value: boolean | null }) {
  if (value === true)
    return (
      <span className="text-success text-xs font-medium" title="new grad">
        NG
      </span>
    );
  if (value === false)
    return (
      <span className="text-muted-foreground/60 text-xs line-through" title="pas new grad">
        NG
      </span>
    );
  return (
    <span className="text-muted-foreground text-xs" title="new grad : inconnu">
      ?
    </span>
  );
}

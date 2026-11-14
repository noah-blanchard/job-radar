"use client";

import { CalendarClock, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isDue } from "@/lib/follow-up";
import { cn, formatDueDate, fromDateInput, toDateInput } from "@/lib/utils";

const QUICK = [
  { days: 3, label: "+3 j" },
  { days: 7, label: "+7 j" },
  { days: 14, label: "+14 j" },
];

/** "Relancer le …" chip with a small popover: quick offsets, a date, or clear. */
export function FollowUpControl({
  at,
  onChange,
  open,
  onOpenChange,
  size = "default",
}: {
  at: string | null;
  onChange: (iso: string | null) => void;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  size?: "default" | "sm";
}) {
  const due = isDue(at);
  const set = (iso: string | null) => {
    onChange(iso);
    onOpenChange?.(false);
  };
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        title="Date de relance (f)"
        className={cn(
          "border-input inline-flex shrink-0 items-center gap-1.5 rounded-md border whitespace-nowrap transition-colors duration-[var(--dur-fast)] hover:border-[#384754]",
          size === "sm" ? "h-7 px-2 text-xs" : "h-8 px-2.5 text-[13px]",
          at
            ? due
              ? "text-warning border-warning/40"
              : "text-foreground"
            : "text-muted-foreground",
        )}
      >
        <CalendarClock className={size === "sm" ? "size-3.5" : "size-4"} aria-hidden />
        {at ? (
          <span>
            {due ? "Relance due" : "Relancer"} · {formatDueDate(at)}
          </span>
        ) : (
          "Relancer le…"
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <p className="label-caps mb-2">Relancer</p>
        <div className="mb-3 grid grid-cols-3 gap-1.5">
          {QUICK.map((q) => (
            <button
              key={q.days}
              type="button"
              onClick={() => set(new Date(Date.now() + q.days * 86_400_000).toISOString())}
              className="border-input hover:bg-secondary h-8 rounded-md border text-[13px]"
            >
              {q.label}
            </button>
          ))}
        </div>
        <label className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
          Date
          <input
            type="date"
            defaultValue={toDateInput(at)}
            onBlur={(e) => {
              const iso = fromDateInput(e.target.value);
              if (iso && e.target.value !== toDateInput(at)) onChange(iso);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const iso = fromDateInput(e.currentTarget.value);
              if (iso) set(iso);
            }}
            className="border-input text-foreground h-8 rounded-md border bg-transparent px-2 text-[13px] [color-scheme:dark]"
          />
        </label>
        {at ? (
          <button
            type="button"
            onClick={() => set(null)}
            className="text-muted-foreground hover:text-foreground mt-3 inline-flex items-center gap-1 text-xs"
          >
            <X className="size-3.5" aria-hidden /> Retirer la relance
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

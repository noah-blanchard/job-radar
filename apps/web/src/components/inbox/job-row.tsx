"use client";

import { Bookmark, Check, EyeOff } from "lucide-react";
import { memo } from "react";
import { ScoreMark, StatusPill } from "@/components/score-badge";
import type { JobStatus } from "@/lib/filters";
import { cn, formatAge, placeLabel } from "@/lib/utils";

export interface InboxItem {
  id: number;
  title: string;
  company_name: string;
  city: string | null;
  country: string | null;
  remote: string;
  score: number | null;
  is_new_grad: boolean | null;
  first_seen_at: string;
  url: string;
  apply_url: string | null;
  domains: string[];
  closed_at: string | null;
  status: JobStatus;
  ledger: [string, number][];
}

const ACTIONS = [
  { status: "saved", label: "Sauvegarder", key: "s", Icon: Bookmark },
  { status: "applied", label: "Postulé", key: "a", Icon: Check },
  { status: "ignored", label: "Ignorer", key: "x", Icon: EyeOff },
] as const;

/** One offer in the triage list. Memoized: j/k only re-renders the two rows that change. */
export const JobRow = memo(function JobRow({
  item,
  status,
  selected,
  leaving,
  minScore,
  onActivate,
  onTriage,
}: {
  item: InboxItem;
  status: JobStatus;
  selected: boolean;
  leaving: boolean;
  minScore: number;
  onActivate: (id: number) => void;
  onTriage: (id: number, status: JobStatus) => void;
}) {
  return (
    <li className="row-leave" data-leaving={leaving || undefined}>
      <div>
        <div
          aria-current={selected || undefined}
          data-id={item.id}
          onClick={() => onActivate(item.id)}
          className={cn(
            "group border-border-soft relative grid h-[58px] cursor-default grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-x-4 border-b px-4 transition-colors duration-[var(--dur-fast)] md:px-6 lg:grid-cols-[72px_minmax(0,1fr)_minmax(0,9.5rem)_2.5rem]",
            selected
              ? "bg-raised before:bg-primary before:absolute before:inset-y-0 before:left-0 before:w-px"
              : "hover:bg-raised-hover bg-background",
          )}
        >
          <ScoreMark
            score={item.score}
            parts={item.ledger}
            dim={item.score !== null && item.score < minScore}
          />
          <div className="min-w-0">
            <p
              className={cn(
                "truncate text-[13.5px] leading-5 font-medium",
                (status === "ignored" || item.closed_at) && "text-muted-foreground font-normal",
              )}
            >
              {item.title}
            </p>
            <p className="text-muted-foreground flex min-w-0 items-center gap-2 truncate text-xs leading-4">
              <span className="truncate">
                {item.company_name}
                <span className="lg:hidden"> · {placeLabel(item)}</span>
              </span>
              <StatusPill status={status} />
              {item.closed_at ? <span className="text-destructive">fermée</span> : null}
            </p>
          </div>
          <span className="text-muted-foreground hidden truncate text-xs lg:block lg:group-hover:invisible">
            {placeLabel(item)}
          </span>
          <span className="text-muted-foreground hidden text-right text-xs tabular-nums lg:block lg:group-hover:invisible lg:group-aria-[current=true]:invisible">
            {formatAge(item.first_seen_at)}
          </span>
          {/* Mouse / touch actions: always on phones, on hover or selection on desktop. */}
          <div className="flex items-center gap-0.5 lg:absolute lg:right-4 lg:bg-inherit lg:pl-2 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100 lg:group-aria-[current=true]:opacity-100">
            {ACTIONS.map(({ status: s, label, key, Icon }) => (
              <button
                key={s}
                type="button"
                title={`${label} (${key})`}
                aria-label={label}
                aria-pressed={status === s}
                onClick={(e) => {
                  e.stopPropagation();
                  onTriage(item.id, s);
                }}
                className={cn(
                  "hover:bg-secondary flex size-8 items-center justify-center rounded-md transition-colors lg:size-7",
                  status === s ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4 lg:size-[15px]" aria-hidden />
              </button>
            ))}
          </div>
        </div>
      </div>
    </li>
  );
});

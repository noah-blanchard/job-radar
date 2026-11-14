"use client";

import { useFormat } from "@/i18n/client";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Optional count shown after the label. */
  count?: number;
  title?: string;
}

/**
 * Segmented control (a group of toggle buttons, one pressed). For a handful of mutually
 * exclusive values that should all stay visible: views, priority, status.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "default",
  className,
  disabled,
}: {
  value: T | null;
  options: readonly SegmentedOption<T>[];
  onChange: (v: T) => void;
  label: string;
  size?: "default" | "sm";
  className?: string;
  disabled?: boolean;
}) {
  const format = useFormat();
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "border-input inline-flex shrink-0 items-stretch overflow-hidden rounded-md border",
        size === "sm" ? "h-7" : "h-8",
        className,
      )}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            title={o.title}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap transition-colors duration-[var(--dur-fast)] disabled:opacity-50",
              size === "sm" ? "px-2 text-xs" : "px-3 text-[13px]",
              i > 0 && "border-input border-l",
              on
                ? "bg-raised text-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {o.label}
            {o.count !== undefined ? (
              <span className={cn("tabular-nums", on ? "text-primary" : "text-muted-foreground")}>
                {format.number(o.count)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

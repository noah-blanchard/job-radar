"use client";

import { Check, Play } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "@/components/ui/toast";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { requestRun } from "./actions";

/** Queues a run that the worker picks up within a minute. */
export function RunButton({ source, pendingSince }: { source: string; pendingSince?: string }) {
  const [pending, start] = useTransition();
  const [queued, setQueued] = useState(!!pendingSince);
  const t = useT();
  return (
    <button
      type="button"
      disabled={pending || queued}
      aria-label={queued ? t("sources.runRequested", { source }) : t("sources.runNow", { source })}
      title={queued ? t("sources.queuedTitle") : t("sources.runTitle")}
      onClick={(e) => {
        e.preventDefault(); // inside a <summary>: don't toggle the row
        start(async () => {
          const r = await requestRun(source);
          if (r.ok) setQueued(true);
          else toast({ tone: "error", message: `${source}: ${r.error ?? t("sources.refused")}` });
        });
      }}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors",
        queued
          ? "text-success"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50",
      )}
    >
      {queued ? <Check className="size-3.5" /> : <Play className="size-3.5" />}
      {queued ? t("sources.queued") : t("sources.run")}
    </button>
  );
}

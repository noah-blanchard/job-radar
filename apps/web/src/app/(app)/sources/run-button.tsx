"use client";

import { Check, Play } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { requestRun } from "./actions";

/** Queues a run that the worker picks up within a minute. */
export function RunButton({ source, pendingSince }: { source: string; pendingSince?: string }) {
  const [pending, start] = useTransition();
  const [queued, setQueued] = useState(!!pendingSince);
  return (
    <button
      type="button"
      disabled={pending || queued}
      aria-label={queued ? `Run demandé pour ${source}` : `Lancer ${source} maintenant`}
      title={
        queued
          ? "Demande enregistrée : le worker la prend en charge dans la minute"
          : "Lancer un run maintenant (pris en charge par le worker dans la minute)"
      }
      onClick={(e) => {
        e.preventDefault(); // inside a <summary>: don't toggle the row
        start(async () => {
          const r = await requestRun(source);
          if (r.ok) setQueued(true);
          else toast({ tone: "error", message: `${source} : ${r.error ?? "demande refusée"}` });
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
      {queued ? "demandé" : "lancer"}
    </button>
  );
}

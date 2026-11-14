"use client";

import { Play } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { requestRun } from "./actions";

export function RunButton({ source, pendingSince }: { source: string; pendingSince?: string }) {
  const [pending, start] = useTransition();
  const [queued, setQueued] = useState(!!pendingSince);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs"
        disabled={pending || queued}
        title={
          queued
            ? "Demande enregistrée : le worker la prend en charge dans la minute"
            : "Lancer un run maintenant (pris en charge par le worker dans la minute)"
        }
        onClick={() =>
          start(async () => {
            const r = await requestRun(source);
            if (r.ok) setQueued(true);
            else setError(r.error ?? "erreur");
          })
        }
      >
        <Play className="size-3" />
        {queued ? "demandé" : "lancer"}
      </Button>
      {error ? <span className="text-destructive text-xs">{error}</span> : null}
    </span>
  );
}

"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { setCompanyPriority } from "./actions";

type Priority = "low" | "normal" | "high";
const LABEL: Record<Priority, string> = { high: "haute", normal: "normale", low: "basse" };

export function PrioritySelect({
  companyId,
  priority,
  manual,
}: {
  companyId: number;
  priority: Priority;
  manual: boolean;
}) {
  const [value, setValue] = useState(priority);
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  return (
    <select
      value={value}
      disabled={pending}
      aria-label="Priorité"
      title={
        error
          ? "Erreur : priorité non enregistrée"
          : manual
            ? "Modifiée dans le dashboard (le seed ne l'écrase plus)"
            : "Scores recalculés par le worker dans la minute"
      }
      onChange={(e) => {
        const next = e.target.value as Priority;
        const prev = value;
        setValue(next);
        setError(false);
        start(async () => {
          const r = await setCompanyPriority(companyId, next);
          if (!r.ok) {
            setValue(prev);
            setError(true);
          }
        });
      }}
      className={cn(
        "border-input bg-background h-7 rounded-md border px-1 text-xs",
        value === "high" && "text-success font-medium",
        error && "border-destructive",
      )}
    >
      {(["high", "normal", "low"] as const).map((p) => (
        <option key={p} value={p}>
          {LABEL[p]}
        </option>
      ))}
    </select>
  );
}

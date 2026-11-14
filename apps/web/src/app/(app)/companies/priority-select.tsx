"use client";

import { useState, useTransition } from "react";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { setCompanyPriority } from "./actions";

type Priority = "low" | "normal" | "high";
const OPTIONS = [
  { value: "high", label: "haute" },
  { value: "normal", label: "normale" },
  { value: "low", label: "basse" },
] as const;

/** Optimistic priority switch; the worker rescores this company's jobs within a minute. */
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
  return (
    <span
      title={
        manual
          ? "Modifiée ici (le seed ne l'écrase plus)"
          : "Scores recalculés par le worker dans la minute"
      }
    >
      <Segmented
        label="Priorité"
        size="sm"
        value={value}
        options={OPTIONS}
        disabled={pending}
        onChange={(next) => {
          if (next === value) return;
          const prev = value;
          setValue(next);
          start(async () => {
            const r = await setCompanyPriority(companyId, next);
            if (!r.ok) {
              setValue(prev);
              toast({ tone: "error", message: "Priorité non enregistrée. Réessaie." });
            }
          });
        }}
      />
    </span>
  );
}

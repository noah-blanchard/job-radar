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

/**
 * Optimistic switch of the user's own priority for a company ("haute" = score bonus for them
 * only); the worker rescores this company's jobs for them within a minute.
 */
export function PrioritySelect({ companyId, priority }: { companyId: number; priority: Priority }) {
  const [value, setValue] = useState(priority);
  const [pending, start] = useTransition();
  return (
    <span title="Ta priorité (bonus de score pour toi seul·e), recalculée dans la minute">
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

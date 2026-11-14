"use client";

import { useState, useTransition } from "react";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { useT } from "@/i18n/client";
import { setCompanyPriority } from "./actions";

type Priority = "low" | "normal" | "high";
const PRIORITIES = ["high", "normal", "low"] as const;

/**
 * Optimistic switch of the user's own priority for a company ("high" = score bonus for them
 * only); the worker rescores this company's jobs for them within a minute.
 */
export function PrioritySelect({ companyId, priority }: { companyId: number; priority: Priority }) {
  const [value, setValue] = useState(priority);
  const [pending, start] = useTransition();
  const t = useT();
  return (
    <span title={t("companies.priorityTitle")}>
      <Segmented
        label={t("companies.priorityLabel")}
        size="sm"
        value={value}
        options={PRIORITIES.map((p) => ({ value: p, label: t(`companies.priority.${p}`) }))}
        disabled={pending}
        onChange={(next) => {
          if (next === value) return;
          const prev = value;
          setValue(next);
          start(async () => {
            const r = await setCompanyPriority(companyId, next);
            if (!r.ok) {
              setValue(prev);
              toast({ tone: "error", message: t("companies.priorityFailed") });
            }
          });
        }}
      />
    </span>
  );
}

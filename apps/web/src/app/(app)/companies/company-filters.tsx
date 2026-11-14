"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface CompanyFilterValues {
  q?: string;
  origin?: string;
  status?: string;
  ats?: string;
}

/** One line of filters; each change rewrites the URL. */
export function CompanyFilters({
  filters,
  atsList,
  origins,
  statuses,
}: {
  filters: CompanyFilterValues;
  atsList: { ats: string; n: number }[];
  origins: { value: string; label: string }[];
  statuses: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(filters.q ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const go = (patch: CompanyFilterValues) => {
    const next = { ...filters, q, ...patch };
    const qs = new URLSearchParams(
      Object.entries(next).filter((e): e is [string, string] => !!e[1]),
    ).toString();
    start(() => router.push(qs ? `/companies?${qs}` : "/companies", { scroll: false }));
  };
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 transition-opacity",
        pending && "opacity-60",
      )}
    >
      <div className="relative w-56">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-2 left-2.5 size-4"
          aria-hidden
        />
        <Input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            clearTimeout(timer.current);
            const v = e.target.value.trim();
            timer.current = setTimeout(() => go({ q: v }), 350);
          }}
          placeholder="Nom"
          className="pl-8"
          aria-label="Filtrer par nom"
        />
      </div>
      <Select
        value={filters.origin ?? ""}
        onChange={(e) => go({ origin: e.target.value })}
        aria-label="Origine"
      >
        <option value="">Toutes origines</option>
        {origins.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      <Select
        value={filters.status ?? ""}
        onChange={(e) => go({ status: e.target.value })}
        aria-label="Statut ATS"
      >
        <option value="">Tous statuts</option>
        {statuses.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </Select>
      <Select
        value={filters.ats ?? ""}
        onChange={(e) => go({ ats: e.target.value })}
        aria-label="ATS"
      >
        <option value="">Tous ATS</option>
        {atsList.map((a) => (
          <option key={a.ats} value={a.ats}>
            {a.ats} ({a.n})
          </option>
        ))}
        <option value="none">Sans ATS</option>
      </Select>
    </div>
  );
}

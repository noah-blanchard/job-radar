"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_FILTERS,
  inboxHref,
  SINCE_LABEL,
  STATUS_LABEL,
  STATUSES,
  type InboxFilters,
  type Since,
} from "@/lib/filters";
import { cn } from "@/lib/utils";

const selectCls =
  "border-input bg-background h-8 rounded-md border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export interface FilterBarProps {
  filters: InboxFilters;
  countries: { value: string; n: number }[];
  sources: { value: string; n: number }[];
  domains: string[];
}

/** Inbox filters. Every change rewrites the URL (page reset to 1); the server does the rest. */
export function FilterBar({ filters, countries, sources, domains }: FilterBarProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState({ q: filters.q, city: filters.city, company: filters.company });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Back/forward navigation: keep the text inputs in sync with the URL.
  const urlText = `${filters.q}
${filters.city}
${filters.company}`;
  const [seen, setSeen] = useState(urlText);
  if (seen !== urlText) {
    setSeen(urlText);
    setText({ q: filters.q, city: filters.city, company: filters.company });
  }

  const go = (patch: Partial<InboxFilters>) => {
    const next = { ...filters, ...text, ...patch, page: 1 };
    start(() => router.push(inboxHref(next), { scroll: false }));
  };
  const typed = (k: "q" | "city" | "company", v: string) => {
    setText((t) => ({ ...t, [k]: v }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ [k]: v.trim() }), 500);
  };
  const isDefault = inboxHref({ ...filters, page: 1 }) === "/";

  return (
    <div
      className={cn("mb-3 flex flex-col gap-2 transition-opacity", pending && "opacity-60")}
      aria-busy={pending}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="text-muted-foreground absolute top-2 left-2 size-4" />
          <Input
            value={text.q}
            onChange={(e) => typed("q", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go({ q: text.q.trim() })}
            placeholder="Recherche plein texte (titre, entreprise, description)…"
            className="h-8 pl-8"
            aria-label="Recherche"
          />
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Vu depuis">
          {(Object.keys(SINCE_LABEL) as Since[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => go({ since: s })}
              className={cn(
                "h-8 rounded-md border px-2 text-xs",
                filters.since === s
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={filters.since === s}
            >
              {SINCE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className={selectCls}
          value={filters.country}
          onChange={(e) => go({ country: e.target.value })}
          aria-label="Pays"
        >
          <option value="">Tous pays</option>
          {countries.map((c) => (
            <option key={c.value} value={c.value}>
              {c.value} ({c.n})
            </option>
          ))}
        </select>
        <Input
          value={text.city}
          onChange={(e) => typed("city", e.target.value)}
          placeholder="Ville"
          className="h-8 w-28"
          aria-label="Ville"
        />
        <select
          className={selectCls}
          value={filters.remote}
          onChange={(e) => go({ remote: e.target.value as InboxFilters["remote"] })}
          aria-label="Mode de travail"
        >
          <option value="">Tout mode</option>
          <option value="remote">Télétravail</option>
          <option value="hybrid">Hybride</option>
          <option value="onsite">Sur site</option>
          <option value="unknown">Inconnu</option>
        </select>
        <select
          className={selectCls}
          value={filters.newGrad}
          onChange={(e) => go({ newGrad: e.target.value as InboxFilters["newGrad"] })}
          aria-label="New grad"
        >
          <option value="">New grad : tous</option>
          <option value="yes">New grad : oui</option>
          <option value="no">New grad : non</option>
          <option value="unknown">New grad : inconnu</option>
        </select>
        <select
          className={selectCls}
          value={filters.domain}
          onChange={(e) => go({ domain: e.target.value })}
          aria-label="Domaine"
        >
          <option value="">Tous domaines</option>
          {domains.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          className={selectCls}
          value={filters.source}
          onChange={(e) => go({ source: e.target.value })}
          aria-label="Source"
        >
          <option value="">Toutes sources</option>
          {sources.map((s) => (
            <option key={s.value} value={s.value}>
              {s.value} ({s.n})
            </option>
          ))}
        </select>
        <Input
          value={text.company}
          onChange={(e) => typed("company", e.target.value)}
          placeholder="Entreprise"
          className="h-8 w-32"
          aria-label="Entreprise"
        />
        <label className="text-muted-foreground flex items-center gap-1 text-xs">
          Score ≥
          <select
            className={selectCls}
            value={String(filters.minScore)}
            onChange={(e) => go({ minScore: Number(e.target.value) })}
            aria-label="Score minimum"
          >
            {[0, 20, 30, 40, 50, 60, 70, 80].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <select
          className={selectCls}
          value={filters.status}
          onChange={(e) => go({ status: e.target.value as InboxFilters["status"] })}
          aria-label="Statut"
        >
          <option value="active">Statut : actives (sans ignorées)</option>
          <option value="todo">Statut : à trier</option>
          <option value="all">Statut : toutes</option>
          {STATUSES.filter((s) => s !== "new").map((s) => (
            <option key={s} value={s}>
              Statut : {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={filters.closed}
            onChange={(e) => go({ closed: e.target.checked })}
            className="accent-foreground"
          />
          inclure les fermées
        </label>
        {!isDefault ? (
          <button
            type="button"
            onClick={() => {
              setText({ q: "", city: "", company: "" });
              start(() => router.push(inboxHref({ ...DEFAULT_FILTERS, sort: filters.sort })));
            }}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
          >
            <X className="size-3.5" /> réinitialiser
          </button>
        ) : null}
      </div>
    </div>
  );
}

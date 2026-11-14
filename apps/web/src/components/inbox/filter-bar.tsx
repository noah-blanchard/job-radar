"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Input, Select } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { useFormat, useT } from "@/i18n/client";
import type { T } from "@/i18n/messages";
import {
  activeFilterCount,
  applyView,
  currentView,
  DEFAULT_FILTERS,
  STATUSES,
  VIEWS,
  type InboxFilters,
  type ViewId,
} from "@/lib/filters";
import { cn, isTyping } from "@/lib/utils";

export interface FilterOptions {
  countries: { value: string; n: number }[];
  sources: { value: string; n: number }[];
  domains: string[];
}

const REMOTES = ["remote", "hybrid", "onsite", "unknown"] as const;

const statusFilterLabels = (t: T): Record<string, string> => ({
  active: t("filters.statusFilter.active"),
  todo: t("filters.statusFilter.todo"),
  all: t("filters.statusFilter.all"),
  ...Object.fromEntries(STATUSES.filter((s) => s !== "new").map((s) => [s, t(`status.${s}`)])),
});

type TextKey = "q" | "city" | "company";

/**
 * Views, search, and every other filter in one popover with removable chips. Every change
 * rewrites the URL (page reset to 1); `navigate` runs inside the Inbox's transition.
 */
export function FilterBar({
  filters,
  options,
  counts,
  navigate,
}: {
  filters: InboxFilters;
  options: FilterOptions;
  counts: Partial<Record<ViewId, number>>;
  navigate: (f: InboxFilters) => void;
}) {
  const [text, setText] = useState({ q: filters.q, city: filters.city, company: filters.company });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const search = useRef<HTMLInputElement>(null);
  const t = useT();
  const format = useFormat();
  const STATUS_FILTER_LABEL = statusFilterLabels(t);

  // Back/forward navigation: keep the text inputs in sync with the URL.
  const urlText = `${filters.q}\n${filters.city}\n${filters.company}`;
  const [seen, setSeen] = useState(urlText);
  if (seen !== urlText) {
    setSeen(urlText);
    setText({ q: filters.q, city: filters.city, company: filters.company });
  }

  // `/` focuses the search from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || isTyping(e.target)) return;
      e.preventDefault();
      search.current?.focus();
      search.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (patch: Partial<InboxFilters>) => {
    clearTimeout(timer.current);
    navigate({ ...filters, ...text, ...patch, page: 1 });
  };
  const typed = (k: TextKey, v: string) => {
    setText((t) => ({ ...t, [k]: v }));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ [k]: v.trim() }), 450);
  };

  const view = currentView(filters);
  const nFilters = activeFilterCount({ ...filters, q: "" });

  const chips: { key: string; label: string; clear: Partial<InboxFilters> }[] = [];
  if (filters.country)
    chips.push({ key: "country", label: filters.country, clear: { country: "" } });
  if (filters.city) chips.push({ key: "city", label: filters.city, clear: { city: "" } });
  if (filters.remote)
    chips.push({
      key: "remote",
      label: t(`filters.remote.${filters.remote}`),
      clear: { remote: "" },
    });
  if (filters.newGrad)
    chips.push({ key: "ng", label: t(`filters.ng.${filters.newGrad}`), clear: { newGrad: "" } });
  if (filters.domain) chips.push({ key: "domain", label: filters.domain, clear: { domain: "" } });
  if (filters.source)
    chips.push({
      key: "source",
      label: t("filters.sourceChip", { source: filters.source }),
      clear: { source: "" },
    });
  if (filters.company)
    chips.push({ key: "company", label: filters.company, clear: { company: "" } });
  if (filters.minScore)
    chips.push({ key: "min", label: `score ≥ ${filters.minScore}`, clear: { minScore: 0 } });
  if (filters.closed)
    chips.push({ key: "closed", label: t("filters.closedChip"), clear: { closed: false } });
  if (!view)
    chips.unshift({
      key: "status",
      label: `${STATUS_FILTER_LABEL[filters.status] ?? filters.status}${filters.since !== "all" ? ` · ${filters.since}` : ""}`,
      clear: { status: DEFAULT_FILTERS.status, since: "all" },
    });

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2.5 md:px-6">
      <Segmented
        label={t("filters.view")}
        value={view}
        options={VIEWS.map((v) => ({
          value: v.id,
          label: t(`views.${v.id}`),
          count: counts[v.id],
        }))}
        onChange={(id) => navigate(applyView({ ...filters, ...text }, id))}
        className="max-w-full overflow-x-auto"
      />

      <div className="relative min-w-44 flex-1 basis-56 md:max-w-sm">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-2 left-2.5 size-4"
          aria-hidden
        />
        <Input
          ref={search}
          type="search"
          value={text.q}
          onChange={(e) => typed("q", e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") go({ q: text.q.trim() });
            if (e.key === "Escape") (e.target as HTMLInputElement).blur();
          }}
          placeholder={t("filters.searchPlaceholder")}
          className="pr-8 pl-8"
          aria-label={t("filters.searchLabel")}
        />
        {!text.q ? (
          <Kbd className="pointer-events-none absolute top-[7px] right-2 hidden md:inline-flex">
            /
          </Kbd>
        ) : null}
      </div>

      <Popover>
        <PopoverTrigger
          className={cn(
            "border-input hover:bg-secondary inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] transition-colors",
            nFilters ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <SlidersHorizontal className="size-3.5" aria-hidden />
          {t("filters.filters")}
          {nFilters ? <span className="text-primary tabular-nums">{nFilters}</span> : null}
        </PopoverTrigger>
        <PopoverContent className="w-[min(380px,calc(100vw-32px))]">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
            <Field label={t("filters.country")}>
              <Select value={filters.country} onChange={(e) => go({ country: e.target.value })}>
                <option value="">{t("filters.allMasc")}</option>
                {options.countries.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.value} ({format.number(c.n)})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("filters.city")}>
              <Input
                value={text.city}
                onChange={(e) => typed("city", e.target.value)}
                placeholder="Montréal"
              />
            </Field>
            <Field label={t("filters.workMode")}>
              <Select
                value={filters.remote}
                onChange={(e) => go({ remote: e.target.value as InboxFilters["remote"] })}
              >
                <option value="">{t("filters.allMasc")}</option>
                {REMOTES.map((v) => (
                  <option key={v} value={v}>
                    {t(`filters.remote.${v}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("filters.newGrad")}>
              <Select
                value={filters.newGrad}
                onChange={(e) => go({ newGrad: e.target.value as InboxFilters["newGrad"] })}
              >
                <option value="">{t("filters.allMasc")}</option>
                <option value="yes">{t("filters.yes")}</option>
                <option value="no">{t("filters.no")}</option>
                <option value="unknown">{t("filters.unknown")}</option>
              </Select>
            </Field>
            <Field label={t("filters.domain")}>
              <Select value={filters.domain} onChange={(e) => go({ domain: e.target.value })}>
                <option value="">{t("filters.allMasc")}</option>
                {options.domains.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("filters.source")}>
              <Select value={filters.source} onChange={(e) => go({ source: e.target.value })}>
                <option value="">{t("filters.allFem")}</option>
                {options.sources.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.value} ({format.number(s.n)})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("filters.company")}>
              <Input
                value={text.company}
                onChange={(e) => typed("company", e.target.value)}
                placeholder="Shopify"
              />
            </Field>
            <Field label={t("filters.minScore")}>
              <Select
                value={String(filters.minScore)}
                onChange={(e) => go({ minScore: Number(e.target.value) })}
              >
                {[0, 20, 30, 40, 50, 60, 70, 80].map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? t("filters.noMin") : `≥ ${n}`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("filters.status")} wide>
              <Select
                value={filters.status}
                onChange={(e) => go({ status: e.target.value as InboxFilters["status"] })}
              >
                {Object.entries(STATUS_FILTER_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="col-span-2 flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={filters.closed}
                onChange={(e) => go({ closed: e.target.checked })}
                className="accent-[var(--primary)] size-3.5"
              />
              {t("filters.includeClosed")}
            </label>
          </div>
        </PopoverContent>
      </Popover>

      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => {
            if (c.key === "city" || c.key === "company") setText((t) => ({ ...t, [c.key]: "" }));
            go(c.clear);
          }}
          className="border-input hover:bg-secondary group inline-flex h-7 items-center gap-1 rounded-full border pr-1.5 pl-2.5 text-xs"
          title={t("filters.removeFilter")}
        >
          {c.label}
          <X className="text-muted-foreground group-hover:text-foreground size-3.5" aria-hidden />
        </button>
      ))}
      {chips.length > 1 ? (
        <button
          type="button"
          onClick={() => {
            setText({ q: "", city: "", company: "" });
            navigate({ ...DEFAULT_FILTERS, sort: filters.sort });
          }}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          {t("filters.clearAll")}
        </button>
      ) : null}
    </div>
  );
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("text-muted-foreground flex flex-col gap-1", wide && "col-span-2")}>
      {label}
      {children}
    </label>
  );
}

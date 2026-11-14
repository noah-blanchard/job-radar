"use client";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Bookmark, Check, ChevronLeft, ChevronRight, EyeOff, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { setJobStatus } from "@/app/(app)/jobs/actions";
import { NewGradMark, ScoreBadge } from "@/components/score-badge";
import { Badge } from "@/components/ui/badge";
import {
  inboxHref,
  PAGE_SIZE,
  STATUS_LABEL,
  type InboxFilters,
  type JobStatus,
} from "@/lib/filters";
import { cn, formatAge, placeLabel } from "@/lib/utils";

export interface InboxItem {
  id: number;
  title: string;
  company_name: string;
  city: string | null;
  country: string | null;
  remote: string;
  score: number | null;
  is_new_grad: boolean | null;
  first_seen_at: string;
  url: string;
  apply_url: string | null;
  domains: string[];
  closed_at: string | null;
  status: JobStatus;
}

const col = createColumnHelper<InboxItem>();

const SHORTCUTS: Record<string, JobStatus> = { s: "saved", a: "applied", x: "ignored" };

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function InboxTable({
  rows,
  total,
  filters,
}: {
  rows: InboxItem[];
  total: number;
  filters: InboxFilters;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(0);
  const [statuses, setStatuses] = useState<Record<number, JobStatus>>({});
  const [, start] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const body = useRef<HTMLTableSectionElement>(null);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // New page of results: selection back to the top, optimistic statuses dropped.
  const [shown, setShown] = useState(rows);
  if (shown !== rows) {
    setShown(rows);
    setSelected(0);
    setStatuses({});
  }

  const statusOf = useCallback((r: InboxItem) => statuses[r.id] ?? r.status, [statuses]);

  const changeStatus = useCallback(
    (r: InboxItem, status: JobStatus) => {
      const next = statusOf(r) === status ? "new" : status; // same key again = undo
      setStatuses((s) => ({ ...s, [r.id]: next }));
      setFlash(`${r.title} : ${STATUS_LABEL[next]}`);
      start(async () => {
        const res = await setJobStatus(r.id, next);
        if (!res.ok) {
          setStatuses((s) => ({ ...s, [r.id]: r.status }));
          setFlash(`Erreur : ${res.error ?? "statut non enregistré"}`);
        }
      });
    },
    [statusOf],
  );

  const columns = useMemo(
    () => [
      col.accessor("score", {
        header: "Score",
        cell: (c) => <ScoreBadge score={c.getValue()} />,
        meta: { sort: "score" },
      }),
      col.accessor("title", {
        header: "Offre",
        cell: (c) => {
          const r = c.row.original;
          return (
            <div className="min-w-0">
              <Link
                href={`/jobs/${r.id}`}
                className="line-clamp-2 font-medium hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {r.title}
              </Link>
              <div className="text-muted-foreground truncate text-xs md:hidden">
                {r.company_name} · {placeLabel(r)}
              </div>
              {r.domains.length ? (
                <div className="mt-0.5 hidden flex-wrap gap-1 sm:flex">
                  {r.domains.map((d) => (
                    <Badge key={d} variant="outline" className="px-1 py-0 text-[10px]">
                      {d}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          );
        },
      }),
      col.accessor("company_name", {
        header: "Entreprise",
        cell: (c) => <span className="line-clamp-2">{c.getValue()}</span>,
        meta: { className: "hidden md:table-cell max-w-48" },
      }),
      col.display({
        id: "place",
        header: "Lieu",
        cell: (c) => <span className="line-clamp-2">{placeLabel(c.row.original)}</span>,
        meta: { className: "hidden md:table-cell max-w-44 text-muted-foreground" },
      }),
      col.accessor("is_new_grad", {
        header: "NG",
        cell: (c) => <NewGradMark value={c.getValue()} />,
        meta: { className: "hidden sm:table-cell text-center" },
      }),
      col.accessor("first_seen_at", {
        header: "Vu",
        cell: (c) => (
          <span className="text-muted-foreground tabular-nums" title={c.getValue()}>
            {formatAge(c.getValue())}
          </span>
        ),
        meta: { sort: "recent", className: "text-right whitespace-nowrap" },
      }),
      col.display({
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: (c) => {
          const r = c.row.original;
          const st = statusOf(r);
          const btn = (status: JobStatus, label: string, Icon: typeof Bookmark, key: string) => (
            <button
              type="button"
              title={`${label} (${key})`}
              aria-label={label}
              aria-pressed={st === status}
              onClick={(e) => {
                e.stopPropagation();
                changeStatus(r, status);
              }}
              className={cn(
                "hover:bg-secondary rounded p-1",
                st === status ? "text-foreground" : "text-muted-foreground/60",
              )}
            >
              <Icon className="size-4" />
            </button>
          );
          return (
            <div className="flex items-center justify-end gap-0.5">
              {btn("saved", "Sauvegarder", Bookmark, "s")}
              {btn("applied", "Postulé", Check, "a")}
              {btn("ignored", "Ignorer", EyeOff, "x")}
              <a
                href={r.apply_url ?? r.url}
                target="_blank"
                rel="noopener noreferrer"
                title="Ouvrir l'offre (o)"
                aria-label="Ouvrir l'offre"
                onClick={(e) => e.stopPropagation()}
                className="text-muted-foreground/60 hover:text-foreground hover:bg-secondary rounded p-1"
              >
                <ExternalLink className="size-4" />
              </a>
            </div>
          );
        },
        meta: { className: "w-px" },
      }),
    ],
    [changeStatus, statusOf],
  );

  // TanStack Table returns new functions each render: the React Compiler skips this component.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount,
    getRowId: (r) => String(r.id),
  });

  // Keyboard: j/k navigate, s/a/x status, o open the offer, Enter open the detail page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || rows.length === 0) return;
      const r = rows[selected];
      if (e.key === "j") setSelected((i) => Math.min(rows.length - 1, i + 1));
      else if (e.key === "k") setSelected((i) => Math.max(0, i - 1));
      else if (r && SHORTCUTS[e.key]) changeStatus(r, SHORTCUTS[e.key]!);
      else if (r && e.key === "o") window.open(r.apply_url ?? r.url, "_blank", "noopener");
      else if (r && e.key === "Enter") router.push(`/jobs/${r.id}`);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, selected, changeStatus, router]);

  useEffect(() => {
    body.current
      ?.querySelector<HTMLElement>(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  const sortHref = (sort: InboxFilters["sort"]) => inboxHref({ ...filters, sort, page: 1 });
  const pageHref = (page: number) => inboxHref({ ...filters, page });
  const first = total === 0 ? 0 : (filters.page - 1) * PAGE_SIZE + 1;

  return (
    <>
      <div className="text-muted-foreground mb-2 flex items-center justify-between gap-2 text-xs">
        <span>
          {total.toLocaleString("fr-CA")} offre{total > 1 ? "s" : ""}
          {total > 0 ? ` · ${first}-${first + rows.length - 1}` : ""}
        </span>
        <span className="hidden sm:inline">
          <kbd>j</kbd>/<kbd>k</kbd> naviguer · <kbd>s</kbd> sauvegarder · <kbd>a</kbd> postulé ·{" "}
          <kbd>x</kbd> ignorer · <kbd>o</kbd> ouvrir · <kbd>↵</kbd> détail
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full caption-bottom text-sm">
          <thead className="[&_tr]:border-b">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const meta = h.column.columnDef.meta as
                    { sort?: InboxFilters["sort"]; className?: string } | undefined;
                  const label = flexRender(h.column.columnDef.header, h.getContext());
                  return (
                    <th
                      key={h.id}
                      className={cn(
                        "text-muted-foreground h-8 px-2 text-left align-middle text-xs font-medium whitespace-nowrap",
                        meta?.className,
                      )}
                      aria-sort={
                        meta?.sort && filters.sort === meta.sort ? "descending" : undefined
                      }
                    >
                      {meta?.sort ? (
                        <Link
                          href={sortHref(meta.sort)}
                          className={cn(
                            "hover:text-foreground",
                            filters.sort === meta.sort && "text-foreground underline",
                          )}
                        >
                          {label} ↓
                        </Link>
                      ) : (
                        label
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody ref={body}>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-muted-foreground p-6 text-center">
                  Aucune offre pour ces filtres.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, i) => {
                const st = statusOf(row.original);
                return (
                  <tr
                    key={row.id}
                    data-index={i}
                    onClick={() => setSelected(i)}
                    aria-selected={i === selected}
                    className={cn(
                      "border-b transition-colors last:border-0",
                      i === selected ? "bg-secondary/70" : "hover:bg-secondary/30",
                      st === "ignored" && "opacity-40",
                      row.original.closed_at && "opacity-60",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as { className?: string } | undefined;
                      return (
                        <td
                          key={cell.id}
                          className={cn("px-2 py-1.5 align-middle", meta?.className)}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <nav className="mt-3 flex items-center justify-between text-sm" aria-label="Pagination">
        {filters.page > 1 ? (
          <Link
            href={pageHref(filters.page - 1)}
            className="flex items-center gap-1 hover:underline"
          >
            <ChevronLeft className="size-4" /> Précédente
          </Link>
        ) : (
          <span />
        )}
        <span className="text-muted-foreground text-xs">
          page {filters.page} / {pageCount}
        </span>
        {filters.page < pageCount ? (
          <Link
            href={pageHref(filters.page + 1)}
            className="flex items-center gap-1 hover:underline"
          >
            Suivante <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span />
        )}
      </nav>

      <div
        role="status"
        aria-live="polite"
        className={cn(
          "bg-secondary text-secondary-foreground fixed right-4 bottom-4 max-w-sm truncate rounded-md px-3 py-2 text-sm shadow-lg transition-opacity",
          flash ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        {flash}
      </div>
    </>
  );
}

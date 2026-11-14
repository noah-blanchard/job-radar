"use client";

import { Maximize2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { setJobStatus, setNextAction } from "@/app/(app)/jobs/actions";
import { FilterBar, type FilterOptions } from "@/components/inbox/filter-bar";
import { JobRow, type InboxItem } from "@/components/inbox/job-row";
import { PaneDivider } from "@/components/inbox/pane-divider";
import { JobDetailView } from "@/components/job/job-detail";
import { buttonVariants } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { dismissToast, toast } from "@/components/ui/toast";
import {
  applyView,
  filtersToParams,
  inboxHref,
  matchesStatus,
  PAGE_SIZE,
  type InboxFilters,
  type JobStatus,
  type ViewId,
} from "@/lib/filters";
import type { JobDetail } from "@/lib/job-detail";
import { popUndo, pushUndo, removeUndo, type UndoEntry } from "@/lib/undo";
import { useFormat, useT } from "@/i18n/client";
import { useSoftRefresh } from "@/lib/use-soft-refresh";
import { cn, isTyping } from "@/lib/utils";

export type { InboxItem };

export const LAST_INBOX_KEY = "jobradar:last-inbox";
const TRIAGE_KEYS: Record<string, JobStatus> = { s: "saved", a: "applied", x: "ignored" };
const LEAVE_MS = 180;

/** Pane cache survives client navigations (back from a job page, next page of results). */
const detailCache = new Map<number, JobDetail>();

function usePaneVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setVisible(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return visible;
}

async function fetchDetail(id: number, signal?: AbortSignal): Promise<JobDetail | null> {
  const hit = detailCache.get(id);
  if (hit) return hit;
  const r = await fetch(`/api/jobs/${id}`, { signal });
  if (!r.ok) return null;
  const d = (await r.json()) as JobDetail;
  detailCache.set(id, d);
  if (detailCache.size > 200) detailCache.delete(detailCache.keys().next().value!);
  return d;
}

export function Inbox({
  rows,
  total,
  filters,
  options,
  counts,
  minScore,
  initialJob,
}: {
  rows: InboxItem[];
  total: number;
  filters: InboxFilters;
  options: FilterOptions;
  counts: Partial<Record<ViewId, number>>;
  minScore: number;
  initialJob: number | null;
}) {
  const router = useRouter();
  const [pending, startNav] = useTransition();
  const paneVisible = usePaneVisible();
  const softRefresh = useSoftRefresh();
  const t = useT();
  const format = useFormat();
  const queue = filters.status === "todo"; // triaged rows leave the list

  const [statuses, setStatuses] = useState<Record<number, JobStatus>>({});
  const [follow, setFollow] = useState<Record<number, string | null>>({});
  const [removed, setRemoved] = useState<ReadonlySet<number>>(new Set());
  const [leaving, setLeaving] = useState<ReadonlySet<number>>(new Set());
  const pick = (list: InboxItem[]) =>
    initialJob && list.some((r) => r.id === initialJob) ? initialJob : (list[0]?.id ?? null);
  const [selectedId, setSelectedId] = useState<number | null>(() => pick(rows));

  // The list is the first server slice plus the slices loaded while scrolling. It only starts
  // over when the filters change: a background refresh (counts after a write) keeps it as is,
  // so rows never jump under the cursor.
  const listKey = inboxHref({ ...filters, page: 1 });
  const [base, setBase] = useState({ rows, total, key: listKey });
  const [extra, setExtra] = useState<InboxItem[]>([]);
  const [exhausted, setExhausted] = useState(rows.length < PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  if (base.key !== listKey) {
    setBase({ rows, total, key: listKey });
    setStatuses({});
    setFollow({});
    setRemoved(new Set());
    setLeaving(new Set());
    setExtra([]);
    setExhausted(rows.length < PAGE_SIZE);
    setSelectedId(pick(rows));
  }

  const all = useMemo(() => {
    const seen = new Set<number>();
    return [...base.rows, ...extra].filter((r) => !seen.has(r.id) && !!seen.add(r.id));
  }, [base.rows, extra]);
  const visible = useMemo(() => all.filter((r) => !removed.has(r.id)), [all, removed]);
  // j/k move over rows that stay: a row collapsing out of the queue is not a stop.
  const nav = useMemo(() => visible.filter((r) => !leaving.has(r.id)), [visible, leaving]);
  const index = Math.max(
    0,
    nav.findIndex((r) => r.id === selectedId),
  );
  const selected = nav[index] ?? null;
  const statusOf = useCallback((r: InboxItem) => statuses[r.id] ?? r.status, [statuses]);

  const navigate = useCallback(
    (f: InboxFilters) => startNav(() => router.push(inboxHref(f), { scroll: false })),
    [router],
  );

  // ---------- reading pane ----------
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [paneError, setPaneError] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const [followOpen, setFollowOpen] = useState(false);
  const paneScroll = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paneVisible || !selected) return;
    const ctrl = new AbortController();
    const id = selected.id;
    if (!detailCache.has(id))
      fetchDetail(id, ctrl.signal)
        .then((d) => {
          if (ctrl.signal.aborted) return;
          setDetail(d);
          setPaneError(!d);
        })
        .catch(() => !ctrl.signal.aborted && setPaneError(true));
    // The next offer is already loaded by the time you press j.
    const near = [nav[index + 1], nav[index - 1], nav[index + 2]].filter(Boolean);
    const t = setTimeout(() => near.forEach((r) => void fetchDetail(r!.id).catch(() => {})), 120);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [paneVisible, selected, nav, index]);

  useEffect(() => {
    paneScroll.current?.scrollTo({ top: 0 });
  }, [selectedId]);

  // Selection in the URL (?job=), without a server round trip: back from a job page restores it.
  useEffect(() => {
    if (!selectedId) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("job") !== String(selectedId)) {
      url.searchParams.set("job", String(selectedId));
      window.history.replaceState(window.history.state, "", url);
    }
    // The job page's "back" goes to exactly this list, filters and selection included.
    try {
      sessionStorage.setItem(LAST_INBOX_KEY, url.pathname + url.search);
    } catch {
      // storage blocked: the back link falls back to the default list
    }
  }, [selectedId]);

  // Keep the selected row in view.
  const listRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const announce = selected
    ? t("inbox.announce", {
        title: selected.title,
        company: selected.company_name,
        score: selected.score ?? t("inbox.notScored"),
      })
    : "";
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-id="${selectedId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  // ---------- actions ----------
  type Apply = (
    r: InboxItem,
    next: JobStatus,
    prev: JobStatus,
    opts: { undoable: boolean },
  ) => void;
  const applyRef = useRef<Apply | null>(null);
  const leaveTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const unremove = (id: number) => {
    clearTimeout(leaveTimers.current.get(id));
    leaveTimers.current.delete(id);
    const drop = (s: ReadonlySet<number>) => {
      if (!s.has(id)) return s;
      const n = new Set(s);
      n.delete(id);
      return n;
    };
    setRemoved(drop);
    setLeaving(drop);
  };
  const applyStatus = useCallback(
    (r: InboxItem, next: JobStatus, prev: JobStatus, opts: { undoable: boolean }) => {
      setStatuses((s) => ({ ...s, [r.id]: next }));
      const leave = queue && next !== "new";
      const back = queue && next === "new";
      if (leave) {
        setLeaving((l) => new Set(l).add(r.id));
        // Selection moves on before the row collapses, so j/k never waits for the animation.
        const i = nav.findIndex((v) => v.id === r.id);
        const after = nav[i + 1] ?? nav[i - 1] ?? null;
        setSelectedId((cur) => (cur === r.id ? (after?.id ?? null) : cur));
        clearTimeout(leaveTimers.current.get(r.id));
        leaveTimers.current.set(
          r.id,
          setTimeout(() => {
            leaveTimers.current.delete(r.id);
            setRemoved((s) => new Set(s).add(r.id));
            setLeaving((l) => {
              const n = new Set(l);
              n.delete(r.id);
              return n;
            });
          }, LEAVE_MS),
        );
      }
      if (back) {
        unremove(r.id);
        setSelectedId(r.id);
      }
      const undo: UndoEntry = {
        label: r.title,
        run: () => applyRef.current?.(r, prev, next, { undoable: false }),
      };
      if (opts.undoable) {
        pushUndo(undo);
        toast({
          message: `${next === "new" ? t("status.backToTriage") : t(`status.${next}`)} · ${r.title}`,
          action: {
            label: t("common.undo"),
            hint: "z",
            run: () => {
              removeUndo(undo);
              undo.run();
            },
          },
        });
      } else {
        dismissToast();
      }
      const rollback = () => {
        setStatuses((s) => ({ ...s, [r.id]: prev }));
        unremove(r.id);
        setSelectedId(r.id);
        removeUndo(undo);
        toast({ tone: "error", message: t("inbox.statusFailed", { title: r.title }) });
      };
      void setJobStatus(r.id, next).then((res) => {
        if (!res.ok) return rollback();
        softRefresh();
        setFollow((f) => ({ ...f, [r.id]: res.nextActionAt ?? null }));
        const cached = detailCache.get(r.id);
        if (cached)
          detailCache.set(r.id, {
            ...cached,
            status: next,
            next_action_at: res.nextActionAt ?? null,
          });
      }, rollback);
    },
    [queue, nav, softRefresh, t],
  );
  useEffect(() => {
    applyRef.current = applyStatus;
  }, [applyStatus]);

  const triage = useCallback(
    (id: number, status: JobStatus) => {
      const r = all.find((x) => x.id === id);
      if (!r) return;
      const prev = statuses[r.id] ?? r.status;
      applyStatus(r, prev === status ? "new" : status, prev, { undoable: true });
    },
    [all, statuses, applyStatus],
  );

  type ChangeFollow = (
    r: InboxItem,
    iso: string | null,
    prevIso: string | null,
    undoable?: boolean,
  ) => void;
  const changeFollowRef = useRef<ChangeFollow | null>(null);
  const changeFollow = useCallback(
    (r: InboxItem, iso: string | null, prevIso: string | null, undoable = true) => {
      const put = (v: string | null) => {
        setFollow((f) => ({ ...f, [r.id]: v }));
        const cached = detailCache.get(r.id);
        if (cached) detailCache.set(r.id, { ...cached, next_action_at: v });
      };
      put(iso);
      const undo: UndoEntry = {
        label: r.title,
        run: () => changeFollowRef.current?.(r, prevIso, iso, false),
      };
      if (undoable) {
        pushUndo(undo);
        toast({
          message: iso
            ? t("inbox.followUpOn", { date: format.dueDate(iso), title: r.title })
            : t("inbox.followUpRemoved", { title: r.title }),
          action: { label: t("common.undo"), hint: "z", run: () => (removeUndo(undo), undo.run()) },
        });
      }
      const rollback = () => {
        put(prevIso);
        removeUndo(undo);
        toast({ tone: "error", message: t("inbox.followUpFailed") });
      };
      void setNextAction(r.id, iso).then((res) => (res.ok ? softRefresh() : rollback()), rollback);
    },
    [softRefresh, t, format],
  );
  useEffect(() => {
    changeFollowRef.current = changeFollow;
  }, [changeFollow]);

  const activate = useCallback(
    (id: number) => {
      if (paneVisible) setSelectedId(id);
      else router.push(`/jobs/${id}`);
    },
    [paneVisible, router],
  );

  // ---------- infinite scroll ----------
  const loading = useRef(false);
  const keyRef = useRef(listKey);
  useEffect(() => {
    keyRef.current = listKey;
  }, [listKey]);
  const sentinel = useRef<HTMLDivElement>(null);

  /** Loads the next slice; resolves with the rows it added (empty when nothing new). */
  const loadMore = useCallback(async (): Promise<InboxItem[]> => {
    if (loading.current || exhausted) return [];
    loading.current = true;
    setLoadingMore(true);
    const key = listKey;
    try {
      // Rows that no longer match the filter (triaged, ignored…) left the server's list:
      // the next slice starts that many rows earlier. Duplicates are dropped by id.
      const left = all.filter((r) => !matchesStatus(statusOf(r), filters.status)).length;
      const qs = filtersToParams({ ...filters, page: 1 });
      qs.set("offset", String(all.length - left));
      const res = await fetch(`/api/inbox?${qs}`);
      if (!res.ok) throw new Error(String(res.status));
      const more = (await res.json()) as InboxItem[];
      if (keyRef.current !== key) return [];
      if (more.length < PAGE_SIZE) setExhausted(true);
      const known = new Set(all.map((r) => r.id));
      const fresh = more.filter((r) => !known.has(r.id));
      setExtra((e) => [...e, ...fresh]);
      return fresh;
    } catch {
      toast({
        tone: "error",
        message: t("inbox.loadMoreFailed"),
      });
      return [];
    } finally {
      loading.current = false;
      setLoadingMore(false);
    }
  }, [exhausted, listKey, all, filters, statusOf, t]);

  // Approaching the end of the list loads the next slice (600 px ahead).
  useEffect(() => {
    const el = sentinel.current;
    if (!el || exhausted) return;
    const contained = window.matchMedia("(min-width: 768px)").matches;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) void loadMore();
      },
      { root: contained ? listRef.current : null, rootMargin: "0px 0px 600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, exhausted, visible.length]);

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector("[role=dialog]")) return;
      const r = selected;
      if (e.key === "j" || e.key === "ArrowDown") {
        if (index < nav.length - 1) setSelectedId(nav[index + 1]!.id);
        else
          void loadMore().then((more) => {
            if (more[0]) setSelectedId(more[0].id);
          });
      } else if (e.key === "k" || e.key === "ArrowUp") {
        if (index > 0) setSelectedId(nav[index - 1]!.id);
      } else if (e.key === "z") {
        const u = popUndo();
        if (!u) toast({ message: t("inbox.nothingToUndo") });
        else u.run();
      } else if (r && TRIAGE_KEYS[e.key]) {
        triage(r.id, TRIAGE_KEYS[e.key]!);
      } else if (r && e.key === "o") {
        window.open(r.apply_url ?? r.url, "_blank", "noopener");
        if (statusOf(r) !== "applied")
          toast({
            message: t("inbox.openedInTab"),
            action: {
              label: t("inbox.markApplied"),
              hint: "a",
              run: () => triage(r.id, "applied"),
            },
          });
      } else if (r && e.key === "Enter") {
        router.push(`/jobs/${r.id}`);
      } else if (r && e.key === "e") {
        if (paneVisible) notesRef.current?.focus();
        else router.push(`/jobs/${r.id}`);
      } else if (r && e.key === "f" && paneVisible) {
        setFollowOpen(true);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, index, nav, loadMore, triage, statusOf, router, paneVisible, t]);

  // ---------- render ----------
  const shownTotal = Math.max(0, base.total - removed.size);
  const paneJob = selected
    ? (detailCache.get(selected.id) ?? (detail?.id === selected.id ? detail : null))
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FilterBar filters={filters} options={options} counts={counts} navigate={navigate} />
      <div
        ref={gridRef}
        className="grid min-h-0 flex-1 md:grid-rows-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_1px_var(--pane-w,520px)]"
      >
        <section
          aria-label={t("inbox.offers")}
          aria-busy={pending}
          className="flex min-h-0 flex-col"
        >
          <p className="sr-only" aria-live="polite">
            {announce}
          </p>
          <div
            ref={listRef}
            className={cn(
              "min-h-0 flex-1 overflow-y-auto transition-opacity duration-[var(--dur)]",
              pending && "opacity-55",
            )}
          >
            {visible.length === 0 ? (
              <EmptyQueue filters={filters} navigate={navigate} loading={!exhausted} />
            ) : (
              <ul aria-label={t("inbox.offers")}>
                {visible.map((r) => (
                  <JobRow
                    key={r.id}
                    item={r}
                    status={statusOf(r)}
                    selected={r.id === selected?.id}
                    leaving={leaving.has(r.id)}
                    minScore={minScore}
                    onActivate={activate}
                    onTriage={triage}
                  />
                ))}
              </ul>
            )}
            <div ref={sentinel} aria-hidden className="h-px" />
            {visible.length > 0 && (loadingMore || !exhausted) ? (
              <p className="text-muted-foreground px-4 py-4 text-center text-xs md:px-6">
                {loadingMore ? t("inbox.loadingMore") : t("inbox.scrollForMore")}
              </p>
            ) : visible.length > 0 ? (
              <p className="text-muted-foreground px-4 py-4 text-center text-xs md:px-6">
                {t("inbox.endOfList")}
              </p>
            ) : null}
          </div>
          <ListFooter
            shown={shownTotal}
            loaded={visible.length}
            pending={pending || loadingMore}
            sort={filters.sort}
            onSort={(sort) => navigate({ ...filters, sort, page: 1 })}
          />
        </section>

        <PaneDivider grid={gridRef} />
        <aside
          ref={paneScroll}
          aria-label={t("inbox.reading")}
          className="bg-surface hidden min-h-0 overflow-y-auto lg:block"
        >
          {!selected ? (
            <PaneHint />
          ) : paneJob ? (
            <>
              <PaneBar id={paneJob.id} />
              <div key={paneJob.id} className="animate-in fade-in-0 px-7 pt-5 pb-8 duration-150">
                <JobDetailView
                  job={paneJob}
                  variant="pane"
                  status={statusOf(selected)}
                  nextActionAt={
                    selected.id in follow ? follow[selected.id]! : paneJob.next_action_at
                  }
                  onStatus={(s) => triage(selected.id, s === "new" ? statusOf(selected) : s)}
                  onNextAction={(iso) =>
                    changeFollow(
                      selected,
                      iso,
                      selected.id in follow ? follow[selected.id]! : paneJob.next_action_at,
                    )
                  }
                  onNotesSaved={(notes) => detailCache.set(paneJob.id, { ...paneJob, notes })}
                  notesRef={notesRef}
                  followOpen={followOpen}
                  onFollowOpen={setFollowOpen}
                  onApplyClick={() =>
                    statusOf(selected) !== "applied" &&
                    toast({
                      message: t("inbox.openedInTab"),
                      action: {
                        label: t("inbox.markApplied"),
                        hint: "a",
                        run: () => triage(selected.id, "applied"),
                      },
                    })
                  }
                />
              </div>
            </>
          ) : paneError ? (
            <p className="text-muted-foreground px-7 py-6 text-[13px]">
              {t("inbox.paneError")}{" "}
              <Link href={`/jobs/${selected.id}`} className="text-info underline">
                {t("inbox.openDetail")}
              </Link>
            </p>
          ) : (
            <>
              <PaneBar id={selected.id} />
              <PaneSkeleton title={selected.title} company={selected.company_name} />
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Pinned on top of the reading pane: the way to the full page stays in reach while reading. */
function PaneBar({ id }: { id: number }) {
  const t = useT();
  return (
    <div className="bg-surface sticky top-0 z-10 flex h-11 items-center gap-3 border-b px-7">
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Kbd>j</Kbd>
        <Kbd>k</Kbd> {t("inbox.nextPrev")}
      </span>
      <Link
        href={`/jobs/${id}`}
        className={buttonVariants({ variant: "outline", size: "sm", className: "ml-auto" })}
        title={t("inbox.openLargeTitle")}
      >
        <Maximize2 className="size-3.5" aria-hidden />
        {t("inbox.openLarge")}
        <Kbd className="ml-0.5">↵</Kbd>
      </Link>
    </div>
  );
}

/** Fixed under the list: count and sort always in reach. */
function ListFooter({
  shown,
  loaded,
  pending,
  sort,
  onSort,
}: {
  shown: number;
  loaded: number;
  pending: boolean;
  sort: InboxFilters["sort"];
  onSort: (s: InboxFilters["sort"]) => void;
}) {
  const t = useT();
  return (
    <div className="bg-background text-muted-foreground sticky bottom-0 flex h-11 shrink-0 items-center gap-3 border-t px-4 text-xs md:px-6">
      <span className="tabular-nums">
        {t("inbox.total", { count: shown })}
        {loaded < shown ? (
          <span className="hidden sm:inline">{t("inbox.loaded", { count: loaded })}</span>
        ) : null}
      </span>
      <span
        className={cn(
          "bg-primary h-px w-8 transition-opacity",
          pending ? "opacity-100" : "opacity-0",
        )}
        aria-hidden
      />
      <Segmented
        label={t("inbox.sort")}
        size="sm"
        className="ml-auto h-7"
        value={sort}
        options={[
          { value: "score", label: t("inbox.sortScore") },
          { value: "recent", label: t("inbox.sortRecent") },
        ]}
        onChange={onSort}
      />
    </div>
  );
}

function PaneSkeleton({ title, company }: { title: string; company: string }) {
  // The title and company are already known: show them, skeleton only what isn't.
  return (
    <div className="px-7 py-6" aria-busy>
      <h1 className="text-[19px] leading-snug font-semibold tracking-[-0.015em] text-balance">
        {title}
      </h1>
      <p className="text-muted-foreground mt-1 text-[13px]">{company}</p>
      <Skeleton className="mt-3 h-4 w-48" />
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-32" />
      </div>
      <Skeleton className="mt-2 h-7 w-[22rem]" />
      <Skeleton className="mt-7 h-4 w-28" />
      <div className="mt-3 flex flex-col gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-3.5 w-full" />
        ))}
      </div>
    </div>
  );
}

function PaneHint() {
  const t = useT();
  return (
    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-[13px]">
      <p>{t("inbox.hint")}</p>
      <p className="flex flex-wrap items-center justify-center gap-1.5 text-xs">
        <Kbd>j</Kbd>
        <Kbd>k</Kbd> {t("inbox.hintNavigate")} · <Kbd>s</Kbd> {t("inbox.hintSave")} · <Kbd>a</Kbd>{" "}
        {t("inbox.hintApplied")} · <Kbd>x</Kbd> {t("inbox.hintIgnore")} · <Kbd>?</Kbd>{" "}
        {t("inbox.hintAll")}
      </p>
    </div>
  );
}

function EmptyQueue({
  filters,
  navigate,
  loading,
}: {
  filters: InboxFilters;
  navigate: (f: InboxFilters) => void;
  loading: boolean;
}) {
  const t = useT();
  if (loading)
    return <p className="text-muted-foreground px-6 py-10 text-[13px]">{t("inbox.loadingMore")}</p>;
  const triage = filters.status === "todo";
  return (
    <div className="px-6 py-12">
      <p className="text-[15px] font-medium">
        {triage ? t("inbox.emptyTriage") : t("inbox.emptyFilters")}
      </p>
      <p className="text-muted-foreground mt-1 text-[13px]">
        {triage ? t("inbox.emptyTriageHelp") : t("inbox.emptyFiltersHelp")}
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-[13px]">
        {triage ? (
          <button
            type="button"
            onClick={() => navigate(applyView(filters, "saved"))}
            className="border-input hover:bg-secondary h-8 rounded-md border px-3"
          >
            {t("inbox.seeSaved")}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => navigate(applyView(filters, "all"))}
          className="border-input hover:bg-secondary h-8 rounded-md border px-3"
        >
          {t("inbox.allOffers")}
        </button>
      </div>
    </div>
  );
}

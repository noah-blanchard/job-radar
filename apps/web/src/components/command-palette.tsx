"use client";

import { ArrowUpRight, CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchHit } from "@/app/api/search/route";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";
import { cn, isTyping } from "@/lib/utils";

const OPEN_EVENT = "jobradar:palette";
export const openCommandPalette = () => window.dispatchEvent(new Event(OPEN_EVENT));

type Group = "views" | "pages" | "offers";

interface Item {
  id: string;
  label: string;
  hint?: string;
  group: Group;
  href: string;
  score?: number | null;
}

const GROUP_LABEL: Record<Group, MessageKey> = {
  views: "palette.views",
  pages: "palette.pages",
  offers: "palette.offers",
};

const STATIC: (Omit<Item, "label"> & { label: MessageKey })[] = [
  { id: "v-todo", group: "views", label: "palette.todo", href: "/" },
  { id: "v-fresh", group: "views", label: "palette.fresh", href: "/?since=24h" },
  { id: "v-saved", group: "views", label: "palette.saved", href: "/?status=saved" },
  { id: "v-all", group: "views", label: "palette.all", href: "/?status=active" },
  { id: "p-pipeline", group: "pages", label: "nav.pipeline", hint: "g p", href: "/pipeline" },
  { id: "p-sources", group: "pages", label: "nav.sources", hint: "g s", href: "/sources" },
  { id: "p-companies", group: "pages", label: "nav.companies", hint: "g e", href: "/companies" },
  { id: "p-stats", group: "pages", label: "nav.stats", hint: "g x", href: "/stats" },
  { id: "p-settings", group: "pages", label: "nav.settings", hint: "g r", href: "/settings" },
];

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Ctrl/⌘ K: jump to a page or view, or find an offer by title / company. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const t = useT();
  const statics: Item[] = useMemo(() => STATIC.map((i) => ({ ...i, label: t(i.label) })), [t]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Offer search, debounced; stale responses are aborted.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((h: SearchHit[]) => setHits(h))
        .catch(() => {});
    }, 140);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const items = useMemo(() => {
    const term = norm(q.trim());
    const pages = term ? statics.filter((i) => norm(i.label).includes(term)) : statics;
    const offers: Item[] =
      term.length >= 2
        ? hits.map((h) => ({
            id: `j-${h.id}`,
            group: "offers" as const,
            label: h.title,
            hint: h.company_name + (h.closed ? t("palette.closed") : ""),
            score: h.score,
            href: `/jobs/${h.id}`,
          }))
        : [];
    return [...pages, ...offers];
  }, [q, hits, statics, t]);

  const go = (it: Item | undefined) => {
    if (!it) return;
    setOpen(false);
    router.push(it.href);
  };

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setQ("");
      setHits([]);
      setActive(0);
    }
  };

  useEffect(() => {
    list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let lastGroup: Group | "" = "";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle className="sr-only">{t("palette.title")}</DialogTitle>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              } else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(items[active]);
              }
            }}
            placeholder={t("palette.placeholder")}
            aria-label={t("palette.search")}
            className="placeholder:text-muted-foreground h-11 flex-1 bg-transparent text-sm outline-none focus-visible:outline-none"
          />
          <Kbd>{t("palette.escape")}</Kbd>
        </div>
        <div ref={list} className="max-h-[min(420px,60vh)] overflow-y-auto p-1.5" role="listbox">
          {items.length === 0 ? (
            <p className="text-muted-foreground px-2 py-6 text-center text-[13px]">
              {t("palette.noMatch", { q: q.trim() })}
            </p>
          ) : (
            items.map((it, i) => {
              const head = it.group !== lastGroup ? it.group : null;
              lastGroup = it.group;
              return (
                <div key={it.id}>
                  {head ? (
                    <p className="label-caps px-2 pt-2 pb-1">{t(GROUP_LABEL[head])}</p>
                  ) : null}
                  <button
                    type="button"
                    data-i={i}
                    role="option"
                    aria-selected={i === active}
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(it)}
                    className={cn(
                      "flex h-9 w-full items-center gap-3 rounded-md px-2 text-left text-[13px]",
                      i === active ? "bg-raised" : "",
                    )}
                  >
                    {it.group === "offers" ? (
                      <span className="w-6 shrink-0 font-semibold tabular-nums">
                        {it.score ?? "—"}
                      </span>
                    ) : null}
                    <span className="min-w-0 truncate">{it.label}</span>
                    {it.hint ? (
                      <span className="text-muted-foreground ml-auto shrink-0 truncate text-xs">
                        {it.hint}
                      </span>
                    ) : null}
                    {i === active ? (
                      it.group === "offers" ? (
                        <ArrowUpRight className="text-muted-foreground size-3.5 shrink-0" />
                      ) : (
                        <CornerDownLeft className="text-muted-foreground size-3.5 shrink-0" />
                      )
                    ) : null}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Global keys: `g` then a letter to switch page, `?` for the help sheet. */
export function useGoChords(onHelp: () => void) {
  const router = useRouter();
  useEffect(() => {
    let armed = 0;
    const MAP: Record<string, string> = {
      t: "/",
      i: "/",
      p: "/pipeline",
      s: "/sources",
      e: "/companies",
      x: "/stats",
      r: "/settings",
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "?") {
        e.preventDefault();
        onHelp();
        return;
      }
      if (e.key === "g") {
        armed = Date.now();
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (armed && Date.now() - armed < 1200 && MAP[e.key]) {
        e.preventDefault();
        e.stopImmediatePropagation();
        armed = 0;
        router.push(MAP[e.key]!);
      }
      armed = 0;
    };
    // Capture phase: a `g` chord wins over page-level single keys (s, x, e…).
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [router, onHelp]);
}

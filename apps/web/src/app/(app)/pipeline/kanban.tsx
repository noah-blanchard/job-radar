"use client";

import { ArrowUpRight, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FollowUpControl } from "@/components/job/follow-up";
import { ScoreMark } from "@/components/score-badge";
import { toast } from "@/components/ui/toast";
import { PIPELINE_STATUSES, STATUS_LABEL, STATUSES, type JobStatus } from "@/lib/filters";
import { isDue } from "@/lib/follow-up";
import { popUndo, pushUndo, removeUndo, type UndoEntry } from "@/lib/undo";
import { useSoftRefresh } from "@/lib/use-soft-refresh";
import { cn, formatAge, formatDueDate, isTyping, placeLabel } from "@/lib/utils";
import { setJobStatus, setNextAction } from "../jobs/actions";

export interface PipelineCard {
  id: number;
  title: string;
  company_name: string;
  city: string | null;
  country: string | null;
  remote: string;
  score: number | null;
  url: string;
  apply_url: string | null;
  closed: boolean;
  status: JobStatus;
  notes: string | null;
  updated_at: string;
  next_action_at: string | null;
  ledger: [string, number][];
}

type Col = (typeof PIPELINE_STATUSES)[number];

const COLUMN_RULE: Record<Col, string> = {
  saved: "bg-st-saved",
  applied: "bg-st-applied",
  interview: "bg-st-interview",
  rejected: "bg-st-rejected",
};

/** Due first (oldest due on top), then the next follow-ups, then the most recently moved. */
function order(a: PipelineCard, b: PipelineCard) {
  const da = a.next_action_at ? Date.parse(a.next_action_at) : Infinity;
  const db = b.next_action_at ? Date.parse(b.next_action_at) : Infinity;
  if (da !== db) return da - db;
  return Date.parse(b.updated_at) - Date.parse(a.updated_at);
}

const Card = memo(function Card({
  c,
  selected,
  dragging,
  onSelect,
  onDragStart,
  onDragEnd,
  onMove,
  onFollow,
}: {
  c: PipelineCard;
  selected: boolean;
  dragging: boolean;
  onSelect: (id: number) => void;
  onDragStart: (id: number) => void;
  onDragEnd: () => void;
  onMove: (id: number, s: JobStatus) => void;
  onFollow: (id: number, iso: string | null) => void;
}) {
  const due = isDue(c.next_action_at);
  return (
    <article
      data-card={c.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(c.id));
        e.dataTransfer.effectAllowed = "move";
        onDragStart(c.id);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(c.id)}
      aria-selected={selected}
      className={cn(
        "border-border-soft cursor-grab rounded-md border bg-[#131b23] p-3 transition-[background-color,border-color,opacity] duration-[var(--dur-fast)] active:cursor-grabbing",
        selected ? "bg-raised border-[#33424e]" : "hover:border-border",
        dragging && "opacity-40",
        c.closed && "opacity-70",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/jobs/${c.id}`}
            className="line-clamp-2 text-[13.5px] leading-5 font-medium hover:underline"
            draggable={false}
          >
            {c.title}
          </Link>
          <p className="text-muted-foreground mt-0.5 truncate text-xs">
            {c.company_name} · {placeLabel(c)}
          </p>
        </div>
        <ScoreMark score={c.score} parts={c.ledger} />
      </div>
      {c.notes ? (
        <p className="text-muted-foreground mt-2 line-clamp-2 text-xs leading-4">{c.notes}</p>
      ) : null}
      <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {c.status !== "rejected" ? (
          <FollowUpControl
            at={c.next_action_at}
            onChange={(iso) => onFollow(c.id, iso)}
            size="sm"
          />
        ) : null}
        <span className="text-muted-foreground ml-auto flex items-center gap-2 text-xs">
          {c.closed ? <span className="text-destructive">fermée</span> : null}
          <span title={`Dernier changement il y a ${formatAge(c.updated_at)}`}>
            {formatAge(c.updated_at)}
          </span>
          <a
            href={c.apply_url ?? c.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Ouvrir l'offre d'origine"
            className="hover:text-foreground"
          >
            <ArrowUpRight className="size-3.5" />
          </a>
        </span>
        {/* Touch devices: no drag, so a status menu. */}
        <select
          value={c.status}
          onChange={(e) => onMove(c.id, e.target.value as JobStatus)}
          aria-label={`Statut de ${c.title}`}
          className="border-input bg-background h-7 rounded-md border px-1 text-xs md:hidden"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      {due ? <span className="sr-only">Relance due</span> : null}
    </article>
  );
});

/** Kanban: drag a card, or select it and press 1–4 / h / l. Follow-up dates edited in place. */
export function Kanban({ cards: initial }: { cards: PipelineCard[] }) {
  const router = useRouter();
  const softRefresh = useSoftRefresh();
  const [cards, setCards] = useState(initial);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<Col | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [showRejected, setShowRejected] = useState(false);

  // Server data refreshed (revalidation): start again from it.
  const [source, setSource] = useState(initial);
  if (source !== initial) {
    setSource(initial);
    setCards(initial);
  }

  const columns = useMemo(
    () =>
      Object.fromEntries(
        PIPELINE_STATUSES.map((col) => [col, cards.filter((c) => c.status === col).sort(order)]),
      ) as Record<Col, PipelineCard[]>,
    [cards],
  );

  const moveRef = useRef<((id: number, s: JobStatus, undoable?: boolean) => void) | null>(null);
  const move = useCallback(
    (id: number, status: JobStatus, undoable = true) => {
      const card = cards.find((c) => c.id === id);
      if (!card || card.status === status) return;
      const before = card.status;
      setCards((cs) =>
        cs.map((c) => (c.id === id ? { ...c, status, updated_at: new Date().toISOString() } : c)),
      );
      if (status === "rejected") setShowRejected(true);
      if (undoable) {
        const undo = { label: card.title, run: () => moveRef.current?.(id, before, false) };
        pushUndo(undo);
        toast({
          message: `${STATUS_LABEL[status]} · ${card.title}`,
          action: { label: "Annuler", hint: "z", run: () => (removeUndo(undo), undo.run()) },
        });
      }
      const rollback = () => {
        setCards((cs) => cs.map((c) => (c.id === id ? { ...c, status: before } : c)));
        toast({ tone: "error", message: "Statut non enregistré. Réessaie." });
      };
      void setJobStatus(id, status).then((r) => {
        if (!r.ok) return rollback();
        softRefresh();
        setCards((cs) =>
          cs.map((c) => (c.id === id ? { ...c, next_action_at: r.nextActionAt ?? null } : c)),
        );
      }, rollback);
    },
    [cards, softRefresh],
  );
  useEffect(() => {
    moveRef.current = move;
  }, [move]);

  const follow = useCallback(
    (id: number, iso: string | null) => {
      const card = cards.find((c) => c.id === id);
      if (!card) return;
      const prev = card.next_action_at;
      const put = (v: string | null) =>
        setCards((cs) => cs.map((c) => (c.id === id ? { ...c, next_action_at: v } : c)));
      put(iso);
      const undo: UndoEntry = {
        label: card.title,
        run: () => {
          put(prev);
          void setNextAction(id, prev);
        },
      };
      pushUndo(undo);
      toast({
        message: iso
          ? `Relance le ${formatDueDate(iso)} · ${card.title}`
          : `Relance retirée · ${card.title}`,
        action: { label: "Annuler", hint: "z", run: () => (removeUndo(undo), undo.run()) },
      });
      const rollback = () => {
        put(prev);
        removeUndo(undo);
        toast({ tone: "error", message: "Date de relance non enregistrée. Réessaie." });
      };
      void setNextAction(id, iso).then((r) => (r.ok ? softRefresh() : rollback()), rollback);
    },
    [cards, softRefresh],
  );

  // Keyboard: j/k within a column, h/l across columns, 1–4 to move, Enter to open.
  useEffect(() => {
    const visibleCols = PIPELINE_STATUSES.filter((c) => c !== "rejected" || showRejected);
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector("[role=dialog]")) return;
      const card = cards.find((c) => c.id === selected);
      const col = card ? (card.status as Col) : null;
      const list = col ? columns[col] : [];
      const i = card ? list.findIndex((c) => c.id === card.id) : -1;
      const first = visibleCols.map((c) => columns[c][0]).find(Boolean);
      if (e.key === "j" || e.key === "k") {
        if (!card) setSelected(first?.id ?? null);
        else {
          const n = list[i + (e.key === "j" ? 1 : -1)];
          if (n) setSelected(n.id);
        }
      } else if (e.key === "h" || e.key === "l") {
        if (!card || !col) setSelected(first?.id ?? null);
        else {
          const ci = visibleCols.indexOf(col);
          for (let d = 1; d < visibleCols.length; d++) {
            const target = visibleCols[ci + (e.key === "l" ? d : -d)];
            if (!target) break;
            const t = columns[target][Math.min(i, columns[target].length - 1)];
            if (t) {
              setSelected(t.id);
              break;
            }
          }
        }
      } else if (card && /^[1-4]$/.test(e.key)) {
        move(card.id, PIPELINE_STATUSES[Number(e.key) - 1]!);
      } else if (card && e.key === "Enter") {
        router.push(`/jobs/${card.id}`);
      } else if (e.key === "z") {
        const u = popUndo();
        if (u) u.run();
        else toast({ message: "Rien à annuler." });
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cards, columns, selected, move, router, showRejected]);

  useEffect(() => {
    document.querySelector(`[data-card="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <div className="grid flex-1 gap-px bg-[var(--border-soft)] md:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
      {PIPELINE_STATUSES.map((col, ci) => {
        const list = columns[col];
        const dueCount = list.filter((c) => isDue(c.next_action_at)).length;
        const collapsed = col === "rejected" && !showRejected;
        return (
          <section
            key={col}
            aria-label={STATUS_LABEL[col]}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(col);
            }}
            onDragLeave={() => setOver((o) => (o === col ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              const id = Number(e.dataTransfer.getData("text/plain"));
              setOver(null);
              setDragging(null);
              if (id) move(id, col);
            }}
            className={cn(
              "bg-background flex min-h-40 flex-col gap-2 p-3 transition-colors duration-[var(--dur-fast)] md:p-4",
              over === col && "bg-[#131e27]",
              collapsed ? "xl:w-56" : col === "rejected" && "xl:w-80",
            )}
          >
            <h2 className="flex items-center gap-2 pb-1 text-[13px] font-medium">
              <span className={cn("h-3 w-[3px] rounded-full", COLUMN_RULE[col])} aria-hidden />
              {STATUS_LABEL[col].replace(/^./, (c) => c.toUpperCase())}
              <span className="text-muted-foreground tabular-nums">{list.length}</span>
              {dueCount ? (
                <span className="text-warning text-xs">
                  {dueCount} due{dueCount > 1 ? "s" : ""}
                </span>
              ) : null}
              <kbd className="text-muted-foreground ml-auto hidden text-[11px] md:inline">
                {ci + 1}
              </kbd>
            </h2>
            {collapsed ? (
              list.length ? (
                <button
                  type="button"
                  onClick={() => setShowRejected(true)}
                  className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-left text-xs"
                >
                  <ChevronDown className="size-3.5" /> Afficher les {list.length} refusées
                </button>
              ) : (
                <p className="text-muted-foreground text-xs">Aucune.</p>
              )
            ) : list.length === 0 ? (
              <p className="text-muted-foreground border-border-soft rounded-md border border-dashed px-3 py-6 text-center text-xs">
                {col === "saved"
                  ? "Sauvegarde des offres depuis Trier (s)."
                  : col === "applied"
                    ? "Les offres marquées « postulé » (a) arrivent ici."
                    : "Glisse une carte ici."}
              </p>
            ) : (
              list.map((c) => (
                <Card
                  key={c.id}
                  c={c}
                  selected={c.id === selected}
                  dragging={dragging === c.id}
                  onSelect={setSelected}
                  onDragStart={setDragging}
                  onDragEnd={() => setDragging(null)}
                  onMove={move}
                  onFollow={follow}
                />
              ))
            )}
          </section>
        );
      })}
    </div>
  );
}

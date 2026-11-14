"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { ScoreBadge } from "@/components/score-badge";
import { PIPELINE_STATUSES, STATUS_LABEL, STATUSES, type JobStatus } from "@/lib/filters";
import { cn, formatAge, placeLabel } from "@/lib/utils";
import { setJobStatus } from "../jobs/actions";

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
}

/** Kanban: drag a card to another column (desktop) or pick a status in its menu (mobile). */
export function Kanban({ cards: initial }: { cards: PipelineCard[] }) {
  const [cards, setCards] = useState(initial);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  // Server data refreshed (revalidation): start again from it.
  const [source, setSource] = useState(initial);
  if (source !== initial) {
    setSource(initial);
    setCards(initial);
  }

  const move = (id: number, status: JobStatus) => {
    const before = cards;
    const card = cards.find((c) => c.id === id);
    if (!card || card.status === status) return;
    setCards((cs) =>
      cs.map((c) => (c.id === id ? { ...c, status, updated_at: new Date().toISOString() } : c)),
    );
    setError(null);
    start(async () => {
      const r = await setJobStatus(id, status);
      if (!r.ok) {
        setCards(before);
        setError(r.error ?? "statut non enregistré");
      }
    });
  };

  return (
    <>
      {error ? <p className="text-destructive mb-2 text-sm">{error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PIPELINE_STATUSES.map((col) => {
          const list = cards.filter((c) => c.status === col);
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
                "bg-card/40 flex min-h-32 flex-col gap-2 rounded-lg border p-2 transition-colors",
                over === col && "border-ring bg-secondary/40",
              )}
            >
              <h2 className="text-muted-foreground flex items-center justify-between px-1 text-xs font-medium tracking-wide uppercase">
                {STATUS_LABEL[col]}
                <span className="tabular-nums">{list.length}</span>
              </h2>
              {list.length === 0 ? (
                <p className="text-muted-foreground/60 px-1 py-4 text-center text-xs">
                  Aucune offre
                </p>
              ) : null}
              {list.map((c) => (
                <article
                  key={c.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", String(c.id));
                    e.dataTransfer.effectAllowed = "move";
                    setDragging(c.id);
                  }}
                  onDragEnd={() => setDragging(null)}
                  className={cn(
                    "bg-card cursor-grab rounded-md border p-2 text-sm shadow-xs active:cursor-grabbing",
                    dragging === c.id && "opacity-50",
                    c.closed && "opacity-70",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <ScoreBadge score={c.score} />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/jobs/${c.id}`}
                        className="line-clamp-2 font-medium hover:underline"
                      >
                        {c.title}
                      </Link>
                      <p className="text-muted-foreground truncate text-xs">
                        {c.company_name} · {placeLabel(c)}
                      </p>
                    </div>
                  </div>
                  {c.notes ? (
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{c.notes}</p>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <select
                      value={c.status}
                      onChange={(e) => move(c.id, e.target.value as JobStatus)}
                      aria-label={`Statut de ${c.title}`}
                      className="border-input bg-background h-7 rounded-md border px-1 text-xs"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    <span className="text-muted-foreground flex items-center gap-2 text-xs">
                      {c.closed ? "fermée · " : ""}
                      {formatAge(c.updated_at)}
                      <a
                        href={c.apply_url ?? c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Ouvrir l'offre"
                        className="hover:text-foreground"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    </span>
                  </div>
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}

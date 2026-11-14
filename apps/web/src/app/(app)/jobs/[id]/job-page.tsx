"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LAST_INBOX_KEY } from "@/components/inbox/inbox";
import { JobDetailView } from "@/components/job/job-detail";
import { Kbd } from "@/components/ui/kbd";
import { dismissToast, toast } from "@/components/ui/toast";
import { STATUS_LABEL, type JobStatus } from "@/lib/filters";
import type { JobDetail } from "@/lib/job-detail";
import { popUndo, pushUndo, removeUndo, type UndoEntry } from "@/lib/undo";
import { useSoftRefresh } from "@/lib/use-soft-refresh";
import { formatDueDate, isTyping } from "@/lib/utils";
import { setJobStatus, setNextAction } from "../actions";

const KEYS: Record<string, JobStatus> = { s: "saved", a: "applied", x: "ignored" };

/** Full-page job view: same detail and keys as the reading pane, plus a precise way back. */
export function JobPage({ job }: { job: JobDetail }) {
  const router = useRouter();
  const softRefresh = useSoftRefresh();
  const [status, setStatus] = useState<JobStatus>(job.status);
  const [next, setNext] = useState<string | null>(job.next_action_at);
  const [followOpen, setFollowOpen] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const change = (target: JobStatus, opts = { undoable: true }) => {
    const prev = status;
    const value = prev === target ? "new" : target;
    setStatus(value);
    const undo: UndoEntry = { label: job.title, run: () => change(prev, { undoable: false }) };
    if (opts.undoable) {
      pushUndo(undo);
      toast({
        message: value === "new" ? "Remise à trier" : `${STATUS_LABEL[value]}`,
        action: { label: "Annuler", hint: "z", run: () => (removeUndo(undo), undo.run()) },
      });
    } else dismissToast();
    const rollback = () => {
      setStatus(prev);
      removeUndo(undo);
      toast({ tone: "error", message: "Statut non enregistré. Réessaie." });
    };
    void setJobStatus(job.id, value).then((r) => {
      if (!r.ok) return rollback();
      setNext(r.nextActionAt ?? null);
      softRefresh();
    }, rollback);
  };

  const changeNext = (iso: string | null, undoable = true) => {
    const prev = next;
    setNext(iso);
    const undo: UndoEntry = { label: job.title, run: () => changeNext(prev, false) };
    if (undoable) {
      pushUndo(undo);
      toast({
        message: iso ? `Relance le ${formatDueDate(iso)}` : "Relance retirée",
        action: { label: "Annuler", hint: "z", run: () => (removeUndo(undo), undo.run()) },
      });
    }
    const rollback = () => {
      setNext(prev);
      removeUndo(undo);
      toast({ tone: "error", message: "Date de relance non enregistrée. Réessaie." });
    };
    void setNextAction(job.id, iso).then((r) => (r.ok ? softRefresh() : rollback()), rollback);
  };

  const goBack = () => {
    let back = "/";
    try {
      back = sessionStorage.getItem(LAST_INBOX_KEY) ?? "/";
    } catch {
      // storage blocked: default list
    }
    router.push(back, { scroll: false });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector("[role=dialog]")) return;
      if (KEYS[e.key]) change(KEYS[e.key]!);
      else if (e.key === "z") {
        const u = popUndo();
        if (u) u.run();
        else toast({ message: "Rien à annuler." });
      } else if (e.key === "o") window.open(job.apply_url ?? job.url, "_blank", "noopener");
      else if (e.key === "e") notesRef.current?.focus();
      else if (e.key === "f") setFollowOpen(true);
      else if (e.key === "Escape") goBack();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-5 md:px-8 md:py-7">
      <button
        type="button"
        onClick={goBack}
        className="text-muted-foreground hover:text-foreground mb-5 inline-flex items-center gap-1.5 text-[13px]"
      >
        <ArrowLeft className="size-4" aria-hidden /> Retour à la liste
        <Kbd className="ml-1 hidden md:inline-flex">Échap</Kbd>
      </button>
      <JobDetailView
        job={job}
        variant="page"
        status={status}
        nextActionAt={next}
        onStatus={(s) => change(s === "new" ? status : s)}
        onNextAction={changeNext}
        notesRef={notesRef}
        followOpen={followOpen}
        onFollowOpen={setFollowOpen}
        onApplyClick={() =>
          status !== "applied" &&
          toast({
            message: "Offre ouverte dans un onglet.",
            action: { label: "Marquer postulé", hint: "a", run: () => change("applied") },
          })
        }
      />
    </div>
  );
}

"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { STATUS_LABEL, STATUSES, type JobStatus } from "@/lib/filters";
import { cn } from "@/lib/utils";
import { saveNotes, setJobStatus, type NotesState } from "../actions";

export function JobStatusControls({
  jobId,
  status,
  notes,
}: {
  jobId: number;
  status: JobStatus;
  notes: string | null;
}) {
  const [current, setCurrent] = useState<JobStatus>(status);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notesState, notesAction, savingNotes] = useActionState<NotesState, FormData>(
    saveNotes,
    {},
  );

  const change = (next: JobStatus) => {
    const prev = current;
    setCurrent(next);
    setError(null);
    start(async () => {
      const r = await setJobStatus(jobId, next);
      if (!r.ok) {
        setCurrent(prev);
        setError(r.error ?? "statut non enregistré");
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Statut">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={current === s}
            disabled={pending}
            onClick={() => change(s)}
            className={cn(
              "rounded-md border px-2 py-1 text-xs",
              current === s
                ? "bg-primary text-primary-foreground border-transparent"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
      <form action={notesAction} className="flex flex-col gap-2">
        <input type="hidden" name="jobId" value={jobId} />
        <textarea
          name="notes"
          defaultValue={notes ?? ""}
          rows={4}
          placeholder="Notes (contacts, date de candidature, suites…)"
          aria-label="Notes"
          className="border-input bg-background focus-visible:ring-ring/50 rounded-md border px-2 py-1.5 text-sm outline-none focus-visible:ring-2"
        />
        <div className="flex items-center gap-2">
          <Button type="submit" variant="secondary" size="sm" disabled={savingNotes}>
            {savingNotes ? "Enregistrement…" : "Enregistrer les notes"}
          </Button>
          {notesState.ok ? <span className="text-success text-xs">{notesState.ok}</span> : null}
          {notesState.error ? (
            <span className="text-destructive text-xs">{notesState.error}</span>
          ) : null}
        </div>
      </form>
    </div>
  );
}

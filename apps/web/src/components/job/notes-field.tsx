"use client";

import { useEffect, useRef, useState } from "react";
import { saveNotes } from "@/app/(app)/jobs/actions";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/**
 * Notes that save themselves: 800 ms after the last keystroke, on blur, and when leaving the
 * job. Remount it per job (key) so a pending save always targets the right one.
 */
export function NotesField({
  jobId,
  initial,
  onSaved,
  ref,
  rows = 3,
}: {
  jobId: number;
  initial: string | null;
  onSaved?: (notes: string) => void;
  ref?: React.Ref<HTMLTextAreaElement>;
  rows?: number;
}) {
  const t = useT();
  const [value, setValue] = useState(initial ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saved = useRef(initial ?? "");
  const latest = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  });

  const flush = useRef(async () => {
    clearTimeout(timer.current);
    const text = latest.current;
    if (text === saved.current) return;
    setState("saving");
    try {
      const r = await saveNotes(jobId, text);
      if (!r.ok) throw new Error(r.error);
      saved.current = text;
      onSavedRef.current?.(text);
      setState(latest.current === text ? "saved" : "idle");
    } catch {
      setState("error");
    }
  });

  // Leaving the job (unmount) saves what was typed.
  useEffect(() => {
    const f = flush.current;
    return () => void f();
  }, []);

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        onChange={(e) => {
          setValue(e.target.value);
          latest.current = e.target.value;
          setState("idle");
          clearTimeout(timer.current);
          timer.current = setTimeout(() => void flush.current(), 800);
        }}
        onBlur={() => void flush.current()}
        onKeyDown={(e) => {
          if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
        }}
        placeholder={t("job.notesPlaceholder")}
        aria-label={t("job.notes")}
        className="border-input placeholder:text-muted-foreground block w-full resize-y rounded-md border bg-field px-2.5 py-2 text-[13px] leading-relaxed outline-none hover:border-input-hover focus-visible:border-primary/70 focus-visible:bg-background focus-visible:outline-none [field-sizing:content] min-h-[4.5rem]"
      />
      <span
        aria-live="polite"
        className={cn(
          "pointer-events-none absolute right-2 bottom-1.5 text-[11px] transition-opacity duration-[var(--dur)]",
          state === "error" ? "text-destructive" : "text-muted-foreground",
          state === "idle" ? "opacity-0" : "opacity-100",
        )}
      >
        {state === "saving"
          ? t("job.notesSaving")
          : state === "saved"
            ? t("job.notesSaved")
            : state === "error"
              ? t("job.notesError")
              : ""}
      </span>
    </div>
  );
}

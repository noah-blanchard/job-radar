"use client";

import { useEffect, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

/**
 * One quiet toast at a time, bottom-right. Used for feedback that must not interrupt: a status
 * change with its undo, an error with what to do next. Module store: `toast()` works anywhere.
 */
export interface ToastData {
  id: number;
  message: string;
  tone?: "default" | "error";
  action?: { label: string; hint?: string; run: () => void };
  ms?: number;
}

let current: ToastData | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(t: Omit<ToastData, "id">): void {
  current = { ...t, id: ++seq };
  emit();
}

export function dismissToast(id?: number): void {
  if (id !== undefined && current?.id !== id) return;
  current = null;
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function Toaster() {
  const t = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );

  useEffect(() => {
    if (!t) return;
    const timer = setTimeout(() => dismissToast(t.id), t.ms ?? (t.action ? 5000 : 3000));
    return () => clearTimeout(timer);
  }, [t]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex max-w-[min(420px,calc(100vw-32px))] justify-end"
    >
      {t ? (
        <div
          key={t.id}
          className={cn(
            "bg-surface animate-in fade-in-0 slide-in-from-bottom-1 border-input pointer-events-auto flex items-center gap-3 rounded-md border py-2 pr-2 pl-3 text-[13px] duration-150",
            t.tone === "error" && "border-[color-mix(in_oklab,var(--destructive)_45%,transparent)]",
          )}
        >
          <span className={cn("min-w-0 truncate", t.tone === "error" && "text-destructive")}>
            {t.message}
          </span>
          {t.action ? (
            <button
              type="button"
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
              className="text-primary hover:bg-secondary inline-flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-1 font-medium"
            >
              {t.action.label}
              {t.action.hint ? (
                <kbd className="border-input text-muted-foreground rounded-[4px] border px-1 text-[11px] leading-4">
                  {t.action.hint}
                </kbd>
              ) : null}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useTransition } from "react";

/**
 * After writes, refresh the server data (rail counts, the Aujourd'hui record, the list) once
 * things go quiet: debounced so a burst of keystrokes costs one round trip, and run in a
 * transition so the current screen stays interactive while it loads. Leaving the page with a
 * refresh still pending runs it right away (the shell's counts must not stay stale).
 */
export function useSoftRefresh(delay = 1200) {
  const router = useRouter();
  const [, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      if (timer.current === undefined) return;
      clearTimeout(timer.current);
      timer.current = undefined;
      router.refresh();
    },
    [router],
  );
  return useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      start(() => router.refresh());
    }, delay);
  }, [router, delay]);
}

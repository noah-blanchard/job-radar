"use client";

import { useEffect, useRef } from "react";
import { useT } from "@/i18n/client";

const KEY = "jobradar:pane-width";
export const PANE_DEFAULT = 520;
const PANE_MIN = 360;
const LIST_MIN = 380;

function clamp(w: number, grid: HTMLElement): number {
  const max = Math.max(PANE_MIN, grid.getBoundingClientRect().width - LIST_MIN);
  return Math.round(Math.min(max, Math.max(PANE_MIN, w)));
}

function read(): number | null {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function save(w: number) {
  try {
    localStorage.setItem(KEY, String(w));
  } catch {
    // storage blocked: the width lasts for this page only
  }
}

/**
 * Draggable boundary between the list and the reading pane (desktop only). The width lives in
 * the grid's `--pane-w` variable and in localStorage, so dragging never re-renders the list.
 * Keyboard: ←/→ (Shift for bigger steps); double-click resets.
 */
export function PaneDivider({ grid }: { grid: React.RefObject<HTMLDivElement | null> }) {
  const handle = useRef<HTMLDivElement>(null);
  const t = useT();

  const apply = (w: number) => {
    const g = grid.current;
    if (!g) return PANE_DEFAULT;
    const v = clamp(w, g);
    g.style.setProperty("--pane-w", `${v}px`);
    handle.current?.setAttribute("aria-valuenow", String(v));
    return v;
  };
  const current = () =>
    Number.parseFloat(grid.current?.style.getPropertyValue("--pane-w") || "") || PANE_DEFAULT;

  // Restore the remembered width, and keep it valid when the window changes size.
  useEffect(() => {
    const g = grid.current;
    if (!g) return;
    apply(read() ?? PANE_DEFAULT);
    const ro = new ResizeObserver(() => apply(current()));
    ro.observe(g);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply/current only read refs
  }, [grid]);

  return (
    <div className="relative hidden lg:block" aria-hidden={false}>
      <div className="bg-border absolute inset-y-0 left-0 w-px" />
      <div
        ref={handle}
        role="separator"
        aria-orientation="vertical"
        aria-label={t("pane.width")}
        aria-valuemin={PANE_MIN}
        aria-valuenow={PANE_DEFAULT}
        tabIndex={0}
        title={t("pane.resize")}
        onPointerDown={(e) => {
          const g = grid.current;
          if (!g || e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.dataset.dragging = "";
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
          const right = g.getBoundingClientRect().right;
          const move = (ev: PointerEvent) => apply(right - ev.clientX);
          const up = (ev: PointerEvent) => {
            const el = handle.current;
            if (el) delete el.dataset.dragging;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            save(apply(right - ev.clientX));
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
        onDoubleClick={() => save(apply(PANE_DEFAULT))}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 80 : 24;
          if (e.key === "ArrowLeft") save(apply(current() + step));
          else if (e.key === "ArrowRight") save(apply(current() - step));
          else return;
          e.preventDefault();
          e.stopPropagation();
        }}
        className="group absolute inset-y-0 -left-[5px] z-20 w-[11px] cursor-col-resize outline-none"
      >
        <span className="bg-primary absolute inset-y-0 left-[5px] w-px opacity-0 transition-opacity duration-[var(--dur-fast)] group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[dragging]:opacity-100" />
      </div>
    </div>
  );
}

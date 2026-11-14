import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { dayKey } from "../i18n/format"; // relative: vitest has no "@/" alias

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** True when a key event comes from a text field (shortcuts must not fire while typing). */
export function isTyping(el: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

// Dates, ages and places shown to the user: `createFormat` in `@/i18n/format`.

/** `<input type="date">` value (Toronto day) for a date, and back to an ISO instant at 9:00. */
export function toDateInput(d: Date | string | null | undefined): string {
  return d ? dayKey(new Date(d)) : "";
}
export function fromDateInput(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  // 9:00 Toronto, either offset: good enough for a day-level reminder.
  const guess = new Date(`${v}T09:00:00-05:00`);
  return guess.toISOString();
}

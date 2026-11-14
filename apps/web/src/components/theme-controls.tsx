"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { useT } from "@/i18n/client";
import {
  MODE_COOKIE,
  MODES,
  PALETTE_COOKIE,
  PALETTES,
  parseMode,
  parsePalette,
  type Mode,
  type Palette,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

const YEAR = 60 * 60 * 24 * 365;

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${YEAR}; samesite=lax`;
}

const prefersDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

function applyMode(mode: Mode) {
  const d = document.documentElement;
  d.dataset.mode = mode;
  d.classList.toggle("dark", mode === "dark" || (mode === "auto" && prefersDark()));
}

/** Reads the current appearance from <html> (set by the server from the cookies). */
function useAppearance() {
  const [palette, setPalette] = useState<Palette>("bleu");
  const [mode, setMode] = useState<Mode>("auto");
  useEffect(() => {
    const d = document.documentElement;
    // Sync from the DOM the server rendered: an external system, read once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPalette(parsePalette(d.dataset.palette));
    setMode(parseMode(d.dataset.mode));
    // "auto" keeps following the device while the page is open.
    const q = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => {
      if (d.dataset.mode === "auto") d.classList.toggle("dark", q.matches);
    };
    q.addEventListener("change", follow);
    return () => q.removeEventListener("change", follow);
  }, []);
  return {
    palette,
    mode,
    choosePalette: (p: Palette) => {
      document.documentElement.dataset.palette = p;
      setCookie(PALETTE_COOKIE, p);
      setPalette(p);
    },
    chooseMode: (m: Mode) => {
      applyMode(m);
      setCookie(MODE_COOKIE, m);
      setMode(m);
    },
  };
}

/** Settings → Appearance: ink and mode. */
export function AppearanceSettings() {
  const { palette, mode, choosePalette, chooseMode } = useAppearance();
  const t = useT();
  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-muted-foreground">{t("settings.appearance.color")}</span>
        <div className="flex gap-2" role="group" aria-label={t("settings.appearance.color")}>
          {PALETTES.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={palette === p}
              onClick={() => choosePalette(p)}
              className={cn(
                "flex h-8 items-center gap-2 rounded-md border px-3 transition-colors",
                palette === p
                  ? "border-primary text-foreground"
                  : "border-input text-muted-foreground hover:border-input-hover hover:text-foreground",
              )}
            >
              <span
                className="size-3 rounded-full"
                style={{ background: p === "violet" ? "#6f58d6" : "#4670c9" }}
                aria-hidden
              />
              {t(`settings.appearance.palette.${p}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-muted-foreground">{t("settings.appearance.mode")}</span>
        <Segmented
          label={t("settings.appearance.mode")}
          value={mode}
          options={MODES.map((m) => ({ value: m, label: t(`settings.appearance.modes.${m}`) }))}
          onChange={chooseMode}
        />
      </div>
      <p className="text-muted-foreground text-xs">{t("settings.appearance.help")}</p>
    </div>
  );
}

const ICON = { auto: Monitor, light: Sun, dark: Moon } as const;
const NEXT: Record<Mode, Mode> = { auto: "light", light: "dark", dark: "auto" };

/** Rail: one button cycling Auto → Light → Dark. */
export function ModeToggle({ className }: { className?: string }) {
  const { mode, chooseMode } = useAppearance();
  const t = useT();
  const Icon = ICON[mode];
  const label = t(`settings.appearance.modes.${mode}`);
  return (
    <button
      type="button"
      onClick={() => chooseMode(NEXT[mode])}
      title={t("settings.appearance.toggleTitle", { mode: label })}
      aria-label={t("settings.appearance.toggleLabel", { mode: label })}
      className={cn(
        "text-muted-foreground hover:text-foreground hover:bg-rail-hover flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px]",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </button>
  );
}

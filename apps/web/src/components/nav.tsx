"use client";

import {
  ChartColumn,
  Building,
  Inbox,
  SquareKanban,
  LogOut,
  Menu,
  RadioTower,
  Search,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { openCommandPalette } from "@/components/command-palette";
import { ModeToggle } from "@/components/theme-controls";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";
import { cn } from "@/lib/utils";

export interface NavCounts {
  triage: number;
  due: number;
  problems: number;
}

interface NavItem {
  href: string;
  label: MessageKey;
  icon: typeof Inbox;
  chord: string;
}

const WORK: readonly [NavItem, NavItem] = [
  { href: "/", label: "nav.triage", icon: Inbox, chord: "t" },
  { href: "/pipeline", label: "nav.pipeline", icon: SquareKanban, chord: "p" },
];

const MACHINE: readonly NavItem[] = [
  { href: "/sources", label: "nav.sources", icon: RadioTower, chord: "s" },
  { href: "/companies", label: "nav.companies", icon: Building, chord: "e" },
  { href: "/stats", label: "nav.stats", icon: ChartColumn, chord: "x" },
  { href: "/settings", label: "nav.settings", icon: Settings, chord: "r" },
];

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" || pathname.startsWith("/jobs/") : pathname.startsWith(href);

function Count({ n, tone }: { n: number | undefined; tone?: "due" }) {
  const t = useT();
  if (!n) return null;
  return (
    <span
      className={cn(
        "ml-auto text-xs tabular-nums",
        tone === "due" ? "text-warning" : "text-muted-foreground",
      )}
    >
      {tone === "due" ? t("nav.due", { count: n }) : t("common.count", { count: n })}
    </span>
  );
}

function RailLink({
  href,
  label,
  icon: Icon,
  active,
  children,
}: {
  href: string;
  label: MessageKey;
  icon: typeof Inbox;
  active: boolean;
  children?: React.ReactNode;
}) {
  const t = useT();
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors duration-[var(--dur-fast)]",
        active
          ? "bg-rail-active text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-rail-hover",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "")} aria-hidden />
      <span className={cn(active && "font-medium")}>{t(label)}</span>
      {children}
    </Link>
  );
}

/** Desktop rail: work first, machine second; counts arrive when the shell's data does. */
export function Rail({
  counts,
  logout,
}: {
  counts: NavCounts | null;
  logout: () => Promise<void>;
}) {
  const pathname = usePathname();
  const t = useT();
  return (
    <aside className="bg-rail hidden h-full w-[208px] shrink-0 flex-col border-r border-rail-border px-2.5 py-4 md:flex">
      <Link
        href="/"
        className="mb-5 flex items-center gap-2 px-2.5 text-sm font-semibold tracking-[-0.01em]"
      >
        <RadarMark />
        JobRadar
      </Link>
      <button
        type="button"
        onClick={openCommandPalette}
        className="text-muted-foreground hover:text-foreground mb-4 flex h-8 items-center gap-2 rounded-md border border-rail-border px-2.5 text-[13px] transition-colors hover:border-input-hover"
      >
        <Search className="size-3.5" aria-hidden />
        {t("nav.goTo")}
        <Kbd className="ml-auto">Ctrl K</Kbd>
      </button>
      <nav aria-label={t("nav.main")} className="flex flex-col gap-0.5">
        <RailLink {...WORK[0]} active={isActive(pathname, "/")}>
          <Count n={counts?.triage} />
        </RailLink>
        <RailLink {...WORK[1]} active={isActive(pathname, "/pipeline")}>
          <Count n={counts?.due} tone="due" />
        </RailLink>
        <p className="label-caps mt-5 mb-1 px-2.5">{t("nav.machine")}</p>
        {MACHINE.map((m) => (
          <RailLink key={m.href} {...m} active={isActive(pathname, m.href)}>
            {m.href === "/sources" && counts?.problems ? (
              <span
                className="bg-destructive ml-auto size-1.5 rounded-full"
                title={t("nav.problems", { count: counts.problems })}
              />
            ) : null}
          </RailLink>
        ))}
      </nav>
      <ModeToggle className="mt-auto" />
      <form action={logout}>
        <button
          type="submit"
          className="text-muted-foreground hover:text-foreground flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] hover:bg-rail-hover"
        >
          <LogOut className="size-4" aria-hidden />
          {t("nav.logout")}
        </button>
      </form>
    </aside>
  );
}

/** Phone / narrow: top bar with the two work areas and the machine pages in a menu. */
export function TopBar({
  counts,
  logout,
}: {
  counts: NavCounts | null;
  logout: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const t = useT();
  return (
    <header className="bg-rail sticky top-0 z-30 flex h-12 items-center gap-1 border-b border-rail-border px-3 md:hidden">
      <Link href="/" aria-label="JobRadar" className="mr-1 px-1">
        <RadarMark />
      </Link>
      {WORK.map((w) => {
        const active = isActive(pathname, w.href);
        return (
          <Link
            key={w.href}
            href={w.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px]",
              active ? "bg-rail-active text-foreground font-medium" : "text-muted-foreground",
            )}
          >
            {t(w.label)}
            {w.href === "/" && counts?.triage ? (
              <span className="text-muted-foreground text-xs tabular-nums">{counts.triage}</span>
            ) : null}
            {w.href === "/pipeline" && counts?.due ? (
              <span className="text-warning text-xs tabular-nums">{counts.due}</span>
            ) : null}
          </Link>
        );
      })}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className="text-muted-foreground relative ml-auto flex size-8 items-center justify-center rounded-md"
          aria-label={t("nav.machineAndAccount")}
        >
          <Menu className="size-4" />
          {counts?.problems ? (
            <span className="bg-destructive absolute top-1.5 right-1.5 size-1.5 rounded-full" />
          ) : null}
        </PopoverTrigger>
        <PopoverContent className="w-52 p-1.5">
          <p className="label-caps px-2 pt-1 pb-1">{t("nav.machine")}</p>
          {MACHINE.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              onClick={() => setOpen(false)}
              className="hover:bg-secondary flex h-9 items-center gap-2.5 rounded-md px-2 text-[13px]"
            >
              <m.icon className="text-muted-foreground size-4" />
              {t(m.label)}
              {m.href === "/sources" && counts?.problems ? (
                <span className="bg-destructive ml-auto size-1.5 rounded-full" />
              ) : null}
            </Link>
          ))}
          <ModeToggle className="h-9 w-full px-2" />
          <form action={logout} className="mt-1 border-t pt-1">
            <button
              type="submit"
              className="text-muted-foreground hover:bg-secondary flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-[13px]"
            >
              <LogOut className="size-4" />
              {t("nav.logout")}
            </button>
          </form>
        </PopoverContent>
      </Popover>
    </header>
  );
}

/** The existing radar icon, inline so it inherits the rail. */
export function RadarMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-[18px]", className)} aria-hidden>
      <circle cx="16" cy="16" r="12" fill="none" stroke="var(--mark)" strokeWidth="2.4" />
      <circle cx="16" cy="16" r="6" fill="none" stroke="var(--mark)" strokeWidth="2.4" />
      <path d="M16 16 L25.5 7.5" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="16" cy="16" r="2.2" fill="var(--primary)" />
    </svg>
  );
}

export const NAV_SHORTCUTS = [...WORK, ...MACHINE];

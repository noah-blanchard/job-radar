"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Inbox" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/companies", label: "Entreprises" },
  { href: "/sources", label: "Sources" },
  { href: "/stats", label: "Stats" },
  { href: "/settings", label: "Réglages" },
] as const;

export function Nav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigation principale" className="-mx-1 flex min-w-0 gap-0.5 overflow-x-auto">
      {LINKS.map(({ href, label }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors",
              active
                ? "bg-secondary text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

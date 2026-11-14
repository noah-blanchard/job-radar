import type * as React from "react";
import { cn } from "@/lib/utils";

/** Keyboard key hint. */
export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "border-input text-muted-foreground inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border px-1 text-[11px] leading-none font-medium",
        className,
      )}
      {...props}
    />
  );
}

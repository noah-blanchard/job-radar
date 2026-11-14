import type * as React from "react";
import { cn } from "@/lib/utils";

export const fieldClass =
  "h-8 rounded-md border border-input bg-field px-2.5 text-[13px] text-foreground outline-none transition-[border-color,background-color] duration-[var(--dur-fast)] placeholder:text-muted-foreground hover:border-input-hover focus-visible:border-primary/70 focus-visible:bg-background focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(fieldClass, "w-full min-w-0", className)}
      {...props}
    />
  );
}

/** Native select in the field style (keyboard and mobile pickers for free). */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select data-slot="select" className={cn(fieldClass, "pr-7", className)} {...props} />;
}

export { Input, Select };

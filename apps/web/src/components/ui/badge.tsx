import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

/** Flat tag: tinted ground, same-hue text. One shape for every status-like label. */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-sm px-1.5 py-px text-[11px] leading-4 font-medium",
  {
    variants: {
      variant: {
        default: "bg-secondary text-foreground",
        secondary: "bg-secondary text-muted-foreground",
        outline: "border border-border text-muted-foreground",
        success: "bg-[color-mix(in_oklab,var(--success)_16%,transparent)] text-success",
        warning: "bg-[color-mix(in_oklab,var(--warning)_16%,transparent)] text-warning",
        destructive: "bg-[color-mix(in_oklab,var(--destructive)_16%,transparent)] text-destructive",
        info: "bg-[color-mix(in_oklab,var(--info)_16%,transparent)] text-info",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };

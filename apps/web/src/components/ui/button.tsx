import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium select-none outline-none transition-[background-color,color,border-color,opacity] duration-[var(--dur-fast)] ease-[var(--ease-out)] disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-[color-mix(in_oklab,var(--primary)_88%,white)] active:bg-[color-mix(in_oklab,var(--primary)_85%,black)]",
        outline:
          "border border-input bg-transparent text-foreground hover:bg-secondary hover:border-[#384754] active:bg-raised",
        secondary: "bg-secondary text-foreground hover:bg-[#223039] active:bg-raised",
        ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground active:bg-raised",
        destructive:
          "border border-[color-mix(in_oklab,var(--destructive)_45%,transparent)] text-destructive hover:bg-[color-mix(in_oklab,var(--destructive)_14%,transparent)]",
        link: "text-info underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3 text-[13px]",
        sm: "h-7 px-2.5 text-xs",
        lg: "h-9 px-4 text-sm",
        icon: "size-8",
        "icon-sm": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };

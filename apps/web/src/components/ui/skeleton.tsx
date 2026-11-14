import { cn } from "@/lib/utils";

/** Static placeholder block sized like the content it stands for (no shimmer). */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("bg-secondary/70 rounded-sm", className)} {...props} />;
}

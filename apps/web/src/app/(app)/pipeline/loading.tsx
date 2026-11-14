import { HeaderSkeleton } from "@/components/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col" aria-busy aria-label="Chargement">
      <HeaderSkeleton title="Pipeline" />
      <div className="grid flex-1 gap-px bg-[var(--border-soft)] md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((c) => (
          <div key={c} className="bg-background flex flex-col gap-2 p-3 md:p-4">
            <Skeleton className="mb-1 h-4 w-28" />
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[104px] w-full rounded-md" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

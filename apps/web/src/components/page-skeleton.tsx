import { Skeleton } from "@/components/ui/skeleton";

/** Route-level loading shapes: same header and row geometry as the pages they stand in for. */
export function HeaderSkeleton({ title }: { title: string }) {
  return (
    <header className="flex items-baseline gap-6 border-b px-4 pt-4 pb-3 md:px-6">
      <h1 className="text-[15px] font-semibold">{title}</h1>
      <Skeleton className="h-3.5 w-64" />
    </header>
  );
}

export function RowsSkeleton({ rows = 10, height = 48 }: { rows?: number; height?: number }) {
  return (
    <div className="px-4 md:px-6" aria-busy aria-label="Chargement">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="border-border-soft flex items-center gap-4 border-b"
          style={{ height }}
        >
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="ml-auto h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({ title }: { title: string }) {
  return (
    <div>
      <HeaderSkeleton title={title} />
      <RowsSkeleton />
    </div>
  );
}

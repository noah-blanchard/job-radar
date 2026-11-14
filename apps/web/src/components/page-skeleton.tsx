import { Skeleton } from "@/components/ui/skeleton";
import type { MessageKey } from "@/i18n/messages";
import { getT } from "@/i18n/server";

/** Route-level loading shapes: same header and row geometry as the pages they stand in for. */
export async function HeaderSkeleton({ title }: { title: MessageKey }) {
  const t = await getT();
  return (
    <header className="flex shrink-0 items-baseline gap-6 border-b px-4 pt-4 pb-3 md:px-6">
      <h1 className="text-[15px] font-semibold">{t(title)}</h1>
      <Skeleton className="h-3.5 w-64" />
    </header>
  );
}

export async function RowsSkeleton({ rows = 10, height = 48 }: { rows?: number; height?: number }) {
  const t = await getT();
  return (
    <div className="px-4 md:px-6" aria-busy aria-label={t("common.loading")}>
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

export function PageSkeleton({ title }: { title: MessageKey }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <HeaderSkeleton title={title} />
      <RowsSkeleton />
    </div>
  );
}

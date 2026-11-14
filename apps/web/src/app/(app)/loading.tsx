import { Skeleton } from "@/components/ui/skeleton";

/** Home (Trier) while the first data arrives: strip, filter bar, ledger rows, pane. */
export default function Loading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy aria-label="Chargement">
      <div className="flex items-center gap-7 border-b px-4 pt-4 pb-3 md:px-6">
        <h1 className="text-[15px] font-semibold">Aujourd&apos;hui</h1>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-5 w-28" />
        ))}
      </div>
      <div className="flex h-[53px] items-center gap-2 border-b px-4 md:px-6">
        <Skeleton className="h-8 w-[380px]" />
        <Skeleton className="h-8 w-60" />
      </div>
      <div className="grid min-h-0 flex-1 lg:grid-rows-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_520px]">
        <div className="lg:border-r">
          <div className="h-9 border-b" />
          {Array.from({ length: 10 }, (_, i) => (
            <div
              key={i}
              className="border-border-soft grid h-[58px] grid-cols-[72px_1fr] items-center gap-4 border-b px-4 md:px-6"
            >
              <div className="flex flex-col gap-[5px]">
                <Skeleton className="h-[15px] w-6" />
                <Skeleton className="h-[5px] w-[72px]" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-3.5 w-3/5" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </div>
        <div className="bg-surface hidden lg:block" />
      </div>
    </div>
  );
}

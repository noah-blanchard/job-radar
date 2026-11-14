import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div
      className="mx-auto w-full max-w-[1120px] px-4 py-5 md:px-8 md:py-7"
      aria-busy
      aria-label="Chargement"
    >
      <Skeleton className="mb-5 h-4 w-32" />
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="mt-2 h-4 w-80" />
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-32" />
      </div>
      <Skeleton className="mt-2 h-7 w-[22rem]" />
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-3.5 w-full" />
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}

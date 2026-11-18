import { Skeleton } from '@/components/ui/skeleton';

/** One `PersonRow`: 44 px box, 36 px avatar, a 20 px name line and a 16 px caption line. */
function PersonSkeleton() {
  return (
    <div className="flex h-11 items-center gap-3">
      <Skeleton className="size-9 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Skeleton className="h-3 w-40 max-w-full" />
        <Skeleton className="h-2.5 w-24 max-w-full" />
      </div>
    </div>
  );
}

/** Loading twin of «Команда» (heading, «Тімлід» row, two «Рекрутери» rows) with the geometry of `TeamPanel`, so the data replaces it without a shift (wireframe §9). */
export function TeamSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col">
      <div className="mb-2 flex h-5 items-center">
        <Skeleton className="h-3.5 w-20" />
      </div>
      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-1 flex h-4 items-center">
            <Skeleton className="h-2.5 w-12" />
          </div>
          <PersonSkeleton />
        </div>
        <div>
          <div className="mb-1 flex h-4 items-center">
            <Skeleton className="h-2.5 w-16" />
          </div>
          <PersonSkeleton />
          <PersonSkeleton />
        </div>
      </div>
    </div>
  );
}

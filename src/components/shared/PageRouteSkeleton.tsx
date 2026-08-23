import { Skeleton } from '@/components/ui/skeleton';

export function PageRouteSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-8" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-2/3 max-w-md" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    </div>
  );
}

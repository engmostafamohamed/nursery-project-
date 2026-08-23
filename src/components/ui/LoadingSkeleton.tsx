import { Skeleton } from '@/components/ui/skeleton';

type LoadingSkeletonProps = {
  variant?: 'default' | 'eventCards' | 'permissionCards' | 'parentEventsCalendar' | 'notificationList';
  /** Accessible name when variant is eventCards (pass i18n string). */
  eventCardsLabel?: string;
  /** Accessible name when variant is permissionCards (pass i18n string). */
  permissionCardsLabel?: string;
  /** Accessible name for parent events calendar skeleton. */
  parentEventsCalendarLabel?: string;
  /** Accessible name for parent notification list skeleton. */
  notificationListLabel?: string;
};

export function LoadingSkeleton({
  variant = 'default',
  eventCardsLabel,
  permissionCardsLabel,
  parentEventsCalendarLabel,
  notificationListLabel,
}: LoadingSkeletonProps) {
  if (variant === 'notificationList') {
    return (
      <div className="space-y-3" aria-busy="true" aria-label={notificationListLabel ?? 'Loading'}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4"
          >
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3 max-w-xs" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'parentEventsCalendar') {
    return (
      <div className="space-y-3" aria-busy="true" aria-label={parentEventsCalendarLabel ?? 'Loading'}>
        <div className="flex justify-between gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={`h-${i}`} className="h-6 w-full rounded" />
          ))}
          {Array.from({ length: 42 }).map((_, i) => (
            <Skeleton key={`c-${i}`} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'permissionCards') {
    return (
      <div className="space-y-4" aria-busy="true" aria-label={permissionCardsLabel ?? 'Loading'}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4"
          >
            <div className="flex gap-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-5 w-full max-w-md" />
                <Skeleton className="h-3 w-52" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 flex-1" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'eventCards') {
    return (
      <div className="space-y-3" aria-busy="true" aria-label={eventCardsLabel ?? 'Loading'}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="space-y-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4"
          >
            <Skeleton className="h-5 w-2/3 max-w-sm" />
            <Skeleton className="h-4 w-48" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-52" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

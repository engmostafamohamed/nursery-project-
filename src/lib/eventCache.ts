import type { QueryClient } from '@tanstack/react-query';

/**
 * Invalidate every event-related React Query cache so the list / calendar popup,
 * the detail (View) page, the Edit form, and the permission stats all stay in
 * sync after ANY event mutation (create / edit / cancel / delete / duplicate).
 *
 * These three surfaces read the same `events` row through separate caches; with
 * the app's 5-minute staleTime, invalidating only one of them lets the others
 * show stale data, so the same event appears different in the popup vs view vs
 * edit. Invalidating by key prefix refreshes them all regardless of nursery/event id.
 */
export async function invalidateAllEventQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    [
      ['admin-events-list'],
      ['admin-event-detail'],
      ['admin-event-detail-attendance'],
      ['admin-event-edit'],
      ['admin-event-permission-stats'],
      ['admin-event-permission-children'],
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

/**
 * The family's side of the same: after an answer, a new urgent event or a cancelled one, every
 * screen of the family that shows events (the list, the event page, the answers, the dashboard's
 * schedule and feed, the invoices a paid yes makes) reads it again.
 */
export async function invalidateFamilyEventQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    [
      ['parent-events-catalog'],
      ['parent-event-details'],
      ['parent-event-permissions'],
      ['parent-permissions-page'],
      ['parent-permissions-counts'],
      ['parent-dashboard-schedule'],
      ['parent-dashboard-feed'],
      ['parent-invoices'],
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

import type {
  AdminEventsListCategoryFilter,
  AdminEventsListDateFilter,
  AdminEventsListStatusFilter,
} from '@/hooks/useAdminEventsList';

/** What the admin's events list is narrowed to: stage, kind, when, a search, and a calendar day. */
export type AdminEventsFilterState = {
  status: AdminEventsListStatusFilter;
  category: AdminEventsListCategoryFilter;
  date: AdminEventsListDateFilter;
  search: string;
  day: string | null;
};

export const NO_EVENT_FILTERS: AdminEventsFilterState = { status: 'all', category: 'all', date: 'all', search: '', day: null };

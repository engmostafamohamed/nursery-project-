import { useQuery } from '@tanstack/react-query';

import { fetchEventRoster, fetchTeacherEvents } from './teacherEventsApi';

/** The events of the signed-in teacher's classes, with their children's counts. */
export function useTeacherEvents(userId: string | undefined) {
  return useQuery({
    queryKey: ['teacher-events', userId],
    queryFn: fetchTeacherEvents,
    enabled: Boolean(userId),
    staleTime: 60_000,
  });
}

/** The children asked to one event (a teacher: of their classes), refreshed while it is open. */
export function useEventRoster(eventId: string | null) {
  return useQuery({
    queryKey: ['event-roster', eventId],
    queryFn: () => fetchEventRoster(eventId as string),
    enabled: Boolean(eventId),
    staleTime: 15_000,
  });
}

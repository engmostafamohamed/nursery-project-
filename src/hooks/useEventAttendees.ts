import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export const eventAttendeesQueryKey = (eventId: string | undefined) =>
  ['event-attendees', eventId] as const;

export type EventAttendee = {
  child_id: string;
  display_name_ar: string;
  display_name_en: string;
  avatar_url: string | null;
  status: string;
};

export function useEventAttendees(eventId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: eventAttendeesQueryKey(eventId),
    queryFn: async (): Promise<EventAttendee[]> => {
      if (!eventId) return [];
      const { data, error } = await supabase
        .from('event_attendees_public')
        .select('child_id, display_name_ar, display_name_en, avatar_url, status')
        .eq('event_id', eventId);
      if (error) throw error;
      return (data ?? []) as EventAttendee[];
    },
    enabled: Boolean(eventId) && enabled,
  });
}

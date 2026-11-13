import { count, list, oneOf, text, textOrNull } from '@/lib/jsonRead';
import { supabase } from '@/lib/supabase';

import { EVENT_CATEGORIES, EVENT_SCOPES, type EventCategory, type EventScope } from './events';

/*
 * The teacher's events through the server: the permission rows are closed to teachers, so the list
 * (teacher_events) and the children of one event (event_roster) come with the counts and answers
 * they may see — their own classes only.
 */

/** A published event concerning the teacher's classes, with how many of their children were asked, said yes and were checked in. */
export type TeacherEvent = {
  id: string;
  title_ar: string;
  title_en: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  category: EventCategory;
  is_urgent: boolean;
  is_paid: boolean;
  target_scope: EventScope;
  asked: number;
  going: number;
  checked_in: number;
};

export const ROSTER_STATUSES = ['granted', 'pending', 'denied'] as const;
export type RosterStatus = (typeof ROSTER_STATUSES)[number];

/** A child asked to an event: the family's answer and when the scanner checked them in. */
export type RosterChild = {
  child_id: string;
  name_ar: string;
  name_en: string;
  avatar_url: string | null;
  class_name_ar: string | null;
  class_name_en: string | null;
  status: RosterStatus;
  responded_at: string | null;
  checked_in_at: string | null;
};

async function rows(name: string, args?: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  return list(data);
}

export async function fetchTeacherEvents(): Promise<TeacherEvent[]> {
  return (await rows('teacher_events')).map((r) => ({
    id: text(r.id),
    title_ar: text(r.title_ar),
    title_en: text(r.title_en),
    starts_at: text(r.starts_at),
    ends_at: textOrNull(r.ends_at),
    location: textOrNull(r.location),
    category: oneOf(r.category, EVENT_CATEGORIES, 'activity'),
    is_urgent: r.is_urgent === true,
    is_paid: r.is_paid === true,
    target_scope: oneOf(r.target_scope, EVENT_SCOPES, 'all'),
    asked: count(r.asked),
    going: count(r.going),
    checked_in: count(r.checked_in),
  }));
}

export async function fetchEventRoster(eventId: string): Promise<RosterChild[]> {
  return (await rows('event_roster', { p_event_id: eventId })).map((r) => ({
    child_id: text(r.child_id),
    name_ar: text(r.name_ar),
    name_en: text(r.name_en),
    avatar_url: textOrNull(r.avatar_url),
    class_name_ar: textOrNull(r.class_name_ar),
    class_name_en: textOrNull(r.class_name_en),
    status: oneOf(r.status, ROSTER_STATUSES, 'pending'),
    responded_at: textOrNull(r.responded_at),
    checked_in_at: textOrNull(r.checked_in_at),
  }));
}

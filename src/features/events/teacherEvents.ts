import { toLocalDateKey } from '@/lib/parentEventsCalendarUtils';

import { ROSTER_STATUSES, type RosterChild, type RosterStatus, type TeacherEvent } from './teacherEventsApi';

/** The teacher's list: every event, today's (the check-in day), the ones still to come, the done ones. */
export const TEACHER_EVENT_TABS = ['all', 'today', 'upcoming', 'past'] as const;
export type TeacherEventTab = (typeof TEACHER_EVENT_TABS)[number];
export type TeacherEventWhen = Exclude<TeacherEventTab, 'all'>;

type Timed = Pick<TeacherEvent, 'starts_at' | 'ends_at'>;

/** Today (it starts today, or is still going on), still to come, or done. */
export function whenOf(event: Timed, now: Date = new Date()): TeacherEventWhen {
  const start = new Date(event.starts_at);
  const end = event.ends_at ? new Date(event.ends_at) : start;
  const ongoing = start.getTime() <= now.getTime() && end.getTime() >= now.getTime();
  if (ongoing || toLocalDateKey(start) === toLocalDateKey(now)) return 'today';
  return start.getTime() > now.getTime() ? 'upcoming' : 'past';
}

const RANK: Record<TeacherEventWhen, number> = { today: 0, upcoming: 1, past: 2 };

/** Today's events first, then the ones to come (the soonest on top), then the done ones (the latest on top). */
export function teacherEventOrder<T extends Timed>(events: T[], now: Date = new Date()): T[] {
  const at = (e: T) => new Date(e.starts_at).getTime();
  return [...events].sort((a, b) => {
    const wa = whenOf(a, now);
    const wb = whenOf(b, now);
    if (wa !== wb) return RANK[wa] - RANK[wb];
    return wa === 'past' ? at(b) - at(a) : at(a) - at(b);
  });
}

export type TeacherEventFilters = { tab: TeacherEventTab; category: string; dayKey: string | null };

/** The events a tab, a kind and a picked day leave, in the list's order. */
export function filterTeacherEvents<T extends Timed & { category: string }>(events: T[], filters: TeacherEventFilters, now: Date = new Date()): T[] {
  return teacherEventOrder(
    events.filter(
      (e) =>
        (filters.tab === 'all' || whenOf(e, now) === filters.tab) &&
        (filters.category === 'all' || e.category === filters.category) &&
        (!filters.dayKey || toLocalDateKey(new Date(e.starts_at)) === filters.dayKey),
    ),
    now,
  );
}

/** The tiles: how many events in each tab, and how many of the teacher's children go today. */
export function teacherEventsOverview(events: (Timed & Pick<TeacherEvent, 'going'>)[], now: Date = new Date()) {
  const counts: Record<TeacherEventTab, number> = { all: events.length, today: 0, upcoming: 0, past: 0 };
  let goingToday = 0;
  for (const e of events) {
    const when = whenOf(e, now);
    counts[when] += 1;
    if (when === 'today') goingToday += e.going;
  }
  return { counts, goingToday };
}

/** An event's children by answer (going, still to answer, said no), and how many were checked in. */
export function rosterSummary(children: RosterChild[]) {
  const groups: { status: RosterStatus; children: RosterChild[] }[] = ROSTER_STATUSES.map((status) => ({
    status,
    children: children.filter((c) => c.status === status),
  })).filter((g) => g.children.length > 0);
  return {
    groups,
    asked: children.length,
    going: children.filter((c) => c.status === 'granted').length,
    checkedIn: children.filter((c) => c.checked_in_at).length,
  };
}

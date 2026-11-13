/*
 * Events as plain data and rules (no React, no network): the categories and who an event is for,
 * with their icons and colours, the steps an admin may take an event to, its time as one line, and
 * the counts the events page shows. The database checks the categories and scopes too.
 */
import { categoryTone } from '@/lib/parentEventsCalendarUtils';
import type { PillTone } from '@/lib/tones';

export const EVENT_CATEGORIES = ['trip', 'activity', 'service', 'doctor_visit'] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const CATEGORY_ICON: Record<EventCategory, string> = {
  trip: 'directions_bus',
  activity: 'palette',
  service: 'room_service',
  doctor_visit: 'stethoscope',
};

export const categoryToneOf = (category: string): PillTone => categoryTone(category);

export const EVENT_SCOPES = ['all', 'class', 'individual'] as const;
export type EventScope = (typeof EVENT_SCOPES)[number];

export const SCOPE_ICON: Record<EventScope, string> = { all: 'groups', class: 'school', individual: 'person_check' };

/** Where an event stands, as the admin sees it. */
export const EVENT_STAGES = ['draft', 'active', 'completed', 'cancelled'] as const;
export type EventStage = (typeof EVENT_STAGES)[number];

/** Each stage's colour and icon on pills and tiles. */
export const STAGE_TONE: Record<EventStage, PillTone> = { draft: 'neutral', active: 'primary', completed: 'success', cancelled: 'error' };
export const STAGE_ICON: Record<EventStage, string> = { draft: 'draft', active: 'event_available', completed: 'task_alt', cancelled: 'event_busy' };

/**
 * The steps an admin may pick on the edit form: a draft can be published, an open event marked
 * done. Cancelling has its own step (with a reason for the families); a cancelled or completed
 * event stays as it is.
 */
export function editStageOptions(current: EventStage): EventStage[] {
  if (current === 'draft') return ['draft', 'active'];
  if (current === 'active') return ['active', 'completed'];
  return [current];
}

/** "Fri 20 Nov · 9:00 AM – 1:00 PM" (the end on its own day when it is another day). */
export function eventTimeRange(startsAt: string, endsAt: string | null, locale: string): string {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return '';
  const day = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hour12: true });
  const end = endsAt ? new Date(endsAt) : null;
  if (!end || Number.isNaN(end.getTime()) || end <= start) return `${day.format(start)} · ${time.format(start)}`;
  const sameDay = start.toDateString() === end.toDateString();
  return sameDay
    ? `${day.format(start)} · ${time.format(start)} – ${time.format(end)}`
    : `${day.format(start)} ${time.format(start)} – ${day.format(end)} ${time.format(end)}`;
}

type CountableEvent = { starts_at: string; category: string; is_urgent: boolean };

/** How many events of each value a key gives (for filter chips). */
export function countBy<T, K extends string>(rows: T[], key: (row: T) => K): Partial<Record<K, number>> {
  const counts: Partial<Record<K, number>> = {};
  for (const row of rows) counts[key(row)] = (counts[key(row)] ?? 0) + 1;
  return counts;
}

/**
 * The events page's tiles: open events still to come, drafts, replies still awaited on events to
 * come, and events this month.
 */
export function eventsOverview<T extends CountableEvent>(
  rows: T[],
  stageOf: (row: T) => EventStage,
  pendingOf: (row: T) => number,
  now: Date = new Date(),
): { upcoming: number; drafts: number; awaitingReplies: number; thisMonth: number } {
  const future = (row: T) => new Date(row.starts_at).getTime() > now.getTime();
  const inMonth = (row: T) => {
    const d = new Date(row.starts_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };
  return {
    upcoming: rows.filter((r) => stageOf(r) === 'active' && future(r)).length,
    drafts: rows.filter((r) => stageOf(r) === 'draft').length,
    awaitingReplies: rows.filter((r) => stageOf(r) === 'active' && future(r)).reduce((sum, r) => sum + pendingOf(r), 0),
    thisMonth: rows.filter((r) => stageOf(r) !== 'cancelled' && inMonth(r)).length,
  };
}

/** Events still to come first (the soonest on top), then the past ones (the latest on top). */
export function upcomingFirst<T extends { starts_at: string }>(rows: T[], now: Date = new Date()): T[] {
  const at = (row: T) => new Date(row.starts_at).getTime();
  const cut = now.getTime();
  return [...rows].sort((a, b) => {
    const aFuture = at(a) > cut;
    const bFuture = at(b) > cut;
    if (aFuture !== bFuture) return aFuture ? -1 : 1;
    return aFuture ? at(a) - at(b) : at(b) - at(a);
  });
}

/** The families' replies as shares of the children asked, 0–100 each. */
export function replyShares(stat: { total: number; granted: number; denied: number; pending: number } | undefined) {
  if (!stat || stat.total <= 0) return null;
  const pct = (n: number) => Math.round((n / stat.total) * 100);
  return { granted: pct(stat.granted), denied: pct(stat.denied), pending: Math.max(0, 100 - pct(stat.granted) - pct(stat.denied)) };
}

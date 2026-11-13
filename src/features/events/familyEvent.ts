import { toIso, toLocalInput } from './eventFormSchema';
import type { EventCategory } from './events';

/*
 * A family's urgent event: something the nursery must know about for a child (a doctor's visit,
 * an early pickup, a session every week). Plain rules: the form's starting values, what is missing,
 * and what goes to the server (create_parent_urgent_event).
 */

export type FamilyEventDraft = {
  title: string;
  description: string;
  /** A datetime-local value. */
  startsAt: string;
  location: string;
  category: EventCategory;
  childIds: string[];
  repeatsWeekly: boolean;
  /** 0 = Sunday … 6 = Saturday. */
  days: number[];
  /** 0 … 23. */
  hours: number[];
};

export type FamilyEventProblem = 'titleRequired' | 'startInvalid' | 'startInPast' | 'childRequired' | 'daysRequired' | 'hoursRequired';
export type FamilyEventField = 'title' | 'startsAt' | 'children' | 'days' | 'hours';

/** The next full hour from now (at least 30 minutes away). */
export function nextFullHour(now: Date = new Date()): Date {
  const d = new Date(now.getTime() + 30 * 60000);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

/** The week schedule a start suggests: its weekday at its hour. */
export function scheduleOf(startsAt: string): { days: number[]; hours: number[] } {
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return { days: [], hours: [] };
  return { days: [d.getDay()], hours: [d.getHours()] };
}

/** A new draft: the next full hour, a doctor's visit, and the only child already picked. */
export function newFamilyEvent(childIds: string[], now: Date = new Date()): FamilyEventDraft {
  const startsAt = toLocalInput(nextFullHour(now));
  return {
    title: '',
    description: '',
    startsAt,
    location: '',
    category: 'doctor_visit',
    childIds: childIds.length === 1 ? [...childIds] : [],
    repeatsWeekly: false,
    ...scheduleOf(startsAt),
  };
}

/** What is wrong with a draft, by field (empty when it can be sent). */
export function familyEventProblems(draft: FamilyEventDraft, now: Date = new Date()): Partial<Record<FamilyEventField, FamilyEventProblem>> {
  const problems: Partial<Record<FamilyEventField, FamilyEventProblem>> = {};
  if (!draft.title.trim()) problems.title = 'titleRequired';
  const start = new Date(draft.startsAt);
  if (!draft.startsAt || Number.isNaN(start.getTime())) problems.startsAt = 'startInvalid';
  else if (start.getTime() <= now.getTime()) problems.startsAt = 'startInPast';
  if (draft.childIds.length === 0) problems.children = 'childRequired';
  if (draft.repeatsWeekly && draft.days.length === 0) problems.days = 'daysRequired';
  if (draft.repeatsWeekly && draft.hours.length === 0) problems.hours = 'hoursRequired';
  return problems;
}

/** The server's arguments: the title in the language it was written in; a week schedule only when it repeats. */
export function familyEventArgs(draft: FamilyEventDraft, isAr: boolean) {
  const title = draft.title.trim();
  const description = draft.description.trim() || null;
  const sorted = (values: number[]) => [...new Set(values)].sort((a, b) => a - b);
  return {
    p_title_ar: isAr ? title : null,
    p_title_en: isAr ? null : title,
    p_description_ar: isAr ? description : null,
    p_description_en: isAr ? null : description,
    p_starts_at: toIso(draft.startsAt),
    p_location: draft.location.trim() || null,
    p_category: draft.category,
    p_child_ids: [...new Set(draft.childIds)],
    p_permission_deadline: null,
    p_urgent_days_of_week: draft.repeatsWeekly ? sorted(draft.days) : [],
    p_urgent_hours_of_day: draft.repeatsWeekly ? sorted(draft.hours) : [],
    p_urgent_repeats_weekly: draft.repeatsWeekly,
  };
}

/** Adds or removes one value of a list (a day, an hour, a child). */
export function toggled<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

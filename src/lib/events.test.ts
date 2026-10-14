// Module 10 · Events & parent permissions — schedules, the parent calendar and permission slips.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ParentCatalogPermissionRow } from '@/hooks/useParentEventsCatalog';
import i18n from '@/lib/i18n';
import {
  eventEditFormSchema,
  eventFormSchema,
  eventRowToEditFormValues,
  mapDbStatusToEditForm,
  toIso,
  toLocalInput,
  type EventRowForEdit,
} from '@/pages/admin/eventFormSchema';
import { fakeDb } from '@/test/fakeSupabase';

import {
  createPermissionsForEventScope,
  ensureEventPermissionsForChildren,
  syncIndividualEventPermissions,
} from './eventPermissionOps';
import { formatUrgentHour, sortUniqueNumbers, summarizeUrgentSchedule } from './eventUrgentSchedule';
import { summarizePermissionsForEvent } from './parentEventPermissionSummary';
import {
  buildMonthGrid,
  categoryDotClass,
  eventsInMonth,
  localDateKeyFromIso,
  toLocalDateKey,
  weekdayShortHeaders,
} from './parentEventsCalendarUtils';

vi.mock('@/lib/supabase', () => import('@/test/fakeSupabase'));

const t = i18n.getFixedT('en');

describe('urgent event schedule', () => {
  it('summarises the days and hours in order, without repeats', () => {
    const summary = summarizeUrgentSchedule(
      { urgent_days_of_week: [3, 1, 1], urgent_hours_of_day: [14, 9], urgent_repeats_weekly: true },
      t,
    );
    expect(summary).toBe('Weekly · Mon, Wed · 09:00, 14:00');
  });

  it('says "one time" for a schedule that does not repeat', () => {
    expect(summarizeUrgentSchedule({ urgent_days_of_week: [0], urgent_hours_of_day: [8] }, t)).toBe('One time · Sun · 08:00');
  });

  it('has no summary without both days and hours', () => {
    expect(summarizeUrgentSchedule({ urgent_days_of_week: [1], urgent_hours_of_day: [] }, t)).toBeNull();
    expect(summarizeUrgentSchedule({}, t)).toBeNull();
  });

  it('helpers sort numbers and pad hours', () => {
    expect(sortUniqueNumbers([5, 1, 5, 3])).toEqual([1, 3, 5]);
    expect(sortUniqueNumbers(null)).toEqual([]);
    expect(formatUrgentHour(7)).toBe('07:00');
  });
});

describe('a parent’s permission summary for an event', () => {
  const slip = (status: string, childNameEn: string): ParentCatalogPermissionRow => ({
    event_id: 'e1',
    child_id: childNameEn,
    status,
    child_name_ar: '',
    child_name_en: childNameEn,
  });

  it('is "none" when no child was invited', () => {
    expect(summarizePermissionsForEvent([slip('pending', 'Adam')], 'e2', false)).toEqual({ kind: 'none' });
  });

  it('puts a pending answer first', () => {
    const all = [slip('granted', 'Adam'), slip('pending', 'Lina')];
    expect(summarizePermissionsForEvent(all, 'e1', false)).toEqual({ kind: 'pending', names: ['Lina'] });
  });

  it('is "approved" once every answer is in and one is yes', () => {
    const all = [slip('granted', 'Adam'), slip('denied', 'Lina')];
    expect(summarizePermissionsForEvent(all, 'e1', false)).toEqual({ kind: 'approved', names: ['Adam'] });
  });

  it('is "declined" when every answer is no', () => {
    expect(summarizePermissionsForEvent([slip('denied', 'Adam')], 'e1', false)).toEqual({ kind: 'declined' });
  });

  it('uses the English name when the Arabic one is missing', () => {
    expect(summarizePermissionsForEvent([slip('pending', 'Adam')], 'e1', true)).toEqual({ kind: 'pending', names: ['Adam'] });
  });
});

describe('the parent events calendar', () => {
  it('lays out October 2026 starting on Thursday, in six weeks', () => {
    const grid = buildMonthGrid(2026, 9);
    expect(grid).toHaveLength(42);
    expect(grid.slice(0, 4)).toEqual([null, null, null, null]);
    expect(grid[4]).toEqual({ day: 1 });
    expect(grid.filter(Boolean)).toHaveLength(31);
  });

  it('handles a leap February', () => {
    expect(buildMonthGrid(2028, 1).filter(Boolean)).toHaveLength(29);
  });

  it('keeps the events of one month', () => {
    const events = [{ starts_at: '2026-10-01T08:00:00' }, { starts_at: '2026-11-01T08:00:00' }, { starts_at: '2025-10-05T08:00:00' }];
    expect(eventsInMonth(events, 2026, 9)).toEqual([events[0]]);
  });

  it('puts a late-evening event on the local day', () => {
    expect(localDateKeyFromIso('2026-10-13T22:30:00Z')).toBe('2026-10-14');
    expect(toLocalDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('starts the week on Sunday', () => {
    expect(weekdayShortHeaders('en-GB')).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  });

  it('colours each category, with a neutral colour for the rest', () => {
    expect(categoryDotClass('trip')).toBe('bg-primary');
    expect(categoryDotClass('doctor_visit')).toBe('bg-success');
    expect(categoryDotClass('party')).toBe('bg-on-surface-variant');
  });
});

describe('creating permission slips', () => {
  beforeEach(() => {
    fakeDb.reset();
  });

  it('adds slips only for children who do not have one yet', async () => {
    fakeDb.setRows('permissions', [{ id: 'p1', child_id: 'c1', status: 'pending' }]);
    await ensureEventPermissionsForChildren('e1', ['c1', 'c2', 'c2', ''], '2026-10-20');
    expect(fakeDb.inserted('permissions')).toEqual([
      { child_id: 'c2', event_id: 'e1', permission_type: 'event', status: 'pending', deadline: '2026-10-20' },
    ]);
  });

  it('writes nothing when every child already has a slip', async () => {
    fakeDb.setRows('permissions', [{ id: 'p1', child_id: 'c1', status: 'granted' }]);
    await ensureEventPermissionsForChildren('e1', ['c1']);
    expect(fakeDb.inserted('permissions')).toEqual([]);
  });

  it('invites every active child of a class', async () => {
    fakeDb.setRows('children', [{ id: 'c1' }, { id: 'c2' }]);
    await createPermissionsForEventScope('e1', 'class', { classId: 'k1' });
    const childQuery = fakeDb.queries.find((q) => q.table === 'children');
    expect(childQuery?.filters).toEqual([
      ['eq', 'class_id', 'k1'],
      ['eq', 'status', 'active'],
    ]);
    expect(fakeDb.inserted('permissions').map((row) => (row as { child_id: string }).child_id)).toEqual(['c1', 'c2']);
  });

  it('does nothing for a whole-nursery event with no nursery', async () => {
    await createPermissionsForEventScope('e1', 'all', { nurseryId: null });
    expect(fakeDb.queries).toEqual([]);
  });

  it('removes unanswered slips of uninvited children and keeps answered ones', async () => {
    fakeDb.setRows('permissions', [
      { id: 'p1', child_id: 'c1', status: 'pending' },
      { id: 'p2', child_id: 'c2', status: 'granted' },
      { id: 'p3', child_id: 'c4', status: 'denied' },
    ]);
    await syncIndividualEventPermissions('e1', ['c2', 'c3']);

    const removal = fakeDb.queries.find((q) => q.action === 'delete');
    expect(removal?.filters).toEqual([['in', 'id', ['p1']]]);
    expect(fakeDb.inserted('permissions').map((row) => (row as { child_id: string }).child_id)).toEqual(['c3']);
  });
});

describe('the event form', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T09:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const event = (overrides: Record<string, unknown> = {}) => ({
    titleEn: 'Zoo trip',
    startsAt: '2026-10-20T09:00',
    category: 'trip',
    targetScope: 'all',
    ...overrides,
  });
  /** The message of the first issue on each field. */
  const errors = (values: Record<string, unknown>, schema: typeof eventFormSchema | typeof eventEditFormSchema = eventFormSchema) => {
    const byPath: Record<string, string> = {};
    for (const issue of schema.safeParse(values).error?.issues ?? []) byPath[issue.path.join('.')] ??= issue.message;
    return byPath;
  };

  it('accepts a complete event with a title in either language', () => {
    expect(errors(event())).toEqual({});
    expect(errors(event({ titleEn: '', titleAr: 'رحلة' }))).toEqual({});
  });

  it('needs a title', () => {
    expect(errors(event({ titleEn: '   ' }))).toEqual({ titleAr: 'titleRequired' });
  });

  it('needs a valid start in the future when creating, but not when editing', () => {
    expect(errors(event({ startsAt: 'soon' }))).toEqual({ startsAt: 'startInvalid' });
    expect(errors(event({ startsAt: '2026-10-01T09:00' }))).toEqual({ startsAt: 'startInFuture' });
    expect(errors(event({ startsAt: '2026-10-01T09:00', eventStatus: 'completed' }), eventEditFormSchema)).toEqual({});
  });

  it('needs a positive price for a paid event', () => {
    expect(errors(event({ isPaid: true }))).toEqual({ price: 'amountPositive' });
    expect(errors(event({ isPaid: true, price: '0' }))).toEqual({ price: 'amountPositive' });
    expect(errors(event({ isPaid: true, price: '150' }))).toEqual({});
  });

  it('needs both days and hours once an urgent schedule is started', () => {
    expect(errors(event({ isUrgent: true }))).toEqual({});
    expect(errors(event({ isUrgent: true, urgentDaysOfWeek: [1] }))).toEqual({ urgentHoursOfDay: 'urgentHoursRequired' });
    expect(errors(event({ isUrgent: true, urgentRepeatsWeekly: true }))).toEqual({
      urgentDaysOfWeek: 'urgentDaysRequired',
      urgentHoursOfDay: 'urgentHoursRequired',
    });
  });

  it('needs a class for a class event, and real child ids for invitations', () => {
    expect(errors(event({ targetScope: 'class' }))).toEqual({ targetClassId: 'classRequired' });
    expect(Object.keys(errors(event({ targetScope: 'individual', targetChildIds: ['not-a-uuid'] })))).toEqual(['targetChildIds.0']);
  });

  it('needs the permission deadline before the event starts', () => {
    expect(errors(event({ permissionDeadline: '2026-10-19T09:00' }))).toEqual({});
    expect(errors(event({ permissionDeadline: '2026-10-20T09:00' }))).toEqual({ permissionDeadline: 'deadlineBeforeStart' });
    expect(errors(event({ permissionDeadline: 'friday' }))).toEqual({ permissionDeadline: 'deadlineInvalid' });
  });
});

describe('editing a saved event', () => {
  const row: EventRowForEdit = {
    title_ar: 'رحلة',
    title_en: 'Zoo trip',
    description_ar: null,
    description_en: null,
    starts_at: '2026-10-20T06:00:00Z',
    location: null,
    category: 'trip',
    is_paid: true,
    price: '150.00',
    target_scope: 'class',
    target_class_id: 'k1',
    status: 'published',
    permission_deadline: null,
    cancelled_at: null,
  };

  it.each([
    [{ status: 'draft', cancelled_at: null }, 'draft'],
    [{ status: 'published', cancelled_at: null }, 'active'],
    [{ status: 'completed', cancelled_at: null }, 'completed'],
    [{ status: 'active', cancelled_at: '2026-10-10T00:00:00Z' }, 'cancelled'],
    [{ status: null, cancelled_at: null }, 'draft'],
  ])('%o shows as %s', (saved, status) => {
    expect(mapDbStatusToEditForm(saved)).toBe(status);
  });

  it('fills the form in local time with a numeric price', () => {
    expect(eventRowToEditFormValues(row)).toMatchObject({
      titleEn: 'Zoo trip',
      startsAt: '2026-10-20T09:00', // 06:00 UTC is 09:00 in Cairo
      price: 150,
      targetClassId: 'k1',
      permissionDeadline: '',
      eventStatus: 'active',
    });
  });

  it('turns the local form time back into the same moment', () => {
    expect(toIso(toLocalInput(new Date('2026-10-20T06:00:00Z')))).toBe('2026-10-20T06:00:00.000Z');
  });
});

import { describe, expect, it } from 'vitest';

import { eventRowPayload } from './eventFormSchema';
import { countBy, editStageOptions, eventsOverview, eventTimeRange, replyShares, upcomingFirst, type EventStage } from './events';

describe('the steps an admin may take an event to', () => {
  it('publish a draft, complete an open event, nothing else (cancelling has its own step)', () => {
    expect(editStageOptions('draft')).toEqual(['draft', 'active']);
    expect(editStageOptions('active')).toEqual(['active', 'completed']);
    expect(editStageOptions('cancelled')).toEqual(['cancelled']);
    expect(editStageOptions('completed')).toEqual(['completed']);
  });
});

describe("an event's time", () => {
  const clock = (iso: string) => new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));

  it('is the day and start, with the end time when it ends the same day', () => {
    expect(eventTimeRange('2026-11-20T09:00:00', null, 'en-GB')).toBe(`Fri 20 Nov · ${clock('2026-11-20T09:00:00')}`);
    expect(eventTimeRange('2026-11-20T09:00:00', '2026-11-20T13:00:00', 'en-GB')).toBe(`Fri 20 Nov · ${clock('2026-11-20T09:00:00')} – ${clock('2026-11-20T13:00:00')}`);
  });

  it('names the end day when it ends another day, and ignores an end before the start', () => {
    expect(eventTimeRange('2026-11-20T09:00:00', '2026-11-21T13:00:00', 'en-GB')).toContain('Sat 21 Nov');
    expect(eventTimeRange('2026-11-20T09:00:00', '2026-11-20T08:00:00', 'en-GB')).not.toContain(' – ');
    expect(eventTimeRange('not a date', null, 'en-GB')).toBe('');
  });
});

describe('the events page counts', () => {
  const now = new Date('2026-11-13T12:00:00');
  const rows = [
    { id: 'a', starts_at: '2026-11-20T09:00:00', category: 'trip', is_urgent: false, stage: 'active' as EventStage, pending: 4 },
    { id: 'b', starts_at: '2026-11-25T09:00:00', category: 'trip', is_urgent: true, stage: 'draft' as EventStage, pending: 0 },
    { id: 'c', starts_at: '2026-11-02T09:00:00', category: 'activity', is_urgent: false, stage: 'active' as EventStage, pending: 7 },
    { id: 'd', starts_at: '2026-12-05T09:00:00', category: 'service', is_urgent: false, stage: 'active' as EventStage, pending: 2 },
    { id: 'e', starts_at: '2026-11-21T09:00:00', category: 'doctor_visit', is_urgent: false, stage: 'cancelled' as EventStage, pending: 9 },
  ];

  it('are the events to come, the drafts, the replies awaited on events to come, and this month', () => {
    expect(eventsOverview(rows, (r) => r.stage, (r) => r.pending, now)).toEqual({ upcoming: 2, drafts: 1, awaitingReplies: 6, thisMonth: 3 });
  });

  it('count by any value, for the filter chips', () => {
    expect(countBy(rows, (r) => r.category)).toEqual({ trip: 2, activity: 1, service: 1, doctor_visit: 1 });
  });

  it('show the replies as shares of the children asked', () => {
    expect(replyShares({ total: 20, granted: 10, denied: 5, pending: 5 })).toEqual({ granted: 50, denied: 25, pending: 25 });
    expect(replyShares({ total: 0, granted: 0, denied: 0, pending: 0 })).toBeNull();
    expect(replyShares(undefined)).toBeNull();
  });
});

describe('the list order', () => {
  it('puts the events to come first (soonest on top), then the past ones (latest on top)', () => {
    const now = new Date('2026-11-13T12:00:00Z');
    const at = (id: string, iso: string) => ({ id, starts_at: iso });
    const rows = [at('past-old', '2026-10-01T09:00:00Z'), at('later', '2026-12-01T09:00:00Z'), at('past-new', '2026-11-10T09:00:00Z'), at('soon', '2026-11-14T09:00:00Z')];
    expect(upcomingFirst(rows, now).map((r) => r.id)).toEqual(['soon', 'later', 'past-new', 'past-old']);
  });
});

describe('the form as an events row', () => {
  const base = {
    titleAr: '',
    titleEn: 'Zoo trip',
    descriptionAr: ' ',
    descriptionEn: 'Bring a hat',
    startsAt: '2026-11-20T09:00',
    endsAt: '',
    location: ' ',
    category: 'trip' as const,
    targetScope: 'class' as const,
    targetClassId: ' c1 ',
    targetChildIds: [],
    isUrgent: false,
    urgentDaysOfWeek: [1, 3],
    urgentHoursOfDay: [9],
    urgentRepeatsWeekly: true,
    isPaid: false,
    price: 150,
    permissionDeadline: '2026-11-18T18:00',
  };

  it('fills the missing title from the other language, turns blanks into nothing, and keeps the class', () => {
    const row = eventRowPayload(base);
    expect(row.title_ar).toBe('Zoo trip');
    expect(row.title_en).toBe('Zoo trip');
    expect(row.description_ar).toBeNull();
    expect(row.description_en).toBe('Bring a hat');
    expect(row.location).toBeNull();
    expect(row.ends_at).toBeNull();
    expect(row.target_class_id).toBe('c1');
    expect(row.starts_at).toBe(new Date('2026-11-20T09:00').toISOString());
    expect(row.permission_deadline).toBe(new Date('2026-11-18T18:00').toISOString());
  });

  it('keeps the urgent schedule only when urgent, and the price only when paid', () => {
    const free = eventRowPayload(base);
    expect(free.price).toBeNull();
    expect(free.urgent_days_of_week).toEqual([]);
    expect(free.urgent_repeats_weekly).toBe(false);
    const paid = eventRowPayload({ ...base, isPaid: true, isUrgent: true, targetScope: 'all' });
    expect(paid.price).toBe('150');
    expect(paid.urgent_days_of_week).toEqual([1, 3]);
    expect(paid.urgent_hours_of_day).toEqual([9]);
    expect(paid.target_class_id).toBeNull();
  });
});

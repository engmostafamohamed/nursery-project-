import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { missingArabicPlurals, missingTexts, textKeysIn } from '@/test/localeKeys';

import { arrivalBlock, toMyStaffDay, toStaffShift } from './staffClock';
import { reviewCounts, settleIssue, toReviewDays } from './staffReview';

const src = path.resolve(__dirname, '../..');

const shift = (over: Record<string, unknown> = {}) => ({
  starts_at: '10:00:00',
  ends_at: '19:00:00',
  mine: true,
  window_opens_at: '2026-11-21T07:00:00+00:00',
  window_closes_at: '2026-11-21T19:00:00+00:00',
  arrival: 'open',
  leaving_early: false,
  ...over,
});

const queue = [
  {
    id: 'd1',
    work_date: '2026-11-20',
    reason: 'left_early',
    check_in_at: '2026-11-20T08:00:00+00:00',
    check_out_at: '2026-11-20T11:00:00+00:00',
    late_minutes: 12,
    who: { id: 'u1', ar: 'هدى', en: 'Hoda' },
  },
  { id: 'd2', work_date: '2026-11-19', reason: 'no_departure', check_in_at: null, check_out_at: null, late_minutes: -4, who: { id: 'u2', ar: 'نور', en: 'Nour' } },
  { id: '', work_date: '2026-11-18', reason: 'left_early', who: {} },
];

describe('the shift a member of staff works today', () => {
  it('keeps the hours, whose shift it is and the window', () => {
    const s = toStaffShift(shift());
    expect(s?.startsAt).toBe('10:00');
    expect(s?.endsAt).toBe('19:00');
    expect(s?.mine).toBe(true);
    expect(s?.windowOpensAt).toBe('2026-11-21T07:00:00+00:00');
  });

  it('is nothing at all on a day somebody does not work', () => {
    expect(toStaffShift({})).toBeNull();
    expect(toStaffShift(null)).toBeNull();
  });

  it('reads an unknown arrival as open rather than locking the button', () => {
    expect(toStaffShift(shift({ arrival: 'whenever' }))?.arrival).toBe('open');
  });

  it('comes with the day it belongs to', () => {
    const me = toMyStaffDay({ today: '2026-11-21', timezone: 'Africa/Cairo', shift: shift(), day: null });
    expect(me.shift?.startsAt).toBe('10:00');
    expect(me.day).toBeNull();
  });
});

describe('whether the clock-in button may be pressed', () => {
  it('may, inside the window', () => {
    expect(arrivalBlock(toStaffShift(shift()))).toBeNull();
  });

  it('may not before the window opens, nor after the shift ends', () => {
    expect(arrivalBlock(toStaffShift(shift({ arrival: 'early' })))).toBe('early');
    expect(arrivalBlock(toStaffShift(shift({ arrival: 'over' })))).toBe('over');
  });

  it('may not on a day she is not on a shift', () => {
    expect(arrivalBlock(null)).toBe('no_shift');
  });
});

describe('a day that waits for the manager', () => {
  it('says whose it is, when and why', () => {
    const days = toReviewDays(queue);
    expect(days).toHaveLength(2);
    expect(days[0]?.nameEn).toBe('Hoda');
    expect(days[0]?.reason).toBe('left_early');
    expect(days[0]?.lateMinutes).toBe(12);
  });

  it('drops a row with no day behind it', () => {
    expect(toReviewDays(queue).map((d) => d.id)).toEqual(['d1', 'd2']);
  });

  it('never reads a negative lateness, and keeps a day nobody closed', () => {
    const second = toReviewDays(queue)[1];
    expect(second?.lateMinutes).toBe(0);
    expect(second?.checkOutAt).toBeNull();
  });

  it('reads an empty queue without inventing anything', () => {
    expect(toReviewDays(null)).toEqual([]);
  });

  it('counts them by reason', () => {
    expect(reviewCounts(toReviewDays(queue))).toEqual({ all: 2, left_early: 1, late_departure: 0, no_departure: 1 });
  });
});

describe('settling a day', () => {
  it('needs both times', () => {
    expect(settleIssue('', '17:00')).toBe('in_required');
    expect(settleIssue('08:00', '')).toBe('out_required');
  });

  it('needs leaving to come after arriving', () => {
    expect(settleIssue('08:00', '08:00')).toBe('out_before_in');
    expect(settleIssue('17:00', '08:00')).toBe('out_before_in');
  });

  it('is happy with a day that makes sense', () => {
    expect(settleIssue('08:00', '17:00')).toBeNull();
  });
});

describe('the clocking and review texts', () => {
  const files = [
    path.join(src, 'features/staff-clock/StaffClockCard.tsx'),
    path.join(src, 'features/staff-clock/StaffReviewPanel.tsx'),
    path.join(src, 'features/staff-clock/SettleStaffDayDialog.tsx'),
  ];

  it('exist in English and Arabic', () => {
    expect(missingTexts(textKeysIn(files))).toEqual([]);
  });

  it('count days in Arabic the way Arabic counts', () => {
    expect(missingArabicPlurals(['staffClock.review.count'])).toEqual([]);
  });
});

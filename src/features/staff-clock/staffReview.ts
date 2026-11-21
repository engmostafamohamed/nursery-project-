/*
 * The days waiting for the manager's word, as plain data and rules (no React, no network).
 *
 * A day stops being ordinary in three ways: somebody left well before their shift ended, somebody
 * stayed long after it, or nobody ever recorded a departure and the day was closed at the shift's
 * end. Each is counted, and each needs a person to say what really happened before it is settled.
 */
import { count, list, text, textOrNull } from '@/lib/jsonRead';

import { reviewReason, type ReviewReason } from './staffClock';

export type ReviewDay = {
  id: string;
  workDate: string;
  reason: ReviewReason | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  lateMinutes: number;
  userId: string;
  nameAr: string;
  nameEn: string;
};

/** get_staff_days_to_review's answer, checked. */
export function toReviewDays(raw: unknown): ReviewDay[] {
  return list(raw)
    .filter((d) => text(d.id))
    .map((d) => {
      const who = typeof d.who === 'object' && d.who ? (d.who as Record<string, unknown>) : {};
      return {
        id: text(d.id),
        workDate: text(d.work_date).slice(0, 10),
        reason: reviewReason(d.reason),
        checkInAt: textOrNull(d.check_in_at),
        checkOutAt: textOrNull(d.check_out_at),
        lateMinutes: count(d.late_minutes),
        userId: text(who.id),
        nameAr: text(who.ar),
        nameEn: text(who.en),
      };
    });
}

export const REVIEW_ICON: Record<ReviewReason, string> = {
  left_early: 'logout',
  late_departure: 'more_time',
  no_departure: 'help_clock',
};

/** How many days wait for each reason, for the tiles above the table. */
export function reviewCounts(days: ReviewDay[]): Record<ReviewReason | 'all', number> {
  const counts = { all: days.length, left_early: 0, late_departure: 0, no_departure: 0 };
  for (const d of days) if (d.reason) counts[d.reason] += 1;
  return counts;
}

export type SettleIssue = 'in_required' | 'out_required' | 'out_before_in';

/** What is wrong with the times the manager settled a day on (HH:MM in the nursery's clock), or null. */
export function settleIssue(checkIn: string, checkOut: string): SettleIssue | null {
  if (!checkIn) return 'in_required';
  if (!checkOut) return 'out_required';
  if (checkOut <= checkIn) return 'out_before_in';
  return null;
}

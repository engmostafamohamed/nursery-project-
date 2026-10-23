// The shared display helpers used by the payment history, invoice cards and the chat.
import { describe, expect, it } from 'vitest';

import { avatarTone, chatListTime } from './chatDisplay';
import { invoiceTypeIcon, paidShare, paymentStateUi, type PaymentState } from './invoiceDisplay';

describe('invoice display', () => {
  it.each([
    ['monthly', 'calendar_month'],
    ['event', 'celebration'],
    ['extra_hours', 'more_time'],
    ['other', 'receipt_long'],
    ['something_new', 'receipt_long'],
  ])('a %s invoice shows the %s icon', (type, icon) => {
    expect(invoiceTypeIcon(type)).toBe(icon);
  });

  it.each<[PaymentState, string, string]>([
    ['paid', 'success', 'invoice.status.paid'],
    ['partial', 'warning', 'financial.paymentHistory.partial'],
    ['unpaid', 'neutral', 'invoice.status.pending'],
    ['in_review', 'primary', 'invoice.inReview'],
    ['overdue', 'error', 'invoice.status.overdue'],
    ['cancelled', 'neutral', 'invoice.status.cancelled'],
  ])('a %s payment is %s with the %s label', (state, tone, labelKey) => {
    expect(paymentStateUi(state)).toMatchObject({ tone, labelKey });
    expect(paymentStateUi(state).icon).toBeTruthy();
  });

  it.each([
    [0, 1000, 0],
    [250, 1000, 25],
    [333, 1000, 33],
    [1000, 1000, 100],
    // Overpaid still reads as fully paid; no amount or a bad number reads as nothing paid.
    [1200, 1000, 100],
    [500, 0, 0],
    [Number.NaN, 1000, 0],
    [-50, 1000, 0],
  ])('%s paid of %s is %s%', (paid, amount, share) => {
    expect(paidShare(paid, amount)).toBe(share);
  });
});

describe('chat display', () => {
  it('gives the same person the same avatar colour, and spreads people over the colours', () => {
    expect(avatarTone('user-1')).toBe(avatarTone('user-1'));
    const tones = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => avatarTone(`parent-${id}`)));
    expect(tones.size).toBeGreaterThan(1);
    for (const tone of tones) expect(['primary', 'success', 'warning', 'error']).toContain(tone);
  });

  const now = new Date(2026, 9, 24, 15, 0); // Saturday 24 Oct 2026, 3 pm
  const at = (daysAgo: number, hour: number) => new Date(2026, 9, 24 - daysAgo, hour, 5).toISOString();
  const time = (iso: string, locale = 'en-GB') => chatListTime(iso, { locale, yesterday: 'Yesterday', now });

  it('lists today by its time', () => {
    expect(time(at(0, 9))).toBe('9:05 am');
  });

  it('lists yesterday as "Yesterday"', () => {
    expect(time(at(1, 22))).toBe('Yesterday');
  });

  it('lists the last week by weekday, older by short date', () => {
    expect(time(at(3, 10))).toBe('Wednesday');
    expect(time(at(10, 10))).toBe('14/10/26');
  });

  it('follows the language', () => {
    expect(time(at(3, 10), 'ar-EG')).toBe('الأربعاء');
  });

  it('shows nothing for a broken date', () => {
    expect(time('not a date')).toBe('');
  });
});

// Module 4 · Attendance & safe pickup — QR scans, pickup records and attendance dates.
import type { TFunction } from 'i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  identityNumberErrorKey,
  identityNumberInputProps,
  isIdentityType,
  needsBackImage,
  normalizeIdentityNumberInput,
} from '@/components/qr/pickupIdentity';

import {
  averageMinutesToTimeLabel,
  calendarMonthRangeToToday,
  eachDateInRange,
  isLatePickupLog,
  minutesFromMidnight,
  rollingWeekRangeToToday,
  startOfCalendarMonth,
  toLocalDateString,
} from './attendanceAnalytics';
import { addCalendarDaysYmd, getNurseryCalendarDateString, nurseryDayStartIso } from './nurseryDay';
import { parseQrTokenFromText } from './parseQrScan';
import { extractPickupSnapshot } from './pickupSnapshot';
import { qrExpiryLabelFromSeconds, qrExpirySummaryFromSeconds } from './qrExpiryLabel';

/** Echoes the key and count, so a test sees which message was chosen. */
const t = ((key: string, options?: { count?: number }) =>
  options?.count === undefined ? key : `${key}:${options.count}`) as unknown as TFunction;

describe('parseQrTokenFromText', () => {
  it('reads the token from a scanned pickup link', () => {
    expect(parseQrTokenFromText('https://app.xo.test/pickup?token=abc123')).toBe('abc123');
    expect(parseQrTokenFromText('https://app.xo.test/pickup?lang=ar&token=abc123&x=1')).toBe('abc123');
  });

  it('decodes an encoded token', () => {
    expect(parseQrTokenFromText('https://app.xo.test/pickup?token=a%2Bb%3D')).toBe('a+b=');
  });

  it('keeps a malformed encoding as it is instead of failing', () => {
    expect(parseQrTokenFromText('https://app.xo.test/pickup?token=%E0%A4%A')).toBe('%E0%A4%A');
  });

  it('treats anything else as the raw token, trimmed', () => {
    expect(parseQrTokenFromText('  raw-token  ')).toBe('raw-token');
  });
});

describe('extractPickupSnapshot', () => {
  it('reads who picked the child up and any late fee', () => {
    const log = {
      pickup_person_name: '  Mona Ali ',
      pickup_photo_url: 'https://x.test/p.jpg',
      pickup_purpose: 'delegate',
      late_pickup: true,
      extra_hours: 2,
      extra_fee: '150',
    };
    expect(extractPickupSnapshot(log)).toEqual({
      personName: 'Mona Ali',
      photoUrl: 'https://x.test/p.jpg',
      purpose: 'delegate',
      isLatePickup: true,
      extraHours: 2,
      extraFee: 150,
    });
  });

  it('returns an on-time, empty pickup for a missing log', () => {
    for (const log of [null, undefined, 'text', 42]) {
      expect(extractPickupSnapshot(log)).toEqual({
        personName: null,
        photoUrl: null,
        purpose: null,
        isLatePickup: false,
        extraHours: 0,
        extraFee: 0,
      });
    }
  });

  it('ignores unknown purposes, blank names and non-numbers', () => {
    const snapshot = extractPickupSnapshot({
      pickup_person_name: '   ',
      pickup_purpose: 'stranger',
      extra_hours: 'two',
      extra_fee: Number.NaN,
    });
    expect(snapshot.personName).toBeNull();
    expect(snapshot.purpose).toBeNull();
    expect(snapshot.extraHours).toBe(0);
    expect(snapshot.extraFee).toBe(0);
  });

  it('isLatePickupLog follows the late_pickup flag', () => {
    expect(isLatePickupLog({ late_pickup: true })).toBe(true);
    expect(isLatePickupLog({ late_pickup: false })).toBe(false);
    expect(isLatePickupLog(null)).toBe(false);
  });
});

describe('QR expiry labels', () => {
  it.each([
    [0, 'qr.expired'],
    [-5, 'qr.expired'],
    [45, 'qr.expiresInSeconds:45'],
    [125, 'qr.expiresInMinutes:2'],
    [3 * 3600 + 10, 'qr.expiresInHours:3'],
    [2 * 86400 + 5, 'qr.expiresInDays:2'],
  ])('a countdown of %i seconds reads %s', (seconds, label) => {
    expect(qrExpiryLabelFromSeconds(seconds, t)).toBe(label);
  });

  it('the summary line uses the long day wording', () => {
    expect(qrExpirySummaryFromSeconds(3 * 86400, t)).toBe('qr.parentPage.expiresInDaysFull:3');
  });

  it('the summary line never says "0 minutes" while the code still works', () => {
    expect(qrExpirySummaryFromSeconds(30, t)).toBe('qr.expiresInMinutes:1');
    expect(qrExpirySummaryFromSeconds(0, t)).toBe('qr.expired');
  });
});

describe('nursery calendar days (Cairo)', () => {
  it('uses the Cairo date, not the UTC date, late in the evening', () => {
    // 22:30 UTC on the 13th is already 01:30 on the 14th in Cairo (summer time, UTC+3).
    expect(getNurseryCalendarDateString(new Date('2026-10-13T22:30:00Z'))).toBe('2026-10-14');
  });

  it.each([
    ['2026-10-14', 1, '2026-10-15'],
    ['2026-10-31', 1, '2026-11-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2028-03-01', -1, '2028-02-29'],
    ['2026-10-14', -7, '2026-10-07'],
  ] as const)('%s plus %i day(s) is %s', (day, delta, expected) => {
    expect(addCalendarDaysYmd(day, delta)).toBe(expected);
  });

  it('a nursery day starts at Cairo midnight, in summer and in winter', () => {
    expect(nurseryDayStartIso('2026-10-14')).toBe('2026-10-13T21:00:00.000Z'); // UTC+3
    expect(nurseryDayStartIso('2026-01-14')).toBe('2026-01-13T22:00:00.000Z'); // UTC+2
  });
});

describe('attendance date ranges', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 14, 9, 0, 0)); // Wed 14 Oct 2026, 09:00 Cairo
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats a local date without shifting it to UTC', () => {
    expect(toLocalDateString(new Date(2026, 9, 14, 0, 30))).toBe('2026-10-14');
  });

  it('the month starts on the 1st', () => {
    expect(startOfCalendarMonth()).toBe('2026-10-01');
    expect(calendarMonthRangeToToday()).toEqual({ from: '2026-10-01', to: '2026-10-14' });
  });

  it('the rolling week is today and the six days before it', () => {
    expect(rollingWeekRangeToToday()).toEqual({ from: '2026-10-08', to: '2026-10-14' });
  });

  it('lists every day in a range, both ends included', () => {
    expect(eachDateInRange('2026-10-12', '2026-10-14')).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
    expect(eachDateInRange('2026-10-14', '2026-10-14')).toEqual(['2026-10-14']);
  });

  it('counts each day once across the end of summer time', () => {
    // Egypt leaves summer time on the last Thursday of October.
    expect(eachDateInRange('2026-10-28', '2026-11-01')).toEqual([
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
  });

  it('returns no days for a reversed range', () => {
    expect(eachDateInRange('2026-10-14', '2026-10-01')).toEqual([]);
  });
});

describe('arrival and pickup times', () => {
  it('measures a check-in in minutes after local midnight', () => {
    expect(minutesFromMidnight('2026-10-14T05:30:00Z')).toBe(8 * 60 + 30); // 08:30 Cairo
  });

  it('shows the average as a clock time, or a dash when there is none', () => {
    expect(averageMinutesToTimeLabel(8 * 60 + 30, 'en')).toMatch(/08:30\s*am/i);
    expect(averageMinutesToTimeLabel(null, 'en')).toBe('—');
    expect(averageMinutesToTimeLabel(Number.NaN, 'ar')).toBe('—');
  });
});

describe('ID of a one-time pickup person', () => {
  it('knows the ID types, and only a national ID card has a back side', () => {
    expect(['national_id', 'passport', 'other'].every(isIdentityType)).toBe(true);
    expect(isIdentityType('driving_licence')).toBe(false);
    expect(needsBackImage('national_id')).toBe(true);
    expect(needsBackImage('passport')).toBe(false);
  });

  it('keeps a national ID to 14 digits as it is typed', () => {
    expect(normalizeIdentityNumberInput('national_id', '2950-1011 2345 6789')).toBe('29501011234567');
    expect(normalizeIdentityNumberInput('passport', 'A12 345')).toBe('A12 345');
    expect(identityNumberInputProps('national_id')).toEqual({ inputMode: 'numeric', maxLength: 14 });
  });

  it('needs a number, and 14 digits for a national ID', () => {
    expect(identityNumberErrorKey('passport', '  ')).toBe('qr.custom.errors.identityNumberRequired');
    expect(identityNumberErrorKey('national_id', '1234')).toBe('qr.custom.errors.nationalIdDigits');
    expect(identityNumberErrorKey('national_id', '29501011234567')).toBeNull();
    expect(identityNumberErrorKey('passport', 'A12345')).toBeNull();
  });
});

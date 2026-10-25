// The dashboard's attendance details: each number lists exactly the rows it counts, the children's
// table sorts and searches, and a child's row opens their record on the right days.
import { describe, expect, it } from 'vitest';

import {
  childName,
  childRecordLink,
  classOptions,
  dayRowsFor,
  extraHoursByChild,
  filterList,
  keepTile,
  matchesSearch,
  PERIOD_TILES,
  rangeFromSearch,
  recordRowsFor,
  reviewLogLink,
  sortPeriodChildren,
  TODAY_TILES,
  weekdayName,
  type DayChildRow,
  type PeriodChildRow,
  type PeriodRecordRow,
} from './attendanceKpiDetails';

function day(name: string, status: DayChildRow['day_status'], patch: Partial<DayChildRow> = {}): DayChildRow {
  return {
    child_id: name, full_name_ar: null, full_name_en: name, child_code: null, class_id: null, class_name_ar: null, class_name_en: null,
    parent_name_ar: null, parent_name_en: null, parent_phone: null, father_name_ar: null, father_name_en: null, parents_text: null, day_status: status,
    check_in: null, check_out: null, check_in_method: null, check_out_method: null,
    dropoff_name_ar: null, dropoff_name_en: null, dropoff_relationship: null, pickup_person_name: null, pickup_relationship: null,
    checked_in_by_ar: null, checked_in_by_en: null, checked_out_by_ar: null, checked_out_by_en: null,
    pickup_due_at: null, late_now: false, late_minutes: 0, extra_hours: 0, extra_hours_covered: 0, extra_hours_billed: 0,
    extra_fee: 0, invoice_status: null, absence_reason: null, absence_note: null,
    absence_reported_by_ar: null, absence_reported_by_en: null, absence_reported_at: null, needs_review: false, review_reason: null,
    ...patch,
  };
}

function record(name: string, patch: Partial<PeriodRecordRow> = {}): PeriodRecordRow {
  return {
    attendance_id: name, child_id: name, full_name_ar: null, full_name_en: name, child_code: null, class_id: null,
    class_name_ar: null, class_name_en: null, father_name_ar: null, father_name_en: null, parents_text: null, attendance_date: '2026-10-01',
    check_in: null, check_out: null, check_out_method: null, pickup_person_name: null, pickup_relationship: null,
    is_late: false, late_minutes: 0, extra_hours: 0, extra_hours_covered: 0, extra_hours_billed: 0, extra_fee: 0,
    late_charge_waived: false, invoice_id: null, invoice_number: null, invoice_status: null, invoice_due_date: null,
    invoice_paid_at: null, needs_review: false, review_reason: null,
    ...patch,
  };
}

function child(name: string, rate: number, present: number, absent: number, excused = 0, ar: string | null = null): PeriodChildRow {
  return {
    child_id: name, full_name_ar: ar, full_name_en: name, child_code: null, class_id: null, class_name_ar: null, class_name_en: null,
    father_name_ar: null, father_name_en: null, parents_text: null, expected_days: present + absent + excused, present_days: present, excused_days: excused, absent_days: absent,
    attendance_rate: rate, late_days: 0, extra_hours: 0, extra_fee: 0,
  };
}

const names = (rows: Array<{ full_name_en: string | null }>) => rows.map((r) => r.full_name_en);

describe('today', () => {
  const rows = [
    day('Here', 'in_nursery', { late_now: true }),
    day('Gone', 'picked_up', { extra_hours: 1 }),
    day('Away', 'absent'),
    day('Sick', 'excused'),
    day('Weekend', 'off'),
  ];

  it('each number lists the children it counts', () => {
    expect(names(dayRowsFor('attended', rows))).toEqual(['Here', 'Gone']);
    expect(names(dayRowsFor('in_nursery', rows))).toEqual(['Here']);
    expect(names(dayRowsFor('picked_up', rows))).toEqual(['Gone']);
    expect(names(dayRowsFor('absent', rows))).toEqual(['Away']);
    expect(names(dayRowsFor('excused', rows))).toEqual(['Sick']);
    expect(names(dayRowsFor('late_now', rows))).toEqual(['Here']);
    expect(names(dayRowsFor('extra_today', rows))).toEqual(['Gone']);
  });
});

describe('a period', () => {
  const rows = [
    record('Paid', { is_late: true, extra_hours: 2, extra_fee: 100, invoice_status: 'paid' }),
    record('Pending', { is_late: true, extra_hours: 1, extra_fee: 50, invoice_status: 'pending', needs_review: true }),
    record('Overdue', { is_late: true, extra_hours: 0.5, extra_fee: 20, invoice_status: 'overdue' }),
    record('Cancelled', { extra_fee: 10, invoice_status: 'cancelled' }),
    record('Grace', { is_late: true }),
  ];

  it('each number lists the days it counts', () => {
    // Late within the charge's rules but no extra hours (Grace) is not counted.
    expect(names(recordRowsFor('late', rows))).toEqual(['Paid', 'Pending', 'Overdue']);
    expect(names(recordRowsFor('billed', rows))).toEqual(['Paid', 'Pending', 'Overdue', 'Cancelled']);
    expect(names(recordRowsFor('collected', rows))).toEqual(['Paid']);
    expect(names(recordRowsFor('outstanding', rows))).toEqual(['Pending', 'Overdue']);
    expect(names(recordRowsFor('review', rows))).toEqual(['Pending']);
  });

  it('the attendance number stays chosen between today and a period; the others do not carry over', () => {
    expect(keepTile('attended', PERIOD_TILES)).toBe('attended');
    expect(keepTile('attended', TODAY_TILES)).toBe('attended');
    expect(keepTile('late_now', PERIOD_TILES)).toBeNull();
    expect(keepTile('billed', TODAY_TILES)).toBeNull();
    expect(keepTile(null, TODAY_TILES)).toBeNull();
  });
});

describe('the children table', () => {
  const rows = [child('Omar', 50, 5, 5), child('Adam', 90, 9, 1), child('Laila', 50, 5, 4, 1, 'ليلى')];

  it('sorts by rate, days and name, ties by name', () => {
    expect(names(sortPeriodChildren(rows, 'rate', 'asc', 'en'))).toEqual(['Laila', 'Omar', 'Adam']);
    expect(names(sortPeriodChildren(rows, 'rate', 'desc', 'en'))).toEqual(['Adam', 'Laila', 'Omar']);
    expect(names(sortPeriodChildren(rows, 'absent', 'desc', 'en'))).toEqual(['Omar', 'Laila', 'Adam']);
    expect(names(sortPeriodChildren(rows, 'excused', 'desc', 'en'))).toEqual(['Laila', 'Adam', 'Omar']);
    expect(names(sortPeriodChildren(rows, 'name', 'asc', 'en'))).toEqual(['Adam', 'Laila', 'Omar']);
    expect(names(sortPeriodChildren(rows, 'name', 'desc', 'en'))).toEqual(['Omar', 'Laila', 'Adam']);
  });

  it('finds a child by either name', () => {
    expect(matchesSearch(rows[2], 'lai')).toBe(true);
    expect(matchesSearch(rows[2], 'ليلى')).toBe(true);
    expect(matchesSearch(rows[0], 'lai')).toBe(false);
    expect(matchesSearch(rows[0], '  ')).toBe(true);
    expect(childName(rows[2], 'ar')).toBe('ليلى');
    expect(childName(rows[0], 'ar')).toBe('Omar');
  });
});

describe('links', () => {
  it('a child opens on their attendance for the period', () => {
    expect(childRecordLink('/admin', 'c1', { from: '2026-10-01', to: '2026-10-25' })).toBe(
      '/admin/children/c1?tab=attendance&from=2026-10-01&to=2026-10-25',
    );
  });

  it('from a single day, on the 30 days up to it', () => {
    expect(childRecordLink('/xo-admin/nursery', 'c1', { from: '2026-10-25', to: '2026-10-25' })).toBe(
      '/xo-admin/nursery/children/c1?tab=attendance&from=2026-09-26&to=2026-10-25',
    );
  });

  it('the review log opens on the period, or its last 92 days', () => {
    expect(reviewLogLink('/admin', { from: '2026-10-01', to: '2026-10-25' })).toBe('/admin/attendance/logs?from=2026-10-01&to=2026-10-25&review=1');
    expect(reviewLogLink('/admin', { from: '2026-01-01', to: '2026-10-25' })).toBe('/admin/attendance/logs?from=2026-07-26&to=2026-10-25&review=1');
  });

  it('only real, ordered dates within the limit are read back from a link', () => {
    const read = (query: string) => rangeFromSearch(new URLSearchParams(query), 366);
    expect(read('from=2026-10-01&to=2026-10-25')).toEqual({ from: '2026-10-01', to: '2026-10-25' });
    expect(read('from=2026-10-25&to=2026-10-01')).toBeNull();
    expect(read('from=2026-02-30&to=2026-03-10')).toBeNull();
    expect(read('from=2024-01-01&to=2026-10-25')).toBeNull();
    expect(read('from=yesterday&to=2026-10-25')).toBeNull();
    expect(read('tab=attendance')).toBeNull();
  });
});

describe('searching and filtering the lists', () => {
  const laila = day('Laila', 'in_nursery', {
    child_code: 'CH-2026-00012', class_id: 'butterflies', class_name_en: 'Butterflies',
    father_name_en: 'Karim', parents_text: 'منى Mona 01011111111 كريم Karim 01022222222',
  });
  const adam = day('Adam', 'absent', { class_id: 'stars', class_name_en: 'Stars', parents_text: 'Huda 01033333333' });
  const omar = day('Omar', 'absent');

  it("finds a child by name, code, a parent's name or phone", () => {
    expect(matchesSearch(laila, 'ch-2026-00012')).toBe(true);
    expect(matchesSearch(laila, 'karim')).toBe(true);
    expect(matchesSearch(laila, 'كريم')).toBe(true);
    expect(matchesSearch(laila, '0102222')).toBe(true);
    expect(matchesSearch(laila, 'laila huda')).toBe(false);
  });

  it('filters by class, or the children in none', () => {
    const rows = [laila, adam, omar];
    expect(names(filterList(rows, { search: '', classId: 'stars' }))).toEqual(['Adam']);
    expect(names(filterList(rows, { search: '', classId: 'none' }))).toEqual(['Omar']);
    expect(names(filterList(rows, { search: 'mona', classId: 'all' }))).toEqual(['Laila']);
    expect(classOptions(rows, 'en')).toEqual([
      { id: 'butterflies', name: 'Butterflies' },
      { id: 'stars', name: 'Stars' },
      { id: 'none', name: null },
    ]);
  });

  it("adds up each child's extra hours, most hours first", () => {
    const rows = [
      record('a', { child_id: 'laila', full_name_en: 'Laila', attendance_date: '2026-10-01', extra_hours: 2, extra_hours_covered: 1, extra_hours_billed: 1, extra_fee: 50 }),
      record('b', { child_id: 'laila', full_name_en: 'Laila', attendance_date: '2026-10-05', extra_hours: 1.5, extra_hours_billed: 1.5, extra_fee: 75 }),
      record('c', { child_id: 'omar', full_name_en: 'Omar', attendance_date: '2026-10-03', extra_hours: 1, extra_hours_billed: 1, extra_fee: 50 }),
      record('d', { child_id: 'adam', full_name_en: 'Adam', is_late: true }),
    ];
    expect(
      extraHoursByChild(rows).map((c) => `${c.full_name_en}: ${c.days} days, ${c.hours} h (${c.covered} covered, ${c.billed_hours} billed), ${c.fee}, last ${c.last_day}`),
    ).toEqual([
      'Laila: 2 days, 3.5 h (1 covered, 2.5 billed), 125, last 2026-10-05',
      'Omar: 1 days, 1 h (0 covered, 1 billed), 50, last 2026-10-03',
    ]);
  });

  it('names the weekdays from Sunday', () => {
    expect(weekdayName(0, 'en-GB')).toBe('Sunday');
    expect(weekdayName(6, 'en-GB')).toBe('Saturday');
    expect(weekdayName(5, 'ar-EG')).toBe('الجمعة');
  });
});

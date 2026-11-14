import { describe, expect, it } from 'vitest';

import type { ParentCourseInvoiceRow, ParentCourseRow } from '@/hooks/useParentCourses';

import { courseTotals, isOpenBill, placesLeft } from './parentCourses';

describe('the family\'s courses', () => {
  it('adds up the courses a month and the bills still to pay', () => {
    const courses = [{ price_per_month: 400 }, { price_per_month: 250 }] as ParentCourseRow[];
    const bills = [
      { status: 'pending', amount: 400 },
      { status: 'overdue', amount: 250 },
      { status: 'paid', amount: 400 },
      { status: 'waived', amount: 250 },
    ] as ParentCourseInvoiceRow[];
    expect(courseTotals(courses, bills)).toEqual({ courses: 2, monthly: 650, openBills: 2, openAmount: 650 });
    expect(bills.map(isOpenBill)).toEqual([true, true, false, false]);
  });

  it('counts the places left (none when the course has no limit)', () => {
    expect([placesLeft({ max_students: 10, enrolled: 7 }), placesLeft({ max_students: 2, enrolled: 3 }), placesLeft({ max_students: null, enrolled: 5 })]).toEqual([3, 0, null]);
  });
});

import type { ParentCourseInvoiceRow, ParentCourseRow } from '@/hooks/useParentCourses';
import type { PillTone } from '@/lib/tones';

/** Each kind of course's icon and colour. */
export const COURSE_LOOK: Record<string, { icon: string; tone: PillTone }> = {
  sport: { icon: 'sports_soccer', tone: 'primary' },
  art: { icon: 'palette', tone: 'error' },
  music: { icon: 'music_note', tone: 'warning' },
  academic: { icon: 'calculate', tone: 'primary' },
  language: { icon: 'translate', tone: 'success' },
  other: { icon: 'school', tone: 'neutral' },
};

/** A bill's state, with its colour: still to pay (late when past due), paid, or waived. */
export const BILL_TONE: Record<string, PillTone> = { pending: 'warning', overdue: 'error', paid: 'success', waived: 'neutral' };

export const isOpenBill = (b: Pick<ParentCourseInvoiceRow, 'status'>) => b.status === 'pending' || b.status === 'overdue';

/** The tiles: active courses, what they cost a month, and the bills still to pay with their total. */
export function courseTotals(courses: ParentCourseRow[], bills: ParentCourseInvoiceRow[]) {
  const open = bills.filter(isOpenBill);
  return {
    courses: courses.length,
    monthly: courses.reduce((sum, c) => sum + Number(c.price_per_month || 0), 0),
    openBills: open.length,
    openAmount: open.reduce((sum, b) => sum + Number(b.amount || 0), 0),
  };
}

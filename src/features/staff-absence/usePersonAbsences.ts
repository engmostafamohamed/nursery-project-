import { useMemo } from 'react';

import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { useSettings } from '@/lib/useSettings';

import { absenceState, addDays, daysBetween, type Absence } from './staffAbsence';
import { useStaffAbsences } from './useStaffAbsence';

/** How far back a member of staff's page looks for their absences. */
export const PERSON_LOOK_BACK_DAYS = 180;

export type PersonAbsenceSummary = {
  /** Their absence today, if they are away. */
  awayToday: Absence | null;
  /** Days already spent away in the last six months (one still running counts up to yesterday). */
  daysAway: number;
  /** Absences still to come. */
  coming: number;
};

/** One member of staff's absences (the nursery's, filtered), with where they stand today; one query for their page's header and tab. */
export function usePersonAbsences(userId: string | null | undefined) {
  const { nurseryId } = useSettings();
  const today = getNurseryCalendarDateString();
  const query = useStaffAbsences(nurseryId, addDays(today, -PERSON_LOOK_BACK_DAYS), addDays(today, 180));
  const day = query.data?.today ?? today;
  const absences = useMemo(() => (query.data?.absences ?? []).filter((a) => a.userId === userId), [query.data, userId]);
  const summary = useMemo<PersonAbsenceSummary>(() => {
    const live = absences.filter((a) => !a.cancelled);
    const daysAway = live
      .filter((a) => a.startsOn < day)
      .reduce((sum, a) => sum + daysBetween(a.startsOn, a.endsOn < day ? a.endsOn : addDays(day, -1)), 0);
    return {
      awayToday: live.find((a) => absenceState(a, day) === 'today') ?? null,
      daysAway,
      coming: live.filter((a) => absenceState(a, day) === 'upcoming').length,
    };
  }, [absences, day]);
  return { query, today: day, absences, summary };
}

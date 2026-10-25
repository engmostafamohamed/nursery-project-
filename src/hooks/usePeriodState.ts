import { useState } from 'react';

import {
  calendarPeriodRange,
  clipToToday,
  customRangeErrors,
  isCalendarPeriod,
  type CustomRangeErrors,
  type DateRange,
  type PeriodChoice,
} from '@/lib/attendancePeriods';

/**
 * A card's period: the choice, how many periods back the arrows went, the picked dates and what
 * they cover. `range` is null for all time or while the picked dates are not valid; `shown` is the
 * range as counted (ending today at the latest).
 */
export function usePeriodState(initial: PeriodChoice, today: string) {
  const [choice, setChoice] = useState<PeriodChoice>(initial);
  const [offset, setOffset] = useState(0);
  const [custom, setCustom] = useState<DateRange>({ from: '', to: '' });

  const calendarChoice = isCalendarPeriod(choice) ? choice : null;
  const calendar = calendarChoice ? calendarPeriodRange(calendarChoice, offset, today) : null;
  const errors: CustomRangeErrors = choice === 'custom' ? customRangeErrors(custom) : {};
  const valid = choice !== 'custom' || (!errors.from && !errors.to);
  const range: DateRange | null =
    choice === 'today' ? { from: today, to: today } : choice === 'custom' ? (valid ? custom : null) : calendar;
  const shown = range ? clipToToday(range, today) : null;

  /** Picking dates starts from the days on screen. */
  const choose = (next: PeriodChoice) => {
    if (next === 'custom' && choice !== 'custom') setCustom(clipToToday(range ?? { from: today, to: today }, today));
    setChoice(next);
    setOffset(0);
  };
  /** Just that day, as picked dates. */
  const openDay = (day: string) => {
    setChoice('custom');
    setCustom({ from: day, to: day });
    setOffset(0);
  };

  return { choice, choose, offset, setOffset, custom, setCustom, calendarChoice, calendar, errors, valid, range, shown, openDay, today };
}

export type PeriodState = ReturnType<typeof usePeriodState>;

// The dashboard's attendance card periods: which days a month, quarter, half year or year covers,
// stepping back across years, the picked dates' checks and the labels.
import { describe, expect, it } from 'vitest';

import {
  calendarPeriodLabel,
  calendarPeriodRange,
  clipToToday,
  customRangeErrors,
  daysInRange,
  MAX_KPI_RANGE_DAYS,
  rangeLabel,
} from './attendancePeriods';

const TODAY = '2026-10-25';

describe('calendar periods', () => {
  it('cover the whole period holding today', () => {
    expect(calendarPeriodRange('month', 0, TODAY)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(calendarPeriodRange('quarter', 0, TODAY)).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(calendarPeriodRange('half', 0, TODAY)).toEqual({ from: '2026-07-01', to: '2026-12-31' });
    expect(calendarPeriodRange('year', 0, TODAY)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('step back into earlier periods, across the year', () => {
    expect(calendarPeriodRange('month', -1, TODAY)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(calendarPeriodRange('month', -10, TODAY)).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(calendarPeriodRange('quarter', -4, TODAY)).toEqual({ from: '2025-10-01', to: '2025-12-31' });
    expect(calendarPeriodRange('half', -1, TODAY)).toEqual({ from: '2026-01-01', to: '2026-06-30' });
    expect(calendarPeriodRange('half', -2, TODAY)).toEqual({ from: '2025-07-01', to: '2025-12-31' });
    expect(calendarPeriodRange('year', -1, TODAY)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });

  it('know February and leap years', () => {
    expect(calendarPeriodRange('month', 0, '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(calendarPeriodRange('quarter', 0, '2026-03-31')).toEqual({ from: '2026-01-01', to: '2026-03-31' });
  });

  it('a leap year is within what the server reads at once', () => {
    expect(daysInRange(calendarPeriodRange('year', 0, '2028-06-01'))).toBe(MAX_KPI_RANGE_DAYS);
  });

  it('count up to today', () => {
    expect(clipToToday({ from: '2026-10-01', to: '2026-12-31' }, TODAY)).toEqual({ from: '2026-10-01', to: TODAY });
    expect(clipToToday({ from: '2026-09-01', to: '2026-09-30' }, TODAY)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });
});

describe('picked dates', () => {
  it('both dates are needed', () => {
    expect(customRangeErrors({ from: '', to: '' })).toEqual({ from: 'required', to: 'required' });
    expect(customRangeErrors({ from: '2026-10-01', to: '' })).toEqual({ to: 'required' });
  });

  it('the start comes before the end, and at most a year apart', () => {
    expect(customRangeErrors({ from: '2026-10-10', to: '2026-10-01' })).toEqual({ to: 'fromAfterTo' });
    expect(customRangeErrors({ from: '2025-01-01', to: '2026-01-02' })).toEqual({ to: 'rangeTooLong' });
    expect(customRangeErrors({ from: '2025-01-01', to: '2026-01-01' })).toEqual({});
    expect(customRangeErrors({ from: '2026-10-25', to: '2026-10-25' })).toEqual({});
  });
});

describe('labels', () => {
  it('name the period and the days counted', () => {
    expect(calendarPeriodLabel('month', calendarPeriodRange('month', 0, TODAY), 'en-GB')).toBe('October 2026');
    expect(calendarPeriodLabel('year', calendarPeriodRange('year', 0, TODAY), 'en-GB')).toBe('2026');
    expect(calendarPeriodLabel('quarter', calendarPeriodRange('quarter', 0, TODAY), 'en-GB')).toMatch(/^Oct\s*–\s*Dec 2026$/);
    expect(rangeLabel({ from: TODAY, to: TODAY }, 'en-GB')).toBe('Sunday 25 October');
    expect(rangeLabel({ from: '2026-10-01', to: TODAY }, 'en-GB')).toMatch(/^1\s*–\s*25 Oct 2026$/);
  });
});

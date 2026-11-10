import { describe, expect, it } from 'vitest';

import { addDays } from './calendarDay';

describe('calendar days', () => {
  it('move by days across months, years and leap days', () => {
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2026-11-10T22:30:00Z', 0)).toBe('2026-11-10');
  });
});

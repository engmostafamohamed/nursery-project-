import { describe, expect, it } from 'vitest';

import { openWeekdays, weekdayNumber, weekdayNumbers } from './weekdays';

describe("the nursery's weekdays, however they were stored", () => {
  it('reads short and full names, numbers and number strings; leaves out anything else', () => {
    expect(['sun', 'Sunday', '0', 0, ' FRI ', 'saturday', 6].map(weekdayNumber)).toEqual([0, 0, 0, 0, 5, 6, 6]);
    expect(['7', -1, 'x', '', null, 1.5].map(weekdayNumber)).toEqual([null, null, null, null, null, null]);
    expect(weekdayNumbers(['thu', '0', 'MON', 9, 'x', 'sun'])).toEqual([0, 1, 4]);
    expect(weekdayNumbers('sun')).toEqual([]);
  });

  it('falls back to Sunday to Thursday, as the server does, when none are usable', () => {
    expect(openWeekdays([])).toEqual([0, 1, 2, 3, 4]);
    expect(openWeekdays(null)).toEqual([0, 1, 2, 3, 4]);
    expect(openWeekdays(['fri', 'sat'])).toEqual([5, 6]);
  });
});

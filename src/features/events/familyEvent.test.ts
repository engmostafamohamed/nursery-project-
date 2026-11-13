import { describe, expect, it } from 'vitest';

import { familyEventArgs, familyEventProblems, newFamilyEvent, nextFullHour, scheduleOf, toggled } from './familyEvent';
import { toLocalInput } from './eventFormSchema';

// Local times, so the weekday and hour are the same wherever the tests run.
const now = new Date(2026, 10, 13, 19, 47); // Fri 13 Nov, 7:47 pm

describe('a family\'s urgent event: the starting values', () => {
  it('starts at the next full hour, at least half an hour away', () => {
    expect(nextFullHour(now)).toEqual(new Date(2026, 10, 13, 21, 0));
    expect(nextFullHour(new Date(2026, 10, 13, 19, 10))).toEqual(new Date(2026, 10, 13, 20, 0));
  });

  it('picks the only child, and suggests the start\'s weekday and hour for a weekly repeat', () => {
    const one = newFamilyEvent(['laila'], now);
    expect(one.childIds).toEqual(['laila']);
    expect(one.repeatsWeekly).toBe(false);
    expect([one.days, one.hours]).toEqual([[5], [21]]);
    expect(newFamilyEvent(['laila', 'nour'], now).childIds).toEqual([]);
    expect(scheduleOf('not a date')).toEqual({ days: [], hours: [] });
  });
});

describe('what is missing', () => {
  const draft = { ...newFamilyEvent(['laila'], now), title: 'Dentist' };

  it('nothing in a complete draft', () => {
    expect(familyEventProblems(draft, now)).toEqual({});
  });

  it('a title, a start to come, a child; and the days and hours of a weekly repeat', () => {
    expect(familyEventProblems({ ...draft, title: '  ', childIds: [] }, now)).toEqual({ title: 'titleRequired', children: 'childRequired' });
    expect(familyEventProblems({ ...draft, startsAt: toLocalInput(new Date(2026, 10, 13, 18, 0)) }, now)).toEqual({ startsAt: 'startInPast' });
    expect(familyEventProblems({ ...draft, startsAt: '' }, now)).toEqual({ startsAt: 'startInvalid' });
    expect(familyEventProblems({ ...draft, repeatsWeekly: true, days: [], hours: [] }, now)).toEqual({ days: 'daysRequired', hours: 'hoursRequired' });
  });
});

describe('what goes to the server', () => {
  const draft = { ...newFamilyEvent(['laila'], now), title: ' Dentist ', description: ' ', location: ' Clinic ' };

  it('the title in the language it was written in, blanks as nothing, no week schedule unless it repeats', () => {
    const args = familyEventArgs(draft, false);
    expect([args.p_title_en, args.p_title_ar, args.p_description_en, args.p_location]).toEqual(['Dentist', null, null, 'Clinic']);
    expect([args.p_urgent_days_of_week, args.p_urgent_hours_of_day, args.p_urgent_repeats_weekly]).toEqual([[], [], false]);
    expect(familyEventArgs(draft, true).p_title_ar).toBe('Dentist');
  });

  it('a weekly repeat sends its days and hours sorted, once each', () => {
    const args = familyEventArgs({ ...draft, repeatsWeekly: true, days: [4, 2, 2], hours: [16, 9] }, false);
    expect([args.p_urgent_days_of_week, args.p_urgent_hours_of_day, args.p_urgent_repeats_weekly]).toEqual([[2, 4], [9, 16], true]);
  });

  it('toggles a value in a list', () => {
    expect(toggled([1, 2], 2)).toEqual([1]);
    expect(toggled([1], 3)).toEqual([1, 3]);
  });
});

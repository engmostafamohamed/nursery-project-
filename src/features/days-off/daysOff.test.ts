import { describe, expect, it } from 'vitest';

import {
  canChangeHoliday,
  canRemoveHoliday,
  earliestEnd,
  holidayArgs,
  holidayLength,
  holidayProblems,
  holidaysOfYear,
  holidayState,
  nextDayOff,
  weekdayDate,
  type Holiday,
} from './daysOff';
import { egyptOfficialHolidays, hijriOf, orthodoxEaster } from './officialHolidays';

const holiday = (starts_on: string, ends_on = starts_on, extra: Partial<Holiday> = {}): Holiday => ({
  id: starts_on, nursery_id: 'n', name_ar: null, name_en: 'Day', starts_on, ends_on, source: 'custom', official_key: null, notified_at: null, ...extra,
});

describe('the nursery days off', () => {
  it('checks a holiday before saving, as the server does', () => {
    const d = { nameAr: '', nameEn: 'Eid', startsOn: '2027-03-09', endsOn: '2027-03-11' };
    expect(holidayProblems(d)).toEqual({});
    expect(holidayProblems({ ...d, nameEn: ' ' })).toEqual({ name: 'nameRequired' });
    expect(holidayProblems({ ...d, nameAr: 'x'.repeat(81) })).toEqual({ name: 'nameTooLong' });
    expect(holidayProblems({ ...d, startsOn: '' })).toEqual({ dates: 'datesRequired' });
    expect(holidayProblems({ ...d, endsOn: '2027-03-01' })).toEqual({ dates: 'datesInvalid' });
    expect(holidayProblems({ ...d, endsOn: '2027-05-09' })).toEqual({ dates: 'tooLong' }); // 61 days after
    expect(holidayProblems({ ...d, endsOn: '2027-05-08' })).toEqual({}); // 60 days after
    expect(holidayArgs({ ...d, nameAr: ' عيد ', endsOn: '' }, 'n')).toEqual({ nursery_id: 'n', name_ar: 'عيد', name_en: 'Eid', starts_on: '2027-03-09', ends_on: '2027-03-09' });
  });

  it('counts the days, the year and where each stands', () => {
    expect([holidayLength(holiday('2027-03-09', '2027-03-11')), holidayLength(holiday('2026-12-31', '2027-01-01'))]).toEqual([3, 2]);
    const list = [holiday('2027-05-01'), holiday('2026-12-31', '2027-01-01'), holiday('2028-01-07')];
    expect(holidaysOfYear(list, 2027).map((h) => h.starts_on)).toEqual(['2026-12-31', '2027-05-01']);
    expect(['2027-03-08', '2027-03-10', '2027-03-12'].map((today) => holidayState(holiday('2027-03-09', '2027-03-11'), today))).toEqual(['coming', 'now', 'past']);
  });

  it('keeps the days gone by: an ended one stays, a running one only ends early, only a coming one is removed', () => {
    const h = holiday('2027-03-09', '2027-03-11');
    expect([canChangeHoliday(h, '2027-03-12'), canChangeHoliday(h, '2027-03-11'), canRemoveHoliday(h, '2027-03-10'), canRemoveHoliday(h, '2027-03-09')]).toEqual([false, true, false, true]);
    expect([earliestEnd(h, '2027-03-10'), earliestEnd(h, '2027-03-05')]).toEqual(['2027-03-09', '2027-03-09']);
    expect(earliestEnd(holiday('2027-03-01', '2027-03-11'), '2027-03-10')).toEqual('2027-03-09');
  });

  it('finds the next day off: a holiday, else the next weekly day off', () => {
    const sunToThu = [0, 1, 2, 3, 4];
    expect(nextDayOff('2026-11-15', sunToThu, [])).toEqual({ day: '2026-11-20', holiday: null }); // Sunday → Friday
    const eid = holiday('2026-11-17');
    expect(nextDayOff('2026-11-15', sunToThu, [eid])).toEqual({ day: '2026-11-17', holiday: eid });
    expect(nextDayOff('2026-11-20', sunToThu, [])?.day).toBe('2026-11-20'); // today is off
    expect(nextDayOff('2026-11-15', [0, 1, 2, 3, 4, 5, 6], [])).toBeNull();
    expect([0, 5, 6].map(weekdayDate).map((d) => new Date(`${d}T00:00:00Z`).getUTCDay())).toEqual([0, 5, 6]);
  });
});

describe("Egypt's official holidays", () => {
  it('finds Coptic Easter, so Sham el-Nessim is the day after', () => {
    expect(['2025', '2026', '2027'].map((y) => orthodoxEaster(Number(y)).toISOString().slice(0, 10))).toEqual(['2025-04-20', '2026-04-12', '2027-05-02']);
  });

  it('lists the fixed and the moon holidays of a year once each, with keys the server accepts', () => {
    const list = egyptOfficialHolidays(2026);
    const byId = Object.fromEntries(list.map((h) => [h.id, h]));
    expect(byId.copticChristmas).toMatchObject({ startsOn: '2026-01-07', endsOn: '2026-01-07', lunar: false, key: 'coptic_christmas-2026' });
    expect(byId.revolutionJan25.key).toBe('revolution_jan_25-2026');
    expect(byId.shamElNessim.startsOn).toBe('2026-04-13');
    expect(byId.armedForcesDay.startsOn).toBe('2026-10-06');
    // The moon ones: three days of Eid al-Fitr from 1 Shawwal, Arafat and three days of Eid al-Adha.
    expect(byId.eidAlFitr).toMatchObject({ key: 'eid_al_fitr-1447', lunar: true });
    expect(hijriOf(new Date(`${byId.eidAlFitr.startsOn}T00:00:00Z`))).toMatchObject({ month: 10, day: 1 });
    expect(holidayLength({ starts_on: byId.eidAlFitr.startsOn, ends_on: byId.eidAlFitr.endsOn })).toBe(3);
    expect(hijriOf(new Date(`${byId.eidAlAdha.startsOn}T00:00:00Z`))).toMatchObject({ month: 12, day: 9 });
    expect(holidayLength({ starts_on: byId.eidAlAdha.startsOn, ends_on: byId.eidAlAdha.endsOn })).toBe(4);
    expect(list.map((h) => h.startsOn)).toEqual([...list.map((h) => h.startsOn)].sort());
    expect(new Set(list.map((h) => h.key)).size).toBe(list.length);
    expect(list.every((h) => /^[a-z0-9_]+-[0-9]{4}$/.test(h.key))).toBe(true);
    expect(list).toHaveLength(12);
  });
});

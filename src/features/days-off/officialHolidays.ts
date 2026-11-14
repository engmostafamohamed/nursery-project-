/*
 * Egypt's official holidays for a year, worked out here so the manager can add them in one click:
 *  - fixed days (25 January, 25 April, 1 May, 30 June, 23 July, 6 October, Coptic Christmas on 7 January);
 *  - Sham el-Nessim, the Monday after Coptic (Orthodox) Easter, by the Julian Easter rule;
 *  - the Islamic ones (Eid al-Fitr, Arafat and Eid al-Adha, the Islamic New Year, the Prophet's
 *    birthday) from the Hijri calendar (Umm al-Qura, as the browser knows it). These follow the moon,
 *    so the announced day can differ by one: the manager checks them and can move any.
 */

const DAY_MS = 86_400_000;
const ymd = (date: Date) => date.toISOString().slice(0, 10);
const utc = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));
const plusDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

export type OfficialHolidayId =
  | 'copticChristmas'
  | 'revolutionJan25'
  | 'shamElNessim'
  | 'sinaiLiberation'
  | 'labourDay'
  | 'revolutionJun30'
  | 'revolutionJul23'
  | 'armedForcesDay'
  | 'eidAlFitr'
  | 'eidAlAdha'
  | 'islamicNewYear'
  | 'prophetBirthday';

export type OfficialHoliday = {
  id: OfficialHolidayId;
  /** Unique for the nursery: the holiday and its year (Hijri for the Islamic ones), e.g. "eid_al_fitr-1448". */
  key: string;
  startsOn: string;
  endsOn: string;
  /** Follows the moon: the announced day can differ by one. */
  lunar: boolean;
};

const snake = (id: string) => id.replace(/[A-Z0-9]+/g, (m) => `_${m.toLowerCase()}`).replace(/^_/, '');

/** Orthodox (Coptic) Easter Sunday of a Gregorian year (valid 1900–2099). */
export function orthodoxEaster(year: number): Date {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  // A Julian calendar date; the Gregorian one is 13 days later this century.
  return plusDays(utc(year, month, day), 13);
}

const hijriFormat = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/** A Gregorian day's Hijri date (Umm al-Qura). */
export function hijriOf(date: Date): { year: number; month: number; day: number } {
  const parts = Object.fromEntries(hijriFormat.formatToParts(date).map((p) => [p.type, p.value]));
  return { year: parseInt(parts.year, 10), month: parseInt(parts.month, 10), day: parseInt(parts.day, 10) };
}

/** Every day of the Gregorian year on which the Hijri month and day fall. */
function hijriDaysIn(year: number, month: number, day: number): { date: Date; hijriYear: number }[] {
  const found: { date: Date; hijriYear: number }[] = [];
  for (let date = utc(year, 1, 1); date.getUTCFullYear() === year; date = plusDays(date, 1)) {
    const h = hijriOf(date);
    if (h.month === month && h.day === day) found.push({ date, hijriYear: h.year });
  }
  return found;
}

/** Egypt's official holidays starting in the Gregorian year, in date order. */
export function egyptOfficialHolidays(year: number): OfficialHoliday[] {
  const list: OfficialHoliday[] = [];
  const fixed = (id: OfficialHolidayId, month: number, day: number) => {
    const date = utc(year, month, day);
    list.push({ id, key: `${snake(id)}-${year}`, startsOn: ymd(date), endsOn: ymd(date), lunar: false });
  };
  fixed('copticChristmas', 1, 7);
  fixed('revolutionJan25', 1, 25);
  fixed('sinaiLiberation', 4, 25);
  fixed('labourDay', 5, 1);
  fixed('revolutionJun30', 6, 30);
  fixed('revolutionJul23', 7, 23);
  fixed('armedForcesDay', 10, 6);
  const shamElNessim = plusDays(orthodoxEaster(year), 1);
  list.push({ id: 'shamElNessim', key: `sham_el_nessim-${year}`, startsOn: ymd(shamElNessim), endsOn: ymd(shamElNessim), lunar: false });

  // The Islamic ones: [id, Hijri month, Hijri day it starts, how many days].
  const lunar: [OfficialHolidayId, number, number, number][] = [
    ['eidAlFitr', 10, 1, 3], // 1–3 Shawwal
    ['eidAlAdha', 12, 9, 4], // Arafat (9 Dhu al-Hijjah) and the three days of the Eid
    ['islamicNewYear', 1, 1, 1], // 1 Muharram
    ['prophetBirthday', 3, 12, 1], // 12 Rabi' al-Awwal
  ];
  for (const [id, month, day, length] of lunar) {
    for (const { date, hijriYear } of hijriDaysIn(year, month, day)) {
      list.push({ id, key: `${snake(id)}-${hijriYear}`, startsOn: ymd(date), endsOn: ymd(plusDays(date, length - 1)), lunar: true });
    }
  }
  return list.sort((a, b) => a.startsOn.localeCompare(b.startsOn));
}

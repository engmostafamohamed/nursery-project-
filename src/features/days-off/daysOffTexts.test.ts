import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { notificationText } from '@/lib/notificationText';
import { missingArabicPlurals, missingTexts, textKeysIn } from '@/test/localeKeys';

import { DAYS_OFF_ERROR_CODES } from './daysOffApi';
import { egyptOfficialHolidays } from './officialHolidays';

describe('days off: texts', () => {
  it('every text the screens name exists in English and Arabic', () => {
    const keys = textKeysIn(
      ['DaysOffSettings.tsx', 'WeeklyDaysOffCard.tsx', 'HolidaysCard.tsx', 'HolidayDialog.tsx', 'OfficialHolidaysDialog.tsx', 'HolidayDates.tsx'].map((f) => path.join(__dirname, f)),
    );
    expect(keys.length).toBeGreaterThan(40);
    expect(missingTexts(keys)).toEqual([]);
  });

  it('and the ones built at run time', () => {
    expect(
      missingTexts([
        'settings.tabs.daysOff',
        ...[...DAYS_OFF_ERROR_CODES.map((c) => c.replace('days_off_', '')), 'network', 'failed'].map((c) => `daysOff.errors.${c}`),
        ...['nameRequired', 'nameTooLong', 'datesRequired', 'datesInvalid', 'tooLong'].map((p) => `daysOff.problems.${p}`),
        ...['now', 'coming', 'past'].map((s) => `daysOff.holiday.state.${s}`),
        ...egyptOfficialHolidays(2027).map((h) => `daysOff.official.${h.id}`),
        ...['nursery_holiday', 'nursery_holiday_range', 'nursery_holiday_cancelled', 'nursery_week_changed'].flatMap((k) => [`notificationTemplates.${k}.title`, `notificationTemplates.${k}.body`]),
      ]),
    ).toEqual([]);
    expect(missingArabicPlurals(['daysOff.days', 'daysOff.week.summary', 'daysOff.holidays.count', 'daysOff.official.add', 'daysOff.official.added'])).toEqual([]);
  });

  it('the families and staff read the notices in their language', () => {
    const name = { ar: 'عيد الفطر', en: 'Eid al-Fitr' };
    const range = notificationText({ template_key: 'nursery_holiday_range', template_params: { name, from_date: '2027-03-09', to_date: '2027-03-11' } }, 'en');
    expect(range.title).toBe('Days off: Eid al-Fitr');
    expect(range.body).toMatch(/^The nursery is closed from .*9.* to .*11.*\.$/);
    expect(notificationText({ template_key: 'nursery_holiday', template_params: { name, from_date: '2027-03-09' } }, 'ar').title).toBe('إجازة: عيد الفطر');
    expect(notificationText({ template_key: 'nursery_week_changed', template_params: { days: { ar: 'الأحد، الاثنين', en: 'Sunday, Monday' } } }, 'en').body).toBe(
      'The nursery now opens on Sunday, Monday.',
    );
  });
});

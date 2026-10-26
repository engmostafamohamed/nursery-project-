// The daily report as the family receives it: a report row (from the parent's list or the teacher's
// history) becomes the card the template shows — the child of that day, the sender, the answers —
// and the history's periods are the ones the server accepts.
import { describe, expect, it } from 'vitest';

import i18n from '@/lib/i18n';

import { mealPortions } from './dailyReport';
import { cardFromRow, childNameOf, classNameOf, senderOfRow } from './dailyReportCard';
import { defaultHistoryFilters, historyFiltered, historyRange } from './dailyReportHistory';
import { napDurationText } from './dailyReportLabels';

const row = {
  report_id: 'r1',
  child_id: 'c1',
  full_name_ar: 'ليلى',
  full_name_en: 'Laila',
  avatar_url: null,
  child_code: 'CH-2026-00042',
  class_name_ar: 'الفراشات',
  class_name_en: 'Butterflies',
  report_date: '2026-10-25',
  published_at: '2026-10-25T13:40:00Z',
  meals_json: { breakfast: { amount: 'quarter' }, lunch: { amount: 'some' }, snacks: { amount: 'all' } },
  nap_json: { napped: true, duration_minutes: 150, quality: 'good' },
  mood_json: { mood: 'happy' },
  toilet_json: { change_count: 3 },
  activities_json: { tags: ['art', 'music'] },
  feeding_json: {},
  special_notes: 'Extra clothes, please',
  sender_name_ar: 'نادية',
  sender_name_en: 'Nadia',
  sender_role: 'teacher',
  sender_role_title_ar: null,
  sender_role_title_en: 'Head of teachers',
  sender_department: null,
  sender_class_role: 'lead',
};

describe('a report row as the family\'s card', () => {
  it('keeps the child of that day, the day and when it was sent', () => {
    const card = cardFromRow(row);
    expect(card).toMatchObject({
      id: 'r1',
      childId: 'c1',
      childCode: 'CH-2026-00042',
      reportDate: '2026-10-25',
      publishedAt: '2026-10-25T13:40:00Z',
    });
    expect(childNameOf(card, 'ar')).toBe('ليلى');
    expect(classNameOf(card, 'en')).toBe('Butterflies');
  });

  it('reads the answers the same way as the editor (an old "some" is half the plate)', () => {
    const a = cardFromRow(row).answers;
    expect([a.meals.breakfast.amount, a.meals.lunch.amount, a.meals.snacks.amount]).toEqual(['quarter', 'half', 'all']);
    expect([mealPortions(a.meals.breakfast.amount), mealPortions(a.meals.lunch.amount), mealPortions(a.meals.snacks.amount)]).toEqual([1, 2, 4]);
    expect(a.nap).toMatchObject({ napped: true, durationMinutes: 150, quality: 'good' });
    expect(a.specialNotes).toBe('Extra clothes, please');
  });

  it('the sender\'s classes are the report\'s class', () => {
    expect(senderOfRow(row)).toEqual({
      sender_name_ar: 'نادية',
      sender_name_en: 'Nadia',
      sender_role: 'teacher',
      sender_role_title_ar: null,
      sender_role_title_en: 'Head of teachers',
      sender_department: null,
      sender_class_names_ar: 'الفراشات',
      sender_class_names_en: 'Butterflies',
      sender_class_role: 'lead',
    });
  });

  it('has no sender when nobody is known to have sent it', () => {
    expect(cardFromRow({ ...row, sender_role: null }).sender).toBeNull();
  });

  it('takes the id of either reader (get_parent_daily_reports: report_id, get_daily_report: id)', () => {
    const { report_id: _ignored, ...withoutReportId } = row;
    expect(cardFromRow({ ...withoutReportId, id: 'r9' }).id).toBe('r9');
  });

  it('falls back to the other language when a name is missing', () => {
    const card = cardFromRow({ ...row, full_name_ar: '' });
    expect(childNameOf(card, 'ar')).toBe('Laila');
  });
});

describe('a portion of food per quarter of the plate', () => {
  it.each([
    [null, 0],
    ['none', 0],
    ['quarter', 1],
    ['half', 2],
    ['three_quarters', 3],
    ['all', 4],
  ] as const)('%s → %i', (amount, portions) => {
    expect(mealPortions(amount)).toBe(portions);
  });
});

describe('how long a nap was, in words', () => {
  const en = i18n.getFixedT('en');
  const ar = i18n.getFixedT('ar');
  it.each([
    [150, '2 h 30 min', 'ساعتان و30 دقيقة'],
    [60, '1 h', 'ساعة'],
    [45, '45 min', '45 دقيقة'],
    [185, '3 h 5 min', '3 ساعات و5 دقائق'],
  ])('%i minutes', (minutes, english, arabic) => {
    expect(napDurationText(en, minutes)).toBe(english);
    expect(napDurationText(ar, minutes)).toBe(arabic);
  });
});

describe('the history\'s period', () => {
  const today = '2026-10-25';

  it('opens on the last month', () => {
    expect(defaultHistoryFilters(today)).toMatchObject({ mode: 'period', from: '2026-09-25', to: today, classId: '', search: '' });
    expect(historyFiltered(defaultHistoryFilters(today), today)).toBe(false);
  });

  it('one day is from and to that day', () => {
    expect(historyRange({ mode: 'day', day: '2026-10-01', from: '', to: '' })).toEqual({ from: '2026-10-01', to: '2026-10-01' });
  });

  it.each([
    ['a period', '2026-01-01', '2026-10-25', true],
    ['a year to the day', '2025-10-25', '2026-10-25', true],
    ['more than a year', '2025-10-23', '2026-10-25', false],
    ['backwards', '2026-10-25', '2026-10-01', false],
    ['an unfinished date', '2026-10', '2026-10-25', false],
  ])('%s → %s', (_label, from, to, valid) => {
    expect(historyRange({ mode: 'period', day: '', from, to }) !== null).toBe(valid);
  });

  it('a changed filter shows the Clear button', () => {
    expect(historyFiltered({ ...defaultHistoryFilters(today), search: 'lai' }, today)).toBe(true);
  });
});

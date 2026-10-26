// The daily report screens (the teacher's list and editor, the alarm, the send rate for the admin and
// the head of teachers): every text they show exists in English and Arabic, and so do the server's
// refusals and the notifications it sends (the report to the family, the reminder to the teacher).
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { MEAL_AMOUNTS, QUESTIONS } from '@/lib/dailyReport';

import ar from './ar.json';
import en from './en.json';

const files = [
  '../pages/teacher/TeacherDailyReportPage.tsx',
  '../pages/teacher/TeacherDailyReportEditorPage.tsx',
  '../pages/admin/DailyReportRatesPage.tsx',
  '../components/daily-reports/DailyReportQuestions.tsx',
  '../components/daily-reports/ReportDueBanner.tsx',
  '../components/daily-reports/ReportRateCard.tsx',
  '../components/daily-reports/CompletionBar.tsx',
  '../lib/dailyReportLabels.ts',
  '../pages/teacher/TeacherHomePage.tsx',
  '../components/daily-reports/DailyReportSheet.tsx',
  '../components/daily-reports/DailyReportHistory.tsx',
  '../components/daily-reports/MealAmountSlider.tsx',
  '../components/parent/ParentReportDetailModal.tsx',
  '../pages/parent/ParentDailyReportsPage.tsx',
];

function lookup(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
}

describe('daily reports', () => {
  it.each(files)('every key %s uses exists in English and Arabic', (file) => {
    const code = readFileSync(path.resolve(__dirname, file), 'utf8');
    const keys = [...new Set([...code.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]))];
    expect(keys.length).toBeGreaterThan(0);
    const missing = keys.flatMap((key) => {
      const exists = (dict: unknown) => typeof lookup(dict, key) === 'string' || typeof lookup(dict, `${key}_other`) === 'string';
      return [...(exists(en) ? [] : [`en: ${key}`]), ...(exists(ar) ? [] : [`ar: ${key}`])];
    });
    expect(missing).toEqual([]);
  });

  it("the server's refusals and every question have their words", () => {
    for (const dict of [en, ar]) {
      for (const code of ['child_not_in_your_class', 'already_sent', 'date_invalid', 'incomplete', 'none_selected', 'forbidden', 'child_not_found', 'search_invalid', 'failed']) {
        expect(typeof lookup(dict, `dailyReport.errors.${code}`), code).toBe('string');
      }
      for (const q of QUESTIONS) expect(typeof lookup(dict, `dailyReport.questions.${q}`), q).toBe('string');
      for (const tag of ['art', 'outdoor', 'reading', 'music', 'circle_time', 'story_time', 'sensory_play', 'free_play', 'other']) {
        expect(typeof lookup(dict, `reports.daily.options.activities.${tag}`), tag).toBe('string');
      }
    }
  });

  it('the notifications the server sends have their words, with every value they use', () => {
    for (const dict of [en, ar]) {
      expect(lookup(dict, 'notificationTemplates.daily_report_sent.title')).toContain('{{child}}');
      expect(lookup(dict, 'notificationTemplates.daily_report_sent.body')).toContain('{{date}}');
      expect(lookup(dict, 'notificationTemplates.daily_report_reminder.title')).toContain('{{due_time}}');
      expect(lookup(dict, 'notificationTemplates.daily_report_reminder.body')).toContain('{{count}}');
      // A sent report names who sent it.
      expect(lookup(dict, 'notificationTemplates.daily_report_sent_by.title')).toContain('{{child}}');
      expect(lookup(dict, 'notificationTemplates.daily_report_sent_by.body')).toContain('{{sender}}');
      expect(lookup(dict, 'notificationTemplates.daily_report_sent_by.body')).toContain('{{date}}');
    }
  });

  it('every meal amount, a quarter of the plate at a time, has its words (and the old "some" is gone)', () => {
    for (const dict of [en, ar]) {
      for (const amount of MEAL_AMOUNTS) expect(typeof lookup(dict, `reports.daily.options.mealAmount.${amount}`), amount).toBe('string');
      expect(lookup(dict, 'reports.daily.options.mealAmount.some')).toBeUndefined();
    }
  });

  it('counts read right in Arabic: every plural form of hours, minutes, visits and reports', () => {
    for (const key of ['dailyReport.sheet.hours', 'dailyReport.sheet.minutes', 'dailyReport.sheet.toiletCount', 'dailyReport.sheet.nursing', 'dailyReport.history.count']) {
      for (const form of ['zero', 'one', 'two', 'few', 'many', 'other']) expect(typeof lookup(ar, `${key}_${form}`), `${key}_${form}`).toBe('string');
      for (const form of ['one', 'other']) expect(typeof lookup(en, `${key}_${form}`), `en ${key}_${form}`).toBe('string');
    }
  });

  it('the menu names', () => {
    for (const dict of [en, ar]) {
      for (const key of ['admin.nav.dailyReportRates', 'teacher.nav.reportRates', 'teacher.nav.dailyReports']) expect(typeof lookup(dict, key), key).toBe('string');
    }
  });
});

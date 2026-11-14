import { describe, expect, it } from 'vitest';

import { hasTemplate, TASK_TEMPLATES, templateArgs } from './staffTaskTemplates';

describe('ready-made staff tasks', () => {
  it('each is a valid task for every teacher, saved with both titles', () => {
    for (const tpl of TASK_TEMPLATES) {
      const args = templateArgs(tpl, { titleAr: 'عنوان', titleEn: 'Title', instructions: 'Do it' }, 'n1', '2026-11-14');
      expect(args).toMatchObject({ nursery_id: 'n1', title_ar: 'عنوان', title_en: 'Title', assign_to: 'teachers', starts_on: '2026-11-14' });
      if (tpl.repeats === 'weekly') expect(args.days_of_week.length).toBeGreaterThan(0);
      if (tpl.repeats === 'monthly') expect(args.day_of_month).toBeGreaterThan(0);
      expect(args.due_time).toMatch(/^\d{2}:\d{2}$/);
    }
    expect(TASK_TEMPLATES.map((t) => t.id)).toEqual(['opening', 'closing', 'weeklyClean', 'fireDrill']);
  });

  it('knows one already added, by either title', () => {
    const tasks = [{ title_ar: null, title_en: ' Opening checklist ' }];
    expect(hasTemplate(tasks, { ar: 'قائمة فتح الحضانة', en: 'Opening checklist' })).toBe(true);
    expect(hasTemplate(tasks, { ar: 'قائمة إغلاق الحضانة', en: 'Closing checklist' })).toBe(false);
  });
});

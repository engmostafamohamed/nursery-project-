import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { notificationText } from '@/lib/notificationText';
import { missingArabicPlurals, missingTexts, textKeysIn } from '@/test/localeKeys';

import { ASSIGN_TO, COMPLETION, REPEATS, TASK_CATEGORIES } from './staffTasks';
import { STAFF_TASK_ERROR_CODES } from './staffTasksApi';

const dir = path.resolve(__dirname);

describe('staff task texts', () => {
  it('every text the screens name exists in English and Arabic', () => {
    const keys = textKeysIn([
      ...['TaskItemCheck.tsx', 'MyTaskChecklist.tsx', 'MyTasksTodayCard.tsx', 'TaskBoard.tsx', 'TaskList.tsx', 'StaffTaskFormDialog.tsx'].map((f) => path.join(dir, f)),
      path.resolve(dir, '../../pages/admin/AdminStaffTasksPage.tsx'),
    ]);
    expect(keys.length).toBeGreaterThan(60);
    expect(missingTexts(keys)).toEqual([]);
  });

  it('and the ones built at run time', () => {
    expect(
      missingTexts([
        ...TASK_CATEGORIES.map((c) => `staffTasks.categories.${c}`),
        ...ASSIGN_TO.flatMap((a) => [`staffTasks.assignTo.${a}`, `staffTasks.assignTo.${a}Hint`]),
        ...COMPLETION.flatMap((c) => [`staffTasks.completion.${c}`, `staffTasks.completion.${c}Hint`]),
        ...REPEATS.map((r) => `staffTasks.repeats.${r}`),
        ...['teacher', 'manager', 'branch_admin'].map((r) => `staffTasks.roles.${r}`),
        ...['all', 'late', 'todo', 'done'].map((f) => `staffTasks.filters.${f}`),
        ...[...STAFF_TASK_ERROR_CODES, 'network', 'failed'].map((c) => `staffTasks.errors.${c}`),
        ...['titleRequired', 'peopleRequired', 'classRequired', 'dateRequired', 'daysRequired', 'dueTimeRequired'].map((c) => `staffTasks.form.errors.${c}`),
        'admin.nav.staffTasks',
        'admin.nav.myTasks',
        'teacher.nav.tasks',
        ...['staff_task_new', 'staff_task_due'].flatMap((k) => [`notificationTemplates.${k}.title`, `notificationTemplates.${k}.body`]),
        ...['staff_tasks_today', 'staff_tasks_missed'].map((k) => `notificationTemplates.${k}.title`),
      ]),
    ).toEqual([]);
  });

  it('the counts have every Arabic plural form', () => {
    expect(
      missingArabicPlurals(['staffTasks.check.covered', 'staffTasks.list.people', 'notificationTemplates.staff_tasks_today.body', 'notificationTemplates.staff_tasks_missed.body']),
    ).toEqual([]);
  });

  it('a person reads how many tasks they have and what is due when; the admin how many were not done', () => {
    const task = { ar: 'مخارج الطوارئ', en: 'Fire exits' };
    expect(notificationText({ template_key: 'staff_tasks_today', template_params: { count: 3 } }, 'en').body).toBe('You have 3 tasks today. Check each off when it is done.');
    expect(notificationText({ template_key: 'staff_tasks_today', template_params: { count: 2 } }, 'ar').body).toContain('مهمتان');
    const due = notificationText({ template_key: 'staff_task_due', template_params: { task, time: '2026-11-14T07:00:00Z', tz: 'Africa/Cairo' } }, 'en');
    expect(due.title).toBe('Due soon: Fire exits');
    expect(due.body).toMatch(/by 9:00/); // 07:00 UTC in Cairo
    const missed = notificationText({ template_key: 'staff_tasks_missed', template_params: { count: 1, date: '2026-11-14' } }, 'en');
    expect(missed.title).toBe('Tasks not done on 14 Nov 2026');
    expect(missed.body).toMatch(/^1 task was not done today/);
  });
});

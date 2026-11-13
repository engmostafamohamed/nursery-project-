import { describe, expect, it } from 'vitest';

import { daySummary, draftOf, groupByTask, itemState, newTaskDraft, shiftDay, taskArgs, taskProblems, type StaffTask } from './staffTasks';

const now = new Date('2026-11-14T10:00:00Z');
const item = (task: string, status: 'pending' | 'done' | 'cancelled', due: string) => ({ task_id: task, status, due_at: due });

describe('where a task item stands', () => {
  it('done, late past its due time, to do, or no longer due', () => {
    expect(itemState(item('a', 'done', '2026-11-14T08:00:00Z'), now)).toBe('done');
    expect(itemState(item('a', 'pending', '2026-11-14T08:00:00Z'), now)).toBe('late');
    expect(itemState(item('a', 'pending', '2026-11-14T12:00:00Z'), now)).toBe('todo');
    expect(itemState(item('a', 'cancelled', '2026-11-14T08:00:00Z'), now)).toBe('cancelled');
  });
});

describe('the day\'s board', () => {
  const items = [
    item('fire', 'done', '2026-11-14T08:00:00Z'),
    item('fire', 'pending', '2026-11-14T08:00:00Z'),
    item('tidy', 'done', '2026-11-14T12:00:00Z'),
    item('tidy', 'done', '2026-11-14T12:00:00Z'),
    item('sheet', 'pending', '2026-11-14T12:00:00Z'),
    item('sheet', 'cancelled', '2026-11-14T12:00:00Z'),
  ];

  it('counts what is due (not the cancelled ones): done, to do, late and the share done', () => {
    expect(daySummary(items, now)).toEqual({ total: 5, done: 3, todo: 1, late: 1, rate: 60 });
    expect(daySummary([], now).rate).toBe(0);
  });

  it('groups by task, the ones with work left first, late people on top', () => {
    const groups = groupByTask(items, now);
    expect(groups.map((g) => [g.taskId, `${g.done}/${g.total}`])).toEqual([
      ['fire', '1/2'],
      ['sheet', '0/1'],
      ['tidy', '2/2'],
    ]);
    expect(groups[0].items.map((i) => i.status)).toEqual(['pending', 'done']);
  });
});

describe('the task form', () => {
  it('starts as a daily task for every teacher, due at noon', () => {
    const d = newTaskDraft('2026-11-14');
    expect([d.assignTo, d.repeats, d.dueTime, d.completion, d.photoRequired]).toEqual(['teachers', 'daily', '12:00', 'each', false]);
  });

  it('asks for a title, the people, the class, the date or the days the choice needs', () => {
    const d = newTaskDraft('2026-11-14');
    expect(taskProblems({ ...d, title: 'Tidy' })).toEqual({});
    expect(taskProblems({ ...d, title: ' ', assignTo: 'people', repeats: 'weekly' })).toEqual({ title: 'titleRequired', people: 'peopleRequired', days: 'daysRequired' });
    expect(taskProblems({ ...d, title: 'x', assignTo: 'class_team', repeats: 'once', onDate: '', dueTime: '' })).toEqual({
      class: 'classRequired',
      onDate: 'dateRequired',
      dueTime: 'dueTimeRequired',
    });
  });

  it('sends only what the choices use, the title in its language (keeping the other one)', () => {
    const d = { ...newTaskDraft('2026-11-14'), title: ' Fire exits ', assignTo: 'people' as const, people: ['a', 'a', 'b'], repeats: 'weekly' as const, days: [4, 1, 1], classId: 'c' };
    const args = taskArgs(d, 'n1', false, { ar: 'مخارج', en: 'old' });
    expect([args.title_en, args.title_ar, args.assignee_ids, args.class_id, args.days_of_week, args.on_date, args.day_of_month]).toEqual([
      'Fire exits', 'مخارج', ['a', 'b'], null, [1, 4], null, null,
    ]);
  });

  it('reads a saved task back into the form', () => {
    const task = { title_ar: 'مهمة', title_en: null, due_time: '09:30:00', assignee_ids: ['a'], days_of_week: [2], day_of_month: null, on_date: null, ends_on: null } as unknown as StaffTask;
    const d = draftOf({ ...task, instructions: null, category: 'safety', assign_to: 'people', class_id: null, completion: 'any', photo_required: true, repeats: 'weekly' } as StaffTask, false, '2026-11-14');
    expect([d.title, d.dueTime, d.people, d.days, d.completion, d.photoRequired]).toEqual(['مهمة', '09:30', ['a'], [2], 'any', true]);
  });

  it('moves a day back and forth', () => {
    expect(shiftDay('2026-11-30', 1)).toBe('2026-12-01');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
  });
});

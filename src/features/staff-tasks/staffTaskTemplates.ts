import type { AssignTo, Completion, Repeats, StaffTask, TaskCategory } from './staffTasks';

/**
 * Ready-made tasks the admin adds with one click (and can change after): opening and closing the
 * nursery, the weekly deep clean, the monthly fire drill. Their texts are in
 * staffTasks.templates.<id>.{title,instructions}, saved in both languages.
 */
export type TaskTemplate = {
  id: 'opening' | 'closing' | 'weeklyClean' | 'fireDrill';
  icon: string;
  category: TaskCategory;
  assign_to: AssignTo;
  completion: Completion;
  photo_required: boolean;
  repeats: Repeats;
  days_of_week: number[];
  day_of_month: number | null;
  due_time: string;
};

export const TASK_TEMPLATES: TaskTemplate[] = [
  { id: 'opening', icon: 'door_open', category: 'safety', assign_to: 'teachers', completion: 'any', photo_required: false, repeats: 'daily', days_of_week: [], day_of_month: null, due_time: '07:30' },
  { id: 'closing', icon: 'lock', category: 'safety', assign_to: 'teachers', completion: 'any', photo_required: false, repeats: 'daily', days_of_week: [], day_of_month: null, due_time: '17:00' },
  { id: 'weeklyClean', icon: 'cleaning_services', category: 'cleaning', assign_to: 'teachers', completion: 'each', photo_required: true, repeats: 'weekly', days_of_week: [4], day_of_month: null, due_time: '15:00' },
  { id: 'fireDrill', icon: 'local_fire_department', category: 'safety', assign_to: 'teachers', completion: 'each', photo_required: true, repeats: 'monthly', days_of_week: [], day_of_month: 1, due_time: '11:00' },
];

/** What staff_task_save gets for a template, with its title in both languages. */
export function templateArgs(
  template: TaskTemplate,
  texts: { titleAr: string; titleEn: string; instructions: string },
  nurseryId: string,
  today: string,
) {
  return {
    nursery_id: nurseryId,
    title_ar: texts.titleAr,
    title_en: texts.titleEn,
    instructions: texts.instructions,
    category: template.category,
    assign_to: template.assign_to,
    assignee_ids: [],
    class_id: null,
    completion: template.completion,
    photo_required: template.photo_required,
    repeats: template.repeats,
    on_date: null,
    days_of_week: template.days_of_week,
    day_of_month: template.day_of_month,
    due_time: template.due_time,
    starts_on: today,
    ends_on: null,
  };
}

/** Whether the nursery already has the template's task (by its title in either language). */
export function hasTemplate(tasks: Pick<StaffTask, 'title_ar' | 'title_en'>[], titles: { ar: string; en: string }): boolean {
  const norm = (s: string | null) => (s ?? '').trim().toLowerCase();
  return tasks.some((task) => norm(task.title_ar) === norm(titles.ar) || norm(task.title_en) === norm(titles.en));
}

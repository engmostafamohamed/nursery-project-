/*
 * Staff tasks as plain rules: what a task is, where an item stands, the board's counts and groups,
 * and the task form's draft (its starting values, what is missing, what goes to the server).
 */

export const TASK_CATEGORIES = ['classroom', 'cleaning', 'safety', 'paperwork', 'kitchen', 'other'] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];
export const CATEGORY_ICON: Record<TaskCategory, string> = {
  classroom: 'school',
  cleaning: 'cleaning_services',
  safety: 'health_and_safety',
  paperwork: 'description',
  kitchen: 'restaurant',
  other: 'task_alt',
};

export const ASSIGN_TO = ['people', 'teachers', 'class_team'] as const;
export type AssignTo = (typeof ASSIGN_TO)[number];
export const REPEATS = ['daily', 'weekly', 'monthly', 'once'] as const;
export type Repeats = (typeof REPEATS)[number];
export const COMPLETION = ['each', 'any'] as const;
export type Completion = (typeof COMPLETION)[number];

export type StaffTask = {
  id: string;
  nursery_id: string;
  title_ar: string | null;
  title_en: string | null;
  instructions: string | null;
  category: TaskCategory;
  assign_to: AssignTo;
  assignee_ids: string[];
  class_id: string | null;
  completion: Completion;
  photo_required: boolean;
  repeats: Repeats;
  on_date: string | null;
  days_of_week: number[];
  day_of_month: number | null;
  due_time: string;
  starts_on: string;
  ends_on: string | null;
  paused: boolean;
};

export type ItemStatus = 'pending' | 'done' | 'cancelled';

export type StaffTaskItem = {
  id: string;
  task_id: string;
  nursery_id: string;
  due_on: string;
  due_at: string;
  assignee_id: string;
  status: ItemStatus;
  done_at: string | null;
  done_by: string | null;
  note: string | null;
  photo_path: string | null;
};

/** Where an item stands: done, late (past its due time), to do, or no longer due. */
export type ItemState = 'done' | 'late' | 'todo' | 'cancelled';

export function itemState(item: Pick<StaffTaskItem, 'status' | 'due_at'>, now: Date = new Date()): ItemState {
  if (item.status === 'done') return 'done';
  if (item.status === 'cancelled') return 'cancelled';
  return new Date(item.due_at).getTime() < now.getTime() ? 'late' : 'todo';
}

/** A day's counts (cancelled items left out): how many, done, to do, late, and the share done. */
export function daySummary(items: Pick<StaffTaskItem, 'status' | 'due_at'>[], now: Date = new Date()) {
  const live = items.filter((i) => i.status !== 'cancelled');
  const states = live.map((i) => itemState(i, now));
  const done = states.filter((s) => s === 'done').length;
  return {
    total: live.length,
    done,
    todo: states.filter((s) => s === 'todo').length,
    late: states.filter((s) => s === 'late').length,
    rate: live.length ? Math.round((done / live.length) * 100) : 0,
  };
}

export type TaskGroup<I> = { taskId: string; items: I[]; done: number; total: number };

/** The board by task: each task with its people's items (late ones first), the tasks with work left first. */
export function groupByTask<I extends Pick<StaffTaskItem, 'task_id' | 'status' | 'due_at'>>(items: I[], now: Date = new Date()): TaskGroup<I>[] {
  const rank: Record<ItemState, number> = { late: 0, todo: 1, done: 2, cancelled: 3 };
  const byTask = new Map<string, I[]>();
  for (const item of items) byTask.set(item.task_id, [...(byTask.get(item.task_id) ?? []), item]);
  return [...byTask.entries()]
    .map(([taskId, list]) => {
      const live = list.filter((i) => i.status !== 'cancelled');
      return {
        taskId,
        items: [...list].sort((a, b) => rank[itemState(a, now)] - rank[itemState(b, now)]),
        done: live.filter((i) => i.status === 'done').length,
        total: live.length,
      };
    })
    .filter((g) => g.items.length > 0)
    .sort((a, b) => (a.done === a.total ? 1 : 0) - (b.done === b.total ? 1 : 0));
}

/** The form's draft of a task. */
export type TaskDraft = {
  title: string;
  instructions: string;
  category: TaskCategory;
  assignTo: AssignTo;
  people: string[];
  classId: string;
  completion: Completion;
  photoRequired: boolean;
  repeats: Repeats;
  onDate: string;
  days: number[];
  dayOfMonth: number;
  dueTime: string;
  endsOn: string;
};

export type TaskProblem = 'titleRequired' | 'peopleRequired' | 'classRequired' | 'dateRequired' | 'daysRequired' | 'dueTimeRequired';
export type TaskField = 'title' | 'people' | 'class' | 'onDate' | 'days' | 'dueTime';

export function newTaskDraft(today: string): TaskDraft {
  return {
    title: '',
    instructions: '',
    category: 'classroom',
    assignTo: 'teachers',
    people: [],
    classId: '',
    completion: 'each',
    photoRequired: false,
    repeats: 'daily',
    onDate: today,
    days: [],
    dayOfMonth: 1,
    dueTime: '12:00',
    endsOn: '',
  };
}

/** A saved task back in the form. */
export function draftOf(task: StaffTask, isAr: boolean, today: string): TaskDraft {
  return {
    title: (isAr ? task.title_ar || task.title_en : task.title_en || task.title_ar) ?? '',
    instructions: task.instructions ?? '',
    category: task.category,
    assignTo: task.assign_to,
    people: [...task.assignee_ids],
    classId: task.class_id ?? '',
    completion: task.completion,
    photoRequired: task.photo_required,
    repeats: task.repeats,
    onDate: task.on_date ?? today,
    days: [...task.days_of_week],
    dayOfMonth: task.day_of_month ?? 1,
    dueTime: task.due_time.slice(0, 5),
    endsOn: task.ends_on ?? '',
  };
}

export function taskProblems(draft: TaskDraft): Partial<Record<TaskField, TaskProblem>> {
  const problems: Partial<Record<TaskField, TaskProblem>> = {};
  if (!draft.title.trim()) problems.title = 'titleRequired';
  if (draft.assignTo === 'people' && draft.people.length === 0) problems.people = 'peopleRequired';
  if (draft.assignTo === 'class_team' && !draft.classId) problems.class = 'classRequired';
  if (draft.repeats === 'once' && !draft.onDate) problems.onDate = 'dateRequired';
  if (draft.repeats === 'weekly' && draft.days.length === 0) problems.days = 'daysRequired';
  if (!/^\d{2}:\d{2}$/.test(draft.dueTime)) problems.dueTime = 'dueTimeRequired';
  return problems;
}

/** What the server saves (staff_task_save): the title in the language it was written in. */
export function taskArgs(draft: TaskDraft, nurseryId: string, isAr: boolean, keepOtherTitle: { ar: string | null; en: string | null } | null = null) {
  const title = draft.title.trim();
  return {
    nursery_id: nurseryId,
    title_ar: isAr ? title : keepOtherTitle?.ar ?? null,
    title_en: isAr ? keepOtherTitle?.en ?? null : title,
    instructions: draft.instructions.trim() || null,
    category: draft.category,
    assign_to: draft.assignTo,
    assignee_ids: draft.assignTo === 'people' ? [...new Set(draft.people)] : [],
    class_id: draft.assignTo === 'class_team' ? draft.classId : null,
    completion: draft.completion,
    photo_required: draft.photoRequired,
    repeats: draft.repeats,
    on_date: draft.repeats === 'once' ? draft.onDate : null,
    days_of_week: draft.repeats === 'weekly' ? [...new Set(draft.days)].sort((a, b) => a - b) : [],
    day_of_month: draft.repeats === 'monthly' ? draft.dayOfMonth : null,
    due_time: draft.dueTime,
    ends_on: draft.endsOn || null,
  };
}

/** A local date as YYYY-MM-DD, and the day before or after it. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function shiftDay(day: string, by: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y, (m ?? 1) - 1, (d ?? 1) + by));
}

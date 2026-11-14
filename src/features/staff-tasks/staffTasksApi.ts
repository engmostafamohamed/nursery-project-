import { errorTextKey } from '@/lib/errorCode';
import { compressImageForUpload } from '@/lib/imageCompression';
import { supabase } from '@/lib/supabase';

import type { StaffTask, StaffTaskItem } from './staffTasks';

/*
 * Staff tasks through the server: the tasks and the items are read under their rules (an admin the
 * nursery's, a person their own); every change goes through a function (staff_task_save,
 * staff_task_set_paused, staff_task_delete, staff_task_complete, staff_task_reopen).
 */

type Names = { name_ar: string | null; name_en: string | null };

/** An item with its task and the names of its person and of who did it. */
export type BoardItem = StaffTaskItem & {
  task: Pick<StaffTask, 'id' | 'title_ar' | 'title_en' | 'instructions' | 'category' | 'completion' | 'photo_required' | 'due_time'>;
  assignee: Names | null;
  doer: Names | null;
  covering: Names | null;
};

export type StaffPerson = Names & { id: string; role: string };
export type ClassOption = { id: string; name_ar: string; name_en: string };

const ITEM_COLUMNS =
  'id, task_id, nursery_id, due_on, due_at, assignee_id, status, done_at, done_by, note, photo_path, covering_for, ' +
  'task:staff_tasks(id, title_ar, title_en, instructions, category, completion, photo_required, due_time), ' +
  'assignee:users!staff_task_items_assignee_id_fkey(name_ar, name_en), doer:users!staff_task_items_done_by_fkey(name_ar, name_en), ' +
  'covering:users!staff_task_items_covering_for_fkey(name_ar, name_en)';

/** A nursery's items of a day (the admins' board). */
export async function fetchBoard(nurseryId: string, day: string): Promise<BoardItem[]> {
  const { data, error } = await supabase.from('staff_task_items').select(ITEM_COLUMNS).eq('nursery_id', nurseryId).eq('due_on', day);
  if (error) throw error;
  return (data ?? []) as unknown as BoardItem[];
}

/** The signed-in person's items from a day to another (their checklist). */
export async function fetchMyItems(userId: string, fromDay: string, toDay: string): Promise<BoardItem[]> {
  const { data, error } = await supabase
    .from('staff_task_items')
    .select(ITEM_COLUMNS)
    .eq('assignee_id', userId)
    .gte('due_on', fromDay)
    .lte('due_on', toDay)
    .neq('status', 'cancelled')
    .order('due_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as BoardItem[];
}

/** A nursery's tasks (not deleted), the newest first. */
export async function fetchTasks(nurseryId: string): Promise<StaffTask[]> {
  const { data, error } = await supabase.from('staff_tasks').select('*').eq('nursery_id', nurseryId).is('deleted_at', null).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as StaffTask[];
}

/** Who can be given a task: the nursery's active teachers, managers and admins. */
export async function fetchStaff(nurseryId: string): Promise<StaffPerson[]> {
  const { data, error } = await supabase
    .from('users')
    .select('id, name_ar, name_en, role')
    .eq('nursery_id', nurseryId)
    .in('role', ['teacher', 'manager', 'branch_admin'])
    .eq('status', 'active')
    .order('name_en', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as StaffPerson[];
}

export async function fetchClasses(nurseryId: string): Promise<ClassOption[]> {
  const { data, error } = await supabase.from('classes').select('id, name_ar, name_en').eq('nursery_id', nurseryId).is('deleted_at', null).order('name_en');
  if (error) throw error;
  return (data ?? []) as unknown as ClassOption[];
}

async function call(name: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  return data as unknown;
}

/** Saves a task (new when id is null); today's items follow at once. Returns its id. */
export async function saveTask(taskId: string | null, task: Record<string, unknown>): Promise<string> {
  return String(await call('staff_task_save', { p_task_id: taskId, p_task: task }));
}
export const setTaskPaused = (taskId: string, paused: boolean) => call('staff_task_set_paused', { p_task_id: taskId, p_paused: paused });
export const deleteTask = (taskId: string) => call('staff_task_delete', { p_task_id: taskId });

/** Checks an item off; with "one is enough", the others' items close with it (how many: `covered`). */
export async function completeItem(itemId: string, note: string | null, photoPath: string | null): Promise<{ covered: number }> {
  const r = (await call('staff_task_complete', { p_item_id: itemId, p_note: note, p_photo_path: photoPath })) as { covered?: number } | null;
  return { covered: Number(r?.covered ?? 0) };
}
export const reopenItem = (itemId: string) => call('staff_task_reopen', { p_item_id: itemId });

/** Uploads a proof photo to the item's folder; returns its path. */
export async function uploadProof(nurseryId: string, itemId: string, file: File): Promise<string> {
  const photo = await compressImageForUpload(file, 1);
  const ext = photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${nurseryId}/${itemId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('staff-task-photos').upload(path, photo, { contentType: photo.type || 'image/jpeg' });
  if (error) throw error;
  return path;
}

export async function proofUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('staff-task-photos').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

/** A person's months, newest first: done by them, missed, still open, done late, and the rate. */
export type TaskMonth = { month: string; done: number; missed: number; open: number; done_late: number; rate: number | null };

export async function fetchMonthRates(userId: string, months = 6): Promise<TaskMonth[]> {
  const { data, error } = await supabase.rpc('staff_task_month_rates' as never, { p_user_id: userId, p_months: months } as never);
  if (error) throw error;
  return (data ?? []) as unknown as TaskMonth[];
}

/** Why the server refused. */
export const STAFF_TASK_ERROR_CODES = [
  'staff_task_forbidden',
  'staff_task_not_found',
  'staff_task_title_required',
  'staff_task_too_long',
  'staff_task_category_invalid',
  'staff_task_people_required',
  'staff_task_class_required',
  'staff_task_schedule_invalid',
  'staff_task_due_time_invalid',
  'staff_task_closed',
  'staff_task_not_yet',
  'staff_task_photo_required',
  'staff_task_photo_invalid',
] as const;

export const staffTaskErrorKey = (error: unknown): string => errorTextKey(error, STAFF_TASK_ERROR_CODES, 'staffTasks.errors');

import { errorTextKey } from '@/lib/errorCode';
import { supabase } from '@/lib/supabase';

import type { Holiday } from './daysOff';

/*
 * The days off on the server: the nursery's weekdays (nurseries.working_days) and its holidays
 * (nursery_holidays, read under their rules) are read here; every change goes through a function that
 * checks who may (nursery_set_open_weekdays, nursery_holiday_save, nursery_holidays_add_official,
 * nursery_holiday_remove). Today's tasks and the notices to families and staff follow on the server.
 */

const HOLIDAY_COLUMNS = 'id, nursery_id, name_ar, name_en, starts_on, ends_on, source, official_key, notified_at';

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw error;
  return data as T;
}

/** The nursery's weekdays as stored (any of the formats the shared reader understands). */
export async function fetchWorkingDays(nurseryId: string): Promise<unknown> {
  const { data, error } = await supabase.from('nurseries').select('working_days').eq('id', nurseryId).maybeSingle();
  if (error) throw error;
  return (data as { working_days?: unknown } | null)?.working_days ?? [];
}

/** The nursery's holidays touching a year (not removed), in date order. */
export async function fetchHolidays(nurseryId: string, year: number): Promise<Holiday[]> {
  const { data, error } = await supabase
    .from('nursery_holidays' as never)
    .select(HOLIDAY_COLUMNS)
    .eq('nursery_id', nurseryId)
    .is('deleted_at', null)
    .lte('starts_on', `${year}-12-31`)
    .gte('ends_on', `${year}-01-01`)
    .order('starts_on');
  if (error) throw error;
  return (data ?? []) as unknown as Holiday[];
}

export const saveOpenWeekdays = (nurseryId: string, openDays: number[]) =>
  call<unknown>('nursery_set_open_weekdays', { p_nursery_id: nurseryId, p_open_days: openDays });

export const saveHoliday = (holidayId: string | null, holiday: Record<string, unknown>) =>
  call<string>('nursery_holiday_save', { p_holiday_id: holidayId, p_holiday: holiday });

export const addOfficialHolidays = (nurseryId: string, holidays: Record<string, unknown>[]) =>
  call<number>('nursery_holidays_add_official', { p_nursery_id: nurseryId, p_holidays: holidays });

export const removeHoliday = (holidayId: string) => call<null>('nursery_holiday_remove', { p_holiday_id: holidayId });

export const DAYS_OFF_ERROR_CODES = [
  'days_off_forbidden',
  'days_off_week_invalid',
  'days_off_name_required',
  'days_off_name_too_long',
  'days_off_dates_invalid',
  'days_off_too_long',
  'days_off_duplicate',
  'days_off_not_found',
  'days_off_past',
] as const;

/** The text for a failed save: daysOff.errors.<code without days_off_>, network or failed. */
export const daysOffErrorKey = (error: unknown) => errorTextKey(error, DAYS_OFF_ERROR_CODES, 'daysOff.errors', 'days_off_');

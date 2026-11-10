/*
 * Staff clocking over the network: the signed-in member of staff's day and clocking in or out, and
 * recording someone's day by hand. Every read and write is a database function (the service worker
 * answers table reads from its cache first).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { classProfileKeys } from '@/features/classes/useClassProfile';
import { supabase } from '@/lib/supabase';

import { toMyStaffDay, toStaffDay, type MyStaffDay, type StaffDay } from './staffClock';

const rpc = async (name: string, args?: Record<string, unknown>): Promise<unknown> => {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  return data;
};

export const fetchMyStaffDay = async (): Promise<MyStaffDay> => toMyStaffDay(await rpc('get_my_staff_day'));
export const clockStaff = async (action: 'in' | 'out'): Promise<MyStaffDay> => toMyStaffDay(await rpc('clock_staff', { p_action: action }));

/** Records (or with both times empty, clears) a member of staff's day; times are HH:MM in the nursery's clock. */
export const recordStaffAttendance = async (input: { userId: string; day: string; checkIn: string | null; checkOut: string | null; note?: string }): Promise<StaffDay | null> =>
  toStaffDay(await rpc('record_staff_attendance', {
    p_user_id: input.userId,
    p_day: input.day,
    p_check_in: input.checkIn || null,
    p_check_out: input.checkOut || null,
    p_note: input.note?.trim() || null,
  }));

const CODES = ['staff_clock_forbidden', 'staff_clock_already_in', 'staff_clock_already_out', 'staff_clock_not_in', 'staff_clock_invalid', 'staff_clock_person'] as const;

/** The text key for a failed call (staffClock.errors.<code>). */
export function staffClockErrorKey(error: unknown): string {
  const message = (error as { message?: string } | null)?.message ?? '';
  const hit = CODES.find((c) => message.includes(c));
  if (hit) return `staffClock.errors.${hit.replace('staff_clock_', '')}`;
  if (/failed to fetch|network|load failed/i.test(message)) return 'staffClock.errors.network';
  return 'staffClock.errors.failed';
}

export const myStaffDayKey = ['staff-clock', 'me'] as const;

export function useMyStaffDay(enabled = true) {
  return useQuery({ queryKey: myStaffDayKey, queryFn: fetchMyStaffDay, enabled, staleTime: 30_000 });
}

/** Clocking in or out: the answer is the new day; class pages and staff calendars read again. */
export function useClockStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clockStaff,
    onSuccess: (day) => {
      queryClient.setQueryData(myStaffDayKey, day);
      void queryClient.invalidateQueries({ queryKey: classProfileKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['staff-attendance-month'] });
    },
  });
}

export function useRecordStaffAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: recordStaffAttendance,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: classProfileKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['staff-attendance-month'] });
      void queryClient.invalidateQueries({ queryKey: myStaffDayKey });
    },
  });
}

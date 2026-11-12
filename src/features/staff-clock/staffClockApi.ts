/*
 * Staff clocking over the network: the signed-in member of staff's day and clocking in or out, and
 * recording someone's day by hand. Every read and write is a database function (the service worker
 * answers table reads from its cache first).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { classProfileKeys } from '@/features/classes/useClassProfile';
import { errorTextKey } from '@/lib/errorCode';
import { callRpc } from '@/lib/rpc';

import { toMyStaffDay, toStaffDay, type MyStaffDay, type StaffDay } from './staffClock';


export const fetchMyStaffDay = async (): Promise<MyStaffDay> => toMyStaffDay(await callRpc('get_my_staff_day'));
export const clockStaff = async (action: 'in' | 'out'): Promise<MyStaffDay> => toMyStaffDay(await callRpc('clock_staff', { p_action: action }));

/** Records (or with both times empty, clears) a member of staff's day; times are HH:MM in the nursery's clock. */
export const recordStaffAttendance = async (input: { userId: string; day: string; checkIn: string | null; checkOut: string | null; note?: string }): Promise<StaffDay | null> =>
  toStaffDay(await callRpc('record_staff_attendance', {
    p_user_id: input.userId,
    p_day: input.day,
    p_check_in: input.checkIn || null,
    p_check_out: input.checkOut || null,
    p_note: input.note?.trim() || null,
  }));

const CODES = ['staff_clock_forbidden', 'staff_clock_already_in', 'staff_clock_already_out', 'staff_clock_not_in', 'staff_clock_invalid', 'staff_clock_person'] as const;

/** The text key for a failed call (staffClock.errors.<code without staff_clock_>, network, failed). */
export const staffClockErrorKey = (error: unknown): string => errorTextKey(error, CODES, 'staffClock.errors', 'staff_clock_');

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

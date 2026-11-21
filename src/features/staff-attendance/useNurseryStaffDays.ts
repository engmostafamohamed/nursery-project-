/*
 * The nursery's staff attendance over a span of days, over the network: one call for everybody
 * (get_nursery_staff_days), and the reported absences for the same span read through the hook the
 * absences screen already uses, so "away" and "never came" are told apart without a second source
 * of truth.
 */
import { useQuery } from '@tanstack/react-query';

import { errorTextKey } from '@/lib/errorCode';
import { callRpc } from '@/lib/rpc';

import { toNurseryStaffDays, type NurseryStaffDays } from './staffAttendanceRange';

export const nurseryStaffDaysKeys = {
  all: ['nursery-staff-days'] as const,
  span: (nurseryId: string | null, from: string, to: string) => ['nursery-staff-days', nurseryId ?? 'none', from, to] as const,
};

export const fetchNurseryStaffDays = async (nurseryId: string, from: string, to: string): Promise<NurseryStaffDays> =>
  toNurseryStaffDays(await callRpc('get_nursery_staff_days', { p_nursery_id: nurseryId, p_from: from, p_to: to }));

export function useNurseryStaffDays(nurseryId: string | null | undefined, from: string, to: string) {
  return useQuery({
    queryKey: nurseryStaffDaysKeys.span(nurseryId ?? null, from, to),
    queryFn: () => fetchNurseryStaffDays(nurseryId as string, from, to),
    enabled: Boolean(nurseryId && from && to && to >= from),
    staleTime: 60_000,
  });
}

const CODES = ['staff_clock_forbidden', 'staff_clock_invalid', 'staff_clock_range_too_long'] as const;

/** The text key for a failed read (staffAttendance.errors.<code without staff_clock_>, network, failed). */
export const staffDaysErrorKey = (error: unknown): string => errorTextKey(error, CODES, 'staffAttendance.errors', 'staff_clock_');

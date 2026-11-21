/*
 * The days waiting for the manager over the network: reading the queue for a nursery and settling
 * one. Both are database functions (get_staff_days_to_review, approve_staff_day).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { classProfileKeys } from '@/features/classes/useClassProfile';
import { callRpc } from '@/lib/rpc';

import { myStaffDayKey } from './staffClockApi';
import { toReviewDays, type ReviewDay } from './staffReview';

export const staffReviewKeys = {
  all: ['staff-review'] as const,
  nursery: (nurseryId: string | null) => ['staff-review', nurseryId ?? 'none'] as const,
};

export const fetchStaffDaysToReview = async (nurseryId: string): Promise<ReviewDay[]> =>
  toReviewDays(await callRpc('get_staff_days_to_review', { p_nursery_id: nurseryId }));

/** Settles a day: the times as they really were, in the nursery's clock, and the manager's note. */
export const approveStaffDay = async (input: { id: string; checkIn: string | null; checkOut: string | null; note?: string }) =>
  callRpc('approve_staff_day', {
    p_attendance_id: input.id,
    p_check_in: input.checkIn || null,
    p_check_out: input.checkOut || null,
    p_note: input.note?.trim() || null,
  });

export function useStaffDaysToReview(nurseryId: string | null) {
  return useQuery({
    queryKey: staffReviewKeys.nursery(nurseryId),
    queryFn: () => fetchStaffDaysToReview(nurseryId as string),
    enabled: Boolean(nurseryId),
    staleTime: 60_000,
  });
}

/** Settling a day: the queue, the month and the person's own card all read again. */
export function useApproveStaffDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: approveStaffDay,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: staffReviewKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['staff-attendance-month'] });
      void queryClient.invalidateQueries({ queryKey: classProfileKeys.all });
      void queryClient.invalidateQueries({ queryKey: myStaffDayKey });
    },
  });
}

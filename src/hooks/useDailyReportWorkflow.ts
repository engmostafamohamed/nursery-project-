import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { MyDailyReport, SaveResult, SendResult } from '@/lib/dailyReport';
import { cardFromRow, type DailyReportCard } from '@/lib/dailyReportCard';
import type { DailyReportHistoryRow } from '@/lib/dailyReportHistory';
import type { DailyReportStats } from '@/lib/dailyReportStats';
import type { DateRange } from '@/lib/attendancePeriods';
import { supabase } from '@/lib/supabase';

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw error;
  return data as T;
}

const myDayKey = (userId: string | undefined, day: string | null) => ['my-daily-reports', userId ?? null, day];

/**
 * The teacher's children on a day with how far each report is (get_my_daily_reports); refreshed
 * every minute. Without a day it is the nursery's today, as the server counts it.
 */
export function useMyDailyReports(userId: string | undefined, day: string | null) {
  return useQuery({
    queryKey: myDayKey(userId, day),
    queryFn: async () => (await rpc<MyDailyReport[] | null>('get_my_daily_reports', { p_day: day })) ?? [],
    enabled: Boolean(userId),
    refetchInterval: 60_000,
  });
}

/**
 * One saved report, read once each time the editor opens it (later refetches would overwrite
 * typing). Read through get_daily_report: the service worker answers plain table reads from its
 * cache first, which would reopen the report as it was before the last save. Waits for the
 * signed-in user, so it is never asked before the session is back.
 */
export function useDailyReportRow(userId: string | undefined, childId: string | undefined, day: string | undefined) {
  return useQuery({
    queryKey: ['daily-report-row', userId ?? null, childId ?? null, day ?? null],
    queryFn: async () => (await rpc<Record<string, unknown> | null>('get_daily_report', { p_child_id: childId, p_report_date: day })) ?? null,
    enabled: Boolean(userId && childId && day),
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/** Saves a child's answers as they are (save_daily_report). */
export function useSaveDailyReport() {
  return useMutation({
    mutationFn: (args: { childId: string; day: string; answers: Record<string, unknown> }) =>
      rpc<SaveResult>('save_daily_report', { p_child_id: args.childId, p_report_date: args.day, p_answers: args.answers }),
  });
}

/** Sends the chosen reports to the families; incomplete ones come back with what they miss (send_daily_reports). */
export function useSendDailyReports(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reportIds: string[]) => rpc<SendResult>('send_daily_reports', { p_report_ids: reportIds }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['my-daily-reports', userId ?? null] });
      void qc.invalidateQueries({ queryKey: ['daily-report-stats'] });
      void qc.invalidateQueries({ queryKey: ['daily-report-history', userId ?? null] });
    },
  });
}

/**
 * The sent reports a teacher can look back on, a page at a time (get_daily_report_history). Null
 * `query` (an invalid period) asks for nothing.
 */
export function useDailyReportHistory(
  userId: string | undefined,
  query: { from: string; to: string; classId: string; search: string; limit: number; offset: number } | null,
) {
  return useQuery({
    queryKey: ['daily-report-history', userId ?? null, query],
    queryFn: async () =>
      (await rpc<DailyReportHistoryRow[] | null>('get_daily_report_history', {
        p_from: query!.from,
        p_to: query!.to,
        p_class_id: query!.classId || null,
        p_search: query!.search.trim() || null,
        p_limit: query!.limit,
        p_offset: query!.offset,
      })) ?? [],
    enabled: Boolean(userId && query),
    placeholderData: (previous) => previous,
  });
}

/** One report as the family sees it, with its child and sender (get_daily_report); null when nothing was saved. */
export function useDailyReportCard(userId: string | undefined, childId: string | null, day: string | null) {
  return useQuery({
    queryKey: ['daily-report-card', userId ?? null, childId, day],
    queryFn: async (): Promise<DailyReportCard | null> => {
      const row = await rpc<Record<string, unknown> | null>('get_daily_report', { p_child_id: childId, p_report_date: day });
      return row ? cardFromRow(row) : null;
    },
    enabled: Boolean(userId && childId && day),
  });
}

/** Refreshes the teacher's day after a save, without waiting for the minute. */
export function useRefreshMyDailyReports(userId: string | undefined) {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['my-daily-reports', userId ?? null] });
}

/** The send rate over a period, by teacher, class, day and child (get_daily_report_stats). */
export function useDailyReportStats(
  nurseryId: string | null | undefined,
  range: DateRange | null,
  filters: { classId?: string | null; teacherId?: string | null } = {},
) {
  return useQuery({
    queryKey: ['daily-report-stats', nurseryId ?? null, range?.from ?? null, range?.to ?? null, filters.classId ?? null, filters.teacherId ?? null],
    queryFn: () =>
      rpc<DailyReportStats>('get_daily_report_stats', {
        p_nursery_id: nurseryId,
        p_from: range!.from,
        p_to: range!.to,
        p_class_id: filters.classId || null,
        p_teacher_id: filters.teacherId || null,
      }),
    enabled: Boolean(nurseryId && range),
    placeholderData: (previous) => previous,
  });
}

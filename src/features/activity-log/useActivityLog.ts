/*
 * Reading the record of what was done to a class or to a member of staff. One database function
 * answers a page of lines with the names already resolved, so a page costs one query.
 */
import { useQuery } from '@tanstack/react-query';

import { callRpc } from '@/lib/rpc';

import { toActivityLines, type ActivitySubject } from './activityLog';

export const activityLogKey = (nurseryId: string | null | undefined, subject: ActivitySubject | 'all', subjectId?: string | null) =>
  ['activity-log', nurseryId ?? null, subject, subjectId ?? null] as const;

export function useActivityLog({
  nurseryId,
  subject = 'all',
  subjectId = null,
  limit = 100,
  enabled = true,
}: {
  nurseryId: string | null | undefined;
  subject?: ActivitySubject | 'all';
  /** One class or one person, when the log is read from their own page. */
  subjectId?: string | null;
  limit?: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: activityLogKey(nurseryId, subject, subjectId),
    queryFn: async () =>
      toActivityLines(
        await callRpc('get_activity_log', {
          p_nursery_id: nurseryId,
          p_subject: subject === 'all' ? null : subject,
          p_subject_id: subjectId,
          p_limit: limit,
        }),
      ),
    enabled: enabled && Boolean(nurseryId),
  });
}

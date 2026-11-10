import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { confirm } from '@/components/ui/confirm';
import { EmptyState } from '@/components/ui/EmptyState';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDay } from '@/lib/datetime';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';

import { CancelSessionDialog } from './CancelSessionDialog';
import { canChange, sessionTime, splitSessions, type CourseSession } from './courseSessions';
import { courseSessionErrorKey } from './courseSessionsApi';
import { CourseSessionRow } from './CourseSessionRow';
import { useCourseSessionChanges, useCourseSessions } from './useCourseSessions';

/**
 * A course's sessions, the past week and the next four: the nursery's admins and the course's
 * teacher cancel one (with a reason) or undo it. Used on the admin's course page and the teacher's
 * course card.
 */
export function CourseSessionsPanel({ courseId }: { courseId: string }) {
  const { t } = useTranslation();
  const query = useCourseSessions(courseId, getNurseryCalendarDateString());
  const changes = useCourseSessionChanges(courseId);
  const [cancelling, setCancelling] = useState<string | null>(null);

  if (query.isPending) return <Skeleton className="h-48 rounded-xl" />;
  if (query.isError || !query.data) {
    return <p role="alert" className="rounded-xl border border-error/40 bg-error/5 p-4 text-sm">{t(courseSessionErrorKey(query.error))}</p>;
  }

  const data = query.data;
  const time = sessionTime(data.timeStart, data.timeEnd);
  const { upcoming, past } = splitSessions(data.sessions, data.today);
  const busy = changes.cancel.isPending || changes.restore.isPending;

  const restore = async (session: CourseSession) => {
    const ok = await confirm({
      title: t('courseSessions.restoreTitle', { date: formatDay(session.date, { weekday: 'long', day: 'numeric', month: 'long' }) }),
      description: t('courseSessions.restoreBody'),
      confirmText: t('courseSessions.restore'),
      icon: 'undo',
    });
    if (!ok) return;
    try {
      const { rebilled } = await changes.restore.mutateAsync(session.date);
      toast.success(t('courseSessions.restoreDone'), rebilled ? { description: t('courseSessions.rebilled', { count: rebilled }) } : undefined);
    } catch (error) {
      toast.error(t(courseSessionErrorKey(error)));
    }
  };

  const list = (sessions: CourseSession[]) => (
    <ul className="space-y-2">
      {sessions.map((session) => (
        <CourseSessionRow
          key={session.date}
          session={session}
          time={time}
          isToday={session.date === data.today}
          changeable={canChange(session.date, data)}
          busy={busy}
          onCancel={() => setCancelling(session.date)}
          onRestore={() => void restore(session)}
        />
      ))}
    </ul>
  );

  return (
    <section className="space-y-4" data-testid="course-sessions">
      <p className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-on-surface">
        <MaterialSymbol name="info" size="text-base" className="mt-px shrink-0 text-primary" />
        {t('courseSessions.hint')}
      </p>
      {!data.sessions.length ? (
        <EmptyState icon="event_available" title={t('courseSessions.emptyTitle')} description={t('courseSessions.emptyBody')} />
      ) : (
        <>
          {upcoming.length ? (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{t('courseSessions.upcoming')}</h3>
              {list(upcoming)}
            </div>
          ) : null}
          {past.length ? (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{t('courseSessions.pastWeek')}</h3>
              {list(past)}
            </div>
          ) : null}
        </>
      )}
      {cancelling ? <CancelSessionDialog date={cancelling} cancel={changes.cancel} onClose={() => setCancelling(null)} /> : null}
    </section>
  );
}

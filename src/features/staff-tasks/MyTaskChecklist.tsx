import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { TableCard, TableEmpty } from '@/components/ui/DataTable';
import { LoadError } from '@/components/ui/LoadError';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatTile } from '@/components/ui/StatTile';
import { useAuthSession } from '@/hooks/useAuthSession';

import { daySummary, dayKey, itemState, shiftDay } from './staffTasks';
import { TaskItemCheck } from './TaskItemCheck';
import { useMyTasks } from './useStaffTasks';

/** Late first, then to do, then done. */
const ORDER = { late: 0, todo: 1, done: 2, cancelled: 3 } as const;

/**
 * A staff member's checklist: today's tasks from the admin, to check off as they are done (with a
 * photo when asked), and the ones of the last week still not done.
 */
export function MyTaskChecklist() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const [today] = useState(() => dayKey(new Date()));
  const query = useMyTasks(user?.id, shiftDay(today, -7), today);

  const items = query.data ?? [];
  const todays = items.filter((i) => i.due_on === today).sort((a, b) => ORDER[itemState(a)] - ORDER[itemState(b)] || a.due_at.localeCompare(b.due_at));
  const earlier = items.filter((i) => i.due_on < today && i.status === 'pending');
  const summary = daySummary(todays);

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-8">
      <PageHeader icon="checklist" title={t('staffTasks.mine.title')} description={t('staffTasks.mine.subtitle')}>
        {query.isSuccess ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile icon="checklist" label={t('staffTasks.tiles.today')} value={summary.total} />
            <StatTile icon="task_alt" tone="success" label={t('staffTasks.tiles.done')} value={summary.done} helper={summary.total ? `${summary.rate}%` : undefined} />
            <StatTile icon="pending_actions" tone={summary.todo ? 'warning' : 'neutral'} label={t('staffTasks.tiles.todo')} value={summary.todo} />
            <StatTile icon="alarm" tone={summary.late + earlier.length ? 'error' : 'neutral'} label={t('staffTasks.tiles.late')} value={summary.late + earlier.length} />
          </div>
        ) : null}
      </PageHeader>

      {query.isPending ? (
        <LoadingSkeleton />
      ) : query.isError ? (
        <LoadError message={t('staffTasks.loadError')} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <TableCard title={t('staffTasks.mine.today')} count={summary.total ? `${summary.done}/${summary.total}` : undefined}>
            {summary.total ? (
              <div className="space-y-3 p-4 sm:p-5">
                <div className="h-2 overflow-hidden rounded-full bg-surface-high" role="progressbar" aria-valuenow={summary.rate} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-success transition-all" style={{ width: `${summary.rate}%` }} />
                </div>
                <ul className="space-y-2">
                  {todays.map((item) => (
                    <TaskItemCheck key={item.id} item={item} userId={user?.id ?? ''} today={today} />
                  ))}
                </ul>
              </div>
            ) : (
              <TableEmpty icon="task_alt" title={t('staffTasks.mine.emptyTitle')} description={t('staffTasks.mine.emptyHint')} />
            )}
          </TableCard>

          {earlier.length ? (
            <TableCard title={t('staffTasks.mine.earlier')} count={String(earlier.length)} description={t('staffTasks.mine.earlierHint')}>
              <ul className="space-y-2 p-4 sm:p-5">
                {earlier.map((item) => (
                  <TaskItemCheck key={item.id} item={item} userId={user?.id ?? ''} today={today} />
                ))}
              </ul>
            </TableCard>
          ) : null}
        </>
      )}
    </div>
  );
}

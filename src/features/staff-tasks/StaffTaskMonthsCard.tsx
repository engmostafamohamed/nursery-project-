import { useTranslation } from 'react-i18next';

import { TableCard, TableEmpty, TableLoading } from '@/components/ui/DataTable';
import { LoadError } from '@/components/ui/LoadError';
import { StatTile } from '@/components/ui/StatTile';
import { formatDate } from '@/lib/datetime';
import { cn } from '@/lib/utils';

import { useTaskMonths } from './useStaffTasks';

const rateColor = (rate: number | null) => (rate == null ? 'bg-surface-high' : rate >= 85 ? 'bg-success' : rate >= 60 ? 'bg-warning' : 'bg-error');

/** A person's staff tasks month by month (for HR and the admins): this month's rate and counts, and the last six months. */
export function StaffTaskMonthsCard({ userId, name }: { userId: string; name: string }) {
  const { t } = useTranslation();
  const query = useTaskMonths(userId);
  const months = query.data ?? [];
  const now = months[0];
  const any = months.some((m) => m.done + m.missed + m.open > 0);

  return (
    <TableCard title={t('staffTasks.months.title')} description={t('staffTasks.months.hint', { name })}>
      {query.isError ? (
        <LoadError inset message={t('staffTasks.months.loadError')} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <TableLoading rows={3} />
      ) : !any || !now ? (
        <TableEmpty icon="task_alt" title={t('staffTasks.months.emptyTitle')} description={t('staffTasks.months.emptyHint')} />
      ) : (
        <div className="space-y-5 p-4 sm:p-5" data-testid="staff-task-months">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              icon="percent"
              label={t('staffTasks.months.rate')}
              value={now.rate != null ? t('staffTasks.dashboard.percent', { value: now.rate }) : '—'}
              tone={now.rate == null ? 'neutral' : now.rate >= 85 ? 'success' : now.rate >= 60 ? 'warning' : 'error'}
              helper={formatDate(`${now.month}T00:00:00`, { month: 'long', year: 'numeric' })}
            />
            <StatTile icon="task_alt" label={t('staffTasks.months.done')} value={now.done} tone="success" helper={t('staffTasks.months.doneLate', { count: now.done_late })} />
            <StatTile icon="event_busy" label={t('staffTasks.months.missed')} value={now.missed} tone={now.missed ? 'error' : 'neutral'} />
            <StatTile icon="pending_actions" label={t('staffTasks.months.open')} value={now.open} tone="neutral" />
          </div>
          <ol className="grid grid-cols-6 items-end gap-2" aria-label={t('staffTasks.months.lastMonths')}>
            {[...months].reverse().map((m) => (
              <li key={m.month} className="flex flex-col items-center gap-1 text-center">
                <span className="text-xs font-semibold tabular-nums text-on-surface">{m.rate != null ? `${m.rate}%` : '—'}</span>
                <span className="flex h-24 w-full max-w-10 items-end overflow-hidden rounded-md bg-surface-high">
                  <span className={cn('w-full rounded-md', rateColor(m.rate))} style={{ height: `${Math.max(m.rate ?? 0, 4)}%` }} />
                </span>
                <span className="text-[11px] text-on-surface-variant">{formatDate(`${m.month}T00:00:00`, { month: 'short' })}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </TableCard>
  );
}

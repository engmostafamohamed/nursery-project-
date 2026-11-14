import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';
import { localName } from '@/lib/bilingualName';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { cn } from '@/lib/utils';

import { daySummary, itemState } from './staffTasks';
import { useTaskBoard } from './useStaffTasks';

const SHOWN_LATE = 3;

/** The admin's dashboard: how much of today's staff tasks is done, what is late and by whom; opens the board. */
export function StaffTasksTodayRateCard({ nurseryId, to, className }: { nurseryId: string; to: string; className?: string }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const [today] = useState(() => getNurseryCalendarDateString());
  const query = useTaskBoard(nurseryId, today);
  const items = query.data ?? [];
  const summary = daySummary(items);
  const late = items.filter((i) => itemState(i) === 'late').sort((a, b) => a.due_at.localeCompare(b.due_at)).slice(0, SHOWN_LATE);
  const tone = summary.rate >= 80 ? 'text-success' : summary.rate >= 50 ? 'text-warning' : 'text-error';

  if (query.isError) return null;

  return (
    <section className={cn('flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5', className)} data-testid="staff-tasks-rate">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-on-surface">
            <MaterialSymbol name="task_alt" className="text-primary" />
            {t('staffTasks.dashboard.title')}
          </h2>
          <p className="text-xs text-on-surface-variant">{t('staffTasks.dashboard.subtitle')}</p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to={to}>
            {t('staffTasks.dashboard.open')}
            <MaterialSymbol name="chevron_right" className="ms-1 text-lg rtl:rotate-180" />
          </Link>
        </Button>
      </header>
      {query.isPending ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : summary.total === 0 ? (
        <p className="text-sm text-on-surface-variant">{t('staffTasks.dashboard.nothing')}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
            <p className={cn('font-headline text-4xl font-extrabold tabular-nums', tone)}>{t('staffTasks.dashboard.percent', { value: summary.rate })}</p>
            <p className="pb-1 text-sm text-on-surface-variant">{t('staffTasks.dashboard.counts', { done: summary.done, total: summary.total })}</p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-high" role="progressbar" aria-valuenow={summary.rate} aria-valuemin={0} aria-valuemax={100}>
            <div className={cn('h-full rounded-full', summary.rate >= 80 ? 'bg-success' : summary.rate >= 50 ? 'bg-warning' : 'bg-error')} style={{ width: `${summary.rate}%` }} />
          </div>
          <dl className="grid grid-cols-3 gap-2 text-center text-xs">
            {(
              [
                ['done', summary.done, 'text-success'],
                ['todo', summary.todo, 'text-on-surface'],
                ['late', summary.late, summary.late ? 'text-error' : 'text-on-surface'],
              ] as const
            ).map(([key, value, color]) => (
              <div key={key} className="rounded-lg bg-surface-container-lowest p-2">
                <dt className="text-on-surface-variant">{t(`staffTasks.tiles.${key}`)}</dt>
                <dd className={cn('text-lg font-bold tabular-nums', color)}>{value}</dd>
              </div>
            ))}
          </dl>
          {late.length ? (
            <ul className="space-y-1.5" aria-label={t('staffTasks.tiles.late')}>
              {late.map((item) => (
                <li key={item.id} className="flex items-center gap-2 text-sm">
                  <MaterialSymbol name="schedule" size="text-base" className="text-error" />
                  <span className="min-w-0 flex-1 truncate text-on-surface">{localName(item.task.title_ar, item.task.title_en, isAr)}</span>
                  <span className="shrink-0 text-xs text-on-surface-variant">{localName(item.assignee?.name_ar, item.assignee?.name_en, isAr)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}

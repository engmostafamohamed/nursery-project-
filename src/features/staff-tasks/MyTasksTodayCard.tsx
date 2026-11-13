import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { useAuthSession } from '@/hooks/useAuthSession';

import { daySummary, dayKey, itemState } from './staffTasks';
import { TaskItemCheck } from './TaskItemCheck';
import { useMyTasks } from './useStaffTasks';

/** On the home page: today's tasks done so far, and the next ones to check off (none: nothing shows). */
export function MyTasksTodayCard({ link }: { link: string }) {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const [today] = useState(() => dayKey(new Date()));
  const query = useMyTasks(user?.id, today, today);
  const items = query.data ?? [];
  if (!items.length) return null;

  const summary = daySummary(items);
  const next = items.filter((i) => itemState(i) !== 'done').slice(0, 3);

  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm" data-testid="my-tasks-today">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant bg-surface-container-lowest px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-on-surface">
          <MaterialSymbol name="checklist" size="text-xl" className="text-primary" />
          {t('staffTasks.home.title')}
          <span className="rounded-full bg-surface-high px-2.5 py-0.5 text-xs font-medium tabular-nums text-on-surface-variant">
            {summary.done}/{summary.total}
          </span>
        </h2>
        <Link to={link} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
          {t('staffTasks.home.all')}
          <MaterialSymbol name="arrow_forward" size="text-base" className="rtl:rotate-180" />
        </Link>
      </div>
      <div className="space-y-3 p-4">
        <div className="h-2 overflow-hidden rounded-full bg-surface-high">
          <div className="h-full rounded-full bg-success transition-all" style={{ width: `${summary.rate}%` }} />
        </div>
        {next.length ? (
          <ul className="space-y-2">
            {next.map((item) => (
              <TaskItemCheck key={item.id} item={item} userId={user?.id ?? ''} today={today} compact />
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-sm font-medium text-success">
            <MaterialSymbol name="celebration" size="text-lg" />
            {t('staffTasks.home.allDone')}
          </p>
        )}
      </div>
    </section>
  );
}

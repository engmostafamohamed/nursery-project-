import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { StatusPill, TableCard, TableEmpty } from '@/components/ui/DataTable';
import { FilterChips } from '@/components/ui/FilterChips';
import { LoadError } from '@/components/ui/LoadError';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { StatTile } from '@/components/ui/StatTile';
import { TONE_TINT } from '@/components/ui/toneClasses';
import { useSearchParam } from '@/hooks/useSearchParam';
import { localName } from '@/lib/bilingualName';
import { cn } from '@/lib/utils';

import { CATEGORY_ICON, daySummary, dayKey, groupByTask, itemState, shiftDay, type ItemState } from './staffTasks';
import { proofUrl, type BoardItem } from './staffTasksApi';
import { useTaskBoard } from './useStaffTasks';

const FILTERS = ['all', 'late', 'todo', 'done'] as const;
type Filter = (typeof FILTERS)[number];

const STATE_PILL: Record<Exclude<ItemState, 'cancelled'>, { tone: 'success' | 'warning' | 'error'; icon: string }> = {
  done: { tone: 'success', icon: 'task_alt' },
  todo: { tone: 'warning', icon: 'pending_actions' },
  late: { tone: 'error', icon: 'alarm' },
};

/**
 * A day's tasks for the admins: how much is done, what is still to do and what is late, by task
 * with each person (done by whom and when, their note, their photo). The day is kept in the
 * address, so the end-of-day notice opens it.
 */
export function TaskBoard({ nurseryId }: { nurseryId: string }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const locale = isAr ? 'ar-EG' : 'en-GB';
  const [today] = useState(() => dayKey(new Date()));
  const [dayParam, setDay] = useSearchParam('day', today);
  const day = dayParam ?? today;
  const [filter, setFilter] = useState<Filter>('all');
  const query = useTaskBoard(nurseryId, day);

  const items = useMemo(() => (query.data ?? []).filter((i) => i.status !== 'cancelled'), [query.data]);
  const summary = daySummary(items);
  const counts: Record<Filter, number> = { all: summary.total, late: summary.late, todo: summary.todo, done: summary.done };
  const shown = filter === 'all' ? items : items.filter((i) => itemState(i) === filter);
  const groups = groupByTask(shown);
  // A task's header counts all its people, whatever the filter shows.
  const totals = new Map(groupByTask(items).map((g) => [g.taskId, g]));
  const byTask = new Map(items.map((i) => [i.task_id, i.task]));
  const clock = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true });
  const dayLabel = new Date(`${day}T00:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });

  const openPhoto = async (path: string) => {
    try {
      window.open(await proofUrl(path), '_blank', 'noopener');
    } catch {
      toast.error(t('staffTasks.board.photoError'));
    }
  };

  const person = (item: BoardItem) => {
    const state = itemState(item) as Exclude<ItemState, 'cancelled'>;
    const name = localName(item.assignee?.name_ar, item.assignee?.name_en, isAr);
    const doer = localName(item.doer?.name_ar, item.doer?.name_en, isAr);
    return (
      <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:px-5" data-testid="board-row">
        <span className="min-w-0 flex-1 text-sm font-medium text-on-surface">
          {name}
          {item.covering ? (
            <span className="ms-2 text-xs font-normal text-on-surface-variant">
              {t('staffTasks.cover.for', { name: localName(item.covering.name_ar, item.covering.name_en, isAr) })}
            </span>
          ) : null}
        </span>
        <StatusPill tone={STATE_PILL[state].tone} icon={STATE_PILL[state].icon}>
          {state === 'done'
            ? item.done_by && item.done_by !== item.assignee_id
              ? t('staffTasks.state.doneBy', { name: doer })
              : t('staffTasks.state.doneAt', { time: clock(item.done_at ?? item.due_at) })
            : state === 'late'
              ? t('staffTasks.state.lateBy', { time: clock(item.due_at) })
              : t('staffTasks.state.by', { time: clock(item.due_at) })}
        </StatusPill>
        {item.photo_path ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => void openPhoto(item.photo_path as string)}>
            <MaterialSymbol name="photo" size="text-base" className="me-1" />
            {t('staffTasks.board.photo')}
          </Button>
        ) : null}
        {item.note ? <p className="w-full text-xs text-on-surface-variant">“{item.note}”</p> : null}
      </li>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setDay(shiftDay(day, -1))} aria-label={t('staffTasks.board.prevDay')}>
          <MaterialSymbol name="chevron_left" size="text-lg" className="rtl:rotate-180" />
        </Button>
        <span className="min-w-0 px-2 text-base font-semibold text-on-surface" data-testid="board-day">{dayLabel}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => setDay(shiftDay(day, 1))} aria-label={t('staffTasks.board.nextDay')}>
          <MaterialSymbol name="chevron_right" size="text-lg" className="rtl:rotate-180" />
        </Button>
        {day !== today ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setDay(null)}>
            {t('staffTasks.board.today')}
          </Button>
        ) : null}
      </div>

      {query.isPending ? (
        <LoadingSkeleton />
      ) : query.isError ? (
        <LoadError message={t('staffTasks.loadError')} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile icon="donut_large" tone={summary.rate === 100 && summary.total ? 'success' : 'primary'} label={t('staffTasks.tiles.rate')} value={`${summary.rate}%`} onClick={() => setFilter('all')} active={filter === 'all'} />
            <StatTile icon="task_alt" tone="success" label={t('staffTasks.tiles.done')} value={summary.done} onClick={() => setFilter('done')} active={filter === 'done'} />
            <StatTile icon="pending_actions" tone={summary.todo ? 'warning' : 'neutral'} label={t('staffTasks.tiles.todo')} value={summary.todo} onClick={() => setFilter('todo')} active={filter === 'todo'} />
            <StatTile icon="alarm" tone={summary.late ? 'error' : 'neutral'} label={t('staffTasks.tiles.late')} value={summary.late} onClick={() => setFilter('late')} active={filter === 'late'} />
          </div>

          <TableCard
            title={t('staffTasks.board.title')}
            count={summary.total ? `${summary.done}/${summary.total}` : undefined}
            filters={
              summary.total ? (
                <FilterChips label={t('staffTasks.board.title')} value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ value: f, label: t(`staffTasks.filters.${f}`), count: counts[f] }))} />
              ) : null
            }
          >
            {groups.length === 0 ? (
              <TableEmpty icon="task_alt" title={summary.total ? t('staffTasks.board.noneHere') : t('staffTasks.board.emptyTitle')} description={summary.total ? undefined : t('staffTasks.board.emptyHint')} />
            ) : (
              <div className="divide-y divide-outline-variant">
                {groups.map((group) => {
                  const task = byTask.get(group.taskId);
                  const all = totals.get(group.taskId) ?? group;
                  if (!task) return null;
                  const pct = all.total ? Math.round((all.done / all.total) * 100) : 0;
                  return (
                    <section key={group.taskId} data-testid="board-task">
                      <header className="flex flex-wrap items-center gap-3 bg-surface-container-lowest px-4 py-3 sm:px-5">
                        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', TONE_TINT[pct === 100 ? 'success' : 'primary'])}>
                          <MaterialSymbol name={CATEGORY_ICON[task.category]} size="text-lg" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="break-words text-sm font-semibold text-on-surface">{localName(task.title_ar, task.title_en, isAr)}</h3>
                          <div className="mt-1 h-1.5 max-w-xs overflow-hidden rounded-full bg-surface-high">
                            <div className={cn('h-full rounded-full', pct === 100 ? 'bg-success' : 'bg-primary')} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {task.completion === 'any' ? <StatusPill icon="group">{t('staffTasks.oneIsEnough')}</StatusPill> : null}
                          {task.photo_required ? <StatusPill icon="photo_camera">{t('staffTasks.photoNeeded')}</StatusPill> : null}
                          <span className="rounded-full bg-surface-high px-2.5 py-0.5 text-xs font-semibold tabular-nums text-on-surface-variant">{all.done}/{all.total}</span>
                        </div>
                      </header>
                      <ul className="divide-y divide-outline-variant">{group.items.map(person)}</ul>
                    </section>
                  );
                })}
              </div>
            )}
          </TableCard>
        </>
      )}
    </div>
  );
}

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { TableCard, TableLoading } from '@/components/ui/DataTable';
import { FormProblem } from '@/components/ui/FormField';
import { LoadError } from '@/components/ui/LoadError';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { formatDay } from '@/lib/datetime';
import { cn } from '@/lib/utils';

import { WEEK_ORDER, weekdayDate } from './daysOff';
import { daysOffErrorKey, saveOpenWeekdays } from './daysOffApi';
import { refreshDaysOff, useOpenWeekdays } from './useDaysOff';

const sameDays = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((d) => b.includes(d));

/** The weekdays the nursery closes every week: the manager taps a day to make it a day off or a working day. */
export function WeeklyDaysOffCard({ nurseryId }: { nurseryId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const week = useOpenWeekdays(nurseryId);
  const [draft, setDraft] = useState<number[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const saved = week.data ?? [];
  const open = draft ?? saved;
  const dirty = draft !== null && !sameDays(draft, saved);
  const name = (d: number) => formatDay(weekdayDate(d), { weekday: 'long' });
  const daysOff = WEEK_ORDER.filter((d) => !open.includes(d));

  const toggle = (d: number) => {
    setProblem(null);
    setDraft(open.includes(d) ? open.filter((x) => x !== d) : [...open, d]);
  };

  const save = async () => {
    if (!open.length) {
      setProblem(t('daysOff.errors.week_invalid'));
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      await saveOpenWeekdays(nurseryId, [...open].sort());
      toast.success(t('daysOff.week.saved'), { description: t('daysOff.week.savedHint') });
      refreshDaysOff(queryClient);
      setDraft(null);
    } catch (error) {
      setProblem(t(daysOffErrorKey(error)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <TableCard title={t('daysOff.week.title')} description={t('daysOff.week.hint')}>
      {week.isError ? (
        <LoadError inset message={t('daysOff.loadError')} onRetry={() => void week.refetch()} />
      ) : week.isPending ? (
        <TableLoading rows={2} />
      ) : (
        <div className="space-y-4 p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" role="group" aria-label={t('daysOff.week.title')}>
            {WEEK_ORDER.map((d) => {
              const isOpen = open.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={!isOpen}
                  onClick={() => toggle(d)}
                  data-testid="weekday"
                  className={cn(
                    'flex min-h-16 flex-col items-start justify-center gap-1 rounded-xl border px-3 py-2 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    isOpen
                      ? 'border-primary/30 bg-primary/5 text-on-surface hover:bg-primary/10'
                      : 'border-outline-variant bg-surface-container text-on-surface-variant hover:bg-surface-high',
                  )}
                >
                  <span className="text-sm font-semibold">{name(d)}</span>
                  <span className={cn('flex items-center gap-1 text-xs', isOpen ? 'text-primary' : 'text-on-surface-variant')}>
                    <MaterialSymbol name={isOpen ? 'check_circle' : 'weekend'} size="text-sm" />
                    {t(isOpen ? 'daysOff.week.open' : 'daysOff.week.off')}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-sm text-on-surface-variant" data-testid="week-summary">
            {t('daysOff.week.summary', { count: open.length })}
            {daysOff.length ? ` · ${t('daysOff.week.offDays', { days: daysOff.map(name).join(t('daysOff.listJoin')) })}` : ''}
          </p>
          <FormProblem message={problem} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" disabled={!dirty || saving} onClick={() => { setDraft(null); setProblem(null); }}>
              {t('common.cancel')}
            </Button>
            <Button type="button" disabled={!dirty || saving} onClick={() => void save()} data-testid="week-save">
              {t('daysOff.week.save')}
            </Button>
          </div>
        </div>
      )}
    </TableCard>
  );
}

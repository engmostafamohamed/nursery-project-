import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { StatusPill, TableCard, TableEmpty, TableLoading } from '@/components/ui/DataTable';
import { FilterChips } from '@/components/ui/FilterChips';
import { LoadError } from '@/components/ui/LoadError';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { localName } from '@/lib/bilingualName';
import type { PillTone } from '@/lib/tones';
import { cn } from '@/lib/utils';

import { canChangeHoliday, canRemoveHoliday, holidayState, type Holiday } from './daysOff';
import { daysOffErrorKey, removeHoliday } from './daysOffApi';
import { HolidayDates } from './HolidayDates';
import { HolidayDialog } from './HolidayDialog';
import { OfficialHolidaysDialog } from './OfficialHolidaysDialog';
import { refreshDaysOff, useHolidays } from './useDaysOff';

const STATE_TONE: Record<ReturnType<typeof holidayState>, PillTone> = { now: 'warning', coming: 'primary', past: 'neutral' };

/** The nursery's holidays of a year: add one, add Egypt's official ones, change or remove a coming one. */
export function HolidaysCard({ nurseryId, today }: { nurseryId: string; today: string }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const queryClient = useQueryClient();
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(String(thisYear));
  const query = useHolidays(nurseryId, Number(year));
  const holidays = query.data ?? [];
  const [editing, setEditing] = useState<Holiday | 'new' | null>(null);
  const [official, setOfficial] = useState(false);

  const remove = async (h: Holiday) => {
    const name = localName(h.name_ar, h.name_en, isAr);
    if (!(await confirm({ title: t('daysOff.holiday.removeTitle', { name }), description: t('daysOff.holiday.removeHint'), variant: 'danger', confirmText: t('daysOff.holiday.remove') }))) return;
    try {
      await removeHoliday(h.id);
      toast.success(t('daysOff.holiday.removed'), { description: h.notified_at ? t('daysOff.holiday.removedTold') : undefined });
      refreshDaysOff(queryClient);
    } catch (error) {
      toast.error(t(daysOffErrorKey(error)));
    }
  };

  return (
    <TableCard
      title={t('daysOff.holidays.title')}
      count={holidays.length ? t('daysOff.holidays.count', { count: holidays.length }) : undefined}
      description={t('daysOff.holidays.hint')}
      actions={
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => setOfficial(true)} data-testid="holidays-official">
            <MaterialSymbol name="flag" size="text-base" className="me-1" />
            {t('daysOff.holidays.official')}
          </Button>
          <Button type="button" size="sm" onClick={() => setEditing('new')} data-testid="holidays-add">
            <MaterialSymbol name="add" size="text-base" className="me-1" />
            {t('daysOff.holidays.add')}
          </Button>
        </>
      }
      filters={
        <FilterChips
          label={t('daysOff.holidays.year')}
          value={year}
          onChange={setYear}
          options={[thisYear, thisYear + 1].map((y) => ({ value: String(y), label: String(y) }))}
        />
      }
    >
      {query.isError ? (
        <LoadError inset message={t('daysOff.loadError')} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <TableLoading rows={3} />
      ) : !holidays.length ? (
        <TableEmpty
          icon="event_available"
          title={t('daysOff.holidays.emptyTitle', { year })}
          description={t('daysOff.holidays.emptyHint')}
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => setOfficial(true)}>
              {t('daysOff.holidays.official')}
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-outline-variant">
          {holidays.map((h) => {
            const state = holidayState(h, today);
            const name = localName(h.name_ar, h.name_en, isAr);
            return (
              <li key={h.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5', state === 'past' && 'opacity-70')} data-testid="holiday">
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', h.source === 'official' ? 'bg-primary/10 text-primary' : 'bg-surface-high text-on-surface-variant')}>
                  <MaterialSymbol name={h.source === 'official' ? 'flag' : 'celebration'} />
                </span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="font-semibold text-on-surface">{name}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-on-surface-variant">
                    <HolidayDates startsOn={h.starts_on} endsOn={h.ends_on} />
                    {h.notified_at ? (
                      <span className="inline-flex items-center gap-1">
                        <MaterialSymbol name="campaign" size="text-sm" />
                        {t('daysOff.holiday.told')}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {h.source === 'official' ? <StatusPill tone="neutral">{t('daysOff.holiday.official')}</StatusPill> : null}
                  <StatusPill tone={STATE_TONE[state]}>{t(`daysOff.holiday.state.${state}`)}</StatusPill>
                  {canChangeHoliday(h, today) ? (
                    <Button type="button" variant="ghost" size="icon" aria-label={t('daysOff.holiday.edit', { name })} onClick={() => setEditing(h)}>
                      <MaterialSymbol name="edit" size="text-base" />
                    </Button>
                  ) : null}
                  {canRemoveHoliday(h, today) ? (
                    <Button type="button" variant="ghost" size="icon" aria-label={t('daysOff.holiday.removeTitle', { name })} onClick={() => void remove(h)}>
                      <MaterialSymbol name="delete" size="text-base" className="text-error" />
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {editing ? (
        <HolidayDialog nurseryId={nurseryId} holiday={editing === 'new' ? null : editing} today={today} onClose={() => setEditing(null)} />
      ) : null}
      {official ? (
        <OfficialHolidaysDialog nurseryId={nurseryId} year={Number(year)} existing={holidays} today={today} onClose={() => setOfficial(false)} />
      ) : null}
    </TableCard>
  );
}

import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { StatusPill } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { formatDay } from '@/lib/datetime';
import { cn, getUserInitials } from '@/lib/utils';

import { REASON_ICON, STATE_TONE } from './absenceLook';
import { absenceState, daysBetween, sortAbsences, type Absence } from './staffAbsence';
import { absenceErrorKey } from './staffAbsenceApi';
import { useAbsenceChanges } from './useStaffAbsence';

const RANGE: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };

/**
 * Absences, the current and coming ones first: the dates, how many days, the reason and the note,
 * who recorded it when it was not the person, and a way to cancel one that has not ended.
 */
export function AbsenceList({ absences, today, showPerson = false, emptyText }: { absences: Absence[]; today: string; showPerson?: boolean; emptyText: string }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const { cancel } = useAbsenceChanges();

  const askCancel = async (a: Absence) => {
    const ok = await confirm({
      title: t('staffAbsence.cancelTitle'),
      description: t('staffAbsence.cancelBody', { from: formatDay(a.startsOn, RANGE), to: formatDay(a.endsOn, RANGE) }),
      confirmText: t('staffAbsence.cancelConfirm'),
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await cancel.mutateAsync(a.id);
      toast.success(t('staffAbsence.cancelled'));
    } catch (error) {
      toast.error(t(absenceErrorKey(error)));
    }
  };

  if (!absences.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-outline-variant px-4 py-8 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-success/10 text-success" aria-hidden>
          <MaterialSymbol name="event_available" size="text-xl" />
        </span>
        <p className="text-sm text-on-surface-variant">{emptyText}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2.5" data-testid="absence-list">
      {sortAbsences(absences, today).map((a) => {
        const state = absenceState(a, today);
        const name = (isArabic ? a.nameAr || a.nameEn : a.nameEn || a.nameAr) || '—';
        const days = daysBetween(a.startsOn, a.endsOn);
        const by = isArabic ? a.byAr || a.byEn : a.byEn || a.byAr;
        return (
          <li
            key={a.id}
            className={cn('flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface p-3.5 sm:flex-row sm:items-center', state === 'cancelled' || state === 'past' ? 'opacity-75' : '')}
            data-testid="absence-item"
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              {showPerson ? (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary" aria-hidden>
                  {getUserInitials(name, '')}
                </span>
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-high text-on-surface-variant" aria-hidden>
                  <MaterialSymbol name={REASON_ICON[a.reason]} size="text-xl" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {showPerson ? <p className="font-semibold text-on-surface">{name}</p> : null}
                  <p className={cn('text-on-surface', showPerson ? 'text-sm' : 'font-semibold', state === 'cancelled' && 'line-through')}>
                    {a.startsOn === a.endsOn ? formatDay(a.startsOn, RANGE) : `${formatDay(a.startsOn, RANGE)} – ${formatDay(a.endsOn, RANGE)}`}
                  </p>
                  <span className="text-xs text-on-surface-variant">{t('staffAbsence.days', { count: days })}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <StatusPill tone={STATE_TONE[state]}>{t(`staffAbsence.states.${state}`)}</StatusPill>
                  <StatusPill tone="neutral" icon={REASON_ICON[a.reason]}>{t(`staffAbsence.reasons.${a.reason}`)}</StatusPill>
                  {!a.bySelf && by ? <span className="text-xs text-on-surface-variant">{t('staffAbsence.recordedBy', { name: by })}</span> : null}
                </div>
                {a.note ? <p className="mt-1.5 whitespace-pre-line text-sm text-on-surface-variant">{a.note}</p> : null}
              </div>
            </div>
            {state === 'today' || state === 'upcoming' ? (
              <Button type="button" size="sm" variant="outline" className="self-start sm:self-center" onClick={() => void askCancel(a)} disabled={cancel.isPending}>
                <MaterialSymbol name="event_available" size="text-base" className="me-1" />
                {t('staffAbsence.cancel')}
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { confirm } from '@/components/ui/confirm';
import { FormProblem } from '@/components/ui/FormField';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';
import { formatTimeIn } from '@/lib/datetime';
import { cn } from '@/lib/utils';

import { arrivalBlock, clockStage, hoursParts, isLate } from './staffClock';
import { staffClockErrorKey, useClockStaff, useMyStaffDay } from './staffClockApi';

/**
 * The member of staff's own day, at the top of their home page: clock in on arrival (late is
 * counted from their own shift, not the nursery's door), clock out when leaving (the hours are
 * counted). Clocking in opens a set time before the shift and closes when it ends, so outside that
 * the button says why rather than failing when pressed. Leaving early is recorded and goes to the
 * manager. A day the admin recorded says so; an absence today is shown, and clocking in still
 * works if they came.
 */
export function StaffClockCard() {
  const { t } = useTranslation();
  const query = useMyStaffDay();
  const clock = useClockStaff();
  const [problem, setProblem] = useState<string | null>(null);

  if (query.isPending) return <Skeleton className="h-24 rounded-xl" />;
  if (query.isError || !query.data) return null;
  const me = query.data;
  const stage = clockStage(me.day);
  const time = (iso: string | null) => formatTimeIn(iso, me.timezone);
  const hours = hoursParts(me.day?.workHours ?? null);
  const late = isLate(me.day?.lateMinutes);
  const shift = me.shift;
  const blocked = stage === 'not_in' ? arrivalBlock(shift) : null;

  const act = async (action: 'in' | 'out') => {
    if (action === 'out') {
      const early = shift?.leavingEarly === true;
      const ok = await confirm({
        title: t('staffClock.confirmOutTitle'),
        description: t(early ? 'staffClock.confirmOutEarlyBody' : 'staffClock.confirmOutBody'),
        confirmText: t('staffClock.clockOut'),
        icon: 'logout',
      });
      if (!ok) return;
    }
    setProblem(null);
    try {
      await clock.mutateAsync(action);
    } catch (error) {
      setProblem(t(staffClockErrorKey(error)));
    }
  };

  /** The line under the title: where the day stands, or why clocking in is not open yet. */
  const subtitle = () => {
    if (stage === 'in') return late ? t('staffClock.lateBy', { count: me.day?.lateMinutes ?? 0 }) : t('staffClock.onTime');
    if (stage === 'left') {
      const span = t('staffClock.leftLine', { from: time(me.day?.checkInAt ?? null), to: time(me.day?.checkOutAt ?? null) });
      return hours ? `${span} · ${t('staffClock.hours', { h: hours.h, m: hours.m })}` : span;
    }
    if (blocked === 'early') return t('staffClock.blocked.early', { time: time(shift?.windowOpensAt ?? null) });
    if (blocked === 'over') return t('staffClock.blocked.over');
    if (blocked === 'no_shift') return t('staffClock.blocked.noShift');
    return t('staffClock.notInHint');
  };

  return (
    <section
      aria-labelledby="staff-clock-title"
      className={cn('rounded-xl border p-4 shadow-sm sm:p-5', stage === 'in' ? 'border-success/30 bg-success/5' : stage === 'left' ? 'border-outline-variant bg-surface' : 'border-primary/30 bg-primary/5')}
      data-testid="staff-clock"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
            stage === 'in' ? 'bg-success/15 text-success' : stage === 'left' ? 'bg-surface-high text-on-surface-variant' : 'bg-primary/15 text-primary')} aria-hidden>
            <MaterialSymbol name={stage === 'in' ? 'badge' : stage === 'left' ? 'logout' : 'login'} size="text-2xl" />
          </span>
          <div className="min-w-0">
            <h2 id="staff-clock-title" className="font-semibold text-on-surface">
              {stage === 'not_in' ? t('staffClock.titleNotIn') : stage === 'in' ? t('staffClock.titleIn', { time: time(me.day?.checkInAt ?? null) }) : t('staffClock.titleLeft')}
            </h2>
            <p className="text-sm text-on-surface-variant">{subtitle()}</p>
            {shift?.startsAt && shift.endsAt ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-on-surface-variant">
                <MaterialSymbol name="schedule" size="text-sm" />
                {t(shift.mine ? 'staffClock.shift.mine' : 'staffClock.shift.house', { from: shift.startsAt, to: shift.endsAt })}
              </p>
            ) : null}
            {stage === 'in' && shift?.leavingEarly ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-warning">
                <MaterialSymbol name="pending_actions" size="text-sm" />
                {t('staffClock.shift.leavingEarly')}
              </p>
            ) : null}
            {me.day?.needsReview ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-warning" data-testid="staff-clock-review">
                <MaterialSymbol name="pending_actions" size="text-sm" />
                {me.day.reviewReason ? t(`staffClock.review.${me.day.reviewReason}`) : t('staffClock.review.waiting')}
              </p>
            ) : null}
            {me.day?.source === 'admin' ? <p className="text-xs text-on-surface-variant">{t('staffClock.recordedByAdmin')}</p> : null}
            {me.absence && stage === 'not_in' ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-warning">
                <MaterialSymbol name="event_busy" size="text-sm" />
                {t('staffClock.absentToday', { reason: t(`staffAbsence.reasons.${me.absence.reason}`, { defaultValue: me.absence.reason }) })}
              </p>
            ) : null}
            {!me.schoolDay && stage === 'not_in' ? <p className="mt-1 text-xs text-on-surface-variant">{t('staffClock.closedToday')}</p> : null}
          </div>
        </div>
        {stage === 'left' ? null : (
          <Button
            type="button"
            size="lg"
            className={cn('h-12 shrink-0 sm:min-w-44', stage === 'not_in' && !blocked && 'btn-gradient text-primary-foreground')}
            variant={stage === 'in' ? 'outline' : 'default'}
            disabled={clock.isPending || blocked !== null}
            onClick={() => void act(stage === 'not_in' ? 'in' : 'out')}
            data-testid={stage === 'not_in' ? 'clock-in' : 'clock-out'}
          >
            <MaterialSymbol name={clock.isPending ? 'progress_activity' : stage === 'not_in' ? 'login' : 'logout'} size="text-lg" className={cn('me-2', clock.isPending && 'animate-spin')} />
            {stage === 'not_in' ? t('staffClock.clockIn') : t('staffClock.clockOut')}
          </Button>
        )}
      </div>
      <div className="mt-3 empty:hidden">
        <FormProblem message={problem} />
      </div>
    </section>
  );
}

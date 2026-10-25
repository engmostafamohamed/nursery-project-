import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { useNow } from '@/hooks/useNow';
import { dueState, type DueState, type ReportDay } from '@/lib/dailyReport';
import { cn } from '@/lib/utils';

const LOOK: Record<DueState, { box: string; icon: string; badge: string; symbol: string }> = {
  done: {
    box: 'border-success/40 bg-success/10 text-on-surface',
    icon: 'bg-success text-white',
    badge: 'bg-success/15 text-success',
    symbol: 'task_alt',
  },
  open: {
    box: 'border-primary/30 bg-primary/5 text-on-surface',
    icon: 'bg-primary text-primary-foreground',
    badge: 'bg-primary/10 text-primary',
    symbol: 'edit_note',
  },
  // An hour before the reports are due: the alarm.
  soon: {
    box: 'border-warning bg-gradient-to-r from-warning/25 via-warning/15 to-error/15 text-on-surface shadow-md shadow-warning/20',
    icon: 'bg-warning text-white animate-pulse',
    badge: 'bg-warning text-white',
    symbol: 'alarm',
  },
  overdue: {
    box: 'border-error bg-gradient-to-r from-error to-error/85 text-white shadow-md shadow-error/30',
    icon: 'bg-white/20 text-white animate-pulse',
    badge: 'bg-white/20 text-white',
    symbol: 'notification_important',
  },
};

/**
 * Where the day's reports stand, in the colours of an alarm as the end of the day nears: how many
 * are left, when they are due, and what to do. On the daily reports page and the teacher's dashboard.
 */
export function ReportDueBanner({ day, dueAt, actions, className }: { day: ReportDay; dueAt: string | null; actions?: ReactNode; className?: string }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const now = useNow();
  const state = day.expected === 0 ? 'done' : dueState(day, dueAt, now);
  const look = LOOK[state];
  const time = dueAt ? new Date(dueAt).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
  const minutesLeft = dueAt ? Math.max(0, Math.round((new Date(dueAt).getTime() - now.getTime()) / 60_000)) : 0;

  const title =
    day.expected === 0
      ? t('dailyReport.banner.nothingTitle')
      : state === 'done'
        ? t('dailyReport.banner.doneTitle')
        : state === 'overdue'
          ? t('dailyReport.banner.overdueTitle', { count: day.open, time })
          : state === 'soon'
            ? t('dailyReport.banner.soonTitle', { count: day.open, minutes: minutesLeft })
            : t('dailyReport.banner.openTitle', { count: day.open });
  const body =
    day.expected === 0
      ? t('dailyReport.banner.nothingBody')
      : state === 'done'
        ? t('dailyReport.banner.doneBody', { sent: day.sent, expected: day.expected })
        : t('dailyReport.banner.progress', { ready: day.ready, inProgress: day.inProgress, notStarted: day.notStarted });

  return (
    <section
      role={state === 'soon' || state === 'overdue' ? 'alert' : 'status'}
      className={cn('flex flex-col gap-3 rounded-xl border-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5', look.box, className)}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', look.icon)}>
          <MaterialSymbol name={look.symbol} className="text-2xl" />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="font-headline text-lg font-extrabold leading-6">{title}</p>
          <p className={cn('text-sm', state === 'overdue' ? 'text-white/90' : 'text-on-surface-variant')}>{body}</p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {dueAt && day.expected > 0 ? (
              <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', look.badge)}>
                <MaterialSymbol name="schedule" className="text-sm" />
                {t('dailyReport.banner.dueAt', { time })}
              </span>
            ) : null}
            {day.expected > 0 ? (
              <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums', look.badge)}>
                <MaterialSymbol name="send" className="text-sm" />
                {t('dailyReport.banner.sentOf', { sent: day.sent, expected: day.expected, rate: day.rate })}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </section>
  );
}

import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/DataTable';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { localName } from '@/lib/bilingualName';
import { formatDay } from '@/lib/datetime';
import { cn } from '@/lib/utils';

import type { CourseSession } from './courseSessions';

/** One session: its day and time, whether it was cancelled (why, by whom), and what can be done. */
export function CourseSessionRow({ session, time, isToday, changeable, busy, onCancel, onRestore }: {
  session: CourseSession;
  time: string;
  isToday: boolean;
  changeable: boolean;
  busy: boolean;
  onCancel: () => void;
  onRestore: () => void;
}) {
  const { t, i18n } = useTranslation();
  const by = session.cancelledBy ? localName(session.cancelledBy.ar, session.cancelledBy.en, i18n.language.startsWith('ar')) : '';

  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-xl border p-3',
        session.cancelled ? 'border-error/30 bg-error/5' : 'border-outline-variant bg-surface-container-lowest',
      )}
      data-testid="course-session"
    >
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', session.cancelled ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary')}>
        <MaterialSymbol name={session.cancelled ? 'event_busy' : 'event'} size="text-xl" />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-on-surface">
          {formatDay(session.date, { weekday: 'long', day: 'numeric', month: 'short' })}
          {time ? <span className="text-xs font-normal text-on-surface-variant" dir="ltr">{time}</span> : null}
          {session.cancelled ? (
            <StatusPill tone="error" icon="block">{t('courseSessions.cancelledPill')}</StatusPill>
          ) : isToday ? (
            <StatusPill tone="primary" icon="today">{t('courseSessions.today')}</StatusPill>
          ) : null}
        </p>
        {session.cancelled && session.reason ? (
          <p className="text-xs text-on-surface">
            <span className="font-medium">{t('courseSessions.reason')}:</span> {session.reason}
          </p>
        ) : null}
        {session.cancelled && by ? <p className="text-xs text-on-surface-variant">{t('courseSessions.cancelledBy', { name: by })}</p> : null}
      </div>
      {changeable ? (
        session.cancelled ? (
          <Button type="button" size="sm" variant="outline" onClick={onRestore} disabled={busy}>
            <MaterialSymbol name="undo" size="text-base" className="me-1" />
            {t('courseSessions.restore')}
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" className="text-error hover:bg-error/5" onClick={onCancel} disabled={busy}>
            <MaterialSymbol name="event_busy" size="text-base" className="me-1" />
            {t('courseSessions.cancel')}
          </Button>
        )
      ) : null}
    </li>
  );
}

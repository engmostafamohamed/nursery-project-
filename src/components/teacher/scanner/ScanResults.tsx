import { useTranslation } from 'react-i18next';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { formatTime } from '@/lib/datetime';
import { cn } from '@/lib/utils';

export type ScanOutcome = 'checkin' | 'checkout' | 'event' | 'already' | 'rejected' | 'blocked';

export type ScanEntry = {
  id: number;
  name: string;
  outcome: ScanOutcome;
  detail: string | null;
  at: number;
};

const OUTCOME_STYLE: Record<ScanOutcome, { icon: string; badge: string; text: string; card: string }> = {
  checkin: { icon: 'login', badge: 'bg-success/15 text-success', text: 'text-success', card: 'border-success/30 bg-success/5' },
  checkout: { icon: 'logout', badge: 'bg-primary/15 text-primary', text: 'text-primary', card: 'border-primary/30 bg-primary/5' },
  event: { icon: 'event_available', badge: 'bg-primary/15 text-primary', text: 'text-primary', card: 'border-primary/30 bg-primary/5' },
  already: { icon: 'info', badge: 'bg-warning/15 text-warning', text: 'text-warning', card: 'border-warning/30 bg-warning/5' },
  rejected: { icon: 'block', badge: 'bg-error/15 text-error', text: 'text-error', card: 'border-error/30 bg-error/5' },
  blocked: { icon: 'gpp_bad', badge: 'bg-error/15 text-error', text: 'text-error', card: 'border-error/30 bg-error/5' },
};

/** The result of the most recent scan, large enough to read at a glance at the gate. */
export function LastScanCard({ entry }: { entry: ScanEntry | null }) {
  const { t } = useTranslation();
  const style = entry ? OUTCOME_STYLE[entry.outcome] : null;

  return (
    <section
      className={cn(
        'rounded-2xl border p-4 shadow-sm transition-colors duration-300',
        style ? style.card : 'border-outline-variant bg-surface',
      )}
      aria-live="polite"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{t('teacher.scanner.result.title')}</p>
      {entry && style ? (
        <div key={entry.id} className="mt-3 flex items-start gap-3 duration-300 animate-in fade-in-0 zoom-in-95">
          <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', style.badge)}>
            <MaterialSymbol name={style.icon} size="text-2xl" />
          </span>
          <div className="min-w-0">
            <p className="break-words text-base font-semibold text-on-surface">{entry.name}</p>
            <p className={cn('text-sm font-medium', style.text)}>
              {t(`teacher.scanner.result.${entry.outcome}`)} · <span className="tabular-nums">{formatTime(entry.at)}</span>
            </p>
            {entry.detail ? <p className="mt-1 break-words text-xs leading-5 text-on-surface-variant">{entry.detail}</p> : null}
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-container text-on-surface-variant">
            <MaterialSymbol name="qr_code_scanner" size="text-2xl" />
          </span>
          <p className="text-sm text-on-surface-variant">{t('teacher.scanner.result.empty')}</p>
        </div>
      )}
    </section>
  );
}

/** Everything scanned on this screen since it was opened, newest first. */
export function SessionHistory({ entries }: { entries: ScanEntry[] }) {
  const { t } = useTranslation();
  const checkedIn = entries.filter((e) => e.outcome === 'checkin').length;
  const pickedUp = entries.filter((e) => e.outcome === 'checkout').length;

  return (
    <section className="rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-on-surface">{t('teacher.scanner.history.title')}</h2>
        {entries.length ? (
          <span className="rounded-full bg-surface-container px-2.5 py-0.5 text-xs text-on-surface-variant">
            {t('teacher.scanner.history.counts', { checkedIn, pickedUp })}
          </span>
        ) : null}
      </div>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-on-surface-variant">{t('teacher.scanner.history.empty')}</p>
      ) : (
        <ul className="mt-2 max-h-80 divide-y divide-outline-variant overflow-y-auto">
          {entries.map((entry) => {
            const style = OUTCOME_STYLE[entry.outcome];
            return (
              <li key={entry.id} className="flex items-center gap-3 py-2.5">
                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', style.badge)}>
                  <MaterialSymbol name={style.icon} size="text-lg" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-on-surface">{entry.name}</p>
                  <p className="truncate text-xs text-on-surface-variant">
                    {t(`teacher.scanner.result.${entry.outcome}`)}
                    {entry.detail ? ` · ${entry.detail}` : ''}
                  </p>
                </div>
                <time className="shrink-0 text-xs tabular-nums text-on-surface-variant" dateTime={new Date(entry.at).toISOString()}>
                  {formatTime(entry.at)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

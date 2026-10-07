import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { useAttendanceKpis } from '@/hooks/useAttendanceKpis';
import { cn } from '@/lib/utils';

/** Today's numbers for the nursery, refreshed after every scan. */
export function TodayAtGateCard({ nurseryId, attendanceLink }: { nurseryId: string | null | undefined; attendanceLink: string }) {
  const { t } = useTranslation();
  const { data, isPending, isError } = useAttendanceKpis(nurseryId);
  if (!nurseryId || isError) return null;
  const today = data?.today;

  const tiles = [
    { key: 'inNursery', icon: 'groups', value: today?.in_nursery, tone: 'text-primary' },
    { key: 'pickedUp', icon: 'logout', value: today?.checked_out, tone: 'text-success' },
    { key: 'lateNow', icon: 'schedule', value: today?.late_now, tone: today?.late_now ? 'text-error' : 'text-on-surface-variant' },
  ] as const;

  return (
    <section className="rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-on-surface">{t('teacher.scanner.today.title')}</h2>
        <Link to={attendanceLink} className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
          {t('teacher.scanner.today.open')}
          <MaterialSymbol name="chevron_right" size="text-base" className="rtl:rotate-180" />
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {tiles.map((tile) => (
          <div key={tile.key} className="rounded-xl bg-surface-container-low p-3">
            <MaterialSymbol name={tile.icon} size="text-lg" className={tile.tone} />
            <p className={cn('mt-1 text-2xl font-semibold tabular-nums text-on-surface', isPending && 'animate-pulse text-on-surface-variant')}>
              {isPending ? '–' : tile.value ?? 0}
            </p>
            <p className="text-xs leading-4 text-on-surface-variant">{t(`teacher.scanner.today.${tile.key}`)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const STEPS = [
  { key: 'dropoff', icon: 'login' },
  { key: 'pickup', icon: 'verified_user' },
  { key: 'manual', icon: 'keyboard' },
] as const;

/** The scanner flow in three lines, for staff new to the gate. */
export function HowItWorksCard() {
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-on-surface">{t('teacher.scanner.steps.title')}</h2>
      <ol className="mt-3 space-y-3">
        {STEPS.map((step) => (
          <li key={step.key} className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MaterialSymbol name={step.icon} size="text-lg" />
            </span>
            <p className="text-sm leading-6 text-on-surface-variant">
              <span className="font-medium text-on-surface">{t(`teacher.scanner.steps.${step.key}.title`)}</span>{' '}
              {t(`teacher.scanner.steps.${step.key}.body`)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

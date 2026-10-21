import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Skeleton } from '@/components/ui/skeleton';
import {
  admissionSteps,
  minutesBetween,
  STEP_DATE,
  type AdmissionStepKey,
  type AdmissionTimeline,
} from '@/lib/admissionTimeline';
import { formatDate, formatTime } from '@/lib/datetime';
import { cn } from '@/lib/utils';

const ICON: Record<AdmissionStepKey, string> = {
  started: 'edit_note',
  submitted: 'send',
  paid: 'payments',
  approved: 'verified',
  joined: 'how_to_reg',
  firstDay: 'login',
};

/** "2 d 3 h", "8 h 39 min" or "25 min". */
function useWaitLabel() {
  const { t } = useTranslation();
  return (minutes: number) => {
    if (minutes >= 24 * 60) {
      return t('admissionJourney.wait.days', { days: Math.floor(minutes / (24 * 60)), hours: Math.floor((minutes % (24 * 60)) / 60) });
    }
    if (minutes >= 60) return t('admissionJourney.wait.hoursMinutes', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
    return t('admissionJourney.wait.minutes', { minutes });
  };
}

/**
 * The admission journey as a vertical timeline: each step with its date and time, who approved
 * the application and how long after it was submitted. Steps not reached yet are dashed.
 */
export function AdmissionJourneySteps({ timeline, wide = false }: { timeline: AdmissionTimeline; wide?: boolean }) {
  const { t, i18n } = useTranslation();
  const waitLabel = useWaitLabel();
  const steps = admissionSteps(timeline);
  const approvedBy = i18n.language.startsWith('ar') ? timeline.approvedBy.ar || timeline.approvedBy.en : timeline.approvedBy.en || timeline.approvedBy.ar;
  const reviewWait = minutesBetween(timeline.submittedAt, timeline.approvedAt);

  return (
    <div className="space-y-3">
      {!timeline.applicationId ? (
        <p className="flex items-start gap-2 rounded-lg bg-surface-container-lowest px-3 py-2 text-xs text-on-surface-variant">
          <MaterialSymbol name="info" size="text-sm" className="mt-px" />
          {t('admissionJourney.direct')}
        </p>
      ) : null}
      {/* Wide: the steps side by side on large screens; otherwise top to bottom. */}
      <ol className={cn(wide && 'xl:grid xl:gap-3', wide && (steps.length > 2 ? 'xl:grid-cols-6' : 'xl:grid-cols-2'))}>
        {steps.map((step, index) => {
          const done = Boolean(step.at || step.day);
          const nextDone = index < steps.length - 1 && Boolean(steps[index + 1].at || steps[index + 1].day);
          return (
            <li key={step.key} className={cn('relative flex gap-3 pb-5 last:pb-0', wide && 'xl:flex-col xl:gap-2 xl:pb-0')}>
              {index < steps.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    'absolute bottom-0 start-[15px] top-8 w-0.5',
                    wide && 'xl:-end-3 xl:bottom-auto xl:start-9 xl:top-[15px] xl:h-0.5 xl:w-auto',
                    done && nextDone ? 'bg-primary/40' : 'bg-outline-variant',
                  )}
                />
              ) : null}
              <span
                className={cn(
                  'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                  done ? 'bg-primary text-primary-foreground' : 'border-2 border-dashed border-outline-variant bg-surface text-on-surface-variant',
                )}
              >
                <MaterialSymbol name={ICON[step.key]} size="text-base" />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className={cn('text-sm font-semibold', done ? 'text-on-surface' : 'text-on-surface-variant')}>
                  {t(`admissionJourney.steps.${step.key}`)}
                </p>
                <p className="text-sm tabular-nums text-on-surface-variant">
                  {step.at ? (
                    // The day, then the time on its own line, so narrow columns do not split the time.
                    <time dateTime={step.at}>
                      <span className="block">{formatDate(step.at, STEP_DATE)}</span>
                      <span className="block">{formatTime(step.at, { hour: 'numeric' })}</span>
                    </time>
                  ) : step.day ? (
                    <>
                      <time dateTime={step.day}>{formatDate(`${step.day}T12:00:00`, STEP_DATE)}</time>
                      <span className="text-xs"> · {t('admissionJourney.timeUnknown')}</span>
                    </>
                  ) : (
                    t('admissionJourney.notYet')
                  )}
                </p>
                {step.key === 'approved' && step.at ? (
                  <p className="mt-0.5 text-xs text-on-surface-variant">
                    {approvedBy ? t('admissionJourney.approvedBy', { name: approvedBy }) : null}
                    {approvedBy && reviewWait !== null ? ' · ' : null}
                    {reviewWait !== null ? t('admissionJourney.afterSubmit', { wait: waitLabel(reviewWait) }) : null}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The journey in a card, with its loading and error states. */
export function AdmissionJourneyCard({
  timeline,
  isLoading,
  isError,
  onRetry,
  wide = false,
  className,
}: {
  timeline: AdmissionTimeline | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** Steps side by side on large screens (a full-width card). */
  wide?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <section className={cn('rounded-xl border border-outline-variant bg-surface shadow-sm', className)}>
      <header className="flex items-start gap-3 border-b border-outline-variant bg-surface-container-lowest px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <MaterialSymbol name="route" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-on-surface">{t('admissionJourney.title')}</h2>
          <p className="mt-0.5 text-xs text-on-surface-variant">{t('admissionJourney.subtitle')}</p>
        </div>
      </header>
      <div className="p-4">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
          </div>
        ) : isError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm text-on-surface">
            <span className="flex items-center gap-2">
              <MaterialSymbol name="error" className="text-error" />
              {t('admissionJourney.loadError')}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              {t('common.retry')}
            </Button>
          </div>
        ) : timeline ? (
          <AdmissionJourneySteps timeline={timeline} wide={wide} />
        ) : (
          <p className="text-sm text-on-surface-variant">{t('admissionJourney.loadError')}</p>
        )}
      </div>
    </section>
  );
}

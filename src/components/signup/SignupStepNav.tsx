import { useTranslation } from 'react-i18next';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

import type { SignUpStep } from '@/features/parent-signup/parentSignUpTypes';

type StepStatus = 'done' | 'current' | 'upcoming' | 'error';

type Props = {
  steps: readonly SignUpStep[];
  currentIndex: number;
  furthestReached: number;
  errorSteps: Set<SignUpStep>;
  onJumpTo: (index: number) => void;
  autosaveState: 'idle' | 'saving' | 'saved' | 'error';
  autosavedAgoSeconds: number | null;
  /** The desktop sidebar leads with a progress card; the mobile drawer already shows it in its summary. */
  showProgress?: boolean;
};

function statusOf(idx: number, currentIndex: number, furthestReached: number, hasError: boolean): StepStatus {
  if (hasError) return 'error';
  if (idx === currentIndex) return 'current';
  if (idx < furthestReached) return 'done';
  return 'upcoming';
}

export function SignupStepNav({
  steps,
  currentIndex,
  furthestReached,
  errorSteps,
  onJumpTo,
  autosaveState,
  autosavedAgoSeconds,
  showProgress = false,
}: Props) {
  const { t } = useTranslation();
  const progress = Math.round(((currentIndex + 1) / Math.max(steps.length, 1)) * 100);

  return (
    <nav aria-label={t('signup.nav.ariaLabel')} className="flex flex-col gap-5">
      {showProgress ? (
        <div className="rounded-2xl bg-primary/5 p-4 ring-1 ring-inset ring-primary/10">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-semibold text-on-surface-variant">{t('signup.nav.progressLabel')}</p>
            <p className="font-headline text-lg font-bold text-primary">{progress}%</p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/10">
            <div
              className="btn-gradient h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-on-surface-variant">
            {t('signup.stepOf', { current: currentIndex + 1, total: steps.length })}
          </p>
        </div>
      ) : null}

      <ol>
        {steps.map((step, idx) => {
          const status = statusOf(idx, currentIndex, furthestReached, errorSteps.has(step));
          const disabled = idx > furthestReached;
          return (
            <li key={step} className="relative pb-1 last:pb-0">
              {/* Connector to the next step's dot; filled once the parent has moved past it. */}
              {idx < steps.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    'absolute start-[25px] top-[38px] h-4 w-0.5 rounded-full',
                    idx < furthestReached ? 'bg-primary/45' : 'bg-outline-variant',
                  )}
                />
              ) : null}
              <button
                type="button"
                onClick={() => !disabled && onJumpTo(idx)}
                disabled={disabled}
                className={cn(
                  'relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-sm transition-colors',
                  status === 'current' && 'bg-primary/10 font-semibold text-primary',
                  status === 'done' && 'text-on-surface hover:bg-surface-container-low',
                  status === 'error' && 'bg-error/10 font-medium text-error',
                  status === 'upcoming' && 'cursor-not-allowed text-on-surface-variant/60',
                )}
                aria-current={status === 'current' ? 'step' : undefined}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-shadow',
                    status === 'done' && 'bg-primary text-primary-foreground',
                    status === 'current' && 'bg-surface text-primary ring-2 ring-primary shadow-[0_0_0_5px_rgb(var(--primary)/0.14)]',
                    status === 'error' && 'bg-error text-primary-foreground',
                    status === 'upcoming' && 'bg-surface-container text-on-surface-variant',
                  )}
                >
                  {status === 'done' ? (
                    <MaterialSymbol name="check" size="text-base" />
                  ) : status === 'error' ? (
                    <MaterialSymbol name="priority_high" size="text-base" />
                  ) : (
                    idx + 1
                  )}
                </span>
                <span className="flex-1 truncate">{t(`signup.steps.${step}`)}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="flex items-center gap-2 border-t border-outline-variant pt-3 text-xs text-on-surface-variant">
        {autosaveState === 'saving' && (
          <>
            <MaterialSymbol name="cloud_sync" size="text-base" className="text-primary" />
            <span>{t('signup.autosave.saving')}</span>
          </>
        )}
        {autosaveState === 'saved' && autosavedAgoSeconds !== null && (
          <>
            <MaterialSymbol name="cloud_done" size="text-base" className="text-primary" />
            <span>
              {autosavedAgoSeconds < 5
                ? t('signup.autosave.justNow')
                : t('signup.autosave.savedAgo', { seconds: autosavedAgoSeconds })}
            </span>
          </>
        )}
        {autosaveState === 'error' && (
          <>
            <MaterialSymbol name="cloud_off" size="text-base" className="text-error" />
            <span className="text-error">{t('signup.autosave.error')}</span>
          </>
        )}
        {autosaveState === 'idle' && <span className="opacity-60">{t('signup.autosave.idle')}</span>}
      </div>
    </nav>
  );
}

import { useTranslation } from 'react-i18next';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

import { SIGNUP_STEPS, type SignUpStep } from '@/features/parent-signup/parentSignUpTypes';

type StepStatus = 'done' | 'current' | 'upcoming' | 'error';

type Props = {
  currentIndex: number;
  furthestReached: number;
  errorSteps: Set<SignUpStep>;
  onJumpTo: (index: number) => void;
  autosaveState: 'idle' | 'saving' | 'saved' | 'error';
  autosavedAgoSeconds: number | null;
};

function statusOf(idx: number, currentIndex: number, furthestReached: number, hasError: boolean): StepStatus {
  if (hasError) return 'error';
  if (idx === currentIndex) return 'current';
  if (idx < furthestReached) return 'done';
  return 'upcoming';
}

export function SignupStepNav({
  currentIndex,
  furthestReached,
  errorSteps,
  onJumpTo,
  autosaveState,
  autosavedAgoSeconds,
}: Props) {
  const { t } = useTranslation();

  return (
    <nav aria-label={t('signup.nav.ariaLabel')} className="flex h-full flex-col justify-between gap-4">
      <ol className="space-y-1">
        {SIGNUP_STEPS.map((step, idx) => {
          const status = statusOf(idx, currentIndex, furthestReached, errorSteps.has(step));
          const disabled = idx > furthestReached;
          return (
            <li key={step}>
              <button
                type="button"
                onClick={() => !disabled && onJumpTo(idx)}
                disabled={disabled}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-sm transition-colors',
                  status === 'current' && 'bg-primary/10 font-semibold text-primary',
                  status === 'done' && 'text-on-surface hover:bg-surface-container',
                  status === 'error' && 'bg-error/10 text-error',
                  status === 'upcoming' && 'cursor-not-allowed text-on-surface-variant/60',
                )}
                aria-current={status === 'current' ? 'step' : undefined}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    status === 'done' && 'bg-primary text-primary-foreground',
                    status === 'current' && 'bg-primary/20 text-primary ring-2 ring-primary',
                    status === 'error' && 'bg-error text-on-error',
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

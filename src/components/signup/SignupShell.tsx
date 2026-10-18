import { useTranslation } from 'react-i18next';

import { LanguageToggle } from '@/components/LanguageToggle';
import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

import type { SignUpStep } from '@/features/parent-signup/parentSignUpTypes';

import { SignupStepNav } from './SignupStepNav';

const STEP_ICONS: Record<SignUpStep, string> = {
  child: 'badge',
  parents: 'family_restroom',
  family: 'home',
  enrollment: 'school',
  health: 'health_and_safety',
  emergency: 'contact_phone',
  dailyCare: 'schedule',
  pickups: 'directions_car',
  medicationConsents: 'medication',
  documents: 'folder_open',
  consents: 'verified_user',
  review: 'fact_check',
  packages: 'workspace_premium',
  payment: 'payments',
};

type Props = {
  steps: readonly SignUpStep[];
  currentIndex: number;
  furthestReached: number;
  errorSteps: Set<SignUpStep>;
  onJumpTo: (index: number) => void;
  onSaveAndExit: () => void;
  onResetDraft: () => void;
  autosaveState: 'idle' | 'saving' | 'saved' | 'error';
  autosavedAgoSeconds: number | null;
  children: React.ReactNode;
};

export function SignupShell({
  steps,
  currentIndex,
  furthestReached,
  errorSteps,
  onJumpTo,
  onSaveAndExit,
  onResetDraft,
  autosaveState,
  autosavedAgoSeconds,
  children,
}: Props) {
  const { t } = useTranslation();
  const currentStep = steps[currentIndex] ?? steps[steps.length - 1];
  const stepOf = t('signup.stepOf', { current: currentIndex + 1, total: steps.length });
  const stepName = t(`signup.steps.${currentStep}`);
  const progress = Math.round(((currentIndex + 1) / Math.max(steps.length, 1)) * 100);
  const navProps = { steps, currentIndex, furthestReached, errorSteps, onJumpTo, autosaveState, autosavedAgoSeconds };

  return (
    <div className="relative isolate min-h-screen bg-surface-container-low">
      <div aria-hidden className="signup-backdrop pointer-events-none fixed inset-0 -z-10" />

      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-outline-variant/70 bg-surface/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="btn-gradient flex size-10 shrink-0 items-center justify-center rounded-xl text-primary-foreground shadow-[0_8px_18px_-8px_rgb(var(--primary)/0.7)]">
              <MaterialSymbol name="child_care" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-headline text-sm font-bold tracking-tight text-on-surface sm:text-base">
                {t('signup.title')}
              </p>
              <p className="hidden truncate text-xs text-on-surface-variant sm:block">
                {stepOf}
                {' — '}
                {stepName}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onResetDraft}>
              <MaterialSymbol name="restart_alt" size="text-base" />
              <span className="hidden sm:inline">{t('signup.resetDraft')}</span>
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onSaveAndExit}>
              <MaterialSymbol name="logout" size="text-base" />
              <span className="hidden sm:inline">{t('signup.saveAndExit')}</span>
            </Button>
            <LanguageToggle />
          </div>
        </div>

        <div className="h-1 w-full bg-primary/10">
          <div
            className="btn-gradient h-full rounded-e-full transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[288px_minmax(0,1fr)] lg:gap-8 lg:px-8 lg:py-10">
        {/* Mobile: the step list folds away so the form starts at the top of the screen. */}
        <details className="group rounded-2xl border border-outline-variant/70 bg-surface shadow-sm lg:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-on-surface-variant">{stepOf}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/10">
                <div className="btn-gradient h-full rounded-full" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <span className="font-headline text-sm font-bold text-primary">{progress}%</span>
            <MaterialSymbol
              name="expand_more"
              className="text-on-surface-variant transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="border-t border-outline-variant/70 p-3">
            <SignupStepNav {...navProps} />
          </div>
        </details>

        {/* Desktop sidebar */}
        <aside className="hidden lg:sticky lg:top-24 lg:block lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto lg:rounded-3xl">
          <div className="rounded-3xl border border-outline-variant/70 bg-surface p-5 shadow-sm">
            <SignupStepNav {...navProps} showProgress />
          </div>
        </aside>

        {/* Main content panel */}
        <main className="min-w-0">
          <section className="signup-surface overflow-clip rounded-3xl border border-outline-variant/70 bg-surface">
            <div className="flex items-center gap-4 border-b border-outline-variant/70 bg-gradient-to-b from-primary/[0.06] to-transparent px-6 py-5 sm:px-10 sm:py-7">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
                <MaterialSymbol name={STEP_ICONS[currentStep] ?? 'edit_note'} size="text-2xl" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary rtl:tracking-normal">{stepOf}</p>
                <h2 className="font-headline text-xl font-bold tracking-tight text-on-surface sm:text-2xl">{stepName}</h2>
              </div>
            </div>
            <div className="px-6 py-6 sm:px-10 sm:py-8">{children}</div>
          </section>
        </main>
      </div>
    </div>
  );
}

import { useTranslation } from 'react-i18next';

import { LanguageToggle } from '@/components/LanguageToggle';
import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';

import { SIGNUP_STEPS, type SignUpStep } from '@/features/parent-signup/parentSignUpTypes';

import { SignupStepNav } from './SignupStepNav';

type Props = {
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
  const currentStep = SIGNUP_STEPS[currentIndex];

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-outline-variant bg-surface-container-lowest/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <MaterialSymbol name="child_care" />
            </div>
            <div>
              <p className="font-headline text-sm font-bold text-on-surface sm:text-base">
                {t('signup.title')}
              </p>
              <p className="hidden text-xs text-on-surface-variant sm:block">
                {t('signup.stepOf', { current: currentIndex + 1, total: SIGNUP_STEPS.length })}
                {' — '}
                {t(`signup.steps.${currentStep}`)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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

        {/* Thin progress line on mobile */}
        <div className="h-1 w-full bg-outline-variant/40 lg:hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / SIGNUP_STEPS.length) * 100}%` }}
          />
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 p-4 lg:grid-cols-[280px_1fr] lg:gap-8 lg:p-8">
        {/* Sidebar */}
        <aside className="lg:sticky lg:top-[84px] lg:h-[calc(100vh-100px)] lg:self-start">
          <div className="rounded-2xl bg-surface-container-lowest p-4 shadow-sm lg:h-full">
            <SignupStepNav
              currentIndex={currentIndex}
              furthestReached={furthestReached}
              errorSteps={errorSteps}
              onJumpTo={onJumpTo}
              autosaveState={autosaveState}
              autosavedAgoSeconds={autosavedAgoSeconds}
            />
          </div>
        </aside>

        {/* Main content panel */}
        <main className="min-w-0">
          <section className="rounded-3xl bg-surface-container-lowest p-6 shadow-lg sm:p-10">
            {children}
          </section>
        </main>
      </div>
    </div>
  );
}

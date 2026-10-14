import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

export type ApplicationStepGroup = {
  label: string;
  /** First and last step number (1-based, inclusive). */
  from: number;
  to: number;
};

type Props = {
  step: number;
  labels: string[];
  icons?: string[];
  onStepClick?: (step: number) => void;
  /**
   * Last step the parent may open: every step before it is complete. Later steps show a lock.
   * Defaults to the current step.
   */
  lastReachableStep?: number;
  /** Optional headings that split the steps into sections. */
  groups?: ApplicationStepGroup[];
  className?: string;
};

type StepState = 'complete' | 'active' | 'open' | 'locked';

const DEFAULT_ICONS = [
  'account_circle',
  'home',
  'child_care',
  'school',
  'health_and_safety',
  'emergency',
  'restaurant',
  'directions_car',
  'upload_file',
  'task_alt',
] as const;

function StepMarker({ n, state, icon }: { n: number; state: StepState; icon: string }) {
  return (
    <span
      className={cn(
        'relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
        state === 'complete' && 'bg-primary text-primary-foreground',
        state === 'active' && 'bg-surface text-primary ring-2 ring-primary',
        state === 'open' && 'border border-outline-variant bg-surface text-on-surface-variant',
        state === 'locked' && 'bg-surface-container text-on-surface-variant/60',
      )}
      aria-hidden
    >
      {state === 'complete' ? (
        <span className="material-symbols-outlined text-base">check</span>
      ) : state === 'locked' ? (
        <span className="material-symbols-outlined text-sm">lock</span>
      ) : state === 'active' ? (
        <span className="material-symbols-outlined text-base">{icon}</span>
      ) : (
        n
      )}
    </span>
  );
}

/**
 * The application wizard's steps: a sticky vertical timeline on wide screens, a scrollable
 * strip on narrow ones, both with overall progress. Only reachable steps can be opened.
 */
export function ApplicationSteps({
  step,
  labels,
  icons,
  onStepClick,
  lastReachableStep = step,
  groups,
  className,
}: Props) {
  const { t } = useTranslation();
  const stripRef = useRef<HTMLOListElement | null>(null);
  const total = labels.length;
  const sections = groups?.length ? groups : [{ label: '', from: 1, to: total }];
  const progress = Math.round(((step - 1) / Math.max(1, total - 1)) * 100);

  const stateOf = (n: number): StepState => {
    if (n === step) return 'active';
    if (n < step) return 'complete';
    return n > Math.max(step, lastReachableStep) ? 'locked' : 'open';
  };
  const iconOf = (idx: number) => icons?.[idx] ?? DEFAULT_ICONS[idx] ?? 'circle';
  const canOpen = (n: number) => Boolean(onStepClick) && stateOf(n) !== 'active' && stateOf(n) !== 'locked';

  // Keep the current step visible in the narrow-screen strip, without scrolling the page.
  useEffect(() => {
    const strip = stripRef.current;
    const chip = strip?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!strip || !chip || strip.offsetParent === null) return;
    const ltrTarget = chip.offsetLeft - (strip.clientWidth - chip.offsetWidth) / 2;
    const rtl = getComputedStyle(strip).direction === 'rtl';
    strip.scrollTo({ left: rtl ? ltrTarget - (strip.scrollWidth - strip.clientWidth) : ltrTarget, behavior: 'smooth' });
  }, [step]);

  return (
    <nav
      aria-label={t('applications.stepper.label')}
      className={cn(
        'min-w-0 self-start rounded-2xl border border-outline-variant bg-surface p-3 shadow-sm xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto',
        className,
      )}
    >
      <div className="px-1 pb-3">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-semibold text-on-surface">
            {t('applications.stepper.progress', { current: step, total })}
          </span>
          <span className="font-medium text-on-surface-variant">{progress}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-container">
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Narrow screens: one scrollable row. */}
      <ol ref={stripRef} className="relative -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 xl:hidden">
        {labels.map((label, idx) => {
          const n = idx + 1;
          const state = stateOf(n);
          return (
            <li key={label} className="shrink-0">
              <button
                type="button"
                disabled={!canOpen(n)}
                aria-current={state === 'active' ? 'step' : undefined}
                onClick={() => onStepClick?.(n)}
                className={cn(
                  'flex h-10 items-center gap-2 rounded-full border pe-3 ps-1.5 text-xs font-medium transition-colors',
                  state === 'active'
                    ? 'border-primary bg-primary/10 text-on-surface'
                    : 'border-outline-variant bg-surface text-on-surface-variant',
                  canOpen(n) && 'hover:border-primary/60',
                  state === 'locked' && 'opacity-60',
                )}
              >
                <StepMarker n={n} state={state} icon={iconOf(idx)} />
                <span className="whitespace-nowrap">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Wide screens: a vertical timeline, in sections. */}
      <div className="hidden xl:block">
        {sections.map((section) => (
          <div key={`${section.from}-${section.to}`} className="pt-1">
            {section.label ? (
              <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
                {section.label}
              </p>
            ) : null}
            <ol>
              {labels.slice(section.from - 1, section.to).map((label, offset) => {
                const idx = section.from - 1 + offset;
                const n = idx + 1;
                const state = stateOf(n);
                const last = n === section.to;
                const content = (
                  <>
                    <StepMarker n={n} state={state} icon={iconOf(idx)} />
                    <span
                      className={cn(
                        'min-w-0 truncate text-sm',
                        state === 'active' ? 'font-semibold text-on-surface' : 'text-on-surface-variant',
                        state === 'complete' && 'text-on-surface',
                      )}
                    >
                      {label}
                    </span>
                  </>
                );
                return (
                  <li key={label} className="relative">
                    {!last ? (
                      <span
                        aria-hidden
                        className={cn(
                          'absolute start-[1.375rem] top-8 h-[calc(100%-1.25rem)] w-px',
                          n < step ? 'bg-primary/60' : 'bg-outline-variant',
                        )}
                      />
                    ) : null}
                    {canOpen(n) ? (
                      <button
                        type="button"
                        onClick={() => onStepClick?.(n)}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-start transition-colors hover:bg-primary/5"
                      >
                        {content}
                      </button>
                    ) : (
                      <div
                        aria-current={state === 'active' ? 'step' : undefined}
                        aria-disabled={state === 'locked' || undefined}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-2 py-1.5',
                          state === 'active' && 'bg-primary/10',
                          state === 'locked' && 'opacity-70',
                        )}
                      >
                        {content}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </nav>
  );
}

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';

const totalSteps = 6;

interface OnboardingFrameProps {
  step: number;
  title: string;
  description?: string;
  children: ReactNode;
  backTo?: string;
  skipTo?: string;
  nextLabel: string;
  onNext?: () => void;
  submitting?: boolean;
}

export function OnboardingFrame({
  step,
  title,
  description,
  children,
  backTo,
  skipTo,
  nextLabel,
  onNext,
  submitting,
}: OnboardingFrameProps) {
  const progress = (step / totalSteps) * 100;

  return (
    <div className="mx-auto w-full max-w-2xl rounded-3xl bg-surface-container-lowest p-6 shadow-sm md:p-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-sm text-on-surface-variant">
          <span>{`Step ${step} / ${totalSteps}`}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2 rounded-full bg-surface-container-low">
          <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <h1 className="font-headline text-3xl font-extrabold text-on-surface">{title}</h1>
      {description ? <p className="mt-2 text-sm text-on-surface-variant">{description}</p> : null}

      <div className="mt-6 space-y-4">{children}</div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {backTo ? (
            <Button asChild variant="outline">
              <Link to={backTo}>Back</Link>
            </Button>
          ) : (
            <span />
          )}
          {skipTo ? (
            <Button asChild variant="ghost">
              <Link to={skipTo}>Skip</Link>
            </Button>
          ) : null}
        </div>
        <Button onClick={onNext} disabled={submitting}>{submitting ? '...' : nextLabel}</Button>
      </div>
    </div>
  );
}

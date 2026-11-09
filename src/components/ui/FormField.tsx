import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { FieldError } from '@/components/ui/FieldError';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

/**
 * A form field: its label (marked optional when it is), the control, a hint, and the problem under
 * it once there is one (the hint gives way to it). The error's id is `${id}-error`, the hint's
 * `${id}-hint`, for the control's aria-describedby.
 */
export function FormField({
  id,
  label,
  error,
  hint,
  optional = false,
  children,
  className,
}: {
  id: string;
  label: string;
  error?: string | null;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} className="flex items-baseline gap-1.5">
        {label}
        {optional ? <span className="text-xs font-normal text-on-surface-variant">{t('common.optional')}</span> : null}
      </Label>
      {children}
      {hint && !error ? <p id={`${id}-hint`} className="text-xs text-on-surface-variant">{hint}</p> : null}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

/** Why a save failed, shown inside the form (never as a pop-up). */
export function FormProblem({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
      <MaterialSymbol name="error" size="text-base" />
      {message}
    </p>
  );
}

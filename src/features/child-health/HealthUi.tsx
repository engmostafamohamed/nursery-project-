import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/FieldError';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

import { TILE, type Tone } from './healthFormat';

/** The building blocks every part of the health profile shares, so they all read alike. */

const PILL: Record<Tone, string> = {
  error: 'border-error/30 bg-error/10 text-error',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  success: 'border-success/30 bg-success/10 text-success',
  primary: 'border-primary/30 bg-primary/10 text-primary',
  neutral: 'border-outline-variant bg-surface-high text-on-surface-variant',
};

export function Pill({ tone = 'neutral', icon, children, className }: { tone?: Tone; icon?: string; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold', PILL[tone], className)}>
      {icon ? <MaterialSymbol name={icon} size="text-sm" /> : null}
      {children}
    </span>
  );
}

/** A part of the profile: icon, title, a one-line hint, a count, and its add button. */
export function HealthCard({
  id,
  icon,
  title,
  hint,
  count,
  action,
  tone = 'primary',
  children,
  className,
}: {
  id: string;
  icon: string;
  title: string;
  hint?: string;
  count?: number;
  action?: ReactNode;
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn('scroll-mt-24 overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm', className)}>
      <header className="flex items-start gap-3 border-b border-outline-variant bg-surface-container-lowest px-4 py-3.5 sm:px-5">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', TILE[tone])} aria-hidden>
          <MaterialSymbol name={icon} size="text-xl" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-title`} className="flex items-center gap-2 font-semibold text-on-surface">
            {title}
            {count !== undefined ? <span className="rounded-full bg-surface-high px-2 py-0.5 text-xs font-semibold text-on-surface-variant">{count}</span> : null}
          </h2>
          {hint ? <p className="mt-0.5 text-xs text-on-surface-variant">{hint}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

/** The "Add …" button in a card's header. */
export function AddButton({ label, onClick, testId }: { label: string; onClick: () => void; testId?: string }) {
  return (
    <Button type="button" size="sm" variant="outline" onClick={onClick} data-testid={testId}>
      <MaterialSymbol name="add" size="text-base" className="me-1" />
      {label}
    </Button>
  );
}

/** Nothing recorded yet: an icon, why it matters, and the way to add the first one. */
export function EmptyNote({ icon, text, action }: { icon: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-outline-variant px-4 py-6 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-high text-on-surface-variant" aria-hidden>
        <MaterialSymbol name={icon} size="text-xl" />
      </span>
      <p className="text-sm text-on-surface-variant">{text}</p>
      {action}
    </div>
  );
}

/** A labelled value; a dash when there is none. */
export function Detail({ label, value, wide = false, className }: { label: string; value: ReactNode; wide?: boolean; className?: string }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className={cn('min-w-0', wide && 'sm:col-span-2', className)}>
      <dt className="text-xs font-medium text-on-surface-variant">{label}</dt>
      <dd className={cn('mt-0.5 whitespace-pre-line break-words text-sm', empty ? 'text-on-surface-variant' : 'text-on-surface')}>{empty ? '—' : value}</dd>
    </div>
  );
}

/** Edit and delete buttons for one item, named after it for screen readers. */
export function ItemActions({ name, onEdit, onDelete }: { name: string; onEdit: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 gap-1">
      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onEdit} aria-label={t('health.profile.actions.editItem', { name })} title={t('common.edit')}>
        <MaterialSymbol name="edit" size="text-lg" />
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-error hover:bg-error/10 hover:text-error" onClick={onDelete} aria-label={t('health.profile.actions.deleteItem', { name })} title={t('common.delete')}>
        <MaterialSymbol name="delete" size="text-lg" />
      </Button>
    </div>
  );
}

/** A form field: its label, the control, a hint, and the problem under it once there is one. */
export function FormField({ id, label, error, hint, optional = false, children, className }: {
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
        {optional ? <span className="text-xs font-normal text-on-surface-variant">{t('health.profile.optional')}</span> : null}
      </Label>
      {children}
      {hint && !error ? <p id={`${id}-hint`} className="text-xs text-on-surface-variant">{hint}</p> : null}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

/** Why a save failed, shown in the form (never as a pop-up). */
export function FormProblem({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
      <MaterialSymbol name="error" size="text-base" />
      {message}
    </p>
  );
}

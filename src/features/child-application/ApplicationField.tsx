import { Children, cloneElement, isValidElement, useContext, type FocusEventHandler, type ReactNode } from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import { FieldValidationContext } from './fieldValidation';

/** A labelled field of the application form; its error comes from FieldValidationContext. */

export function FieldErrorText({ error }: { error?: string }) {
  return error ? <p className="text-xs font-medium text-error" data-field-invalid="true">{error}</p> : null;
}

export function FormField({
  label,
  children,
  className,
  hint,
  name,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  hint?: string;
  /** Validated field name; its error (from FieldValidationContext) shows under the control. */
  name?: string;
}) {
  const validation = useContext(FieldValidationContext);
  const error = name ? validation?.errorFor(name) : undefined;
  const childList = Children.toArray(children);
  const filled = childList.some((child) => {
    if (!isValidElement<{ value?: unknown }>(child)) return false;
    const value = child.props.value;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return true;
    return Boolean(value);
  });
  const controlClassName = filled
    ? 'border-primary/40 bg-primary-container/35 text-on-surface shadow-sm ring-1 ring-primary/10'
    : 'border-outline-variant bg-surface/95 text-on-surface shadow-sm';
  const styledChildren = Children.map(children, (child) => {
    if (!isValidElement<{ className?: string; onFocus?: FocusEventHandler; onBlur?: FocusEventHandler; 'aria-invalid'?: boolean }>(child)) return child;
    return cloneElement(child, {
      className: cn(controlClassName, child.props.className, error && 'border-error ring-1 ring-error/30'),
      'aria-invalid': error ? true : undefined,
      ...(name && validation
        ? {
            onFocus: (event) => {
              child.props.onFocus?.(event);
              validation.onFieldFocus(name);
            },
            onBlur: (event) => {
              child.props.onBlur?.(event);
              validation.onFieldBlur(name);
            },
          }
        : {}),
    });
  });

  return (
    <div className={cn('space-y-2', className)}>
      <Label className="flex min-h-10 items-end text-sm font-semibold leading-5 text-on-surface">{label}</Label>
      {styledChildren}
      {error ? <FieldErrorText error={error} /> : hint ? <p className="text-xs text-on-surface-variant">{hint}</p> : null}
    </div>
  );
}

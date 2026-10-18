import { cn } from '@/lib/utils';

/** A validation message under its field (red), or nothing. */
export function FieldError({ id, message, className }: { id?: string; message?: string | null; className?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className={cn('text-xs text-error', className)}>
      {message}
    </p>
  );
}

/** Red border for an input whose error is showing. */
export const invalidFieldClass = 'border-error focus-visible:ring-error';

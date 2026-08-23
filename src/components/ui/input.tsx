import * as React from 'react';

import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Matches Select and Textarea: they carried a real border while this used
          // border-ghost at 15% opacity, which read as no border at all.
          'flex h-12 w-full rounded-lg border border-outline-variant px-3 py-2 text-base',
          'bg-surface-container-lowest text-foreground shadow-sm',
          'placeholder:text-on-surface-variant',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };

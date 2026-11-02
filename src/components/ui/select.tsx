import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The app's dropdown: a native select boxed like Input. The arrow and, where the browser allows
 * it, the open list's look (matching FilterMenu) come from `select` rules in index.css.
 */
const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<'select'>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-12 w-full appearance-none rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-base text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

export { Select };

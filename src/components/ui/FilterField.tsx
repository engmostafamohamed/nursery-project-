import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** A filter control with its label above it, so date and select filters say what they filter. */
export function FilterField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block min-w-[10rem] flex-1 space-y-1', className)}>
      <span className="block text-xs font-semibold text-on-surface-variant">{label}</span>
      {children}
    </label>
  );
}

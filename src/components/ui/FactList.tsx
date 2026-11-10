import type { ReactNode } from 'react';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

/** Facts as label–value rows inside a card (a TableCard's body): <FactList><Fact …/>…</FactList>. */
export function FactList({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn('divide-y divide-outline-variant', className)}>{children}</dl>;
}

/**
 * One fact: an icon, its label and its value at the far end. `ltr` keeps numbers, phones and emails
 * the right way round in Arabic; an empty value shows a dash.
 */
export function Fact({ icon, label, value, ltr = false }: { icon: string; label: string; value: ReactNode; ltr?: boolean }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <MaterialSymbol name={icon} size="text-lg" className="shrink-0 text-on-surface-variant" />
      <dt className="text-sm text-on-surface-variant">{label}</dt>
      <dd className="ms-auto min-w-0 text-end text-sm font-medium text-on-surface">
        {empty ? '—' : ltr ? <span dir="ltr">{value}</span> : value}
      </dd>
    </div>
  );
}

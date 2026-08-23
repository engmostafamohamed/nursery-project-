import type { PropsWithChildren } from 'react';

import { cn } from '@/lib/utils';

export function BottomSheet({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <section className={cn('rounded-t-[2.5rem] bg-surface/85 p-5 backdrop-blur-2xl', className)}>
      <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-outline-variant" />
      {children}
    </section>
  );
}

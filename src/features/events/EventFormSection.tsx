import type { ReactNode } from 'react';

import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { TONE_TINT } from '@/components/ui/toneClasses';
import type { PillTone } from '@/lib/tones';
import { cn } from '@/lib/utils';

/** One part of the event form: an icon tile, a title and a hint, then its fields. */
export function EventFormSection({ icon, title, hint, tone = 'primary', aside, children, className }: {
  icon: string;
  title: string;
  hint?: string;
  tone?: PillTone;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-4 rounded-2xl border border-outline-variant bg-surface p-4 shadow-sm sm:p-5', className)}>
      <header className="flex flex-wrap items-start gap-3">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', TONE_TINT[tone])}>
          <MaterialSymbol name={icon} size="text-xl" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-on-surface">{title}</h2>
          {hint ? <p className="text-xs text-on-surface-variant">{hint}</p> : null}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

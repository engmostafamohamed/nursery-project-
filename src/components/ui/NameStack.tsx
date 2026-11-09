import type { NameLines } from '@/lib/bilingualName';
import { cn } from '@/lib/utils';

/** A name on one line and, when the nursery shows both languages, the other name under it. */
export function NameStack({ name, strong = false, className }: { name: NameLines; strong?: boolean; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className={cn('truncate text-on-surface', strong ? 'font-semibold' : 'font-medium')} title={name.primary}>
        {name.primary}
      </p>
      {name.secondary ? (
        <p className="truncate text-xs text-on-surface-variant" title={name.secondary}>
          {name.secondary}
        </p>
      ) : null}
    </div>
  );
}

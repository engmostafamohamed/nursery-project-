import { useTranslation } from 'react-i18next';

import { TONE_FILL } from '@/components/ui/toneClasses';
import { cn } from '@/lib/utils';

import { capacityFill } from './classCapacity';

/** The class's children against its places ("18 / 25") with a bar: green, amber from 90%, red over. */
export function ClassCapacityMeter({ count, capacity, className }: { count: number; capacity: number | null; className?: string }) {
  const { t } = useTranslation();
  const fill = capacityFill(count, capacity);
  return (
    <div className={cn('min-w-[8.5rem]', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn('font-semibold tabular-nums', fill.over ? 'text-error' : 'text-on-surface')} dir="ltr">
          {count}
          {capacity !== null ? ` / ${capacity}` : ''}
        </span>
        {fill.over ? (
          <span className="rounded-full bg-error/10 px-2 py-0.5 text-[11px] font-semibold text-error">{t('admin.classes.list.overBy', { count: fill.over })}</span>
        ) : null}
      </div>
      {fill.pct !== null ? (
        <div
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-high"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={capacity ?? 0}
          aria-valuenow={count}
          aria-label={t('classProfile.capacityLabel', { count, capacity })}
        >
          <div className={cn('h-full rounded-full', TONE_FILL[fill.tone])} style={{ width: `${Math.min(100, fill.pct)}%` }} />
        </div>
      ) : null}
    </div>
  );
}

import type { ReactNode } from 'react';

import type { MilestoneItem } from '@/hooks/useMilestones';
import { formatDate } from '@/lib/datetime';

import { groupByMonth } from './milestones';

/** The milestones as a timeline: a heading per month, newest first, and a grid of cards under each. */
export function MilestoneMonths({ items, card }: { items: MilestoneItem[]; card: (m: MilestoneItem) => ReactNode }) {
  return (
    <div className="space-y-6 p-4 sm:p-5">
      {groupByMonth(items).map((group) => (
        <section key={group.month} className="space-y-3" aria-labelledby={`month-${group.month}`}>
          <h3 id={`month-${group.month}`} className="flex items-center gap-2 text-sm font-semibold text-on-surface">
            <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
            {formatDate(`${group.month}-01T00:00:00`, { month: 'long', year: 'numeric' })}
            <span className="text-xs font-normal text-on-surface-variant">· {group.items.length}</span>
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{group.items.map(card)}</div>
        </section>
      ))}
    </div>
  );
}

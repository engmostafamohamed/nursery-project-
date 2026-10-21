import { cn } from '@/lib/utils';

/** Colour key for a chart: a dot and a label per series. */
export function ChartLegend({ items, className }: { items: Array<{ label: string; color: string }>; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-on-surface-variant', className)}>
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

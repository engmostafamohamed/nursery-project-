import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/*
 * Small pieces the platform dashboard's charts share: the hover readout, the legend, and a table
 * twin of each chart for screen readers (every value stays reachable without hovering).
 */

export type TooltipRow = { key: string; color: string; name: string; value: string; shape?: 'line' | 'box' };

/** The hover readout: the values lead, the series names follow, each keyed by a short stroke of its colour. */
export function ChartTooltipBox({ title, rows, note, dir }: { title: string; rows: TooltipRow[]; note?: string; dir: 'ltr' | 'rtl' }) {
  return (
    <div dir={dir} className="min-w-[9rem] rounded-lg border border-outline-variant bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-on-surface-variant">{title}</p>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2">
            <span
              className={cn('shrink-0', row.shape === 'box' ? 'h-2.5 w-2.5 rounded-sm' : 'h-0.5 w-3 rounded-full')}
              style={{ background: row.color }}
              aria-hidden
            />
            <span className="font-semibold tabular-nums text-on-surface">{row.value}</span>
            <span className="text-on-surface-variant">{row.name}</span>
          </li>
        ))}
      </ul>
      {note ? <p className="mt-1 text-on-surface-variant">{note}</p> : null}
    </div>
  );
}

/** A legend of line keys (for line charts) or swatches (for bars and segments). */
export function ChartLegend({ items, className }: { items: Array<{ key: string; color: string; label: string; shape?: 'line' | 'box' }>; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-on-surface-variant', className)}>
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <span
            className={cn('shrink-0', item.shape === 'box' ? 'h-2.5 w-2.5 rounded-sm' : 'h-0.5 w-4 rounded-full')}
            style={{ background: item.color }}
            aria-hidden
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** The chart's numbers as a table only screen readers see. */
export function ScreenReaderTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: ReactNode[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A quiet "nothing here yet" line inside a card. */
export function PanelEmpty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-on-surface-variant sm:px-5">{children}</p>;
}

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import type { PillTone } from '@/lib/tones';
import { cn } from '@/lib/utils';

import { TONE_TINT } from './toneClasses';

export type StatTone = PillTone;

const TONE_TEXT: Record<StatTone, string> = {
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  neutral: 'text-on-surface-variant',
};

const LINK_CLASS =
  'outline-none transition hover:border-primary/50 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary/30';

type StatTileProps = {
  icon: string;
  label: string;
  value: ReactNode;
  tone?: StatTone;
  /** A short line under the value, e.g. "Last 7 days". */
  helper?: string;
  /** When set, the whole tile is a link. */
  to?: string;
  /** When set (and no `to`), the tile is a toggle button, e.g. to filter a list by this number. */
  onClick?: () => void;
  /** The pressed state of an `onClick` tile. */
  active?: boolean;
  className?: string;
};

/**
 * One headline number with its label. On phones the icon sits above the text so the value gets
 * the full tile width; labels wrap instead of being cut off.
 */
export function StatTile({ icon, label, value, tone = 'primary', helper, to, onClick, active = false, className }: StatTileProps) {
  const content = (
    <>
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-md', TONE_TINT[tone])}>
        <span className="material-symbols-outlined text-xl" aria-hidden>{icon}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-xs font-medium leading-4 text-on-surface-variant">{label}</span>
        <span className="mt-1 block break-words text-xl font-bold leading-7 tabular-nums text-on-surface">{value}</span>
        {helper ? <span className="mt-0.5 line-clamp-2 block text-xs leading-4 text-on-surface-variant">{helper}</span> : null}
      </span>
    </>
  );

  const tileClass = cn(
    'group flex min-w-0 flex-col gap-3 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm sm:flex-row sm:items-center',
    (to || onClick) && LINK_CLASS,
    active && 'border-primary bg-primary/5 ring-1 ring-primary',
    className,
  );

  if (to) {
    return (
      <Link to={to} className={tileClass}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={cn(tileClass, 'text-start')} aria-pressed={active} onClick={onClick}>
        {content}
      </button>
    );
  }
  return <div className={tileClass}>{content}</div>;
}

export type StatStripItem = {
  icon: string;
  label: string;
  value: ReactNode;
  tone?: StatTone;
  helper?: string;
  to?: string;
};

/**
 * Secondary numbers in one bordered strip instead of a second row of tiles: side by side from
 * `sm`, and one "label … value" line each on phones.
 */
export function StatStrip({ items, className }: { items: StatStripItem[]; className?: string }) {
  return (
    <div
      className={cn(
        'grid divide-y divide-outline-variant overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm sm:auto-cols-fr sm:grid-flow-col sm:divide-x sm:divide-y-0 sm:rtl:divide-x-reverse',
        className,
      )}
    >
      {items.map((item) => {
        const cellClass = 'flex min-w-0 items-center justify-between gap-3 px-4 py-3 sm:block sm:p-4';
        const body = (
          <>
            <span className="flex min-w-0 items-start gap-1.5 text-xs font-medium leading-4 text-on-surface-variant">
              <span className={cn('material-symbols-outlined shrink-0 text-base leading-4', TONE_TEXT[item.tone ?? 'primary'])} aria-hidden>
                {item.icon}
              </span>
              <span className="line-clamp-2">{item.label}</span>
            </span>
            <span className="block shrink-0 text-end sm:mt-1.5 sm:text-start">
              <span className="block break-words text-lg font-bold leading-6 tabular-nums text-on-surface">{item.value}</span>
              {item.helper ? <span className="mt-0.5 block text-xs leading-4 text-on-surface-variant">{item.helper}</span> : null}
            </span>
          </>
        );
        return item.to ? (
          <Link
            key={item.label}
            to={item.to}
            className={cn(cellClass, 'outline-none transition hover:bg-surface-container-lowest focus-visible:bg-surface-container-lowest')}
          >
            {body}
          </Link>
        ) : (
          <div key={item.label} className={cellClass}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

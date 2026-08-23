import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';

interface StatsCardProps {
  icon: ReactNode;
  value: string;
  label: string;
  /** Optional sub-label (e.g. trend vs last month). */
  hint?: string;
  className?: string;
  /** When set, the whole card is a link and navigates on click. */
  to?: string;
}

export function StatsCard({ icon, value, label, hint, className, to }: StatsCardProps) {
  const cardClassName = cn(
    'group rounded-md bg-surface-container-lowest p-5 shadow-sm transition-colors hover:bg-primary',
    to && 'block cursor-pointer no-underline outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
    className,
  );

  const inner = (
    <>
      <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-secondary-fixed text-primary">
        {icon}
      </div>
      <p className="text-3xl font-black text-on-surface transition-colors group-hover:text-white">{value}</p>
      <p className="mt-1 text-sm text-on-surface-variant transition-colors group-hover:text-white">{label}</p>
      {hint ? (
        <p className="mt-1 text-xs text-on-surface-variant/90 transition-colors group-hover:text-white/90">{hint}</p>
      ) : null}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={cardClassName}>
        {inner}
      </Link>
    );
  }

  return <div className={cardClassName}>{inner}</div>;
}

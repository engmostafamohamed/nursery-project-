import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type PageHeaderProps = {
  icon: string;
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  /** Buttons on the trailing side (wrap under the title on phones). */
  actions?: ReactNode;
  /** Extra bands under the title, e.g. stats or filters; each child gets its own divided, padded row. */
  children?: ReactNode;
  className?: string;
};

/** A page's title card: icon, title and actions, with optional bands (stats, filters) below. */
export function PageHeader({ icon, title, eyebrow, description, actions, children, className }: PageHeaderProps) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm', className)}>
      <div className="flex flex-col gap-4 bg-surface-container-lowest p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-md">
            <span className="material-symbols-outlined text-2xl" aria-hidden>{icon}</span>
          </span>
          <div className="min-w-0">
            {eyebrow ? <p className="text-xs font-semibold uppercase text-primary">{eyebrow}</p> : null}
            <h1 className="text-2xl font-bold leading-tight text-on-surface">{title}</h1>
            {description ? <div className="mt-1 text-sm text-on-surface-variant">{description}</div> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2 lg:shrink-0 lg:justify-end">{actions}</div> : null}
      </div>
      {children ? (
        <div className="divide-y divide-outline-variant border-t border-outline-variant [&>*]:p-4 sm:[&>*]:p-5">{children}</div>
      ) : null}
    </section>
  );
}

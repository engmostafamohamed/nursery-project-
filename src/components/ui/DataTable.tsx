import type { ComponentProps, ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/skeleton';
import type { Pagination as Pager } from '@/hooks/usePagination';
import { cn } from '@/lib/utils';

/*
 * One look for every list page:
 *   <TableCard title count filters={<FilterBar>…</FilterBar>} pagination={<TablePagination pager={pager} />}>
 *     <DataTable><THead>…<Th/>…</THead><TBody>…<Tr><Td/></Tr>…</TBody></DataTable>
 *   </TableCard>
 * Loading and empty states go in place of the table: <TableLoading /> / <TableEmpty />.
 */

type TableCardProps = {
  title: string;
  /** Result count shown next to the title, e.g. "12 classes". */
  count?: string;
  /** Buttons on the trailing side of the title strip. */
  actions?: ReactNode;
  /** A <FilterBar> above the table. */
  filters?: ReactNode;
  /** A <TablePagination> (client-side paging) or <TablePager> (server-side paging) under the table. */
  pagination?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function TableCard({ title, count, actions, filters, pagination, children, className }: TableCardProps) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant bg-surface-container-lowest px-4 py-3 sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-on-surface">{title}</h2>
          {count ? (
            <span className="rounded-full bg-surface-high px-2.5 py-0.5 text-xs font-medium tabular-nums text-on-surface-variant">{count}</span>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {filters ? <div className="border-b border-outline-variant px-4 py-4 sm:px-5">{filters}</div> : null}
      {children}
      {pagination}
    </section>
  );
}

const PAGER_BAND = 'px-4 py-3 sm:px-5';

/** The pager band of a TableCard when the server pages the list (pass the Pagination props yourself). */
export function TablePager(props: ComponentProps<typeof Pagination>) {
  return <Pagination {...props} className={cn(PAGER_BAND, props.className)} />;
}

/** The pager band of a TableCard for a client-side `usePagination` list; nothing when one page fits. */
export function TablePagination<T>({ pager, pageSizeOptions }: { pager: Pager<T>; pageSizeOptions?: number[] }) {
  return (
    <Pagination
      page={pager.page}
      pageCount={pager.pageCount}
      total={pager.total}
      startIndex={pager.startIndex}
      endIndex={pager.endIndex}
      hasPrev={pager.hasPrev}
      hasNext={pager.hasNext}
      onPrev={pager.prev}
      onNext={pager.next}
      onPageChange={pager.setPage}
      pageSize={pager.pageSize}
      pageSizeOptions={pageSizeOptions}
      onPageSizeChange={pager.setPageSize}
      className={PAGER_BAND}
    />
  );
}

export function DataTable({ children, minWidth = 720, className }: { children: ReactNode; minWidth?: number; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full text-sm', className)} style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-surface-container-lowest text-xs text-on-surface-variant">
      <tr>{children}</tr>
    </thead>
  );
}

type Align = 'start' | 'center' | 'end';
const ALIGN: Record<Align, string> = { start: 'text-start', center: 'text-center', end: 'text-end' };

export type ThSort = { active: boolean; direction: 'asc' | 'desc'; onToggle: () => void };

/** A header cell; with `sort` it becomes a sort button showing the current direction. */
export function Th({ children, align = 'start', sort, className }: { children?: ReactNode; align?: Align; sort?: ThSort; className?: string }) {
  return (
    <th
      scope="col"
      className={cn('px-4 py-3 font-semibold', ALIGN[align], className)}
      aria-sort={sort ? (sort.active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
    >
      {sort ? (
        <button type="button" onClick={sort.onToggle} className="inline-flex items-center gap-1 rounded hover:text-on-surface">
          {children}
          <span className={cn('material-symbols-outlined text-base', !sort.active && 'opacity-40')} aria-hidden>
            {!sort.active ? 'unfold_more' : sort.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}
          </span>
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-outline-variant">{children}</tbody>;
}

/**
 * A row; with `onClick` the whole row opens something and works with Enter / Space too.
 * Links, buttons and fields inside the row keep their own behaviour.
 */
export function Tr({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <tr
      className={cn(
        'transition-colors hover:bg-surface-container-lowest',
        onClick && 'cursor-pointer outline-none focus-visible:bg-surface-container-lowest',
        className,
      )}
      onClick={
        onClick
          ? (e) => {
              if ((e.target as HTMLElement).closest('a, button, input, select, textarea, label, [role="menuitem"]')) return;
              onClick();
            }
          : undefined
      }
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {children}
    </tr>
  );
}

export function Td({ children, align = 'start', className, colSpan }: { children?: ReactNode; align?: Align; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn('px-4 py-3 align-middle', ALIGN[align], className)}>
      {children}
    </td>
  );
}

export type PillTone = 'primary' | 'success' | 'warning' | 'error' | 'neutral';

const PILL: Record<PillTone, { pill: string; dot: string }> = {
  primary: { pill: 'border-primary/30 bg-primary/10 text-primary', dot: 'bg-primary' },
  success: { pill: 'border-success/30 bg-success/10 text-success', dot: 'bg-success' },
  warning: { pill: 'border-warning/30 bg-warning/10 text-warning', dot: 'bg-warning' },
  error: { pill: 'border-error/30 bg-error/10 text-error', dot: 'bg-error' },
  neutral: { pill: 'border-outline-variant bg-surface-high text-on-surface-variant', dot: 'bg-outline' },
};

/** A status chip in a table cell: a coloured dot (or icon) and a short label. */
export function StatusPill({ tone = 'neutral', icon, children, className }: { tone?: PillTone; icon?: string; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold', PILL[tone].pill, className)}>
      {icon ? (
        <span className="material-symbols-outlined text-sm" aria-hidden>{icon}</span>
      ) : (
        <span className={cn('h-1.5 w-1.5 rounded-full', PILL[tone].dot)} aria-hidden />
      )}
      {children}
    </span>
  );
}

/** An icon-only row action (view / edit / delete …); `label` is its accessible name and tooltip. */
export function IconAction({
  icon,
  label,
  onClick,
  to,
  danger = false,
  disabled = false,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
  to?: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  const className = cn(
    'inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-40',
    danger ? 'text-error hover:bg-error/10' : 'text-on-surface-variant hover:bg-surface-high hover:text-primary',
  );
  const content = <span className="material-symbols-outlined text-lg" aria-hidden>{icon}</span>;
  if (to) {
    return (
      <Link to={to} className={className} aria-label={label} title={label} onClick={(e) => e.stopPropagation()}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {content}
    </button>
  );
}

/** Placeholder rows while a list loads. */
export function TableLoading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4 sm:p-5">
      {Array.from({ length: rows }, (_, k) => (
        <Skeleton key={k} className="h-12 w-full" />
      ))}
    </div>
  );
}

/** The empty / no-results message in place of a table. */
export function TableEmpty({ icon, title, description, action }: { icon: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="p-4 sm:p-5">
      <EmptyState icon={icon} title={title} description={description ?? ''} action={action} />
    </div>
  );
}

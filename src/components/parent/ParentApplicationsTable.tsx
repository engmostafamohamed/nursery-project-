import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { ApplicationStatusBadge } from '@/components/applications/ApplicationStatusBadge';
import { Button } from '@/components/ui/button';
import { DataTable, TBody, Td, Th, THead, TableCard, TableEmpty, TableLoading, TablePagination, Tr } from '@/components/ui/DataTable';
import { FilterChips } from '@/components/ui/FilterChips';
import { usePagination } from '@/hooks/usePagination';
import { STEP_DATE_TIME } from '@/lib/admissionTimeline';
import { formatDateTime } from '@/lib/datetime';
import { cn, getUserInitials } from '@/lib/utils';

type StatusFilter = 'all' | 'draft' | 'in_review' | 'approved' | 'rejected';

const IN_REVIEW = new Set(['submitted', 'under_review', 'documents_pending']);

function text(source: Record<string, unknown> | undefined, key: string): string {
  const value = source?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

/** The parent's applications as a table: one row per child, with status, dates and the next step. */
export function ParentApplicationsTable({
  rows,
  isLoading,
  onNewApplication,
}: {
  rows: Record<string, unknown>[];
  isLoading: boolean;
  onNewApplication: () => void;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isAr = i18n.language.startsWith('ar');
  const [filter, setFilter] = useState<StatusFilter>('all');

  const items = useMemo(
    () =>
      rows.map((row) => {
        const child = row.child_info_json as Record<string, unknown> | undefined;
        const en = text(child, 'full_name_en') || text(child, 'full_name');
        const ar = text(child, 'full_name_ar');
        const status = String(row.status ?? 'draft');
        return {
          id: String(row.id),
          name: (isAr ? ar || en : en || ar) || '',
          status,
          group: (status === 'draft' ? 'draft' : IN_REVIEW.has(status) ? 'in_review' : status) as StatusFilter,
          submittedAt: typeof row.submitted_at === 'string' ? row.submitted_at : null,
          updatedAt: typeof row.updated_at === 'string' ? row.updated_at : typeof row.created_at === 'string' ? row.created_at : null,
        };
      }),
    [rows, isAr],
  );
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: items.length, draft: 0, in_review: 0, approved: 0, rejected: 0 };
    for (const item of items) if (item.group in c) c[item.group] += 1;
    return c;
  }, [items]);
  const filtered = filter === 'all' ? items : items.filter((item) => item.group === filter);
  const pager = usePagination(filtered, 5, filter);

  const chipLabel: Record<StatusFilter, string> = {
    all: t('parent.dashboard.applicationsTable.all'),
    draft: t('applications.statuses.draft'),
    in_review: t('parent.dashboard.applicationsTable.inReview'),
    approved: t('applications.statuses.approved'),
    rejected: t('applications.statuses.rejected'),
  };
  const nameCell = (item: (typeof items)[number]) =>
    item.name ? (
      <span className="font-semibold text-on-surface">{item.name}</span>
    ) : (
      <span className="font-semibold italic text-on-surface-variant">{t('parent.dashboard.admissionCycle.newApplication')}</span>
    );
  const submitted = (item: (typeof items)[number]) =>
    item.submittedAt ? formatDateTime(item.submittedAt, STEP_DATE_TIME) : t('parent.dashboard.admissionCycle.notSubmitted');
  const actionButton = (item: (typeof items)[number], className?: string) => (
    <Button asChild size="sm" variant={item.status === 'draft' ? 'default' : 'outline'} className={className}>
      <Link to={`/parent/applications/${item.id}`}>
        {item.status === 'draft' ? t('parent.dashboard.applicationsTable.continue') : t('parent.dashboard.applicationsTable.open')}
        <span className="material-symbols-outlined ms-1 text-base rtl:rotate-180" aria-hidden>chevron_right</span>
      </Link>
    </Button>
  );

  return (
    <TableCard
      title={t('parent.dashboard.sectionApplications')}
      count={items.length ? t('parent.dashboard.applicationsTable.count', { count: items.length }) : undefined}
      actions={
        <Button type="button" variant="outline" onClick={onNewApplication}>
          <span className="material-symbols-outlined me-1 text-base" aria-hidden>person_add</span>
          {t('applications.createApplication', { defaultValue: 'Add child' })}
        </Button>
      }
      filters={
        items.length > 1 ? (
          <FilterChips
            label={t('parent.dashboard.sectionApplications')}
            value={filter}
            onChange={setFilter}
            hideEmpty
            options={(['all', 'draft', 'in_review', 'approved', 'rejected'] as const).map((value) => ({
              value,
              label: chipLabel[value],
              count: counts[value],
            }))}
          />
        ) : null
      }
      pagination={filtered.length ? <TablePagination pager={pager} pageSizeOptions={[5, 10, 20]} /> : null}
    >
      {isLoading ? (
        <TableLoading rows={3} />
      ) : !items.length ? (
        <TableEmpty icon="assignment" title={t('parent.dashboard.noApplications')} />
      ) : (
        <>
          {/* Phones: one card per application. */}
          <ul className="divide-y divide-outline-variant md:hidden">
            {pager.pageItems.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden>
                  {item.name ? getUserInitials(item.name, null) : <span className="material-symbols-outlined text-lg">edit_document</span>}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{nameCell(item)}</p>
                  <p className="mt-0.5 truncate text-xs text-on-surface-variant">{submitted(item)}</p>
                  <ApplicationStatusBadge status={item.status} className="mt-1.5" />
                </div>
                {actionButton(item, 'shrink-0')}
              </li>
            ))}
          </ul>

          {/* Tablets and up: the table. */}
          <div className="hidden md:block">
            <DataTable minWidth={640}>
              <THead>
                <Th>{t('parent.dashboard.applicationsTable.child')}</Th>
                <Th>{t('parent.dashboard.applicationsTable.status')}</Th>
                <Th>{t('parent.dashboard.applicationsTable.submitted')}</Th>
                <Th>{t('parent.dashboard.applicationsTable.updated')}</Th>
                <Th align="end">{t('parent.dashboard.applicationsTable.action')}</Th>
              </THead>
              <TBody>
                {pager.pageItems.map((item) => (
                  <Tr key={item.id} onClick={() => navigate(`/parent/applications/${item.id}`)}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden>
                          {item.name ? getUserInitials(item.name, null) : <span className="material-symbols-outlined text-lg">edit_document</span>}
                        </span>
                        <span className="min-w-0 truncate text-sm">{nameCell(item)}</span>
                      </div>
                    </Td>
                    <Td>
                      <ApplicationStatusBadge status={item.status} />
                    </Td>
                    <Td className={cn('text-sm', item.submittedAt ? 'text-on-surface' : 'text-on-surface-variant')}>{submitted(item)}</Td>
                    <Td className="text-sm text-on-surface-variant">{item.updatedAt ? formatDateTime(item.updatedAt, STEP_DATE_TIME) : '—'}</Td>
                    <Td align="end">{actionButton(item)}</Td>
                  </Tr>
                ))}
              </TBody>
            </DataTable>
          </div>
        </>
      )}
    </TableCard>
  );
}

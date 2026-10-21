import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { ApplicationStatusBadge } from '@/components/applications/ApplicationStatusBadge';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  IconAction,
  TableCard,
  TableEmpty,
  TableLoading,
  TablePagination,
  TBody,
  THead,
  Td,
  Th,
  Tr,
} from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { StatTile } from '@/components/ui/StatTile';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useApplications } from '@/hooks/useApplications';
import { usePagination } from '@/hooks/usePagination';
import { STEP_DATE_TIME } from '@/lib/admissionTimeline';
import { formatDateTime } from '@/lib/datetime';

const STATUSES = ['draft', 'submitted', 'under_review', 'documents_pending', 'approved', 'rejected'] as const;
/** Decided applications leave the default "open" list. */
const DECIDED = new Set(['approved', 'rejected']);

/**
 * Two flows write applications with different shapes: the inquiry flow stores a flat
 * { full_name }, while parent signup stores { father, mother, ... } and the child's
 * name as full_name_en/full_name_ar. Read both so neither renders as a blank row.
 */
function applicantParentName(parentInfo: Record<string, unknown>): string {
  const direct = parentInfo.full_name;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  for (const key of ['mother', 'father'] as const) {
    const parent = parentInfo[key] as Record<string, unknown> | null | undefined;
    const name = parent?.full_name;
    if (typeof name === 'string' && name.trim()) return name.trim();
  }
  return '';
}

function applicantChildName(childInfo: Record<string, unknown>): string {
  for (const key of ['full_name', 'full_name_en', 'full_name_ar'] as const) {
    const name = childInfo[key];
    if (typeof name === 'string' && name.trim()) return name.trim();
  }
  return '';
}

function shortApplicationId(id: unknown): string {
  const value = typeof id === 'string' ? id.trim() : '';
  return value ? value.slice(0, 8) : '-';
}

export function AdminApplicationsPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { activeNurseryId } = useActiveNurseryId();
  const apps = useApplications({ nurseryId: activeNurseryId ?? undefined });
  const [status, setStatus] = useState('open');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const admissionsBasePath = location.pathname.startsWith('/xo-admin/')
    ? '/xo-admin/nursery/admissions'
    : '/admin/admissions';

  const rows = useMemo(() => apps.adminApplications.filter((r) => {
    const rowStatus = String(r.status);
    if (status === 'open' && DECIDED.has(rowStatus)) return false;
    if (status !== 'open' && status !== 'all' && rowStatus !== status) return false;
    if (from && String(r.created_at) < `${from}T00:00:00`) return false;
    if (to && String(r.created_at) > `${to}T23:59:59`) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const parent = (r.parent_info_json as Record<string, unknown> | undefined) ?? {};
    const child = (r.child_info_json as Record<string, unknown> | undefined) ?? {};
    return [
      String(r.id ?? ''),
      shortApplicationId(r.id),
      applicantParentName(parent),
      applicantChildName(child),
    ].join(' ').toLowerCase().includes(q);
  }), [apps.adminApplications, status, search, from, to]);

  const openCount = useMemo(
    () => apps.adminApplications.filter((r) => !DECIDED.has(String(r.status))).length,
    [apps.adminApplications],
  );
  const filtersActive = status !== 'open' || Boolean(search.trim() || from || to);
  const clearFilters = () => {
    setStatus('open');
    setSearch('');
    setFrom('');
    setTo('');
  };

  const pager = usePagination(rows, 10, `${status}|${from}|${to}|${search.trim().toLowerCase()}`);

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        icon="assignment"
        title={t('applications.adminListTitle')}
        description={t('applications.adminListSubtitle')}
        actions={
          <Button asChild variant="outline">
            <Link to={`${admissionsBasePath}/inquiries`}>
              <span className="material-symbols-outlined me-1 text-base" aria-hidden>contact_support</span>
              {t('admissions.inquiriesTitle')}
            </Link>
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile
            icon="inbox"
            label={t('applications.openApplications')}
            value={openCount}
            onClick={() => setStatus('open')}
            active={status === 'open'}
          />
          <StatTile
            icon="pending_actions"
            label={t('applications.pendingReview')}
            value={apps.stats.pendingReview}
            tone={apps.stats.pendingReview > 0 ? 'warning' : 'success'}
          />
          <StatTile icon="verified" label={t('applications.approvedThisMonth')} value={apps.stats.approvedThisMonth} tone="success" />
          <StatTile
            icon="timer"
            label={t('applications.avgReviewTime')}
            value={t('applications.avgReviewHoursValue', { hours: apps.stats.avgReviewHours.toFixed(1) })}
            tone="neutral"
          />
        </div>
      </PageHeader>

      <TableCard
        title={t('applications.adminListTitle')}
        count={apps.isLoading ? undefined : t('applications.resultsCount', { count: rows.length })}
        filters={
          <FilterBar onClear={clearFilters} canClear={filtersActive}>
            <FilterField label={t('applications.status')}>
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="open">{t('applications.openApplications')}</option>
                <option value="all">{t('applications.allApplications')}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{t(`applications.statuses.${s}`)}</option>
                ))}
              </Select>
            </FilterField>
            <FilterField label={t('common.fromDate')}>
              <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            </FilterField>
            <FilterField label={t('common.toDate')}>
              <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </FilterField>
            <FilterField label={t('common.search')} className="sm:flex-[2]">
              <SearchInput value={search} onChange={setSearch} placeholder={t('applications.search')} />
            </FilterField>
          </FilterBar>
        }
        pagination={apps.isLoading || !rows.length ? null : <TablePagination pager={pager} />}
      >
        {apps.isLoading ? (
          <TableLoading />
        ) : !rows.length ? (
          <TableEmpty icon="assignment" title={t('applications.emptyTitle')} description={t('applications.emptyDescription')} />
        ) : (
          <DataTable minWidth={880}>
            <THead>
              <Th>{t('applications.applicationId')}</Th>
              <Th>{t('applications.parentName')}</Th>
              <Th>{t('applications.childName')}</Th>
              <Th>{t('applications.submittedAt')}</Th>
              <Th>{t('applications.status')}</Th>
              <Th>{t('applications.documentsCount')}</Th>
              <Th align="end">{t('common.actions')}</Th>
            </THead>
            <TBody>
              {pager.pageItems.map((r) => {
                const parent = (r.parent_info_json as Record<string, unknown> | undefined) ?? {};
                const child = (r.child_info_json as Record<string, unknown> | undefined) ?? {};
                const parentName = applicantParentName(parent);
                const childName = applicantChildName(child);
                const detailPath = `${admissionsBasePath}/applications/${String(r.id)}`;
                return (
                  <Tr key={String(r.id)} onClick={() => navigate(detailPath)}>
                    <Td>
                      <span className="rounded-md bg-surface-high px-2 py-1 font-mono text-xs text-on-surface-variant" title={String(r.id)}>
                        {shortApplicationId(r.id)}
                      </span>
                    </Td>
                    <Td className="font-medium text-on-surface">{parentName || '—'}</Td>
                    <Td>
                      {childName ? <span className="text-on-surface">{childName}</span> : <span className="text-on-surface-variant">—</span>}
                    </Td>
                    <Td>
                      {r.submitted_at ? (
                        <span className="text-on-surface">{formatDateTime(String(r.submitted_at), STEP_DATE_TIME)}</span>
                      ) : (
                        <span className="text-xs text-on-surface-variant">{t('applications.notSubmitted')}</span>
                      )}
                    </Td>
                    <Td>
                      <ApplicationStatusBadge status={String(r.status)} />
                    </Td>
                    <Td>
                      <span className="inline-flex items-center gap-1 text-on-surface">
                        <span className="material-symbols-outlined text-base text-on-surface-variant" aria-hidden>description</span>
                        {Number(r.documents_count ?? 0)}
                      </span>
                    </Td>
                    <Td align="end">
                      <IconAction icon="visibility" label={`${t('invoice.actions.viewDetails')}: ${parentName || shortApplicationId(r.id)}`} to={detailPath} />
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </DataTable>
        )}
      </TableCard>
    </div>
  );
}

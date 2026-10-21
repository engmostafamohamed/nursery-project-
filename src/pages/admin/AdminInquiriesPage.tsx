import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { InquiryDetailModal } from '@/components/admin/InquiryDetailModal';
import { InquiryKanban } from '@/components/admin/InquiryKanban';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  IconAction,
  StatusPill,
  TableCard,
  TableEmpty,
  TableLoading,
  TablePagination,
  TBody,
  THead,
  Td,
  Th,
  Tr,
  type PillTone,
} from '@/components/ui/DataTable';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { StatTile } from '@/components/ui/StatTile';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useInquiries } from '@/hooks/useInquiries';
import { usePagination } from '@/hooks/usePagination';
import { useWaitlist } from '@/hooks/useWaitlist';
import { useApplications } from '@/hooks/useApplications';
import { cn } from '@/lib/utils';

const STATUSES = ['new', 'contacted', 'scheduled', 'waitlisted', 'enrolled', 'declined'] as const;
const SOURCES = ['website', 'referral', 'walk_in', 'social_media', 'other'] as const;

const STATUS_TONE: Record<string, PillTone> = {
  new: 'primary',
  contacted: 'neutral',
  scheduled: 'warning',
  waitlisted: 'warning',
  enrolled: 'success',
  declined: 'error',
};

function formatDay(value: unknown, lang: string): string {
  const date = new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(lang.startsWith('ar') ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function AdminInquiriesPage() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { user } = useAuthSession();
  const { activeNurseryId } = useActiveNurseryId();
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('all');
  const [assignedTo, setAssignedTo] = useState('all');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const inquiries = useInquiries(activeNurseryId ?? undefined, { status, source, assignedTo, search, fromDate, toDate });
  const waitlist = useWaitlist(activeNurseryId ?? undefined);
  const apps = useApplications({ nurseryId: activeNurseryId ?? undefined });
  const admissionsBasePath = location.pathname.startsWith('/xo-admin/')
    ? '/xo-admin/nursery/admissions'
    : '/admin/admissions';

  const waitlistCount = useMemo(() => inquiries.inquiries.filter((i) => String(i.status) === 'waitlisted').length, [inquiries.inquiries]);
  const filtersActive = status !== 'all' || source !== 'all' || assignedTo !== 'all' || Boolean(search.trim() || fromDate || toDate);
  const clearFilters = () => {
    setStatus('all');
    setSource('all');
    setAssignedTo('all');
    setSearch('');
    setFromDate('');
    setToDate('');
  };
  const pager = usePagination(inquiries.inquiries, 10, `${status}|${source}|${assignedTo}|${search}|${fromDate}|${toDate}|${view}`);

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        icon="person_search"
        title={t('admissions.inquiriesTitle')}
        description={t('admissions.inquiriesSubtitle')}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to={`${admissionsBasePath}/applications`} className="gap-2">
                <span className="material-symbols-outlined text-base" aria-hidden>assignment</span>
                {t('applications.adminListTitle')}
                {apps.stats.pendingReview > 0 ? (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                    {apps.stats.pendingReview}
                  </span>
                ) : null}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={`${admissionsBasePath}/waitlist`}>
                <span className="material-symbols-outlined me-1 text-base" aria-hidden>hourglass_top</span>
                {t('admissions.waitlistTitle')}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={`${admissionsBasePath}/import`}>
                <span className="material-symbols-outlined me-1 text-base" aria-hidden>upload_file</span>
                {t('import.title')}
              </Link>
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile icon="fiber_new" label={t('admissions.newThisWeek')} value={inquiries.stats.newThisWeek} />
          <StatTile icon="trending_up" label={t('admissions.conversionRate')} value={`${inquiries.stats.conversionRate.toFixed(1)}%`} tone="success" />
          <StatTile
            icon="timer"
            label={t('admissions.avgResponseTime')}
            value={t('applications.avgReviewHoursValue', { hours: inquiries.stats.avgResponseHours.toFixed(1) })}
            tone="neutral"
          />
          <StatTile
            icon="hourglass_top"
            label={t('admissions.waitlistCount')}
            value={waitlistCount}
            tone={waitlistCount > 0 ? 'warning' : 'neutral'}
            onClick={() => setStatus((current) => (current === 'waitlisted' ? 'all' : 'waitlisted'))}
            active={status === 'waitlisted'}
          />
        </div>
      </PageHeader>

      <TableCard
        title={t('admissions.inquiriesTitle')}
        count={inquiries.isLoading ? undefined : t('admissions.resultsCount', { count: inquiries.inquiries.length })}
        actions={
          <div className="inline-flex rounded-lg border border-outline-variant bg-surface p-0.5" role="group" aria-label={t('admissions.viewLabel')}>
            {(['kanban', 'list'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => setView(option)}
                className={cn(
                  'inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs font-semibold transition-colors',
                  view === option ? 'bg-primary text-primary-foreground' : 'text-on-surface-variant hover:bg-surface-high',
                )}
              >
                <span className="material-symbols-outlined text-base" aria-hidden>{option === 'kanban' ? 'view_kanban' : 'table_rows'}</span>
                {option === 'kanban' ? t('admissions.kanban') : t('admissions.list')}
              </button>
            ))}
          </div>
        }
        filters={
          <FilterBar onClear={clearFilters} canClear={filtersActive}>
            <FilterField label={t('admissions.status')}>
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">{t('common.all')}</option>
                {STATUSES.map((s) => <option key={s} value={s}>{t(`admissions.statuses.${s}`)}</option>)}
              </Select>
            </FilterField>
            <FilterField label={t('admissions.source')}>
              <Select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="all">{t('common.all')}</option>
                {SOURCES.map((s) => <option key={s} value={s}>{t(`admissions.sources.${s}`)}</option>)}
              </Select>
            </FilterField>
            <FilterField label={t('admissions.assignedLabel')}>
              <Select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="all">{t('admissions.anyone')}</option>
                <option value={user?.id ?? 'all'}>{t('admissions.assignedToMe')}</option>
              </Select>
            </FilterField>
            <FilterField label={t('common.fromDate')}>
              <Input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} />
            </FilterField>
            <FilterField label={t('common.toDate')}>
              <Input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} />
            </FilterField>
            <FilterField label={t('common.search')} className="sm:flex-[2]">
              <SearchInput value={search} onChange={setSearch} placeholder={t('admissions.searchPlaceholder')} />
            </FilterField>
          </FilterBar>
        }
        pagination={view === 'list' && !inquiries.isLoading && inquiries.inquiries.length ? <TablePagination pager={pager} /> : null}
      >
        {inquiries.isLoading ? (
          <TableLoading />
        ) : !inquiries.inquiries.length ? (
          <TableEmpty icon="person_search" title={t('admissions.emptyTitle')} description={t('admissions.emptyDescription')} />
        ) : view === 'kanban' ? (
          <div className="p-4 sm:p-5">
            <InquiryKanban
              inquiries={inquiries.inquiries}
              onOpen={setSelected}
              onAssignToMe={(id) => void inquiries.updateInquiry({ id, updates: { assigned_to: user?.id } })}
              onStatusChange={(id, next) => void inquiries.updateInquiry({ id, updates: { status: next } })}
            />
          </div>
        ) : (
          <DataTable minWidth={820}>
            <THead>
              <Th>{t('admissions.parentName')}</Th>
              <Th>{t('admissions.childName')}</Th>
              <Th>{t('admissions.source')}</Th>
              <Th>{t('admissions.status')}</Th>
              <Th>{t('admissions.receivedAt')}</Th>
              <Th align="end">{t('common.actions')}</Th>
            </THead>
            <TBody>
              {pager.pageItems.map((r) => {
                const rowStatus = String(r.status);
                const parentName = String(r.parent_name ?? '') || '—';
                return (
                  <Tr key={String(r.id)} onClick={() => setSelected(r)}>
                    <Td>
                      <p className="font-semibold text-on-surface">{parentName}</p>
                      {r.parent_phone ? <p className="text-xs text-on-surface-variant" dir="ltr">{String(r.parent_phone)}</p> : null}
                    </Td>
                    <Td className="text-on-surface">{String(r.child_name ?? '') || '—'}</Td>
                    <Td className="text-on-surface-variant">{t(`admissions.sources.${String(r.source)}`, { defaultValue: String(r.source ?? '—') })}</Td>
                    <Td>
                      <StatusPill tone={STATUS_TONE[rowStatus] ?? 'neutral'}>
                        {t(`admissions.statuses.${rowStatus}`, { defaultValue: rowStatus })}
                      </StatusPill>
                    </Td>
                    <Td className="text-on-surface-variant">{formatDay(r.created_at, i18n.language)}</Td>
                    <Td align="end">
                      <IconAction icon="visibility" label={`${t('invoice.actions.viewDetails')}: ${parentName}`} onClick={() => setSelected(r)} />
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </DataTable>
        )}
      </TableCard>

      <InquiryDetailModal
        open={Boolean(selected)}
        onOpenChange={(o) => !o && setSelected(null)}
        inquiry={selected}
        classes={inquiries.classes}
        onUpdate={inquiries.updateInquiry}
        onScheduleInterview={(id) => {
          void inquiries.updateInquiry({ id, updates: { status: 'scheduled' } });
          toast.success(t('admissions.interviewScheduled'));
        }}
        onMoveToWaitlist={(id, classId) => {
          if (!activeNurseryId) return;
          void waitlist.addToWaitlist({ inquiryId: id, classId, nurseryId: activeNurseryId });
          toast.success(t('admissions.movedToWaitlist'));
        }}
        onCreateApplication={(inquiryId) => {
          if (!activeNurseryId) return;
          void apps.createFromInquiry({ inquiryId, nurseryId: activeNurseryId }).then(() => toast.success(t('applications.createdFromInquiry')));
        }}
      />
    </div>
  );
}

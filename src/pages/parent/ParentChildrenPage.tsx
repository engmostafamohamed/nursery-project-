import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { AdmissionJourneySteps } from '@/components/admissions/AdmissionJourney';
import { ApplicationStatusBadge } from '@/components/applications/ApplicationStatusBadge';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  StatusPill,
  TableCard,
  TableEmpty,
  TablePagination,
  TBody,
  THead,
  Td,
  Th,
  Tr,
  type PillTone,
} from '@/components/ui/DataTable';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar, SearchInput } from '@/components/ui/FilterBar';
import { FilterField } from '@/components/ui/FilterField';
import type { FilterMenuOption } from '@/components/ui/FilterMenu';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/StatTile';
import { useAdmissionTimelines } from '@/hooks/useAdmissionTimelines';
import { useAllChildrenAttendanceSummary } from '@/hooks/useAllChildrenAttendanceSummary';
import { useApplications } from '@/hooks/useApplications';
import { useAuthSession } from '@/hooks/useAuthSession';
import { usePagination } from '@/hooks/usePagination';
import { useParentChildrenOverview, type ParentChildOverview } from '@/hooks/useParentChildrenOverview';
import { useParentInvoices } from '@/hooks/useParentInvoices';
import { useUserProfile } from '@/hooks/useUserProfile';
import { joinedWhenText } from '@/lib/admissionTimeline';
import { cn, getUserInitials } from '@/lib/utils';

type ChildStatusFilter = 'all' | 'active' | 'pending' | 'inactive';
type AttendanceFilter = 'all' | 'present' | 'absent';
type ApplicationFilter = 'all' | 'none' | 'draft' | 'submitted' | 'under_review' | 'documents_pending' | 'approved' | 'rejected';
type PaymentFilter = 'all' | 'due' | 'clear';

function displayChildName(child: ParentChildOverview, language: string) {
  return language.startsWith('ar')
    ? child.nameAr || child.nameEn || '-'
    : child.nameEn || child.nameAr || '-';
}

function formatClock(value: string | null | undefined, language: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString(language.startsWith('ar') ? 'ar-EG' : 'en-GB', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

const STATUS_TONE: Record<string, PillTone> = {
  active: 'success',
  pending: 'warning',
  inactive: 'error',
  withdrawn: 'neutral',
  graduated: 'primary',
};

type ChildAction = { icon: string; label: string } & ({ to: string } | { key: string; onSelect: () => void });

function ChildActionsMenu({ actions, label }: { actions: ChildAction[]; label: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 w-9 rounded-md p-0 text-on-surface-variant hover:text-primary"
          aria-label={label}
          title={label}
        >
          <span className="material-symbols-outlined text-lg" aria-hidden>more_vert</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-xl p-2">
        {actions.map((action) =>
          'to' in action ? (
            <DropdownMenuItem key={action.to} asChild className="rounded-lg px-3 py-2.5">
              <Link to={action.to} className="gap-3">
                <span className="material-symbols-outlined text-base text-primary" aria-hidden>{action.icon}</span>
                <span className="min-w-0 flex-1 truncate">{action.label}</span>
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem key={action.key} onSelect={action.onSelect} className="gap-3 rounded-lg px-3 py-2.5">
              <span className="material-symbols-outlined text-base text-primary" aria-hidden>{action.icon}</span>
              <span className="min-w-0 flex-1 truncate">{action.label}</span>
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ParentChildrenPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id ?? undefined;
  const childrenQuery = useParentChildrenOverview(user?.id, nurseryId);
  const children = useMemo(() => childrenQuery.data ?? [], [childrenQuery.data]);
  const childIds = useMemo(() => children.map((child) => child.id), [children]);
  const attendanceSummary = useAllChildrenAttendanceSummary({ childIds, nurseryId });
  // When each child applied, joined and first came, with the time; one child's in a dialog.
  const journeys = useAdmissionTimelines(childIds);
  const [journeyChildId, setJourneyChildId] = useState<string | null>(null);
  const journeyChild = children.find((child) => child.id === journeyChildId) ?? null;
  const journeyTimeline = journeyChildId ? journeys.byChild.get(journeyChildId) : undefined;
  const invoicesQuery = useParentInvoices({ parentId: user?.id, status: 'all', sort: 'newest' });
  const applications = useApplications({ parentId: user?.id, nurseryId });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ChildStatusFilter>('all');
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>('all');
  const [applicationFilter, setApplicationFilter] = useState<ApplicationFilter>('all');
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all');
  const [addingChild, setAddingChild] = useState(false);

  const statusOptions = useMemo<FilterMenuOption<ChildStatusFilter>[]>(() => [
    { value: 'all', label: t('parent.children.filters.allStatuses', { defaultValue: 'All statuses' }), icon: 'tune' },
    { value: 'active', label: t('parent.children.active', { defaultValue: 'Active' }), icon: 'verified' },
    { value: 'pending', label: t('applications.statuses.pending', { defaultValue: 'Pending' }), icon: 'pending' },
    { value: 'inactive', label: t('parent.children.notActive', { defaultValue: 'Not active' }), icon: 'pause_circle' },
  ], [t]);

  const attendanceOptions = useMemo<FilterMenuOption<AttendanceFilter>[]>(() => [
    { value: 'all', label: t('parent.children.filters.allAttendance', { defaultValue: 'All attendance' }), icon: 'history' },
    { value: 'present', label: t('parent.dashboard.analytics.present', { defaultValue: 'Present' }), icon: 'event_available' },
    { value: 'absent', label: t('parent.dashboard.analytics.absent', { defaultValue: 'Absent' }), icon: 'event_busy' },
  ], [t]);

  const applicationOptions = useMemo<FilterMenuOption<ApplicationFilter>[]>(() => [
    { value: 'all', label: t('parent.children.filters.allApplications', { defaultValue: 'All applications' }), icon: 'assignment' },
    { value: 'none', label: t('parent.children.noApplication', { defaultValue: 'No application' }), icon: 'assignment_late' },
    { value: 'draft', label: t('applications.statuses.draft', { defaultValue: 'Draft' }), icon: 'edit_note' },
    { value: 'submitted', label: t('applications.statuses.submitted', { defaultValue: 'Submitted' }), icon: 'outbox' },
    { value: 'under_review', label: t('applications.statuses.under_review', { defaultValue: 'Under Review' }), icon: 'rate_review' },
    { value: 'documents_pending', label: t('applications.statuses.documents_pending', { defaultValue: 'Documents Pending' }), icon: 'folder_open' },
    { value: 'approved', label: t('applications.statuses.approved', { defaultValue: 'Approved' }), icon: 'check_circle' },
    { value: 'rejected', label: t('applications.statuses.rejected', { defaultValue: 'Rejected' }), icon: 'cancel' },
  ], [t]);

  const paymentOptions = useMemo<FilterMenuOption<PaymentFilter>[]>(() => [
    { value: 'all', label: t('parent.children.filters.allPayments', { defaultValue: 'All payments' }), icon: 'account_balance_wallet' },
    { value: 'due', label: t('parent.children.paymentDue', { defaultValue: 'Payment due' }), icon: 'error' },
    { value: 'clear', label: t('parent.children.paymentClear', { defaultValue: 'No balance' }), icon: 'task_alt' },
  ], [t]);

  const childFinancials = useMemo(() => {
    return children.reduce<Record<string, { outstanding: number; invoices: number; latestInvoiceId?: string }>>((acc, child) => {
      const invoices = (invoicesQuery.allData ?? []).filter((invoice) => invoice.childIds.includes(child.id));
      const due = invoices.filter((invoice) => invoice.status === 'pending' || invoice.status === 'overdue');
      acc[child.id] = {
        // An invoice shared by siblings is split between them, as on the dashboard card.
        outstanding: due.reduce((sum, invoice) => sum + invoice.balance / Math.max(invoice.childIds.length, 1), 0),
        invoices: invoices.length,
        latestInvoiceId: invoices[0]?.id,
      };
      return acc;
    }, {});
  }, [children, invoicesQuery.allData]);

  const filteredChildren = useMemo(() => {
    const q = search.trim().toLowerCase();
    return children.filter((child) => {
      const name = `${child.nameAr} ${child.nameEn}`.toLowerCase();
      const financial = childFinancials[child.id] ?? { outstanding: 0, invoices: 0 };
      const isPresent = child.todayAttendance === 'present' || child.todayAttendance === 'checked_out';

      if (q && !name.includes(q)) return false;
      if (statusFilter !== 'all') {
        if (statusFilter === 'inactive' && child.status === 'active') return false;
        if (statusFilter !== 'inactive' && child.status !== statusFilter) return false;
      }
      if (attendanceFilter === 'present' && !isPresent) return false;
      if (attendanceFilter === 'absent' && (isPresent || child.todayAttendance === 'off')) return false;
      if (applicationFilter !== 'all' && child.applicationStatus !== applicationFilter) return false;
      if (paymentFilter === 'due' && financial.outstanding <= 0) return false;
      if (paymentFilter === 'clear' && financial.outstanding > 0) return false;
      return true;
    });
  }, [applicationFilter, attendanceFilter, childFinancials, children, paymentFilter, search, statusFilter]);

  const stats = useMemo(() => {
    const active = children.filter((child) => child.status === 'active').length;
    const inactive = children.filter((child) => child.status !== 'active').length;
    const presentToday = children.filter((child) => child.todayAttendance === 'present' || child.todayAttendance === 'checked_out').length;
    const due = (invoicesQuery.allData ?? [])
      .filter((invoice) => invoice.status === 'pending' || invoice.status === 'overdue')
      .reduce((sum, invoice) => sum + invoice.balance, 0);
    // Absent means an active child expected today who did not come (not pending, withdrawn or a day off).
    const absentToday = children.filter((child) => child.status === 'active' && child.todayAttendance === 'absent').length;
    return { active, inactive, presentToday, absentToday, due };
  }, [children, invoicesQuery.allData]);

  const addChild = async () => {
    if (!user?.id || !nurseryId) {
      toast.error(t('applications.notFound'));
      return;
    }
    setAddingChild(true);
    try {
      const applicationId = await applications.createParentDraft({
        parentId: user.id,
        nurseryId,
        parentProfile: profile,
      });
      navigate(`/parent/applications/${applicationId}?newChild=1`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('payment.errors.actionFailed'));
    } finally {
      setAddingChild(false);
    }
  };

  const filtersActive =
    statusFilter !== 'all' || attendanceFilter !== 'all' || applicationFilter !== 'all' || paymentFilter !== 'all' || Boolean(search.trim());
  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setAttendanceFilter('all');
    setApplicationFilter('all');
    setPaymentFilter('all');
  };
  const pager = usePagination(filteredChildren, 10, `${search}|${statusFilter}|${attendanceFilter}|${applicationFilter}|${paymentFilter}`);
  const money = (value: number) =>
    new Intl.NumberFormat(i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(value);

  if (childrenQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const childRowData = (child: ParentChildOverview) => {
    const name = displayChildName(child, i18n.language);
    const attendance = attendanceSummary.perChildSummary[child.id];
    const financial = childFinancials[child.id] ?? { outstanding: 0, invoices: 0 };
    const isPresent = child.todayAttendance === 'present' || child.todayAttendance === 'checked_out';
    const actions: ChildAction[] = [
      { to: `/parent/attendance?child=${child.id}`, icon: 'history', label: t('parent.nav.attendanceHistory') },
      { to: `/parent/invoices?child=${child.id}`, icon: 'payments', label: t('parent.paymentRecord.title', { defaultValue: 'Payments' }) },
      { to: `/parent/chat?child=${child.id}`, icon: 'forum', label: t('parent.nav.chat') },
      { to: `/parent/child/${child.id}/qr`, icon: 'qr_code_2', label: t('parent.nav.qrCode') },
      ...(child.applicationId
        ? [{ to: `/parent/applications/${child.applicationId}`, icon: 'assignment', label: t('parent.dashboard.stats.applications', { defaultValue: 'Application' }) }]
        : []),
      ...(journeys.byChild.has(child.id)
        ? [{ key: 'journey', icon: 'route', label: t('admissionJourney.open'), onSelect: () => setJourneyChildId(child.id) }]
        : []),
    ];
    const timeline = journeys.byChild.get(child.id);
    const statusPill = (
      <StatusPill tone={STATUS_TONE[child.status] ?? 'neutral'}>
        {child.status ? t(`admin.children.list.status.${child.status}`, { defaultValue: child.status }) : '-'}
      </StatusPill>
    );
    const todayPill = (
      <StatusPill tone={isPresent ? 'success' : child.todayAttendance === 'off' ? 'neutral' : 'error'}>
        {isPresent
          ? t('parent.dashboard.analytics.present', { defaultValue: 'Present' })
          : child.todayAttendance === 'off'
            ? t('attendance.offDayTitle')
            : t('parent.dashboard.analytics.absent', { defaultValue: 'Absent' })}
      </StatusPill>
    );
    const applicationPill =
      child.applicationStatus === 'none' ? (
        <StatusPill tone="neutral">{t('parent.children.noApplication', { defaultValue: 'No application' })}</StatusPill>
      ) : (
        <ApplicationStatusBadge status={child.applicationStatus} />
      );
    const rate = attendance?.ratePct ?? 0;
    return { name, attendance, financial, actions, timeline, statusPill, todayPill, applicationPill, rate };
  };

  const avatar = (child: ParentChildOverview, name: string) =>
    child.avatarUrl ? (
      <img src={child.avatarUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" loading="lazy" decoding="async" />
    ) : (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary" aria-hidden>
        {getUserInitials(name, null)}
      </span>
    );

  return (
    <div className="w-full max-w-none space-y-5 pb-6">
      <PageHeader
        icon="family_restroom"
        eyebrow={t('parent.children.eyebrow', { defaultValue: 'Family children' })}
        title={t('parent.nav.children', { defaultValue: 'Children' })}
        description={t('parent.children.subtitle', { defaultValue: 'Family records, attendance, payments, applications, and nursery messages.' })}
        actions={
          <Button type="button" disabled={addingChild} onClick={() => void addChild()}>
            <span className="material-symbols-outlined me-1 text-base" aria-hidden>person_add</span>
            {addingChild ? t('common.loading') : t('applications.createApplication', { defaultValue: 'Add child' })}
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
          <StatTile icon="child_care" label={t('parent.dashboard.stats.children', { defaultValue: 'Children' })} value={children.length} onClick={clearFilters} active={!filtersActive} />
          <StatTile
            icon="verified"
            label={t('parent.children.active', { defaultValue: 'Active' })}
            value={stats.active}
            tone="success"
            onClick={() => setStatusFilter((current) => (current === 'active' ? 'all' : 'active'))}
            active={statusFilter === 'active'}
          />
          <StatTile
            icon="pause_circle"
            label={t('parent.children.notActive', { defaultValue: 'Not active' })}
            value={stats.inactive}
            tone={stats.inactive > 0 ? 'warning' : 'neutral'}
            onClick={() => setStatusFilter((current) => (current === 'inactive' ? 'all' : 'inactive'))}
            active={statusFilter === 'inactive'}
          />
          <StatTile
            icon="how_to_reg"
            label={t('parent.children.presentToday', { defaultValue: 'Present today' })}
            value={stats.presentToday}
            tone="success"
            onClick={() => setAttendanceFilter((current) => (current === 'present' ? 'all' : 'present'))}
            active={attendanceFilter === 'present'}
          />
          <StatTile
            icon="account_balance_wallet"
            label={t('parent.children.paymentDue', { defaultValue: 'Payment due' })}
            value={money(stats.due)}
            tone={stats.due > 0 ? 'error' : 'success'}
            onClick={() => setPaymentFilter((current) => (current === 'due' ? 'all' : 'due'))}
            active={paymentFilter === 'due'}
          />
        </div>
      </PageHeader>

      {!children.length ? (
        <EmptyState
          icon="child_care"
          title={t('parent.children.emptyTitle', { defaultValue: 'No children yet' })}
          description={t('parent.children.emptyDescription', { defaultValue: 'Approved children will appear here. Use the application cards above to continue drafts.' })}
        />
      ) : (
        <TableCard
          title={t('parent.children.records', { defaultValue: 'Children records' })}
          count={`${filteredChildren.length} / ${children.length}`}
          filters={
            <FilterBar onClear={clearFilters} canClear={filtersActive}>
              <FilterField label={t('common.search')} className="sm:min-w-[12rem] sm:flex-[2]">
                <SearchInput value={search} onChange={setSearch} placeholder={t('parent.children.search', { defaultValue: 'Search child name' })} />
              </FilterField>
              <FilterField label={t('common.status', { defaultValue: 'Status' })} className="min-w-[9rem]">
                <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ChildStatusFilter)}>
                  {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              </FilterField>
              <FilterField label={t('parent.nav.attendanceHistory')} className="min-w-[9rem]">
                <Select value={attendanceFilter} onChange={(e) => setAttendanceFilter(e.target.value as AttendanceFilter)}>
                  {attendanceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              </FilterField>
              <FilterField label={t('parent.dashboard.stats.applications', { defaultValue: 'Applications' })} className="min-w-[9rem]">
                <Select value={applicationFilter} onChange={(e) => setApplicationFilter(e.target.value as ApplicationFilter)}>
                  {applicationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              </FilterField>
              <FilterField label={t('parent.paymentRecord.title', { defaultValue: 'Payment record' })} className="min-w-[9rem]">
                <Select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as PaymentFilter)}>
                  {paymentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              </FilterField>
            </FilterBar>
          }
          pagination={filteredChildren.length ? <TablePagination pager={pager} /> : null}
        >
          {!filteredChildren.length ? (
            <TableEmpty icon="search_off" title={t('parent.children.noResults', { defaultValue: 'No children match these filters.' })} />
          ) : (
            <>
              {/* Phones: one card per child. */}
              <ul className="divide-y divide-outline-variant md:hidden">
                {pager.pageItems.map((child) => {
                  const row = childRowData(child);
                  return (
                    <li key={child.id} className="space-y-3 p-4">
                      <div className="flex items-start gap-3">
                        {avatar(child, row.name)}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate font-semibold text-on-surface">{row.name}</p>
                            <ChildActionsMenu actions={row.actions} label={t('common.actions', { defaultValue: 'Actions' })} />
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {row.statusPill}
                            {row.todayPill}
                            {row.applicationPill}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="rounded-lg bg-surface-container-lowest px-2 py-2">
                          <p className="text-[11px] text-on-surface-variant">{t('parent.children.thirtyDays', { defaultValue: '30 days' })}</p>
                          <p className="text-sm font-semibold tabular-nums text-on-surface">{row.rate}%</p>
                        </div>
                        <div className="rounded-lg bg-surface-container-lowest px-2 py-2">
                          <p className="text-[11px] text-on-surface-variant">{t('parent.paymentRecord.title', { defaultValue: 'Payment record' })}</p>
                          <p className={cn('text-sm font-semibold tabular-nums', row.financial.outstanding > 0 ? 'text-error' : 'text-success')}>
                            {money(row.financial.outstanding)}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Tablets and up: the standard table. */}
              <div className="hidden md:block">
                <DataTable minWidth={920}>
                  <THead>
                    <Th>{t('admin.children.childColumn', { defaultValue: 'Child' })}</Th>
                    <Th>{t('common.status', { defaultValue: 'Status' })}</Th>
                    <Th>{t('parent.nav.attendanceHistory')}</Th>
                    <Th>{t('parent.children.thirtyDays', { defaultValue: '30 days' })}</Th>
                    <Th>{t('parent.dashboard.stats.applications', { defaultValue: 'Applications' })}</Th>
                    <Th>{t('parent.paymentRecord.title', { defaultValue: 'Payment record' })}</Th>
                    <Th align="end">{t('common.actions', { defaultValue: 'Actions' })}</Th>
                  </THead>
                  <TBody>
                    {pager.pageItems.map((child) => {
                      const row = childRowData(child);
                      return (
                        <Tr key={child.id}>
                          <Td>
                            <div className="flex items-center gap-3">
                              {avatar(child, row.name)}
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-on-surface">{row.name}</p>
                                {row.timeline ? (
                                  <button
                                    type="button"
                                    onClick={() => setJourneyChildId(child.id)}
                                    className="mt-0.5 flex items-center gap-1 text-start text-xs text-on-surface-variant hover:text-primary hover:underline"
                                  >
                                    <span className="material-symbols-outlined text-sm" aria-hidden>how_to_reg</span>
                                    {t('admissionJourney.joinedShort', { when: joinedWhenText(row.timeline) })}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </Td>
                          <Td>{row.statusPill}</Td>
                          <Td>
                            {row.todayPill}
                            {child.checkIn ? (
                              <p className="mt-1.5 text-xs tabular-nums text-on-surface-variant" dir="ltr">
                                {formatClock(child.checkIn, i18n.language)}
                                {child.checkOut ? ` – ${formatClock(child.checkOut, i18n.language)}` : null}
                              </p>
                            ) : null}
                          </Td>
                          <Td>
                            <div className="min-w-[120px]">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold tabular-nums text-on-surface">{row.rate}%</span>
                                <span className="text-xs text-on-surface-variant">
                                  {row.attendance?.presentDays ?? 0}/{(row.attendance?.presentDays ?? 0) + (row.attendance?.absentDays ?? 0)}
                                </span>
                              </div>
                              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-high">
                                <div
                                  className={cn('h-full rounded-full', row.rate >= 80 ? 'bg-success' : row.rate >= 50 ? 'bg-warning' : 'bg-error')}
                                  style={{ width: `${Math.min(100, row.rate)}%` }}
                                />
                              </div>
                            </div>
                          </Td>
                          <Td>{row.applicationPill}</Td>
                          <Td>
                            <p className={cn('font-semibold tabular-nums', row.financial.outstanding > 0 ? 'text-error' : 'text-success')}>
                              {money(row.financial.outstanding)}
                            </p>
                            <p className="mt-0.5 text-xs text-on-surface-variant">{t('parent.children.invoiceCount', { count: row.financial.invoices })}</p>
                          </Td>
                          <Td align="end">
                            <ChildActionsMenu actions={row.actions} label={t('common.actions', { defaultValue: 'Actions' })} />
                          </Td>
                        </Tr>
                      );
                    })}
                  </TBody>
                </DataTable>
              </div>
            </>
          )}
        </TableCard>
      )}

      <Dialog open={journeyChildId !== null} onOpenChange={(open) => { if (!open) setJourneyChildId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('admissionJourney.title')}</DialogTitle>
            <DialogDescription>{journeyChild ? displayChildName(journeyChild, i18n.language) : ''}</DialogDescription>
          </DialogHeader>
          {journeyTimeline ? <AdmissionJourneySteps timeline={journeyTimeline} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

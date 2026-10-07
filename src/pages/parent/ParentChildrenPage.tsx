import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterMenu, type FilterMenuOption } from '@/components/ui/FilterMenu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAllChildrenAttendanceSummary } from '@/hooks/useAllChildrenAttendanceSummary';
import { useApplications } from '@/hooks/useApplications';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useParentChildrenOverview, type ParentChildOverview } from '@/hooks/useParentChildrenOverview';
import { useParentInvoices } from '@/hooks/useParentInvoices';
import { useUserProfile } from '@/hooks/useUserProfile';
import { cn } from '@/lib/utils';

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

function statusTone(status: string) {
  if (status === 'active' || status === 'approved' || status === 'paid') return 'border-success/30 bg-success/10 text-success';
  if (status === 'inactive' || status === 'rejected' || status === 'absent' || status === 'overdue') return 'border-error/30 bg-error/10 text-error';
  if (status === 'pending' || status === 'documents_pending' || status === 'submitted' || status === 'under_review') {
    return 'border-warning/30 bg-warning/10 text-warning';
  }
  return 'border-outline-variant bg-surface-container text-on-surface-variant';
}

function StatTile({ icon, label, value, tone = 'primary' }: { icon: string; label: string; value: string | number; tone?: 'primary' | 'success' | 'warning' | 'error' }) {
  const toneClass = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    error: 'bg-error/10 text-error',
  }[tone];

  return (
    <div className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-md', toneClass)}>
          <span className="material-symbols-outlined text-xl" aria-hidden>{icon}</span>
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase text-on-surface-variant">{label}</p>
          <p className="mt-1 text-2xl font-bold text-on-surface">{value}</p>
        </div>
      </div>
    </div>
  );
}

type ChildAction = {
  to: string;
  icon: string;
  label: string;
};

function ChildActionsMenu({ actions, label }: { actions: ChildAction[]; label: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 w-9 rounded-full p-0"
          aria-label={label}
          title={label}
        >
          <span className="material-symbols-outlined text-lg" aria-hidden>more_vert</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-xl p-2">
        {actions.map((action) => (
          <DropdownMenuItem key={action.to} asChild className="rounded-lg px-3 py-2.5">
            <Link to={action.to} className="gap-3">
              <span className="material-symbols-outlined text-base text-primary" aria-hidden>{action.icon}</span>
              <span className="min-w-0 flex-1 truncate">{action.label}</span>
            </Link>
          </DropdownMenuItem>
        ))}
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

  if (childrenQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-none space-y-5 pb-6">
      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
        <div className="flex flex-col gap-4 border-b border-outline-variant bg-surface-container-lowest px-4 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-primary">
              {t('parent.children.eyebrow', { defaultValue: 'Family children' })}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-on-surface">
              {t('parent.nav.children', { defaultValue: 'Children' })}
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-on-surface-variant">
              {t('parent.children.subtitle', {
                defaultValue: 'Family records, attendance, payments, applications, and nursery messages.',
              })}
            </p>
          </div>
          <Button type="button" className="h-11 rounded-md" disabled={addingChild} onClick={() => void addChild()}>
            <span className="material-symbols-outlined me-2 text-base" aria-hidden>person_add</span>
            {addingChild ? t('common.loading') : t('applications.createApplication', { defaultValue: 'Add child' })}
          </Button>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile icon="child_care" label={t('parent.dashboard.stats.children', { defaultValue: 'Children' })} value={children.length} />
          <StatTile icon="verified" label={t('parent.children.active', { defaultValue: 'Active' })} value={stats.active} tone="success" />
          <StatTile icon="pause_circle" label={t('parent.children.notActive', { defaultValue: 'Not active' })} value={stats.inactive} tone="warning" />
          <StatTile icon="how_to_reg" label={t('parent.children.presentToday', { defaultValue: 'Present today' })} value={stats.presentToday} tone="success" />
          <StatTile icon="account_balance_wallet" label={t('parent.children.paymentDue', { defaultValue: 'Payment due' })} value={stats.due.toFixed(0)} tone={stats.due > 0 ? 'error' : 'primary'} />
        </div>
      </section>

      {!children.length ? (
        <EmptyState
          icon="child_care"
          title={t('parent.children.emptyTitle', { defaultValue: 'No children yet' })}
          description={t('parent.children.emptyDescription', { defaultValue: 'Approved children will appear here. Use the application cards above to continue drafts.' })}
        />
      ) : null}

      {children.length ? <section className="rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.2fr)_repeat(4,minmax(170px,1fr))]">
          <div className="relative min-w-0">
            <span className="material-symbols-outlined pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-base text-on-surface-variant" aria-hidden>
              search
            </span>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('parent.children.search', { defaultValue: 'Search child name' })}
              className="h-11 rounded-lg bg-surface-container-lowest ps-10"
            />
          </div>
          <FilterMenu value={statusFilter} options={statusOptions} onChange={setStatusFilter} />
          <FilterMenu value={attendanceFilter} options={attendanceOptions} onChange={setAttendanceFilter} />
          <FilterMenu value={applicationFilter} options={applicationOptions} onChange={setApplicationFilter} />
          <FilterMenu value={paymentFilter} options={paymentOptions} onChange={setPaymentFilter} />
        </div>
      </section> : null}

      {children.length ? <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-outline-variant bg-surface-container-lowest px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-on-surface">
              {t('parent.children.records', { defaultValue: 'Children records' })}
            </h2>
            <p className="mt-0.5 text-xs text-on-surface-variant">
              {filteredChildren.length} / {children.length}
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-surface-container-lowest text-xs uppercase text-on-surface-variant">
              <tr>
                <th className="px-4 py-3 text-start font-semibold">{t('admin.children.childColumn', { defaultValue: 'Child' })}</th>
                <th className="px-4 py-3 text-start font-semibold">{t('common.status', { defaultValue: 'Status' })}</th>
                <th className="px-4 py-3 text-start font-semibold">{t('parent.nav.attendanceHistory')}</th>
                <th className="px-4 py-3 text-start font-semibold">{t('parent.children.thirtyDays', { defaultValue: '30 days' })}</th>
                <th className="px-4 py-3 text-start font-semibold">{t('parent.dashboard.stats.applications', { defaultValue: 'Applications' })}</th>
                <th className="px-4 py-3 text-start font-semibold">{t('parent.paymentRecord.title', { defaultValue: 'Payment record' })}</th>
                <th className="px-4 py-3 text-start font-semibold">{t('common.actions', { defaultValue: 'Actions' })}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {filteredChildren.map((child) => {
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
                ];

                return (
                  <tr key={child.id} className="bg-surface align-top transition hover:bg-surface-container-lowest">
                    <td className="px-4 py-4 font-semibold text-on-surface">
                      {name}
                    </td>
                    <td className="px-4 py-4">
                      <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold', statusTone(child.status))}>
                        {child.status || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={cn(
                          'inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold',
                          statusTone(isPresent ? 'active' : child.todayAttendance === 'off' ? 'off' : 'absent'),
                        )}
                      >
                        {isPresent
                          ? t('parent.dashboard.analytics.present', { defaultValue: 'Present' })
                          : child.todayAttendance === 'off'
                            ? t('attendance.offDayTitle')
                            : t('parent.dashboard.analytics.absent', { defaultValue: 'Absent' })}
                      </span>
                      <p className="mt-2 text-xs text-on-surface-variant">
                        {formatClock(child.checkIn, i18n.language)} / {formatClock(child.checkOut, i18n.language)}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-on-surface">{attendance?.ratePct ?? 0}%</p>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        {attendance?.presentDays ?? 0} {t('parent.dashboard.analytics.present', { defaultValue: 'Present' })} / {attendance?.absentDays ?? 0} {t('parent.dashboard.analytics.absent', { defaultValue: 'Absent' })}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold', statusTone(child.applicationStatus))}>
                        {child.applicationStatus === 'none'
                          ? t('parent.children.noApplication', { defaultValue: 'No application' })
                          : t(`applications.statuses.${child.applicationStatus}`, { defaultValue: child.applicationStatus })}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <p className={cn('font-semibold', financial.outstanding > 0 ? 'text-error' : 'text-success')}>
                        {financial.outstanding.toFixed(0)} EGP
                      </p>
                      <p className="mt-1 text-xs text-on-surface-variant">{financial.invoices} {t('parent.children.invoices', { defaultValue: 'invoice(s)' })}</p>
                    </td>
                    <td className="px-4 py-4">
                      <ChildActionsMenu actions={actions} label={t('common.actions', { defaultValue: 'Actions' })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!filteredChildren.length ? (
          <div className="border-t border-outline-variant p-8 text-center text-sm text-on-surface-variant">
            {t('parent.children.noResults', { defaultValue: 'No children match these filters.' })}
          </div>
        ) : null}
      </section> : null}
    </div>
  );
}

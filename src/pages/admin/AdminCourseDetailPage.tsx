import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { confirm } from '@/components/ui/confirm';

import { Button } from '@/components/ui/button';
import { DataTable, IconAction, StatusPill, TableEmpty, TablePagination, TBody, Td, Th, THead, Tr, type PillTone } from '@/components/ui/DataTable';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatTile } from '@/components/ui/StatTile';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  useAdminCourseDetail,
  useAdminCourseEnrollments,
  useAdminCourseInvoices,
  adminCourseEnrollmentsQueryKey,
  adminCourseInvoicesQueryKey,
} from '@/hooks/useAdminCourseDetail';
import { CourseRequestsPanel } from '@/features/course-requests/CourseRequestsPanel';
import { useCourseRequests } from '@/features/course-requests/useCourseRequests';
import { CourseSessionsPanel } from '@/features/course-sessions/CourseSessionsPanel';
import { useNurseryChildrenPicker } from '@/hooks/useNurseryChildrenPicker';
import { usePagination } from '@/hooks/usePagination';
import { localName } from '@/lib/bilingualName';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const COURSE_TABS = ['roster', 'requests', 'sessions', 'invoices'] as const;
type CourseTab = (typeof COURSE_TABS)[number];

const INVOICE_TONE: Record<string, PillTone> = {
  pending: 'warning',
  paid: 'success',
  overdue: 'error',
  waived: 'neutral',
};

export function AdminCourseDetailPage() {
  const { t, i18n } = useTranslation();
  const { courseId } = useParams<{ courseId: string }>();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id;
  const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const isAr = i18n.language.startsWith('ar');
  const queryClient = useQueryClient();

  // A request's notice opens the requests (?tab=requests).
  const [params] = useSearchParams();
  const [tab, setTab] = useState<CourseTab>(() => COURSE_TABS.find((x) => x === params.get('tab')) ?? 'roster');
  const waitingRequests = (useCourseRequests(courseId).data ?? []).filter((r) => r.status === 'pending').length;
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [childSearch, setChildSearch] = useState('');
  const [selectedChildId, setSelectedChildId] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [generateMonth, setGenerateMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  });
  const [generating, setGenerating] = useState(false);

  const { data: course, isPending: loadingCourse } = useAdminCourseDetail(courseId);
  const { data: enrollments = [], isPending: loadingEnrollments } = useAdminCourseEnrollments(courseId);
  const { data: invoices = [], isPending: loadingInvoices } = useAdminCourseInvoices(courseId);
  const { data: allChildren = [] } = useNurseryChildrenPicker(nurseryId);

  const activeEnrollments = useMemo(() => enrollments.filter((e) => e.status === 'active'), [enrollments]);
  const activeEnrollmentCount = activeEnrollments.length;
  const capacity = course?.max_students ?? null;
  const placesLeft = capacity != null ? capacity - activeEnrollmentCount : null;
  const isFull = placesLeft != null && placesLeft <= 0;

  const rosterPager = usePagination(activeEnrollments, 10, activeEnrollments.length);
  const invoicePager = usePagination(invoices, 10, invoices.length);

  // The picker searches the nursery's children not yet on the course.
  const enrolledChildIds = useMemo(() => new Set(activeEnrollments.map((e) => e.child_id)), [activeEnrollments]);
  const availableChildren = useMemo(() => {
    const q = childSearch.trim().toLowerCase();
    return allChildren
      .filter((c) => !enrolledChildIds.has(c.id))
      .filter((c) => !q || `${c.full_name_ar} ${c.full_name_en}`.toLowerCase().includes(q))
      .slice(0, 30);
  }, [allChildren, enrolledChildIds, childSearch]);

  const dateFmt = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }), [locale]);
  const monthFmt = useMemo(() => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }), [locale]);
  const priceFmt = useMemo(() => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP' }), [locale]);

  const handleEnroll = async () => {
    if (!selectedChildId || !courseId) return;
    if (isFull) {
      toast.error(t('admin.courses.detail.fullError', { count: capacity ?? 0 }));
      return;
    }
    setEnrolling(true);
    try {
      const { error } = await supabase.from('course_enrollments').insert({
        course_id: courseId,
        child_id: selectedChildId,
        enrolled_by_user_id: user?.id,
        status: 'active',
      } as never);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: adminCourseEnrollmentsQueryKey(courseId) });
      toast.success(t('admin.courses.detail.enrollSuccess'));
      setEnrollModalOpen(false);
      setSelectedChildId('');
      setChildSearch('');
    } catch {
      toast.error(t('admin.courses.detail.enrollError'));
    } finally {
      setEnrolling(false);
    }
  };

  const handleUnenroll = async (enrollmentId: string) => {
    if (!(await confirm({ description: t('admin.courses.detail.unenrollConfirm'), variant: 'danger' })))
      return;
    try {
      const { error } = await supabase
        .from('course_enrollments')
        .update({ status: 'cancelled', unenrolled_at: new Date().toISOString() } as never)
        .eq('id', enrollmentId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: adminCourseEnrollmentsQueryKey(courseId) });
      toast.success(t('admin.courses.detail.unenrollSuccess'));
    } catch {
      toast.error(t('admin.courses.detail.unenrollError'));
    }
  };

  const handleGenerateInvoices = async () => {
    if (!courseId || !nurseryId) return;
    setGenerating(true);
    try {
      const [year, month] = generateMonth.split('-').map(Number);
      const billingDate = `${year}-${String(month).padStart(2, '0')}-01`;

      if (activeEnrollments.length === 0) {
        toast.error(t('admin.courses.detail.noEnrollmentsToInvoice'));
        return;
      }

      const dueDate = new Date(year, (month ?? 1) - 1 + 1, 5).toISOString().slice(0, 10);

      const rows = activeEnrollments.map((e) => ({
        course_id: courseId,
        enrollment_id: e.id,
        child_id: e.child_id,
        nursery_id: nurseryId,
        billing_month: billingDate,
        amount: course?.price_per_month ?? 0,
        currency: 'EGP',
        status: 'pending',
        due_date: dueDate,
        invoice_number: `COURSE-${courseId.slice(0, 8).toUpperCase()}-${year}${String(month).padStart(2, '0')}-${e.child_id.slice(0, 4).toUpperCase()}`,
      }));

      const { error } = await supabase.from('course_invoices').upsert(rows as never[], {
        onConflict: 'enrollment_id,billing_month',
        ignoreDuplicates: true,
      });
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: adminCourseInvoicesQueryKey(courseId) });
      toast.success(t('admin.courses.detail.generateSuccess', { count: rows.length }));
    } catch {
      toast.error(t('admin.courses.detail.generateError'));
    } finally {
      setGenerating(false);
    }
  };

  const handleMarkPaid = async (invoiceId: string) => {
    try {
      const { error } = await supabase
        .from('course_invoices')
        .update({ status: 'paid', paid_at: new Date().toISOString() } as never)
        .eq('id', invoiceId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: adminCourseInvoicesQueryKey(courseId) });
      toast.success(t('admin.courses.detail.markPaidSuccess'));
    } catch {
      toast.error(t('admin.courses.detail.markPaidError'));
    }
  };

  const handleMarkWaived = async (invoiceId: string) => {
    try {
      const { error } = await supabase
        .from('course_invoices')
        .update({ status: 'waived' } as never)
        .eq('id', invoiceId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: adminCourseInvoicesQueryKey(courseId) });
      toast.success(t('admin.courses.detail.waiveSuccess'));
    } catch {
      toast.error(t('admin.courses.detail.waiveError'));
    }
  };

  if (loadingCourse) {
    return (
      <div className="space-y-4 pb-8">
        <LoadingSkeleton />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="pb-8">
        <p className="text-sm text-error" role="alert">{t('admin.courses.detail.notFound')}</p>
      </div>
    );
  }

  const title = localName(course.title_ar, course.title_en, isAr);
  const teacher = localName(course.teacher_name_ar, course.teacher_name_en, isAr);
  const description = localName(course.description_ar, course.description_en, isAr);

  const dayLabels = (course.schedule_days ?? [])
    .map((d) => t(`admin.courses.days.${d}`))
    .join(' · ');
  const timeRange = [course.schedule_time_start?.slice(0, 5), course.schedule_time_end?.slice(0, 5)].filter(Boolean).join('–');

  const pendingInvoices = invoices.filter((i) => i.status === 'pending' || i.status === 'overdue').length;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        icon="school"
        eyebrow={t('admin.courses.title')}
        title={title}
        description={
          <div className="space-y-1">
            {description ? <p>{description}</p> : null}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <StatusPill tone="primary">{t(`admin.courses.categories.${course.category}`)}</StatusPill>
              <StatusPill tone={course.status === 'active' ? 'success' : 'neutral'}>{t(`admin.courses.status.${course.status}`)}</StatusPill>
              {teacher ? (
                <span className="inline-flex items-center gap-1 text-on-surface-variant">
                  <MaterialSymbol name="person" size="text-sm" />
                  {teacher}
                </span>
              ) : null}
              {dayLabels ? (
                <span className="inline-flex items-center gap-1 text-on-surface-variant">
                  <MaterialSymbol name="schedule" size="text-sm" />
                  {dayLabels}
                  {timeRange ? ` · ${timeRange}` : ''}
                </span>
              ) : null}
              {course.starts_on ? (
                <span className="inline-flex items-center gap-1 text-on-surface-variant">
                  <MaterialSymbol name="event" size="text-sm" />
                  {dateFmt.format(new Date(`${course.starts_on}T00:00:00`))}
                  {course.ends_on ? ` – ${dateFmt.format(new Date(`${course.ends_on}T00:00:00`))}` : ''}
                </span>
              ) : null}
            </div>
          </div>
        }
        actions={
          <Button asChild variant="outline">
            <Link to={`/admin/courses/${courseId}/edit`}>
              <MaterialSymbol name="edit" size="text-base" className="me-1" />
              {t('admin.courses.detail.editCourse')}
            </Link>
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile
            icon="group"
            tone={capacity != null && activeEnrollmentCount > capacity ? 'error' : isFull ? 'warning' : 'primary'}
            label={t('admin.courses.detail.tiles.enrolled')}
            value={capacity != null ? `${activeEnrollmentCount} / ${capacity}` : activeEnrollmentCount}
            helper={
              capacity != null && activeEnrollmentCount > capacity
                ? t('admin.courses.detail.tiles.overCapacity', { count: activeEnrollmentCount - capacity })
                : isFull
                  ? t('parent.courses.catalog.full')
                  : placesLeft != null
                    ? t('parent.courses.catalog.placesLeft', { count: placesLeft })
                    : undefined
            }
          />
          <StatTile icon="payments" tone="success" label={t('admin.courses.detail.tiles.monthlyPrice')} value={priceFmt.format(course.price_per_month)} />
          <StatTile
            icon="trending_up"
            label={t('admin.courses.detail.tiles.monthlyRevenue')}
            value={priceFmt.format(course.price_per_month * activeEnrollmentCount)}
            helper={t('admin.courses.detail.tiles.monthlyRevenueHint')}
          />
          <StatTile
            icon="receipt_long"
            tone={pendingInvoices > 0 ? 'warning' : 'neutral'}
            label={t('admin.courses.detail.tiles.pendingInvoices')}
            value={pendingInvoices}
            onClick={() => setTab('invoices')}
            active={tab === 'invoices'}
          />
        </div>
      </PageHeader>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto border-b border-outline-variant">
        {COURSE_TABS.map((tabKey) => (
          <button
            key={tabKey}
            type="button"
            className={cn(
              'shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors',
              tab === tabKey ? 'border-b-2 border-primary text-primary' : 'text-on-surface-variant hover:text-on-surface',
            )}
            onClick={() => setTab(tabKey)}
          >
            {t(`admin.courses.detail.tab${tabKey.charAt(0).toUpperCase()}${tabKey.slice(1)}`)}
            {tabKey === 'requests' && waitingRequests ? (
              <span className="ms-1.5 rounded-full bg-warning px-1.5 text-[10px] font-semibold text-white">{waitingRequests}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Roster tab */}
      {tab === 'roster' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-on-surface-variant">
              {t('admin.courses.detail.rosterCount', { count: activeEnrollmentCount })}
            </p>
            <Button size="sm" onClick={() => setEnrollModalOpen(true)} data-testid="course-add-student">
              <MaterialSymbol name="person_add" size="text-base" className="me-1" />
              {t('admin.courses.detail.addStudent')}
            </Button>
          </div>

          {loadingEnrollments ? (
            <LoadingSkeleton />
          ) : activeEnrollmentCount === 0 ? (
            <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
              <TableEmpty
                icon="group"
                title={t('admin.courses.detail.emptyRosterTitle')}
                description={t('admin.courses.detail.emptyRosterDescription')}
              />
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
              <DataTable minWidth={680}>
                <THead>
                  <Th>{t('admin.courses.detail.rosterTable.child')}</Th>
                  <Th>{t('admin.courses.detail.rosterTable.parent')}</Th>
                  <Th>{t('admin.courses.detail.rosterTable.since')}</Th>
                  <Th>{t('admin.courses.detail.rosterTable.status')}</Th>
                  <Th align="end">{t('admin.courses.detail.rosterTable.actions')}</Th>
                </THead>
                <TBody>
                  {rosterPager.pageItems.map((e) => (
                    <Tr key={e.id} data-testid="course-roster-row">
                      <Td className="min-w-[11rem] font-semibold text-on-surface">{localName(e.child_name_ar, e.child_name_en, isAr)}</Td>
                      <Td className="text-on-surface-variant">{localName(e.parent_name_ar, e.parent_name_en, isAr) || '—'}</Td>
                      <Td className="whitespace-nowrap text-on-surface-variant">{dateFmt.format(new Date(e.enrolled_at))}</Td>
                      <Td>
                        <StatusPill tone={e.status === 'active' ? 'success' : 'neutral'}>{t(`admin.courses.status.${e.status}`)}</StatusPill>
                      </Td>
                      <Td align="end">
                        <IconAction icon="person_remove" label={t('admin.courses.detail.unenroll')} onClick={() => void handleUnenroll(e.id)} danger />
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </DataTable>
              <TablePagination pager={rosterPager} pageSizeOptions={[10, 20, 50]} />
            </div>
          )}

          {/* Enroll modal: search the nursery's children, pick one; a full course does not take more. */}
          <Dialog open={enrollModalOpen} onOpenChange={(open) => !enrolling && setEnrollModalOpen(open)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{t('admin.courses.detail.enrollModalTitle')}</DialogTitle>
              </DialogHeader>
              {isFull ? (
                <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning" role="alert">
                  {t('admin.courses.detail.fullError', { count: capacity ?? 0 })}
                </p>
              ) : null}
              <Input
                type="search"
                autoFocus
                value={childSearch}
                onChange={(e) => setChildSearch(e.target.value)}
                placeholder={t('admin.courses.detail.searchChildPlaceholder')}
                data-testid="enroll-child-search"
              />
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {availableChildren.length === 0 ? (
                  <p className="px-1 py-4 text-center text-sm text-on-surface-variant">{t('admin.courses.detail.noChildMatches')}</p>
                ) : (
                  availableChildren.map((c) => {
                    const picked = selectedChildId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedChildId(picked ? '' : c.id)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-start text-sm transition-colors',
                          picked ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant bg-surface hover:border-primary/40',
                        )}
                        data-testid="enroll-child-option"
                      >
                        <MaterialSymbol name={picked ? 'radio_button_checked' : 'radio_button_unchecked'} size="text-base" className="shrink-0" />
                        <span className="min-w-0 truncate font-medium">{localName(c.full_name_ar, c.full_name_en, isAr)}</span>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setEnrollModalOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button className="flex-1" disabled={!selectedChildId || enrolling || isFull} onClick={handleEnroll} data-testid="enroll-confirm">
                  {enrolling ? t('common.saving') : t('admin.courses.detail.confirmEnroll')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      ) : null}

      {/* Sessions tab: cancelling a session (its time becomes extra time for the children who stay) */}
      {tab === 'sessions' && courseId ? <CourseSessionsPanel courseId={courseId} /> : null}

      {tab === 'requests' && courseId ? <CourseRequestsPanel courseId={courseId} /> : null}

      {/* Invoices tab */}
      {tab === 'invoices' ? (
        <div className="space-y-4">
          {/* Generate invoices panel */}
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
            <div className="space-y-1">
              <label htmlFor="generateMonth" className="text-xs text-on-surface-variant">
                {t('admin.courses.detail.generateForMonth')}
              </label>
              <input
                id="generateMonth"
                type="month"
                value={generateMonth}
                onChange={(e) => setGenerateMonth(e.target.value)}
                className="h-10 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface"
              />
            </div>
            <Button disabled={generating || activeEnrollmentCount === 0} onClick={handleGenerateInvoices}>
              <MaterialSymbol name="receipt_long" size="text-base" className="me-1" />
              {generating ? t('common.saving') : t('admin.courses.detail.generateInvoices')}
            </Button>
            <p className="text-xs text-on-surface-variant">
              {t('admin.courses.detail.generateHint', { count: activeEnrollmentCount })}
            </p>
          </div>

          {loadingInvoices ? (
            <LoadingSkeleton />
          ) : invoices.length === 0 ? (
            <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
              <TableEmpty
                icon="receipt_long"
                title={t('admin.courses.detail.emptyInvoicesTitle')}
                description={t('admin.courses.detail.emptyInvoicesDescription')}
              />
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
              <DataTable minWidth={820}>
                <THead>
                  <Th>{t('admin.courses.detail.invoiceTable.child')}</Th>
                  <Th>{t('admin.courses.detail.invoiceTable.month')}</Th>
                  <Th>{t('admin.courses.detail.invoiceTable.number')}</Th>
                  <Th align="end">{t('admin.courses.detail.invoiceTable.amount')}</Th>
                  <Th>{t('admin.courses.detail.invoiceTable.status')}</Th>
                  <Th align="end">{t('admin.courses.detail.invoiceTable.actions')}</Th>
                </THead>
                <TBody>
                  {invoicePager.pageItems.map((inv) => {
                    const invPriceFmt = new Intl.NumberFormat(locale, { style: 'currency', currency: inv.currency });
                    return (
                      <Tr key={inv.id} data-testid="course-invoice-row">
                        <Td className="min-w-[11rem] font-semibold text-on-surface">{localName(inv.child_name_ar, inv.child_name_en, isAr)}</Td>
                        <Td className="whitespace-nowrap text-on-surface">{monthFmt.format(new Date(inv.billing_month + 'T00:00:00'))}</Td>
                        <Td className="whitespace-nowrap text-xs text-on-surface-variant">{inv.invoice_number ? `#${inv.invoice_number}` : '—'}</Td>
                        <Td align="end" className="whitespace-nowrap font-semibold tabular-nums text-on-surface">{invPriceFmt.format(inv.amount)}</Td>
                        <Td>
                          <StatusPill tone={INVOICE_TONE[inv.status] ?? 'neutral'}>{t(`admin.courses.invoiceStatus.${inv.status}`)}</StatusPill>
                        </Td>
                        <Td align="end">
                          {inv.status === 'pending' || inv.status === 'overdue' ? (
                            <span className="flex items-center justify-end gap-2">
                              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void handleMarkPaid(inv.id)}>
                                {t('admin.courses.detail.markPaid')}
                              </Button>
                              <Button size="sm" variant="outline" className="h-8 text-xs text-on-surface-variant" onClick={() => void handleMarkWaived(inv.id)}>
                                {t('admin.courses.detail.waive')}
                              </Button>
                            </span>
                          ) : null}
                        </Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </DataTable>
              <TablePagination pager={invoicePager} pageSizeOptions={[10, 20, 50]} />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

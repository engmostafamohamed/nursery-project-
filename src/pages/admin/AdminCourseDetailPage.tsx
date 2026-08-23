import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { confirm } from '@/components/ui/confirm';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  useAdminCourseDetail,
  useAdminCourseEnrollments,
  useAdminCourseInvoices,
  adminCourseEnrollmentsQueryKey,
  adminCourseInvoicesQueryKey,
  type CourseEnrollmentRow,
  type CourseInvoiceRow,
} from '@/hooks/useAdminCourseDetail';
import { nurseryChildrenPickerQueryKey } from '@/hooks/useNurseryChildrenPicker';
import { useNurseryChildrenPicker } from '@/hooks/useNurseryChildrenPicker';
import { supabase } from '@/lib/supabase';

const INVOICE_STATUS_COLORS: Record<string, string> = {
  pending: 'border-outline-variant bg-surface-container-highest text-on-surface-variant',
  paid: 'border-transparent bg-success/10 text-success',
  overdue: 'border-transparent bg-error-container text-on-error-container',
  waived: 'border-transparent bg-surface-container text-on-surface-variant',
};

function EnrollmentRow({
  enrollment,
  locale,
  t,
  onUnenroll,
}: {
  enrollment: CourseEnrollmentRow;
  locale: string;
  t: ReturnType<typeof useTranslation>['t'];
  onUnenroll: (id: string) => void;
}) {
  const isAr = locale.startsWith('ar');
  const childName = isAr ? enrollment.child_name_ar || enrollment.child_name_en : enrollment.child_name_en || enrollment.child_name_ar;
  const parentName = isAr ? enrollment.parent_name_ar || enrollment.parent_name_en : enrollment.parent_name_en || enrollment.parent_name_ar;
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-on-surface">{childName}</p>
        {parentName ? (
          <p className="text-xs text-on-surface-variant">{parentName}</p>
        ) : null}
        <p className="text-xs text-on-surface-variant">
          {t('admin.courses.detail.enrolledSince', {
            date: dateFmt.format(new Date(enrollment.enrolled_at)),
          })}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge className={`text-xs ${enrollment.status === 'active' ? 'border-transparent bg-secondary-fixed text-on-primary-fixed' : 'border-outline-variant bg-surface-container text-on-surface-variant'}`}>
          {t(`admin.courses.status.${enrollment.status}`)}
        </Badge>
        {enrollment.status === 'active' ? (
          <Button size="sm" variant="outline" className="text-error hover:bg-error/5 text-xs" onClick={() => onUnenroll(enrollment.id)}>
            {t('admin.courses.detail.unenroll')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function InvoiceRow({
  invoice,
  locale,
  t,
  onMarkPaid,
  onMarkWaived,
}: {
  invoice: CourseInvoiceRow;
  locale: string;
  t: ReturnType<typeof useTranslation>['t'];
  onMarkPaid: (id: string) => void;
  onMarkWaived: (id: string) => void;
}) {
  const isAr = locale.startsWith('ar');
  const childName = isAr ? invoice.child_name_ar || invoice.child_name_en : invoice.child_name_en || invoice.child_name_ar;
  const priceFmt = new Intl.NumberFormat(locale, { style: 'currency', currency: invoice.currency });
  const monthFmt = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' });
  const billingDate = new Date(invoice.billing_month + 'T00:00:00');

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium text-on-surface">{childName}</p>
        <p className="text-xs text-on-surface-variant">{monthFmt.format(billingDate)}</p>
        {invoice.invoice_number ? (
          <p className="text-xs text-on-surface-variant">#{invoice.invoice_number}</p>
        ) : null}
      </div>
      <div className="flex flex-col items-end gap-2">
        <p className="text-sm font-semibold text-on-surface">{priceFmt.format(invoice.amount)}</p>
        <Badge className={`text-xs ${INVOICE_STATUS_COLORS[invoice.status] ?? ''}`}>
          {t(`admin.courses.invoiceStatus.${invoice.status}`)}
        </Badge>
        {invoice.status === 'pending' || invoice.status === 'overdue' ? (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onMarkPaid(invoice.id)}>
              {t('admin.courses.detail.markPaid')}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs text-on-surface-variant" onClick={() => onMarkWaived(invoice.id)}>
              {t('admin.courses.detail.waive')}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AdminCourseDetailPage() {
  const { t, i18n } = useTranslation();
  const { courseId } = useParams<{ courseId: string }>();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id;
  const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const isAr = i18n.language.startsWith('ar');
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'roster' | 'invoices'>('roster');
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
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

  const enrolledChildIds = new Set(enrollments.filter((e) => e.status === 'active').map((e) => e.child_id));
  const availableChildren = allChildren.filter((c) => !enrolledChildIds.has(c.id));

  const handleEnroll = async () => {
    if (!selectedChildId || !courseId) return;
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
      const activeEnrollments = enrollments.filter((e) => e.status === 'active');

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

  const title = isAr ? course.title_ar || course.title_en : course.title_en || course.title_ar;
  const teacher = isAr
    ? course.teacher_name_ar || course.teacher_name_en
    : course.teacher_name_en || course.teacher_name_ar;
  const priceFmt = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP' });

  const dayLabels = (course.schedule_days ?? [])
    .map((d) => t(`admin.courses.days.${d}`))
    .join(' · ');

  const pendingInvoices = invoices.filter((i) => i.status === 'pending' || i.status === 'overdue').length;
  const activeEnrollmentCount = enrollments.filter((e) => e.status === 'active').length;

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-on-surface-variant">
            <Link to="/admin/courses" className="hover:underline">{t('admin.courses.title')}</Link>
            {' / '}
            {title}
          </p>
          <h1 className="mt-1 text-lg font-semibold text-on-surface">{title}</h1>
          {teacher ? (
            <p className="text-sm text-on-surface-variant">
              <span className="material-symbols-outlined me-1 align-middle text-base" aria-hidden>person</span>
              {teacher}
            </p>
          ) : null}
        </div>
        <Button asChild variant="outline">
          <Link to={`/admin/courses/${courseId}/edit`}>
            <span className="material-symbols-outlined me-1 text-base" aria-hidden>edit</span>
            {t('admin.courses.detail.editCourse')}
          </Link>
        </Button>
      </div>

      {/* Stats strip */}
      <div className="flex flex-wrap gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-primary text-lg" aria-hidden>group</span>
          {t('admin.courses.detail.statsEnrolled', { count: activeEnrollmentCount })}
        </div>
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-primary text-lg" aria-hidden>payments</span>
          {priceFmt.format(course.price_per_month)} {t('admin.courses.list.perMonth')}
        </div>
        {dayLabels ? (
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-primary text-lg" aria-hidden>schedule</span>
            {dayLabels}
            {course.schedule_time_start ? ` · ${course.schedule_time_start}` : ''}
            {course.schedule_time_end ? `–${course.schedule_time_end}` : ''}
          </div>
        ) : null}
        {pendingInvoices > 0 ? (
          <div className="flex items-center gap-2 text-sm text-error">
            <span className="material-symbols-outlined text-lg" aria-hidden>receipt_long</span>
            {t('admin.courses.detail.statsPendingInvoices', { count: pendingInvoices })}
          </div>
        ) : null}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-outline-variant">
        {(['roster', 'invoices'] as const).map((tabKey) => (
          <button
            key={tabKey}
            type="button"
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === tabKey
                ? 'border-b-2 border-primary text-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
            onClick={() => setTab(tabKey)}
          >
            {t(`admin.courses.detail.tab${tabKey.charAt(0).toUpperCase()}${tabKey.slice(1)}`)}
          </button>
        ))}
      </div>

      {/* Roster tab */}
      {tab === 'roster' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-on-surface-variant">
              {t('admin.courses.detail.rosterCount', { count: activeEnrollmentCount })}
            </p>
            <Button size="sm" onClick={() => setEnrollModalOpen(true)}>
              <span className="material-symbols-outlined me-1 text-base" aria-hidden>person_add</span>
              {t('admin.courses.detail.addStudent')}
            </Button>
          </div>

          {loadingEnrollments ? (
            <LoadingSkeleton />
          ) : enrollments.filter((e) => e.status === 'active').length === 0 ? (
            <EmptyState
              icon="group"
              title={t('admin.courses.detail.emptyRosterTitle')}
              description={t('admin.courses.detail.emptyRosterDescription')}
            />
          ) : (
            <div className="space-y-2">
              {enrollments
                .filter((e) => e.status === 'active')
                .map((e) => (
                  <EnrollmentRow
                    key={e.id}
                    enrollment={e}
                    locale={locale}
                    t={t}
                    onUnenroll={handleUnenroll}
                  />
                ))}
            </div>
          )}

          {/* Enroll modal */}
          {enrollModalOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEnrollModalOpen(false)}>
              <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <h2 className="mb-4 text-base font-semibold text-on-surface">{t('admin.courses.detail.enrollModalTitle')}</h2>
                <select
                  className="h-11 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface"
                  value={selectedChildId}
                  onChange={(e) => setSelectedChildId(e.target.value)}
                >
                  <option value="">{t('admin.courses.detail.selectChild')}</option>
                  {availableChildren.map((c) => (
                    <option key={c.id} value={c.id}>
                      {isAr ? c.full_name_ar || c.full_name_en : c.full_name_en || c.full_name_ar}
                    </option>
                  ))}
                </select>
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setEnrollModalOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button className="flex-1" disabled={!selectedChildId || enrolling} onClick={handleEnroll}>
                    {enrolling ? t('common.saving') : t('admin.courses.detail.confirmEnroll')}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

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
              <span className="material-symbols-outlined me-1 text-base" aria-hidden>receipt_long</span>
              {generating ? t('common.saving') : t('admin.courses.detail.generateInvoices')}
            </Button>
            <p className="text-xs text-on-surface-variant">
              {t('admin.courses.detail.generateHint', { count: activeEnrollmentCount })}
            </p>
          </div>

          {loadingInvoices ? (
            <LoadingSkeleton />
          ) : invoices.length === 0 ? (
            <EmptyState
              icon="receipt_long"
              title={t('admin.courses.detail.emptyInvoicesTitle')}
              description={t('admin.courses.detail.emptyInvoicesDescription')}
            />
          ) : (
            <div className="space-y-2">
              {invoices.map((inv) => (
                <InvoiceRow
                  key={inv.id}
                  invoice={inv}
                  locale={locale}
                  t={t}
                  onMarkPaid={handleMarkPaid}
                  onMarkWaived={handleMarkWaived}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

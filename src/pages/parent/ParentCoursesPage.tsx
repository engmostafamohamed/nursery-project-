import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useParentCourses, type ParentCourseInvoiceRow } from '@/hooks/useParentCourses';

const CATEGORY_COLORS: Record<string, string> = {
  sport: 'bg-blue-100 text-blue-900',
  art: 'bg-pink-100 text-pink-900',
  music: 'bg-purple-100 text-purple-900',
  academic: 'bg-amber-100 text-amber-900',
  language: 'bg-green-100 text-green-900',
  other: 'bg-surface-container text-on-surface',
};

const INVOICE_STATUS_COLORS: Record<string, string> = {
  pending: 'border-outline-variant bg-surface-container-highest text-on-surface-variant',
  paid: 'border-transparent bg-success/10 text-success',
  overdue: 'border-transparent bg-error-container text-on-error-container',
  waived: 'border-transparent bg-surface-container text-on-surface-variant',
};

function InvoiceCard({ invoice, locale, t }: {
  invoice: ParentCourseInvoiceRow;
  locale: string;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const isAr = locale.startsWith('ar');
  const courseTitle = isAr ? invoice.course_title_ar || invoice.course_title_en : invoice.course_title_en || invoice.course_title_ar;
  const childName = isAr ? invoice.child_name_ar || invoice.child_name_en : invoice.child_name_en || invoice.child_name_ar;
  const priceFmt = new Intl.NumberFormat(locale, { style: 'currency', currency: invoice.currency });
  const monthFmt = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' });

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium text-on-surface">{courseTitle}</p>
        <p className="text-xs text-on-surface-variant">{childName}</p>
        <p className="text-xs text-on-surface-variant">
          {monthFmt.format(new Date(invoice.billing_month + 'T00:00:00'))}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <p className="text-sm font-semibold text-on-surface">{priceFmt.format(invoice.amount)}</p>
        <Badge className={`text-xs ${INVOICE_STATUS_COLORS[invoice.status] ?? ''}`}>
          {t(`parent.courses.invoiceStatus.${invoice.status}`)}
        </Badge>
      </div>
    </div>
  );
}

export function ParentCoursesPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const isAr = i18n.language.startsWith('ar');

  const { data, isPending, isError } = useParentCourses(user?.id);
  const enrollments = data?.enrollments ?? [];
  const invoices = data?.invoices ?? [];

  const [tab, setTab] = useState<'courses' | 'invoices'>('courses');

  const priceFmt = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP' });

  const pendingCount = invoices.filter((i) => i.status === 'pending' || i.status === 'overdue').length;

  if (isPending) {
    return (
      <div className="mx-auto max-w-2xl lg:max-w-none space-y-4 px-4 pb-28 pt-2">
        <h1 className="text-lg font-semibold text-on-surface">{t('parent.courses.title')}</h1>
        <LoadingSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-2xl lg:max-w-none px-4 py-6">
        <h1 className="text-lg font-semibold text-on-surface">{t('parent.courses.title')}</h1>
        <p className="mt-4 text-sm text-error" role="alert">{t('parent.courses.loadError')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl lg:max-w-none space-y-4 px-4 pb-28 pt-2">
      <div>
        <h1 className="text-lg font-semibold text-on-surface">{t('parent.courses.title')}</h1>
        {enrollments.length > 0 ? (
          <p className="text-xs text-on-surface-variant">
            {t('parent.courses.subtitle', { count: enrollments.length })}
          </p>
        ) : null}
      </div>

      {/* Summary strip */}
      {(enrollments.length > 0 || pendingCount > 0) ? (
        <div className="flex flex-wrap gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-lg text-primary" aria-hidden>school</span>
            {t('parent.courses.totalEnrolled', { count: enrollments.length })}
          </div>
          {pendingCount > 0 ? (
            <div className="flex items-center gap-2 text-sm text-error">
              <span className="material-symbols-outlined text-lg" aria-hidden>receipt_long</span>
              {t('parent.courses.pendingInvoices', { count: pendingCount })}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-outline-variant">
        {(['courses', 'invoices'] as const).map((tabKey) => (
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
            {t(`parent.courses.tab${tabKey.charAt(0).toUpperCase()}${tabKey.slice(1)}`)}
            {tabKey === 'invoices' && pendingCount > 0 ? (
              <span className="ms-1.5 rounded-full bg-error px-1.5 text-[10px] text-white">{pendingCount}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Courses tab */}
      {tab === 'courses' ? (
        enrollments.length === 0 ? (
          <EmptyState
            icon="school"
            title={t('parent.courses.emptyTitle')}
            description={t('parent.courses.emptyDescription')}
          />
        ) : (
          <div className="space-y-3">
            {enrollments.map((e) => {
              const courseTitle = isAr ? e.course_title_ar || e.course_title_en : e.course_title_en || e.course_title_ar;
              const childName = isAr ? e.child_name_ar || e.child_name_en : e.child_name_en || e.child_name_ar;
              const teacher = isAr ? e.teacher_name_ar || e.teacher_name_en : e.teacher_name_en || e.teacher_name_ar;
              const dayLabels = (e.schedule_days ?? []).map((d) => t(`admin.courses.days.${d}`)).join(' · ');

              return (
                <div key={e.enrollment_id} className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-on-surface">{courseTitle}</p>
                      <p className="text-sm text-on-surface-variant">{childName}</p>
                    </div>
                    <Badge className={`${CATEGORY_COLORS[e.category] ?? ''} border-transparent shrink-0 text-xs`}>
                      {t(`admin.courses.categories.${e.category}`)}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-3 text-xs text-on-surface-variant">
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm text-primary" aria-hidden>payments</span>
                      {priceFmt.format(e.price_per_month)} {t('admin.courses.list.perMonth')}
                    </span>
                    {teacher ? (
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm text-primary" aria-hidden>person</span>
                        {teacher}
                      </span>
                    ) : null}
                    {dayLabels ? (
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm text-primary" aria-hidden>schedule</span>
                        {dayLabels}
                        {e.schedule_time_start ? ` · ${e.schedule_time_start}` : ''}
                        {e.schedule_time_end ? `–${e.schedule_time_end}` : ''}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : null}

      {/* Invoices tab */}
      {tab === 'invoices' ? (
        invoices.length === 0 ? (
          <EmptyState
            icon="receipt_long"
            title={t('parent.courses.emptyInvoicesTitle')}
            description={t('parent.courses.emptyInvoicesDescription')}
          />
        ) : (
          <div className="space-y-2">
            {invoices.map((inv) => (
              <InvoiceCard key={inv.id} invoice={inv} locale={locale} t={t} />
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

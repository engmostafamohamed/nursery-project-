import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import { StatusPill, TableCard, TableEmpty, TableLoading } from '@/components/ui/DataTable';
import { FilterChips } from '@/components/ui/FilterChips';
import { LoadError } from '@/components/ui/LoadError';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatTile } from '@/components/ui/StatTile';
import { TONE_TINT } from '@/components/ui/toneClasses';
import { BILL_TONE, COURSE_LOOK, courseTotals } from '@/features/parent-courses/parentCourses';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useParentCourses, type ParentCourseInvoiceRow, type ParentCourseRow } from '@/hooks/useParentCourses';
import { localName } from '@/lib/bilingualName';
import { formatDate } from '@/lib/datetime';
import { formatMoneyAmount } from '@/lib/money';
import { cn } from '@/lib/utils';

type Tab = 'courses' | 'invoices';

/** The children's courses and their bills; a bill's notice opens the bills (?tab=invoices). */
export function ParentCoursesPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'invoices' ? 'invoices' : 'courses';
  const { data, isPending, isError, refetch } = useParentCourses(user?.id);
  const courses = data?.enrollments ?? [];
  const bills = data?.invoices ?? [];
  const totals = courseTotals(courses, bills);
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 pb-28">
      <PageHeader icon="school" title={t('parent.courses.title')} description={t('parent.courses.description')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile icon="school" label={t('parent.courses.stats.courses')} value={totals.courses} onClick={() => setParams({}, { replace: true })} active={tab === 'courses'} />
          <StatTile icon="calendar_month" label={t('parent.courses.stats.monthly')} value={money(totals.monthly)} tone="neutral" />
          <StatTile
            icon="receipt_long"
            label={t('parent.courses.stats.openBills')}
            value={totals.openBills}
            tone={totals.openBills ? 'warning' : 'success'}
            onClick={() => setParams({ tab: 'invoices' }, { replace: true })}
            active={tab === 'invoices'}
          />
          <StatTile icon="payments" label={t('parent.courses.stats.openAmount')} value={money(totals.openAmount)} tone={totals.openAmount ? 'error' : 'success'} />
        </div>
      </PageHeader>

      <TableCard
        title={tab === 'courses' ? t('parent.courses.tabCourses') : t('parent.courses.tabInvoices')}
        description={tab === 'invoices' ? t('parent.courses.payHint') : undefined}
        actions={
          <FilterChips
            label={t('parent.courses.title')}
            value={tab}
            onChange={(next) => setParams(next === 'invoices' ? { tab: 'invoices' } : {}, { replace: true })}
            options={[
              { value: 'courses' as const, label: t('parent.courses.tabCourses'), count: courses.length },
              { value: 'invoices' as const, label: t('parent.courses.tabInvoices'), count: bills.length },
            ]}
          />
        }
      >
        {isError ? (
          <LoadError inset message={t('parent.courses.loadError')} onRetry={() => void refetch()} />
        ) : isPending ? (
          <TableLoading rows={3} />
        ) : tab === 'courses' ? (
          courses.length ? (
            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
              {courses.map((c) => <CourseCard key={c.enrollment_id} course={c} money={money} />)}
            </div>
          ) : (
            <TableEmpty icon="school" title={t('parent.courses.emptyTitle')} description={t('parent.courses.emptyDescription')} />
          )
        ) : bills.length ? (
          <ul className="divide-y divide-outline-variant">
            {bills.map((b) => <BillRow key={b.id} bill={b} money={money} />)}
          </ul>
        ) : (
          <TableEmpty icon="receipt_long" title={t('parent.courses.emptyInvoicesTitle')} description={t('parent.courses.emptyInvoicesDescription')} />
        )}
      </TableCard>
    </div>
  );
}

/** One course a child takes: what, who teaches it, when, and what it costs a month. */
function CourseCard({ course, money }: { course: ParentCourseRow; money: (n: number) => string }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const look = COURSE_LOOK[course.category] ?? COURSE_LOOK.other;
  const teacher = localName(course.teacher_name_ar, course.teacher_name_en, isAr);
  const days = (course.schedule_days ?? []).map((d) => t(`admin.courses.days.${d}`)).join(' · ');
  const time = [course.schedule_time_start?.slice(0, 5), course.schedule_time_end?.slice(0, 5)].filter(Boolean).join('–');

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm" data-testid="parent-course">
      <div className="flex items-start gap-3">
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', TONE_TINT[look.tone])}>
          <MaterialSymbol name={look.icon} size="text-xl" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-on-surface">{localName(course.course_title_ar, course.course_title_en, isAr)}</h3>
          <p className="text-sm text-on-surface-variant">{localName(course.child_name_ar, course.child_name_en, isAr)}</p>
        </div>
        <StatusPill tone={look.tone}>{t(`admin.courses.categories.${course.category || 'other'}`)}</StatusPill>
      </div>
      <dl className="space-y-1.5 text-sm text-on-surface-variant">
        {days ? (
          <div className="flex items-center gap-2">
            <MaterialSymbol name="schedule" size="text-base" className="text-primary" />
            <dt className="sr-only">{t('parent.courses.when')}</dt>
            <dd>{time ? `${days} · ${time}` : days}</dd>
          </div>
        ) : null}
        {teacher ? (
          <div className="flex items-center gap-2">
            <MaterialSymbol name="person" size="text-base" className="text-primary" />
            <dt className="sr-only">{t('parent.courses.teacher')}</dt>
            <dd>{teacher}</dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-auto border-t border-outline-variant pt-3 text-sm">
        <strong className="text-on-surface">{money(Number(course.price_per_month))}</strong>{' '}
        <span className="text-on-surface-variant">{t('admin.courses.list.perMonth')}</span>
      </p>
    </article>
  );
}

/** One course bill: the course and child, the month, the amount, when it is due, and its state. */
function BillRow({ bill, money }: { bill: ParentCourseInvoiceRow; money: (n: number) => string }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5" data-testid="parent-course-bill">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-on-surface">{localName(bill.course_title_ar, bill.course_title_en, isAr)}</p>
        <p className="text-xs text-on-surface-variant">
          {localName(bill.child_name_ar, bill.child_name_en, isAr)} · {formatDate(`${bill.billing_month}T00:00:00`, { month: 'long', year: 'numeric' })}
          {bill.status === 'paid' && bill.paid_at
            ? ` · ${t('parent.courses.paidOn', { date: formatDate(bill.paid_at, { day: 'numeric', month: 'short' }) })}`
            : bill.due_date
              ? ` · ${t('parent.courses.dueOn', { date: formatDate(bill.due_date, { day: 'numeric', month: 'short', year: 'numeric' }) })}`
              : ''}
        </p>
      </div>
      <span className="text-sm font-semibold tabular-nums text-on-surface">{money(Number(bill.amount))}</span>
      <StatusPill tone={BILL_TONE[bill.status] ?? 'neutral'}>{t(`parent.courses.invoiceStatus.${bill.status}`)}</StatusPill>
    </li>
  );
}

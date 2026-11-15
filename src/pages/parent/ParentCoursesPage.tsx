import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { DataTable, StatusPill, TableCard, TableEmpty, TableLoading, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { FilterChips } from '@/components/ui/FilterChips';
import { LoadError } from '@/components/ui/LoadError';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatTile } from '@/components/ui/StatTile';
import { TONE_TINT } from '@/components/ui/toneClasses';
import { CourseCatalog } from '@/features/course-requests/CourseCatalog';
import { BILL_TONE, COURSE_LOOK, courseTotals, isOpenBill } from '@/features/parent-courses/parentCourses';
import { useCourseCatalog } from '@/features/course-requests/useCourseRequests';
import { useAuthSession } from '@/hooks/useAuthSession';
import { usePagination } from '@/hooks/usePagination';
import { useParentCourses, type ParentCourseInvoiceRow, type ParentCourseRow } from '@/hooks/useParentCourses';
import { localName } from '@/lib/bilingualName';
import { formatDate } from '@/lib/datetime';
import { formatMoneyAmount } from '@/lib/money';
import { cn } from '@/lib/utils';

type Tab = 'courses' | 'catalog' | 'invoices';
const TABS: Tab[] = ['courses', 'catalog', 'invoices'];

/** The children's courses, the nursery's open courses to ask for (?tab=catalog), and the bills (?tab=invoices), each paid online. */
export function ParentCoursesPage() {
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find((x) => x === params.get('tab')) ?? 'courses';
  const catalog = useCourseCatalog();
  const { data, isPending, isError, refetch } = useParentCourses(user?.id);
  const courses = data?.enrollments ?? [];
  const bills = data?.invoices ?? [];
  const totals = courseTotals(courses, bills);
  const money = (amount: number) => t('invoice.egpAmount', { amount: formatMoneyAmount(amount) });
  const coursePager = usePagination(courses, 10, 'courses');
  const billPager = usePagination(bills, 10, 'bills');

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
        title={t(`parent.courses.tabs.${tab}`)}
        description={tab === 'invoices' ? t('parent.courses.payHint') : tab === 'catalog' ? t('parent.courses.catalog.hint') : undefined}
        pagination={
          tab === 'courses' && courses.length ? <TablePagination pager={coursePager} pageSizeOptions={[10, 20, 50]} />
          : tab === 'invoices' && bills.length ? <TablePagination pager={billPager} pageSizeOptions={[10, 20, 50]} />
          : null
        }
        actions={
          <FilterChips
            label={t('parent.courses.title')}
            value={tab}
            onChange={(next) => setParams(next === 'courses' ? {} : { tab: next }, { replace: true })}
            options={TABS.map((value) => ({
              value,
              label: t(`parent.courses.tabs.${value}`),
              count: value === 'courses' ? courses.length : value === 'catalog' ? catalog.data?.length : bills.length,
            }))}
          />
        }
      >
        {isError ? (
          <LoadError inset message={t('parent.courses.loadError')} onRetry={() => void refetch()} />
        ) : isPending ? (
          <TableLoading rows={3} />
        ) : tab === 'catalog' ? (
          <CourseCatalog money={money} />
        ) : tab === 'courses' ? (
          courses.length ? (
            <DataTable minWidth={760}>
              <THead>
                <Th>{t('parent.courses.table.course')}</Th>
                <Th>{t('parent.courses.table.child')}</Th>
                <Th>{t('parent.courses.when')}</Th>
                <Th>{t('parent.courses.teacher')}</Th>
                <Th align="end">{t('parent.courses.table.price')}</Th>
              </THead>
              <TBody>
                {coursePager.pageItems.map((c) => <CourseRow key={c.enrollment_id} course={c} money={money} />)}
              </TBody>
            </DataTable>
          ) : (
            <TableEmpty icon="school" title={t('parent.courses.emptyTitle')} description={t('parent.courses.emptyDescription')} />
          )
        ) : bills.length ? (
          <DataTable minWidth={760}>
            <THead>
              <Th>{t('parent.courses.table.course')}</Th>
              <Th>{t('parent.courses.table.month')}</Th>
              <Th>{t('parent.courses.table.due')}</Th>
              <Th align="end">{t('parent.courses.table.amount')}</Th>
              <Th>{t('parent.courses.table.status')}</Th>
              <Th align="end"><span className="sr-only">{t('parent.courses.pay')}</span></Th>
            </THead>
            <TBody>
              {billPager.pageItems.map((b) => <BillRow key={b.id} bill={b} money={money} />)}
            </TBody>
          </DataTable>
        ) : (
          <TableEmpty icon="receipt_long" title={t('parent.courses.emptyInvoicesTitle')} description={t('parent.courses.emptyInvoicesDescription')} />
        )}
      </TableCard>
    </div>
  );
}

/** One course a child takes, as a table row: what, for which child, when, who teaches it, and its monthly price. */
function CourseRow({ course, money }: { course: ParentCourseRow; money: (n: number) => string }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const look = COURSE_LOOK[course.category] ?? COURSE_LOOK.other;
  const teacher = localName(course.teacher_name_ar, course.teacher_name_en, isAr);
  const days = (course.schedule_days ?? []).map((d) => t(`admin.courses.days.${d}`)).join(' · ');
  const time = [course.schedule_time_start?.slice(0, 5), course.schedule_time_end?.slice(0, 5)].filter(Boolean).join('–');

  return (
    <Tr data-testid="parent-course">
      <Td className="min-w-[13rem]">
        <span className="flex min-w-0 items-center gap-3">
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', TONE_TINT[look.tone])}>
            <MaterialSymbol name={look.icon} size="text-lg" />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-on-surface">{localName(course.course_title_ar, course.course_title_en, isAr)}</span>
            <StatusPill tone={look.tone} className="mt-1">{t(`admin.courses.categories.${course.category || 'other'}`)}</StatusPill>
          </span>
        </span>
      </Td>
      <Td className="text-on-surface">{localName(course.child_name_ar, course.child_name_en, isAr)}</Td>
      <Td className="whitespace-nowrap text-on-surface-variant">{days ? (time ? `${days} · ${time}` : days) : '—'}</Td>
      <Td className="text-on-surface-variant">{teacher || '—'}</Td>
      <Td align="end" className="whitespace-nowrap">
        <strong className="text-on-surface">{money(Number(course.price_per_month))}</strong>{' '}
        <span className="text-xs text-on-surface-variant">{t('admin.courses.list.perMonth')}</span>
      </Td>
    </Tr>
  );
}

/** One course bill, as a table row: the course and child, the month, when it is due or was paid, the amount, its state and the pay or invoice link. */
function BillRow({ bill, money }: { bill: ParentCourseInvoiceRow; money: (n: number) => string }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  return (
    <Tr data-testid="parent-course-bill">
      <Td className="min-w-[12rem]">
        <span className="block font-semibold text-on-surface">{localName(bill.course_title_ar, bill.course_title_en, isAr)}</span>
        <span className="block text-xs text-on-surface-variant">{localName(bill.child_name_ar, bill.child_name_en, isAr)}</span>
      </Td>
      <Td className="whitespace-nowrap text-on-surface">{formatDate(`${bill.billing_month}T00:00:00`, { month: 'long', year: 'numeric' })}</Td>
      <Td className="whitespace-nowrap text-on-surface-variant">
        {bill.status === 'paid' && bill.paid_at
          ? t('parent.courses.paidOn', { date: formatDate(bill.paid_at, { day: 'numeric', month: 'short' }) })
          : bill.due_date
            ? t('parent.courses.dueOn', { date: formatDate(bill.due_date, { day: 'numeric', month: 'short', year: 'numeric' }) })
            : '—'}
      </Td>
      <Td align="end" className="whitespace-nowrap font-semibold tabular-nums text-on-surface">{money(Number(bill.amount))}</Td>
      <Td>
        <StatusPill tone={BILL_TONE[bill.status] ?? 'neutral'}>{t(`parent.courses.invoiceStatus.${bill.status}`)}</StatusPill>
      </Td>
      <Td align="end">
        {bill.invoice_id ? (
          <Button asChild size="sm" variant={isOpenBill(bill) ? 'default' : 'ghost'}>
            <Link
              to={
                isOpenBill(bill)
                  ? `/parent/invoices/${bill.invoice_id}/pay?returnTo=${encodeURIComponent('/parent/courses?tab=invoices')}`
                  : `/parent/invoices/${bill.invoice_id}`
              }
              data-testid="course-bill-action"
            >
              {isOpenBill(bill) ? t('parent.courses.pay') : t('parent.courses.viewInvoice')}
            </Link>
          </Button>
        ) : null}
      </Td>
    </Tr>
  );
}

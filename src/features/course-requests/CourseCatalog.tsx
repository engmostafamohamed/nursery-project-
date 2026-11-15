import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { DataTable, StatusPill, TableEmpty, TableLoading, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { LoadError } from '@/components/ui/LoadError';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { TONE_TINT } from '@/components/ui/toneClasses';
import { useParentChildren } from '@/hooks/useParentChildren';
import { usePagination } from '@/hooks/usePagination';
import { localName } from '@/lib/bilingualName';
import { cn } from '@/lib/utils';

import { cancelRequest, courseRequestErrorKey, type CatalogCourse } from './courseRequestsApi';
import { CourseRequestDialog } from './CourseRequestDialog';
import { COURSE_LOOK, placesLeft } from '@/features/parent-courses/parentCourses';
import { refreshCourseRequests, useCourseCatalog } from './useCourseRequests';

/** The nursery's open courses for the family: what, when, the price, places left, and for each child: in it, asked, or ask. */
export function CourseCatalog({ money }: { money: (n: number) => string }) {
  const { t } = useTranslation();
  const query = useCourseCatalog();
  const courses = query.data ?? [];
  const pager = usePagination(courses, 10, 'catalog');

  if (query.isError) return <LoadError inset message={t('parent.courses.catalog.loadError')} onRetry={() => void query.refetch()} />;
  if (query.isPending) return <TableLoading rows={3} />;
  if (!courses.length) return <TableEmpty icon="school" title={t('parent.courses.catalog.emptyTitle')} description={t('parent.courses.catalog.emptyHint')} />;
  return (
    <>
      <DataTable minWidth={900}>
        <THead>
          <Th>{t('parent.courses.table.course')}</Th>
          <Th>{t('parent.courses.when')}</Th>
          <Th align="end">{t('parent.courses.table.price')}</Th>
          <Th>{t('parent.courses.catalog.places')}</Th>
          <Th>{t('parent.courses.catalog.yourChildren')}</Th>
          <Th align="end"><span className="sr-only">{t('parent.courses.catalog.ask')}</span></Th>
        </THead>
        <TBody>
          {pager.pageItems.map((c) => <CatalogRow key={c.id} course={c} money={money} />)}
        </TBody>
      </DataTable>
      <TablePagination pager={pager} pageSizeOptions={[10, 20, 50]} />
    </>
  );
}

function CatalogRow({ course, money }: { course: CatalogCourse; money: (n: number) => string }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const queryClient = useQueryClient();
  const names = new Map((useParentChildren().data ?? []).map((c) => [c.id, localName(c.nameAr, c.nameEn, isAr)]));
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const look = COURSE_LOOK[course.category] ?? COURSE_LOOK.other;
  const title = localName(course.title_ar, course.title_en, isAr);
  const description = localName(course.description_ar, course.description_en, isAr);
  const left = placesLeft(course);
  const full = left === 0;
  const days = (course.schedule_days ?? []).map((d) => t(`admin.courses.days.${d}`)).join(' · ');
  const time = [course.schedule_time_start?.slice(0, 5), course.schedule_time_end?.slice(0, 5)].filter(Boolean).join('–');
  const children = course.children ?? [];
  const canAsk = children.filter((c) => c.state === 'none').map((c) => ({ id: c.child_id, name: names.get(c.child_id) ?? '' }));

  const withdraw = async (requestId: string) => {
    setBusy(requestId);
    try {
      await cancelRequest(requestId);
      toast.success(t('parent.courses.catalog.withdrawn'));
      refreshCourseRequests(queryClient);
    } catch (error) {
      toast.error(t(courseRequestErrorKey(error)));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Tr data-testid="catalog-course">
      <Td className="min-w-[14rem]">
        <span className="flex min-w-0 items-start gap-3">
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', TONE_TINT[look.tone])}>
            <MaterialSymbol name={look.icon} size="text-lg" />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-on-surface">{title}</span>
            {description ? <span className="line-clamp-1 block text-xs text-on-surface-variant" title={description}>{description}</span> : null}
            {course.teacher ? <span className="block text-xs text-on-surface-variant">{localName(course.teacher.ar, course.teacher.en, isAr)}</span> : null}
          </span>
        </span>
      </Td>
      <Td className="whitespace-nowrap text-on-surface-variant">{days ? (time ? `${days} · ${time}` : days) : '—'}</Td>
      <Td align="end" className="whitespace-nowrap">
        <strong className="text-on-surface">{money(Number(course.price_per_month))}</strong>{' '}
        <span className="text-xs text-on-surface-variant">{t('admin.courses.list.perMonth')}</span>
      </Td>
      <Td>
        <StatusPill tone={full ? 'error' : left != null && left <= 3 ? 'warning' : 'success'}>
          {full ? t('parent.courses.catalog.full') : left == null ? t('parent.courses.catalog.open') : t('parent.courses.catalog.placesLeft', { count: left })}
        </StatusPill>
      </Td>
      <Td className="min-w-[12rem]">
        <span className="space-y-1.5">
          {children.map((c) => (
            <span key={c.child_id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 truncate font-medium text-on-surface">{names.get(c.child_id)}</span>
              {c.state === 'enrolled' ? (
                <StatusPill tone="success" icon="task_alt">{t('parent.courses.catalog.enrolled')}</StatusPill>
              ) : c.state === 'pending' ? (
                <>
                  <StatusPill tone="warning" icon="hourglass_top">{t('parent.courses.catalog.pending')}</StatusPill>
                  <Button type="button" size="sm" variant="ghost" disabled={busy === c.request_id} onClick={() => c.request_id && void withdraw(c.request_id)}>
                    {t('parent.courses.catalog.withdraw')}
                  </Button>
                </>
              ) : null}
            </span>
          ))}
        </span>
      </Td>
      <Td align="end">
        {canAsk.length ? (
          <Button type="button" size="sm" variant={full ? 'outline' : 'default'} disabled={full} onClick={() => setAsking(true)} data-testid="catalog-ask">
            <MaterialSymbol name="how_to_reg" size="text-base" className="me-1" />
            {t('parent.courses.catalog.ask')}
          </Button>
        ) : null}
        {asking ? <CourseRequestDialog courseId={course.id} courseTitle={title} kids={canAsk} onClose={() => setAsking(false)} /> : null}
      </Td>
    </Tr>
  );
}

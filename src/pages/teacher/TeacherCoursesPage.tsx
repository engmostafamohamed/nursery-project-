import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable, StatusPill, TableEmpty, TablePagination, TBody, Td, Th, THead, Tr, type PillTone } from '@/components/ui/DataTable';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { useAuthSession } from '@/hooks/useAuthSession';
import { usePagination } from '@/hooks/usePagination';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useTeacherCourses, useTeacherCourseEnrollees } from '@/hooks/useTeacherCourses';
import { CourseSessionsPanel } from '@/features/course-sessions/CourseSessionsPanel';
import { localName } from '@/lib/bilingualName';

const CATEGORY_TONE: Record<string, PillTone> = {
  sport: 'primary',
  art: 'error',
  music: 'primary',
  academic: 'warning',
  language: 'success',
  other: 'neutral',
};

/** The children taking this course, one row each. */
function RosterPanel({ courseId }: { courseId: string }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const { data: enrollees = [], isPending } = useTeacherCourseEnrollees(courseId);
  const pager = usePagination(enrollees, 10, enrollees.length);

  if (isPending) return <LoadingSkeleton />;
  if (enrollees.length === 0) {
    return <p className="py-3 text-sm text-on-surface-variant">{t('teacher.courses.emptyRosterTitle')}</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface">
      <DataTable minWidth={320}>
        <THead>
          <Th>{t('teacher.courses.rosterTable.child')}</Th>
        </THead>
        <TBody>
          {pager.pageItems.map((e) => (
            <Tr key={e.id} data-testid="teacher-roster-row">
              <Td>
                <span className="flex items-center gap-2">
                  <MaterialSymbol name="child_care" size="text-lg" className="text-primary" />
                  <span className="font-medium text-on-surface">{localName(e.child_name_ar, e.child_name_en, isAr)}</span>
                </span>
              </Td>
            </Tr>
          ))}
        </TBody>
      </DataTable>
      <TablePagination pager={pager} pageSizeOptions={[10, 20, 50]} />
    </div>
  );
}

export function TeacherCoursesPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  useNurseryLanguagePref(profile?.nursery_id);
  const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB';
  const isAr = i18n.language.startsWith('ar');

  const { data: courses = [], isPending, isError } = useTeacherCourses(user?.id);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pager = usePagination(courses, 10, courses.length);

  const priceFmt = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP' });

  if (isPending) {
    return (
      <div className="space-y-4 pb-8">
        <h1 className="text-lg font-semibold text-on-surface">{t('teacher.courses.title')}</h1>
        <LoadingSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="pb-8">
        <h1 className="text-lg font-semibold text-on-surface">{t('teacher.courses.title')}</h1>
        <p className="mt-4 text-sm text-error" role="alert">{t('teacher.courses.loadError')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <div>
        <h1 className="text-lg font-semibold text-on-surface">{t('teacher.courses.title')}</h1>
        {courses.length > 0 ? (
          <p className="text-xs text-on-surface-variant">
            {t('teacher.courses.subtitle', { count: courses.length })}
          </p>
        ) : null}
      </div>

      {courses.length === 0 ? (
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
          <TableEmpty
            icon="school"
            title={t('teacher.courses.emptyTitle')}
            description={t('teacher.courses.emptyDescription')}
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
          <DataTable minWidth={760}>
            <THead>
              <Th>{t('teacher.courses.table.course')}</Th>
              <Th>{t('parent.courses.when')}</Th>
              <Th>{t('teacher.courses.table.children')}</Th>
              <Th align="end">{t('teacher.courses.table.price')}</Th>
              <Th align="end"><span className="sr-only">{t('teacher.courses.table.open')}</span></Th>
            </THead>
            <TBody>
              {pager.pageItems.map((course) => {
                const title = localName(course.title_ar, course.title_en, isAr);
                const isExpanded = expandedId === course.id;
                const dayLabels = (course.schedule_days ?? [])
                  .map((d) => t(`admin.courses.days.${d}`))
                  .join(' · ');
                const timeRange = [course.schedule_time_start?.slice(0, 5), course.schedule_time_end?.slice(0, 5)]
                  .filter(Boolean)
                  .join('–');
                return (
                  <Fragment key={course.id}>
                    <Tr onClick={() => setExpandedId(isExpanded ? null : course.id)} data-testid="teacher-course-row">
                      <Td className="min-w-[12rem]">
                        <span className="block font-semibold text-on-surface">{title}</span>
                        <StatusPill tone={CATEGORY_TONE[course.category] ?? 'neutral'} className="mt-1">
                          {t(`admin.courses.categories.${course.category}`)}
                        </StatusPill>
                      </Td>
                      <Td className="whitespace-nowrap text-on-surface-variant">
                        {dayLabels ? (timeRange ? `${dayLabels} · ${timeRange}` : dayLabels) : '—'}
                      </Td>
                      <Td className="whitespace-nowrap text-on-surface-variant">
                        {t('teacher.courses.enrolledCount', { count: course.enrollment_count })}
                      </Td>
                      <Td align="end" className="whitespace-nowrap">
                        <span className="font-semibold text-on-surface">{priceFmt.format(course.price_per_month)}</span>{' '}
                        <span className="text-xs text-on-surface-variant">{t('admin.courses.list.perMonth')}</span>
                      </Td>
                      <Td align="end">
                        <MaterialSymbol name={isExpanded ? 'expand_less' : 'expand_more'} size="text-xl" className="text-primary" />
                      </Td>
                    </Tr>
                    {isExpanded ? (
                      <tr className="bg-surface-container-lowest" data-testid="teacher-course-details">
                        <td colSpan={5} className="space-y-4 px-4 py-4 sm:px-5">
                          <div>
                            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                              {t('teacher.courses.rosterHeading')}
                            </p>
                            <RosterPanel courseId={course.id} />
                          </div>
                          <div>
                            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                              {t('teacher.courses.sessionsHeading')}
                            </p>
                            <CourseSessionsPanel courseId={course.id} />
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </TBody>
          </DataTable>
          <TablePagination pager={pager} pageSizeOptions={[10, 20, 50]} />
        </div>
      )}
    </div>
  );
}

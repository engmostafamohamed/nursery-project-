import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useTeacherCourses, useTeacherCourseEnrollees } from '@/hooks/useTeacherCourses';

const CATEGORY_COLORS: Record<string, string> = {
  sport: 'bg-blue-100 text-blue-900',
  art: 'bg-pink-100 text-pink-900',
  music: 'bg-purple-100 text-purple-900',
  academic: 'bg-amber-100 text-amber-900',
  language: 'bg-green-100 text-green-900',
  other: 'bg-surface-container text-on-surface',
};

function RosterPanel({ courseId, locale }: { courseId: string; locale: string }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const { data: enrollees = [], isPending } = useTeacherCourseEnrollees(courseId);

  if (isPending) return <LoadingSkeleton />;
  if (enrollees.length === 0) {
    return (
      <EmptyState icon="group" title={t('teacher.courses.emptyRosterTitle')} description={t('teacher.courses.emptyRosterDescription')} />
    );
  }

  return (
    <div className="space-y-2">
      {enrollees.map((e) => {
        const name = isAr ? e.child_name_ar || e.child_name_en : e.child_name_en || e.child_name_ar;
        return (
          <div key={e.id} className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
            <span className="material-symbols-outlined text-lg text-primary" aria-hidden>child_care</span>
            <p className="text-sm font-medium text-on-surface">{name}</p>
          </div>
        );
      })}
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
        <EmptyState
          icon="school"
          title={t('teacher.courses.emptyTitle')}
          description={t('teacher.courses.emptyDescription')}
        />
      ) : (
        <div className="space-y-3">
          {courses.map((course) => {
            const title = isAr ? course.title_ar || course.title_en : course.title_en || course.title_ar;
            const isExpanded = expandedId === course.id;
            const dayLabels = (course.schedule_days ?? [])
              .map((d) => t(`admin.courses.days.${d}`))
              .join(' · ');

            return (
              <div key={course.id} className="rounded-2xl border border-outline-variant bg-surface-container-lowest">
                <button
                  type="button"
                  className="flex w-full items-start gap-3 p-4 text-start"
                  onClick={() => setExpandedId(isExpanded ? null : course.id)}
                >
                  <span className="material-symbols-outlined mt-0.5 shrink-0 text-xl text-primary" aria-hidden>school</span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="font-semibold text-on-surface">{title}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge className={`${CATEGORY_COLORS[course.category] ?? ''} border-transparent text-xs`}>
                        {t(`admin.courses.categories.${course.category}`)}
                      </Badge>
                      <span className="flex items-center gap-1 text-xs text-on-surface-variant">
                        <span className="material-symbols-outlined text-sm" aria-hidden>group</span>
                        {t('teacher.courses.enrolledCount', { count: course.enrollment_count })}
                      </span>
                    </div>
                    {dayLabels ? (
                      <p className="text-xs text-on-surface-variant">
                        {dayLabels}
                        {course.schedule_time_start ? ` · ${course.schedule_time_start}` : ''}
                        {course.schedule_time_end ? `–${course.schedule_time_end}` : ''}
                      </p>
                    ) : null}
                    <p className="text-xs text-on-surface-variant">
                      {priceFmt.format(course.price_per_month)} {t('admin.courses.list.perMonth')}
                    </p>
                  </div>
                  <span className="material-symbols-outlined shrink-0 text-base text-on-surface-variant" aria-hidden>
                    {isExpanded ? 'expand_less' : 'expand_more'}
                  </span>
                </button>

                {isExpanded ? (
                  <div className="border-t border-outline-variant px-4 pb-4 pt-3">
                    <p className="mb-2 text-xs font-medium text-on-surface-variant uppercase tracking-wide">
                      {t('teacher.courses.rosterHeading')}
                    </p>
                    <RosterPanel courseId={course.id} locale={locale} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

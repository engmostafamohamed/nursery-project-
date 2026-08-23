import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { confirm } from '@/components/ui/confirm';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  adminCoursesListQueryKey,
  useAdminCoursesList,
  type AdminCoursesListRow,
  type CourseCategory,
  type CourseStatus,
} from '@/hooks/useAdminCoursesList';
import { supabase } from '@/lib/supabase';

const CATEGORY_COLORS: Record<string, string> = {
  sport: 'bg-blue-100 text-blue-900',
  art: 'bg-pink-100 text-pink-900',
  music: 'bg-purple-100 text-purple-900',
  academic: 'bg-amber-100 text-amber-900',
  language: 'bg-green-100 text-green-900',
  other: 'bg-surface-container text-on-surface',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'border-transparent bg-secondary-fixed text-on-primary-fixed',
  paused: 'border-outline-variant bg-surface-container-highest text-on-surface-variant',
  completed: 'border-transparent bg-success/10 text-success',
  cancelled: 'border-transparent bg-error-container text-on-error-container',
};

const CATEGORIES: Array<'all' | CourseCategory> = ['all', 'sport', 'art', 'music', 'academic', 'language', 'other'];
const STATUSES: Array<'all' | CourseStatus> = ['all', 'active', 'paused', 'completed', 'cancelled'];

function CourseCard({
  course,
  locale,
  t,
  onDelete,
}: {
  course: AdminCoursesListRow;
  locale: string;
  t: ReturnType<typeof useTranslation>['t'];
  onDelete: (id: string) => void;
}) {
  const isAr = locale.startsWith('ar');
  const title = isAr ? course.title_ar || course.title_en : course.title_en || course.title_ar;
  const teacher = isAr
    ? course.teacher_name_ar || course.teacher_name_en
    : course.teacher_name_en || course.teacher_name_ar;

  const priceFmt = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP' });

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-on-surface">{title}</p>
          {teacher ? (
            <p className="mt-0.5 text-xs text-on-surface-variant">
              <span className="material-symbols-outlined me-1 align-middle text-sm text-primary" aria-hidden>
                person
              </span>
              {teacher}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1">
          <Badge className={`${CATEGORY_COLORS[course.category] ?? ''} border-transparent text-xs`}>
            {t(`admin.courses.categories.${course.category}`)}
          </Badge>
          <Badge className={`${STATUS_COLORS[course.status] ?? ''} text-xs`}>
            {t(`admin.courses.status.${course.status}`)}
          </Badge>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-on-surface-variant">
        <span className="flex items-center gap-1">
          <span className="material-symbols-outlined text-base text-primary" aria-hidden>group</span>
          {t('admin.courses.list.enrolledCount', { count: course.enrollment_count })}
          {course.max_students ? ` / ${course.max_students}` : ''}
        </span>
        <span className="flex items-center gap-1">
          <span className="material-symbols-outlined text-base text-primary" aria-hidden>payments</span>
          {priceFmt.format(course.price_per_month)}
          {' '}{t('admin.courses.list.perMonth')}
        </span>
        {course.starts_on ? (
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-base text-primary" aria-hidden>calendar_today</span>
            {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(course.starts_on + 'T00:00:00'))}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-outline-variant/40 pt-3">
        <Button asChild size="sm" variant="default">
          <Link to={`/admin/courses/${course.id}`}>{t('admin.courses.list.viewDetails')}</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to={`/admin/courses/${course.id}/edit`}>{t('admin.courses.list.edit')}</Link>
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="ms-auto text-error hover:bg-error/5"
          onClick={() => onDelete(course.id)}
        >
          {t('admin.courses.list.delete')}
        </Button>
      </div>
    </div>
  );
}

export function AdminCoursesListPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const profileQuery = useUserProfile(user?.id);
  const nurseryId = profileQuery.data?.nursery_id;
  const queryClient = useQueryClient();
  const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-GB';

  const [categoryFilter, setCategoryFilter] = useState<'all' | CourseCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | CourseStatus>('all');
  const [search, setSearch] = useState('');

  const { data: courses = [], isPending, isError } = useAdminCoursesList(nurseryId);

  const [deleting, setDeleting] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = courses;
    if (categoryFilter !== 'all') list = list.filter((c) => c.category === categoryFilter);
    if (statusFilter !== 'all') list = list.filter((c) => c.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) => c.title_en.toLowerCase().includes(q) || c.title_ar.toLowerCase().includes(q),
      );
    }
    return list;
  }, [courses, categoryFilter, statusFilter, search]);

  const handleDelete = async (courseId: string) => {
    if (!(await confirm({ description: t('admin.courses.list.deleteConfirm'), variant: 'danger' }))) return;
    setDeleting(courseId);
    try {
      const { error } = await supabase.from('courses').delete().eq('id', courseId);
      if (error) throw error;
      queryClient.removeQueries({ queryKey: adminCoursesListQueryKey(nurseryId) });
      toast.success(t('admin.courses.list.deleteSuccess'));
    } catch {
      toast.error(t('admin.courses.list.deleteError'));
    } finally {
      setDeleting(null);
    }
  };

  if (isPending) {
    return (
      <div className="space-y-4 pb-8">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-on-surface">{t('admin.courses.title')}</h1>
        </div>
        <LoadingSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="pb-8">
        <h1 className="text-lg font-semibold text-on-surface">{t('admin.courses.title')}</h1>
        <p className="mt-4 text-sm text-error" role="alert">{t('admin.courses.list.loadError')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-on-surface">{t('admin.courses.title')}</h1>
          <p className="text-xs text-on-surface-variant">
            {t('admin.courses.list.totalCount', { count: courses.length })}
          </p>
        </div>
        <Button asChild>
          <Link to="/admin/courses/new">
            <span className="material-symbols-outlined me-1 text-base" aria-hidden>add</span>
            {t('admin.courses.list.createNew')}
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                categoryFilter === cat
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
              }`}
              onClick={() => setCategoryFilter(cat)}
            >
              {cat === 'all' ? t('admin.courses.categories.all') : t(`admin.courses.categories.${cat}`)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((st) => (
            <button
              key={st}
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === st
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
              }`}
              onClick={() => setStatusFilter(st)}
            >
              {st === 'all' ? t('admin.courses.status.all') : t(`admin.courses.status.${st}`)}
            </button>
          ))}
        </div>
        <div className="relative max-w-sm">
          <span className="material-symbols-outlined pointer-events-none absolute start-3 top-2.5 text-base text-on-surface-variant">
            search
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.courses.list.searchPlaceholder')}
            className="h-11 w-full rounded-md border border-outline-variant bg-surface-container-lowest py-2 ps-10 pe-3 text-sm text-on-surface"
          />
        </div>
      </div>

      {courses.length === 0 ? (
        <EmptyState
          icon="school"
          title={t('admin.courses.list.emptyTitle')}
          description={t('admin.courses.list.emptyDescription')}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="filter_alt_off"
          title={t('admin.courses.list.emptyFilterTitle')}
          description={t('admin.courses.list.emptyFilterDescription')}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((course) => (
            <div key={course.id} className={deleting === course.id ? 'pointer-events-none opacity-50' : ''}>
              <CourseCard course={course} locale={locale} t={t} onDelete={handleDelete} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

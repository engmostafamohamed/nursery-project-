import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { confirm } from '@/components/ui/confirm';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, IconAction, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { usePagination } from '@/hooks/usePagination';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  adminCoursesListQueryKey,
  useAdminCoursesList,
  type AdminCoursesListRow,
  type CourseCategory,
  type CourseStatus,
} from '@/hooks/useAdminCoursesList';
import { localName } from '@/lib/bilingualName';
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

/** One course in the admin's courses table: name and kind, teacher, status, places taken, price, start, and its actions. */
function CourseRow({
  course,
  locale,
  t,
  onDelete,
  busy,
}: {
  course: AdminCoursesListRow;
  locale: string;
  t: ReturnType<typeof useTranslation>['t'];
  onDelete: (id: string) => void;
  busy: boolean;
}) {
  const navigate = useNavigate();
  const isAr = locale.startsWith('ar');
  const title = localName(course.title_ar, course.title_en, isAr);
  const teacher = localName(course.teacher_name_ar, course.teacher_name_en, isAr);
  const priceFmt = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP' });

  return (
    <Tr onClick={() => navigate(`/admin/courses/${course.id}`)} className={busy ? 'pointer-events-none opacity-50' : undefined} data-testid="admin-course-row">
      <Td className="min-w-[13rem]">
        <span className="block font-semibold text-on-surface">{title}</span>
        <Badge className={`${CATEGORY_COLORS[course.category] ?? ''} mt-1 border-transparent text-xs`}>
          {t(`admin.courses.categories.${course.category}`)}
        </Badge>
      </Td>
      <Td className="text-on-surface-variant">{teacher || '—'}</Td>
      <Td>
        <Badge className={`${STATUS_COLORS[course.status] ?? ''} text-xs`}>{t(`admin.courses.status.${course.status}`)}</Badge>
      </Td>
      <Td className="whitespace-nowrap text-on-surface">
        {t('admin.courses.list.enrolledCount', { count: course.enrollment_count })}
        {course.max_students ? ` / ${course.max_students}` : ''}
      </Td>
      <Td align="end" className="whitespace-nowrap">
        <span className="font-semibold text-on-surface">{priceFmt.format(course.price_per_month)}</span>{' '}
        <span className="text-xs text-on-surface-variant">{t('admin.courses.list.perMonth')}</span>
      </Td>
      <Td className="whitespace-nowrap text-on-surface-variant">
        {course.starts_on ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(course.starts_on + 'T00:00:00')) : '—'}
      </Td>
      <Td align="end">
        <span className="flex items-center justify-end gap-0.5">
          <IconAction icon="visibility" label={t('admin.courses.list.viewDetails')} to={`/admin/courses/${course.id}`} />
          <IconAction icon="edit" label={t('admin.courses.list.edit')} to={`/admin/courses/${course.id}/edit`} />
          <IconAction icon="delete" label={t('admin.courses.list.delete')} onClick={() => onDelete(course.id)} danger />
        </span>
      </Td>
    </Tr>
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
  const pager = usePagination(filtered, 10, `${filtered.length}`);

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
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-sm">
          <DataTable minWidth={980}>
            <THead>
              <Th>{t('admin.courses.list.table.course')}</Th>
              <Th>{t('admin.courses.list.table.teacher')}</Th>
              <Th>{t('admin.courses.list.table.status')}</Th>
              <Th>{t('admin.courses.list.table.places')}</Th>
              <Th align="end">{t('admin.courses.list.table.price')}</Th>
              <Th>{t('admin.courses.list.table.starts')}</Th>
              <Th align="end">{t('admin.courses.list.table.actions')}</Th>
            </THead>
            <TBody>
              {pager.pageItems.map((course) => (
                <CourseRow key={course.id} course={course} locale={locale} t={t} onDelete={handleDelete} busy={deleting === course.id} />
              ))}
            </TBody>
          </DataTable>
          <TablePagination pager={pager} pageSizeOptions={[10, 20, 50]} />
        </div>
      )}
    </div>
  );
}

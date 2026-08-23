import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryLanguagePref, type NurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useUserProfile } from '@/hooks/useUserProfile';
import { getNurseryCalendarDateString } from '@/lib/nurseryDay';
import { supabase } from '@/lib/supabase';

type ClassRow = { id: string; name_ar: string | null; name_en: string | null };
type ChildRow = {
  id: string;
  class_id: string | null;
  full_name_ar: string | null;
  full_name_en: string | null;
  avatar_url: string | null;
};
type AttRow = {
  child_id: string;
  check_in: string | null;
  check_out: string | null;
  attendance_date: string;
};
type MediaRow = {
  id: string;
  thumbnail_url: string | null;
  caption: string | null;
  activity_type: string | null;
  uploaded_at: string;
};

function localized(ar: string | null, en: string | null, pref: NurseryLanguagePref): string {
  const a = (ar ?? '').trim();
  const e = (en ?? '').trim();
  if (pref === 'ar') return a || e || '—';
  if (pref === 'en') return e || a || '—';
  if (a && e) return `${a} / ${e}`;
  return a || e || '—';
}

export function TeacherHomePage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { data: languagePref = 'both' } = useNurseryLanguagePref(profile?.nursery_id);
  const today = getNurseryCalendarDateString();

  // Classes the teacher is on staff of.
  const classesQuery = useQuery({
    queryKey: ['teacher-home-classes', user?.id],
    queryFn: async (): Promise<ClassRow[]> => {
      if (!user?.id) return [];
      const memberships = await supabase
        .from('class_staff')
        .select('class_id')
        .eq('user_id', user.id);
      if (memberships.error) throw memberships.error;
      const ids = ((memberships.data ?? []) as { class_id: string }[]).map((m) => m.class_id);
      if (!ids.length) return [];
      const classes = await supabase.from('classes').select('id, name_ar, name_en').in('id', ids);
      if (classes.error) throw classes.error;
      return (classes.data ?? []) as ClassRow[];
    },
    enabled: Boolean(user?.id),
  });

  const classIds = useMemo(
    () => (classesQuery.data ?? []).map((c) => c.id),
    [classesQuery.data],
  );

  // Children in those classes.
  const childrenQuery = useQuery({
    queryKey: ['teacher-home-children', classIds],
    queryFn: async (): Promise<ChildRow[]> => {
      if (!classIds.length) return [];
      const res = await supabase
        .from('children')
        .select('id, class_id, full_name_ar, full_name_en, avatar_url')
        .in('class_id', classIds)
        .eq('status', 'active')
        .order('full_name_en', { ascending: true });
      if (res.error) throw res.error;
      return (res.data ?? []) as ChildRow[];
    },
    enabled: classIds.length > 0,
  });

  const childIds = useMemo(
    () => (childrenQuery.data ?? []).map((c) => c.id),
    [childrenQuery.data],
  );

  // Today's attendance for those children.
  const attendanceQuery = useQuery({
    queryKey: ['teacher-home-attendance', childIds, today],
    queryFn: async (): Promise<AttRow[]> => {
      if (!childIds.length) return [];
      const res = await supabase
        .from('attendance_records')
        .select('child_id, check_in, check_out, attendance_date')
        .eq('attendance_date', today)
        .in('child_id', childIds);
      if (res.error) throw res.error;
      return (res.data ?? []) as AttRow[];
    },
    enabled: childIds.length > 0,
  });

  const attIndex = useMemo(() => {
    const map = new Map<string, AttRow>();
    for (const r of attendanceQuery.data ?? []) map.set(r.child_id, r);
    return map;
  }, [attendanceQuery.data]);

  const stats = useMemo(() => {
    let stillIn = 0;
    let leftOut = 0;
    let notArrived = 0;
    for (const c of childrenQuery.data ?? []) {
      const r = attIndex.get(c.id);
      if (!r || !r.check_in) notArrived += 1;
      else if (r.check_out) leftOut += 1;
      else stillIn += 1;
    }
    return { stillIn, leftOut, notArrived, total: (childrenQuery.data ?? []).length };
  }, [attIndex, childrenQuery.data]);

  // Today's photos uploaded by this teacher.
  const mediaQuery = useQuery({
    queryKey: ['teacher-home-media', user?.id, today],
    queryFn: async (): Promise<MediaRow[]> => {
      if (!user?.id) return [];
      const res = await supabase
        .from('media')
        .select('id, thumbnail_url, caption, activity_type, uploaded_at')
        .eq('uploaded_by', user.id)
        .eq('captured_at', today)
        .order('uploaded_at', { ascending: false });
      if (res.error) throw res.error;
      return (res.data ?? []) as MediaRow[];
    },
    enabled: Boolean(user?.id),
  });

  const formatTime = useMemo(() => {
    const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-GB';
    return (iso: string | null) =>
      iso
        ? new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: true })
        : '—';
  }, [i18n.language]);

  const teacherName = profile?.name_en || profile?.name_ar || t('teacher.home.fallbackName');
  const showSkeleton = classesQuery.isLoading || childrenQuery.isLoading || attendanceQuery.isLoading;

  if (showSkeleton) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (classIds.length === 0) {
    return (
      <EmptyState
        icon="school"
        title={t('teacher.home.noClassesTitle')}
        description={t('teacher.home.noClassesDescription')}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-extrabold text-on-surface">
          {t('teacher.home.greeting', { name: teacherName })}
        </h1>
        <p className="mt-1 text-sm text-on-surface-variant">{t('teacher.home.subtitle')}</p>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-on-surface">
            {t('teacher.home.classesTitle')}
          </h2>
          <Link to="/teacher/classes" className="text-sm font-medium text-primary hover:underline">
            {t('teacher.home.viewAll')}
          </Link>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {(classesQuery.data ?? []).map((c) => {
            const count = (childrenQuery.data ?? []).filter((ch) => ch.class_id === c.id).length;
            return (
              <Link
                key={c.id}
                to={`/teacher/classes/${c.id}`}
                className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 transition-colors hover:bg-surface-container-low"
              >
                <p className="text-sm font-semibold text-on-surface">
                  {localized(c.name_ar, c.name_en, languagePref)}
                </p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  {t('teacher.home.studentsCount', { count })}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-on-surface">
            {t('teacher.home.attendanceTitle')}
          </h2>
          <Link to="/teacher/attendance" className="text-sm font-medium text-primary hover:underline">
            {t('teacher.home.openAttendance')}
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
            <p className="text-xs text-on-surface-variant">{t('teacher.home.stillIn')}</p>
            <p className="mt-1 text-2xl font-extrabold text-primary">{stats.stillIn}</p>
          </div>
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
            <p className="text-xs text-on-surface-variant">{t('teacher.home.leftOut')}</p>
            <p className="mt-1 text-2xl font-extrabold text-on-surface">{stats.leftOut}</p>
          </div>
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
            <p className="text-xs text-on-surface-variant">{t('teacher.home.notArrived')}</p>
            <p className="mt-1 text-2xl font-extrabold text-on-surface-variant">
              {stats.notArrived}
            </p>
          </div>
        </div>
        <div className="space-y-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-3">
          {(childrenQuery.data ?? []).slice(0, 8).map((c) => {
            const r = attIndex.get(c.id);
            const status = !r || !r.check_in ? 'not_arrived' : r.check_out ? 'left' : 'in';
            const name = localized(c.full_name_ar, c.full_name_en, languagePref);
            return (
              <div key={c.id} className="flex items-center gap-3">
                <div className="h-8 w-8 shrink-0 rounded-full bg-secondary-fixed text-center text-xs font-semibold leading-8 text-primary">
                  {name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-on-surface">{name}</p>
                  <p className="text-xs text-on-surface-variant">
                    {t('teacher.home.checkIn')}: {formatTime(r?.check_in ?? null)}
                    {' · '}
                    {t('teacher.home.checkOut')}: {formatTime(r?.check_out ?? null)}
                  </p>
                </div>
                <Badge
                  className={
                    status === 'in'
                      ? 'border-primary bg-primary/10 text-primary text-[10px]'
                      : status === 'left'
                        ? 'text-[10px]'
                        : 'border-outline-variant text-on-surface-variant text-[10px]'
                  }
                >
                  {t(`teacher.home.statuses.${status}`)}
                </Badge>
              </div>
            );
          })}
          {(childrenQuery.data ?? []).length > 8 ? (
            <p className="text-center text-xs text-on-surface-variant">
              {t('teacher.home.moreStudents', {
                count: (childrenQuery.data ?? []).length - 8,
              })}
            </p>
          ) : null}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-on-surface">
            {t('teacher.home.mediaTitle')}
          </h2>
          <Link to="/teacher/media" className="text-sm font-medium text-primary hover:underline">
            {t('teacher.home.openMedia')}
          </Link>
        </div>
        {(mediaQuery.data ?? []).length === 0 ? (
          <Link
            to="/teacher/media/upload"
            className="block rounded-2xl border border-dashed border-outline-variant bg-surface-container-lowest p-6 text-center text-sm text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            {t('teacher.home.noMediaToday')}
          </Link>
        ) : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {(mediaQuery.data ?? []).map((m) => (
              <div
                key={m.id}
                className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest"
              >
                <div className="aspect-[4/3] w-full bg-surface-container">
                  {m.thumbnail_url ? (
                    <img
                      src={m.thumbnail_url}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : null}
                </div>
                <div className="space-y-1 p-2">
                  <p className="line-clamp-2 text-xs text-on-surface">
                    {m.caption ?? '—'}
                  </p>
                  <p className="text-[10px] text-on-surface-variant">
                    {m.activity_type
                      ? t(`media.activity.${m.activity_type}`, { defaultValue: m.activity_type })
                      : ''}
                    {m.activity_type ? ' · ' : ''}
                    {formatTime(m.uploaded_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

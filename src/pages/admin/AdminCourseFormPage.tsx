import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { adminCoursesListQueryKey } from '@/hooks/useAdminCoursesList';
import { adminCourseDetailQueryKey } from '@/hooks/useAdminCourseDetail';
import { isValidIsoDate } from '@/lib/onboardingDateBounds';
import { supabase } from '@/lib/supabase';

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const CATEGORIES = ['sport', 'art', 'music', 'academic', 'language', 'other'] as const;
const STATUSES = ['active', 'paused', 'completed', 'cancelled'] as const;

const courseSchema = z
  .object({
    title_en: z.string().min(1, 'Required'),
    title_ar: z.string().min(1, 'Required'),
    description_en: z.string().optional(),
    description_ar: z.string().optional(),
    category: z.enum(CATEGORIES),
    price_per_month: z.coerce.number().min(0),
    max_students: z.coerce.number().min(1).optional().or(z.literal('')),
    schedule_days: z.array(z.string()).optional(),
    schedule_time_start: z.string().optional(),
    schedule_time_end: z.string().optional(),
    starts_on: z.string().optional(),
    ends_on: z.string().optional(),
    status: z.enum(STATUSES),
    teacher_user_id: z.string().optional().or(z.literal('')),
  })
  .superRefine((values, ctx) => {
    const startsOn = values.starts_on?.trim() ?? '';
    const endsOn = values.ends_on?.trim() ?? '';

    if (startsOn && !isValidIsoDate(startsOn)) {
      ctx.addIssue({ code: 'custom', path: ['starts_on'], message: 'admin.courses.form.invalidDate' });
    }
    if (endsOn && !isValidIsoDate(endsOn)) {
      ctx.addIssue({ code: 'custom', path: ['ends_on'], message: 'admin.courses.form.invalidDate' });
    }
    if (startsOn && endsOn && isValidIsoDate(startsOn) && isValidIsoDate(endsOn) && endsOn < startsOn) {
      ctx.addIssue({ code: 'custom', path: ['ends_on'], message: 'admin.courses.form.endBeforeStart' });
    }
  });

type FormValues = z.infer<typeof courseSchema>;

export function AdminCourseCreatePage() {
  return <AdminCourseFormPage mode="create" />;
}

export function AdminCourseEditPage() {
  return <AdminCourseFormPage mode="edit" />;
}

function AdminCourseFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { courseId } = useParams<{ courseId: string }>();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const nurseryId = profile?.nursery_id;
  const { data: langPref = 'both' } = useNurseryLanguagePref(nurseryId);
  const queryClient = useQueryClient();
  const showAr = langPref === 'both' || langPref === 'ar';
  const showEn = langPref === 'both' || langPref === 'en';

  const form = useForm<FormValues>({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      title_en: '',
      title_ar: '',
      description_en: '',
      description_ar: '',
      category: 'academic',
      price_per_month: 0,
      max_students: '',
      schedule_days: [],
      schedule_time_start: '',
      schedule_time_end: '',
      starts_on: '',
      ends_on: '',
      status: 'active',
      teacher_user_id: '',
    },
  });

  const { data: existingCourse, isPending: loadingCourse } = useQuery({
    queryKey: adminCourseDetailQueryKey(courseId),
    queryFn: async () => {
      if (!courseId) return null;
      const { data, error } = await supabase.from('courses').select('*').eq('id', courseId).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: mode === 'edit' && Boolean(courseId),
  });

  useEffect(() => {
    if (existingCourse) {
      form.reset({
        title_en: existingCourse.title_en ?? '',
        title_ar: existingCourse.title_ar ?? '',
        description_en: existingCourse.description_en ?? '',
        description_ar: existingCourse.description_ar ?? '',
        category: existingCourse.category ?? 'academic',
        price_per_month: existingCourse.price_per_month ?? 0,
        max_students: existingCourse.max_students ?? '',
        schedule_days: existingCourse.schedule_days ?? [],
        schedule_time_start: existingCourse.schedule_time_start ?? '',
        schedule_time_end: existingCourse.schedule_time_end ?? '',
        starts_on: existingCourse.starts_on ?? '',
        ends_on: existingCourse.ends_on ?? '',
        status: existingCourse.status ?? 'active',
        teacher_user_id: existingCourse.teacher_user_id ?? '',
      });
    }
  }, [existingCourse, form]);

  const { data: teachers = [] } = useQuery({
    queryKey: ['nursery-teachers', nurseryId],
    queryFn: async () => {
      if (!nurseryId) return [];
      const { data, error } = await supabase
        .from('users')
        .select('id, name_en, name_ar')
        .eq('nursery_id', nurseryId)
        .eq('role', 'teacher')
        .order('name_en');
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(nurseryId),
  });

  const [saving, setSaving] = useState(false);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!nurseryId) return;
    setSaving(true);
    try {
      const payload = {
        nursery_id: nurseryId,
        title_en: values.title_en.trim(),
        title_ar: values.title_ar.trim(),
        description_en: values.description_en?.trim() || null,
        description_ar: values.description_ar?.trim() || null,
        category: values.category,
        price_per_month: values.price_per_month,
        max_students: values.max_students ? Number(values.max_students) : null,
        schedule_days: values.schedule_days?.length ? values.schedule_days : null,
        schedule_time_start: values.schedule_time_start?.trim() || null,
        schedule_time_end: values.schedule_time_end?.trim() || null,
        starts_on: values.starts_on?.trim() || null,
        ends_on: values.ends_on?.trim() || null,
        status: values.status,
        teacher_user_id: values.teacher_user_id?.trim() || null,
      };

      if (mode === 'create') {
        const { error } = await supabase.from('courses').insert(payload as never);
        if (error) throw error;
        toast.success(t('admin.courses.form.createSuccess'));
      } else {
        const { error } = await supabase.from('courses').update(payload as never).eq('id', courseId!);
        if (error) throw error;
        toast.success(t('admin.courses.form.saveSuccess'));
        queryClient.removeQueries({ queryKey: adminCourseDetailQueryKey(courseId) });
      }
      queryClient.removeQueries({ queryKey: adminCoursesListQueryKey(nurseryId) });
      navigate('/admin/courses');
    } catch {
      toast.error(t('admin.courses.form.saveError'));
    } finally {
      setSaving(false);
    }
  });

  if (mode === 'edit' && loadingCourse) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 pb-8">
        <LoadingSkeleton />
      </div>
    );
  }

  const scheduleDays = form.watch('schedule_days') ?? [];

  const toggleDay = (day: string) => {
    const current = form.getValues('schedule_days') ?? [];
    form.setValue(
      'schedule_days',
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day],
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-on-surface">
          {mode === 'create' ? t('admin.courses.form.createTitle') : t('admin.courses.form.editTitle')}
        </h1>
        <Button asChild variant="outline">
          <Link to={mode === 'edit' ? `/admin/courses/${courseId}` : '/admin/courses'}>
            {t('admin.courses.form.back')}
          </Link>
        </Button>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5"
      >
        {/* Titles */}
        <div className="grid gap-4 sm:grid-cols-2">
          {showEn ? (
            <div className="space-y-1.5">
              <Label htmlFor="title_en">{t('admin.courses.form.titleEn')}</Label>
              <Input id="title_en" {...form.register('title_en')} />
              {form.formState.errors.title_en ? (
                <p className="text-xs text-error">{form.formState.errors.title_en.message}</p>
              ) : null}
            </div>
          ) : null}
          {showAr ? (
            <div className="space-y-1.5">
              <Label htmlFor="title_ar">{t('admin.courses.form.titleAr')}</Label>
              <Input id="title_ar" dir="rtl" {...form.register('title_ar')} />
              {form.formState.errors.title_ar ? (
                <p className="text-xs text-error">{form.formState.errors.title_ar.message}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Descriptions */}
        <div className="grid gap-4 sm:grid-cols-2">
          {showEn ? (
            <div className="space-y-1.5">
              <Label htmlFor="description_en">{t('admin.courses.form.descriptionEn')}</Label>
              <textarea
                id="description_en"
                rows={3}
                className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
                {...form.register('description_en')}
              />
            </div>
          ) : null}
          {showAr ? (
            <div className="space-y-1.5">
              <Label htmlFor="description_ar">{t('admin.courses.form.descriptionAr')}</Label>
              <textarea
                id="description_ar"
                dir="rtl"
                rows={3}
                className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
                {...form.register('description_ar')}
              />
            </div>
          ) : null}
        </div>

        {/* Category + Status */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="category">{t('admin.courses.form.category')}</Label>
            <select
              id="category"
              className="h-11 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface"
              {...form.register('category')}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{t(`admin.courses.categories.${c}`)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="status">{t('admin.courses.form.status')}</Label>
            <select
              id="status"
              className="h-11 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface"
              {...form.register('status')}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{t(`admin.courses.status.${s}`)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Teacher */}
        <div className="space-y-1.5">
          <Label htmlFor="teacher_user_id">{t('admin.courses.form.teacher')}</Label>
          <select
            id="teacher_user_id"
            className="h-11 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface"
            {...form.register('teacher_user_id')}
          >
            <option value="">{t('admin.courses.form.noTeacher')}</option>
            {teachers.map((u) => (
              <option key={u.id} value={u.id}>{u.name_en || u.name_ar}</option>
            ))}
          </select>
        </div>

        {/* Price + Max Students */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="price_per_month">{t('admin.courses.form.pricePerMonth')}</Label>
            <Input
              id="price_per_month"
              type="number"
              min={0}
              step={0.01}
              {...form.register('price_per_month')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="max_students">{t('admin.courses.form.maxStudents')}</Label>
            <Input
              id="max_students"
              type="number"
              min={1}
              placeholder={t('admin.courses.form.maxStudentsPlaceholder')}
              {...form.register('max_students')}
            />
          </div>
        </div>

        {/* Schedule days */}
        <div className="space-y-2">
          <Label>{t('admin.courses.form.scheduleDays')}</Label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((day) => (
              <button
                key={day}
                type="button"
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  scheduleDays.includes(day)
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
                onClick={() => toggleDay(day)}
              >
                {t(`admin.courses.days.${day}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Time */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="schedule_time_start">{t('admin.courses.form.timeStart')}</Label>
            <Input id="schedule_time_start" type="time" {...form.register('schedule_time_start')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="schedule_time_end">{t('admin.courses.form.timeEnd')}</Label>
            <Input id="schedule_time_end" type="time" {...form.register('schedule_time_end')} />
          </div>
        </div>

        {/* Dates */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="starts_on">{t('admin.courses.form.startsOn')}</Label>
            <Input id="starts_on" type="date" {...form.register('starts_on')} />
            {form.formState.errors.starts_on ? (
              <p className="text-xs text-error">{t(String(form.formState.errors.starts_on.message))}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ends_on">{t('admin.courses.form.endsOn')}</Label>
            <Input id="ends_on" type="date" {...form.register('ends_on')} />
            {form.formState.errors.ends_on ? (
              <p className="text-xs text-error">{t(String(form.formState.errors.ends_on.message))}</p>
            ) : null}
            <p className="text-xs text-on-surface-variant">{t('admin.courses.form.endsOnHint')}</p>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-outline-variant pt-4">
          <Button type="button" variant="outline" onClick={() => navigate('/admin/courses')}>
            {t('admin.courses.form.cancel')}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? t('common.saving') : mode === 'create' ? t('admin.courses.form.create') : t('admin.courses.form.save')}
          </Button>
        </div>
      </form>
    </div>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { AdminEventEditFormLayout } from '@/components/admin/AdminEventEditFormLayout';
import type { EventClassRow } from '@/components/admin/EventFormFields';
import { Button } from '@/components/ui/button';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryChildrenPicker } from '@/hooks/useNurseryChildrenPicker';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useUserProfile } from '@/hooks/useUserProfile';
import { createPermissionsForEventScope, fetchPermissionChildIdsForEvent, syncIndividualEventPermissions } from '@/lib/eventPermissionOps';
import { notifyParentsEventPublished } from '@/lib/eventPublishNotifications';
import { issueEventQrCodes } from '@/lib/eventQrOps';
import { invalidateAllEventQueries } from '@/lib/eventCache';
import { supabase } from '@/lib/supabase';
import {
  eventEditFormSchema,
  eventRowToEditFormValues,
  mapDbStatusToEditForm,
  toIso,
  type EventEditFormValues,
  type EventRowForEdit,
} from '@/pages/admin/eventFormSchema';

const adminEventEditQueryKey = (eventId: string | undefined, nurseryId: string | undefined | null) =>
  ['admin-event-edit', eventId, nurseryId] as const;

export function AdminEventEditPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { eventId } = useParams<{ eventId: string }>();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuthSession();
  const profileQuery = useUserProfile(user?.id);
  const nurseryId = profileQuery.data?.nursery_id;
  const { data: languagePref = 'both' } = useNurseryLanguagePref(nurseryId);
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';

  const form = useForm({
    resolver: zodResolver(eventEditFormSchema),
    defaultValues: {
      titleAr: '',
      titleEn: '',
      descriptionAr: '',
      descriptionEn: '',
      startsAt: '',
      location: '',
      category: 'activity' as EventEditFormValues['category'],
      targetScope: 'all' as EventEditFormValues['targetScope'],
      targetClassId: '',
      isUrgent: false,
      urgentDaysOfWeek: [] as number[],
      urgentHoursOfDay: [] as number[],
      urgentRepeatsWeekly: false,
      isPaid: false,
      price: undefined as number | undefined,
      permissionDeadline: '',
      targetChildIds: [] as string[],
      eventStatus: 'draft' as EventEditFormValues['eventStatus'],
    },
  });

  const eventQuery = useQuery({
    queryKey: adminEventEditQueryKey(eventId, nurseryId),
    queryFn: async (): Promise<EventRowForEdit | null> => {
      if (!eventId || !nurseryId) return null;
      const { data, error } = await supabase
        .from('events')
        .select(
          'title_ar, title_en, description_ar, description_en, starts_at, location, category, is_urgent, urgent_days_of_week, urgent_hours_of_day, urgent_repeats_weekly, is_paid, price, target_scope, target_class_id, status, permission_deadline, cancelled_at, nursery_id',
        )
        .eq('id', eventId)
        .maybeSingle();
      if (error) throw error;
      const row = data as EventRowForEdit | null;
      if (!row || row.nursery_id !== nurseryId) return null;
      return row;
    },
    enabled: Boolean(eventId && nurseryId),
  });

  useEffect(() => {
    const row = eventQuery.data;
    if (!row) return;
    form.reset(eventRowToEditFormValues(row));
  }, [eventQuery.data, form]);

  const permChildrenQuery = useQuery({
    queryKey: ['admin-event-permission-children', eventId],
    queryFn: () => fetchPermissionChildIdsForEvent(eventId!),
    enabled: Boolean(eventId && eventQuery.data?.target_scope === 'individual'),
  });

  useEffect(() => {
    if (eventQuery.data?.target_scope !== 'individual') return;
    const rows = permChildrenQuery.data;
    if (!rows?.length) return;
    form.setValue(
      'targetChildIds',
      [...new Set(rows.map((r) => r.child_id))],
      { shouldValidate: false },
    );
  }, [eventQuery.data?.target_scope, permChildrenQuery.data, form]);

  const classesQuery = useQuery({
    queryKey: ['events-create-classes', nurseryId],
    queryFn: async (): Promise<EventClassRow[]> => {
      if (!nurseryId) return [];
      const { data, error } = await supabase
        .from('classes')
        .select('id, name_ar, name_en')
        .eq('nursery_id', nurseryId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as EventClassRow[];
    },
    enabled: Boolean(nurseryId),
  });

  const childrenPickerQuery = useNurseryChildrenPicker(nurseryId);

  const classes = classesQuery.data ?? [];
  const nurseryChildren = childrenPickerQuery.data ?? [];
  const showAr = languagePref === 'ar' || languagePref === 'both';
  const showEn = languagePref === 'en' || languagePref === 'both';

  const headerTitle =
    (i18n.language.startsWith('ar')
      ? eventQuery.data?.title_ar || eventQuery.data?.title_en
      : eventQuery.data?.title_en || eventQuery.data?.title_ar) ?? '';

  const onSubmit = form.handleSubmit(async (values) => {
    const parsed: EventEditFormValues = eventEditFormSchema.parse(values);
    if (!eventId || !nurseryId || !eventQuery.data) {
      toast.error(t('admin.events.edit.error'));
      return;
    }
    if (
      parsed.targetScope === 'individual' &&
      parsed.eventStatus === 'active' &&
      !parsed.targetChildIds.length
    ) {
      toast.error(t('admin.events.errors.individualChildrenRequired'));
      return;
    }
    try {
      const titleAr = parsed.titleAr?.trim() || parsed.titleEn?.trim() || '';
      const titleEn = parsed.titleEn?.trim() || parsed.titleAr?.trim() || '';
      const deadlineRaw = parsed.permissionDeadline?.trim();
      const cancelledAt =
        parsed.eventStatus === 'cancelled'
          ? (eventQuery.data.cancelled_at ?? new Date().toISOString())
          : null;

      const prevListed = mapDbStatusToEditForm(eventQuery.data);
      const becameActive = parsed.eventStatus === 'active' && prevListed !== 'active';
      const deadline = deadlineRaw ? toIso(deadlineRaw) : null;

      if (parsed.targetScope === 'individual') {
        await syncIndividualEventPermissions(eventId, parsed.targetChildIds, deadline);
      } else if (parsed.eventStatus === 'active') {
        // For all/class scopes: ensure permissions exist whenever the event is active.
        // ensureEventPermissionsForChildren inside createPermissionsForEventScope is idempotent.
        await createPermissionsForEventScope(eventId, parsed.targetScope, {
          nurseryId,
          classId: parsed.targetScope === 'class' ? (parsed.targetClassId?.trim() || null) : null,
          deadline,
        });
      }

      const payload = {
        title_ar: titleAr,
        title_en: titleEn,
        description_ar: parsed.descriptionAr?.trim() || null,
        description_en: parsed.descriptionEn?.trim() || null,
        starts_at: toIso(parsed.startsAt),
        location: parsed.location?.trim() || null,
        category: parsed.category,
        is_urgent: parsed.isUrgent,
        urgent_days_of_week: parsed.isUrgent ? parsed.urgentDaysOfWeek : [],
        urgent_hours_of_day: parsed.isUrgent ? parsed.urgentHoursOfDay : [],
        urgent_repeats_weekly: parsed.isUrgent ? parsed.urgentRepeatsWeekly : false,
        is_paid: parsed.isPaid,
        price: parsed.isPaid && parsed.price !== undefined && !Number.isNaN(parsed.price) ? String(parsed.price) : null,
        target_scope: parsed.targetScope,
        target_class_id: parsed.targetScope === 'class' && parsed.targetClassId?.trim() ? parsed.targetClassId.trim() : null,
        permission_deadline: deadlineRaw ? toIso(deadlineRaw) : null,
        status: parsed.eventStatus,
        cancelled_at: cancelledAt,
      };

      const { error } = await supabase.from('events').update(payload as never).eq('id', eventId).eq('nursery_id', nurseryId);
      if (error) throw error;

      if (becameActive) {
        try {
          await notifyParentsEventPublished({
            eventId,
            nurseryId,
            titleAr,
            titleEn,
          });
        } catch {
          /* non-blocking */
        }
        try {
          // Mint a per-child check-in QR for every targeted child.
          await issueEventQrCodes(eventId);
        } catch {
          /* non-blocking */
        }
      }

      // Refresh every event cache so popup / list, view, and edit stay in sync.
      await invalidateAllEventQueries(queryClient);

      toast.success(t('admin.events.edit.success'));
      navigate(`/admin/events${qs}`);
    } catch (err) {
      console.error(err);
      const e = err as { message?: string; details?: string; hint?: string } | null;
      const detail =
        err instanceof Error ? err.message : e?.message || e?.details || e?.hint || JSON.stringify(err);
      toast.error(`${t('admin.events.edit.error')}: ${detail}`);
    }
  });

  const noNursery = Boolean(user) && !profileQuery.isPending && !nurseryId;
  const showLoading =
    Boolean(user) && (profileQuery.isPending || (Boolean(nurseryId) && eventQuery.isPending));
  const missingEvent =
    Boolean(eventId) && Boolean(nurseryId) && eventQuery.isSuccess && eventQuery.data === null;

  if (showLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-1 pb-8">
        <LoadingSkeleton />
      </div>
    );
  }

  if (noNursery) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-1 pb-8">
        <h1 className="text-lg font-semibold text-on-surface">{t('admin.events.list.noNurseryTitle')}</h1>
        <p className="text-sm text-on-surface-variant" role="alert">
          {t('admin.events.list.noNurseryDescription')}
        </p>
        <Button asChild variant="outline">
          <Link to={`/admin/events${qs}`}>{t('admin.events.edit.backToList')}</Link>
        </Button>
      </div>
    );
  }

  if (!eventId || missingEvent) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-1 pb-8">
        <p className="text-sm text-error" role="alert">
          {t('admin.events.edit.notFound')}
        </p>
        <Button asChild variant="outline">
          <Link to={`/admin/events${qs}`}>{t('admin.events.edit.backToList')}</Link>
        </Button>
      </div>
    );
  }

  if (eventQuery.isError) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-1 pb-8">
        <p className="text-sm text-error" role="alert">
          {t('admin.events.edit.loadError')}
        </p>
        <Button asChild variant="outline">
          <Link to={`/admin/events${qs}`}>{t('admin.events.edit.backToList')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <AdminEventEditFormLayout
      qs={qs}
      headerTitle={headerTitle}
      form={form as unknown as UseFormReturn<FieldValues>}
      showAr={showAr}
      showEn={showEn}
      classes={classes}
      classesLoading={classesQuery.isPending}
      nurseryChildren={nurseryChildren}
      childrenLoading={childrenPickerQuery.isPending}
      onSubmit={onSubmit}
      isSubmitting={form.formState.isSubmitting}
    />
  );
}

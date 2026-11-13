import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { eventFlowErrorKey, publishEvent, syncEventChildren, type SyncResult } from '@/features/events/eventFlowApi';
import { askedChildIds } from '@/features/events/eventAdminApi';
import {
  eventEditFormSchema,
  eventRowPayload,
  eventRowToEditFormValues,
  mapDbStatusToEditForm,
  type EventEditFormValues,
  type EventRowForEdit,
} from '@/features/events/eventFormSchema';
import { EventFormFields } from '@/features/events/EventFormFields';
import { EventFormLayout } from '@/features/events/EventFormLayout';
import { EventPreviewCard } from '@/features/events/EventPreviewCard';
import { editStageOptions } from '@/features/events/events';
import { useEventFormData } from '@/features/events/useEventFormData';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useUserProfile } from '@/hooks/useUserProfile';
import { localName } from '@/lib/bilingualName';
import { invalidateAllEventQueries } from '@/lib/eventCache';
import { issueEventQrCodes } from '@/lib/eventQrOps';
import { supabase } from '@/lib/supabase';

const EVENT_EDIT_COLUMNS =
  'title_ar, title_en, description_ar, description_en, starts_at, ends_at, location, category, is_urgent, urgent_days_of_week, urgent_hours_of_day, urgent_repeats_weekly, is_paid, price, target_scope, target_class_id, status, permission_deadline, cancelled_at, nursery_id';

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
  const { classes, classesLoading, children, childrenLoading } = useEventFormData(nurseryId);
  const [problem, setProblem] = useState<string | null>(null);
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';
  const listPath = `/admin/events${qs}`;

  const form = useForm({
    resolver: zodResolver(eventEditFormSchema),
    defaultValues: {
      titleAr: '',
      titleEn: '',
      descriptionAr: '',
      descriptionEn: '',
      startsAt: '',
      endsAt: '',
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
    queryKey: ['admin-event-edit', eventId, nurseryId] as const,
    queryFn: async (): Promise<EventRowForEdit | null> => {
      if (!eventId || !nurseryId) return null;
      const { data, error } = await supabase.from('events').select(EVENT_EDIT_COLUMNS).eq('id', eventId).maybeSingle();
      if (error) throw error;
      const row = data as EventRowForEdit | null;
      return row && row.nursery_id === nurseryId ? row : null;
    },
    enabled: Boolean(eventId && nurseryId),
  });
  const row = eventQuery.data;

  useEffect(() => {
    if (row) form.reset(eventRowToEditFormValues(row));
  }, [row, form]);

  // The children already asked, for an event sent to chosen children.
  const permChildrenQuery = useQuery({
    queryKey: ['admin-event-permission-children', eventId],
    queryFn: () => askedChildIds(eventId!),
    enabled: Boolean(eventId && row?.target_scope === 'individual'),
  });
  useEffect(() => {
    if (row?.target_scope !== 'individual' || !permChildrenQuery.data?.length) return;
    form.setValue('targetChildIds', permChildrenQuery.data, { shouldValidate: false });
  }, [row?.target_scope, permChildrenQuery.data, form]);

  const stage = row ? mapDbStatusToEditForm(row) : 'draft';
  const locked = stage === 'cancelled' || stage === 'completed';

  const save = async (values: EventEditFormValues) => {
    setProblem(null);
    if (!eventId || !nurseryId || !row || locked) return;
    const publishing = stage === 'draft' && values.eventStatus === 'active';
    const payload = eventRowPayload(values);
    // An open event moved (day, time or place): the server tells the families asked.
    const moved =
      stage === 'active' &&
      (payload.starts_at !== new Date(row.starts_at).toISOString() ||
        payload.ends_at !== (row.ends_at ? new Date(row.ends_at).toISOString() : null) ||
        (payload.location ?? '') !== (row.location ?? '').trim());
    let changes: SyncResult | null = null;
    try {
      // The row first: the scope, the class and the deadline are what the server reads next.
      // Publishing is the server's step too, so the row keeps its stage here; marking an open
      // event done is a plain change.
      const { error } = await supabase
        .from('events')
        .update({ ...payload, status: publishing ? stage : values.eventStatus } as never)
        .eq('id', eventId)
        .eq('nursery_id', nurseryId);
      if (error) throw error;
      // Who is asked, set by the server (a request no longer needed is withdrawn, never removed).
      if (values.eventStatus !== 'completed' && new Date(payload.starts_at) > new Date()) {
        changes = await syncEventChildren(eventId, values.targetScope === 'individual' ? values.targetChildIds : null);
      }
    } catch (error) {
      console.error('Edit event failed', error);
      setProblem(t(eventFlowErrorKey(error)));
      return;
    }

    if (publishing) {
      try {
        const opened = await publishEvent(eventId);
        await issueEventQrCodes(eventId).catch(() => undefined);
        toast.success(t('admin.events.create.publishSuccess'), { description: t('eventFlow.publish.done', { count: opened.notified }) });
      } catch (error) {
        toast.error(t('eventFlow.publish.savedAsDraft'), { description: t(eventFlowErrorKey(error)) });
      }
    } else {
      const notes = [
        moved ? t('eventFlow.edit.movedTold') : null,
        stage === 'active' && changes?.asked ? t('eventFlow.sync.asked', { count: changes.asked }) : null,
        stage === 'active' && changes?.withdrawn ? t('eventFlow.sync.withdrawn', { count: changes.withdrawn }) : null,
      ].filter(Boolean);
      toast.success(t('admin.events.edit.success'), notes.length ? { description: notes.join(' ') } : undefined);
      // Children added to an open event get their check-in QR too.
      if (stage === 'active' && changes?.asked) await issueEventQrCodes(eventId).catch(() => undefined);
    }
    await invalidateAllEventQueries(queryClient);
    navigate(listPath);
  };

  const onSave = form.handleSubmit((values) => save(values as EventEditFormValues), () => setProblem(null));
  const formAny = form as unknown as UseFormReturn<FieldValues>;

  const noNursery = Boolean(user) && !profileQuery.isPending && !nurseryId;
  const loading = Boolean(user) && (profileQuery.isPending || (Boolean(nurseryId) && eventQuery.isPending));
  const missing = !eventId || (Boolean(nurseryId) && eventQuery.isSuccess && row === null);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 pb-8">
        <LoadingSkeleton />
      </div>
    );
  }
  if (noNursery || missing || eventQuery.isError) {
    const message = noNursery
      ? t('admin.events.list.noNurseryDescription')
      : eventQuery.isError
        ? t('admin.events.edit.loadError')
        : t('admin.events.edit.notFound');
    return (
      <div className="mx-auto max-w-3xl space-y-4 pb-8">
        <p className="text-sm text-error" role="alert">{message}</p>
        <Button asChild variant="outline">
          <Link to={listPath}>{t('admin.events.edit.backToList')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <EventFormLayout
      icon="edit_calendar"
      title={t('admin.events.edit.title')}
      description={localName(row?.title_ar, row?.title_en, i18n.language.startsWith('ar')) || '—'}
      backTo={listPath}
      problem={problem ?? (Object.keys(form.formState.errors).length ? t('eventForm.fixErrors') : null)}
      preview={<EventPreviewCard form={formAny} classes={classes} />}
      actions={
        <>
          {locked ? (
            <p className="flex items-start gap-2 rounded-lg bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant">
              <MaterialSymbol name="lock" size="text-base" />
              {stage === 'cancelled' ? t('eventForm.lockedCancelled') : t('eventForm.lockedCompleted')}
            </p>
          ) : null}
          <Button type="button" disabled={locked || form.formState.isSubmitting} onClick={() => void onSave()} data-testid="event-save">
            <MaterialSymbol name="save" size="text-base" />
            {t('admin.events.edit.save')}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(listPath)}>
            {t('admin.events.edit.cancel')}
          </Button>
          {stage === 'draft' ? <p className="text-center text-xs text-on-surface-variant">{t('eventForm.publishFromStageHint')}</p> : null}
        </>
      }
    >
      <EventFormFields
        form={formAny}
        showAr={languagePref === 'ar' || languagePref === 'both'}
        showEn={languagePref === 'en' || languagePref === 'both'}
        stageOptions={editStageOptions(stage)}
        classes={classes}
        classesLoading={classesLoading}
        nurseryChildren={children}
        childrenLoading={childrenLoading}
      />
    </EventFormLayout>
  );
}

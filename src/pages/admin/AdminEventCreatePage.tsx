import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { eventFlowErrorKey, publishEvent, syncEventChildren } from '@/features/events/eventFlowApi';
import { eventFormSchema, eventRowPayload, toLocalInput, type EventFormValues } from '@/features/events/eventFormSchema';
import { EventFormFields } from '@/features/events/EventFormFields';
import { EventFormLayout } from '@/features/events/EventFormLayout';
import { EventPreviewCard } from '@/features/events/EventPreviewCard';
import { useEventFormData } from '@/features/events/useEventFormData';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { adminEventsListQueryKey } from '@/hooks/useAdminEventsList';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { issueEventQrCodes } from '@/lib/eventQrOps';
import { supabase } from '@/lib/supabase';

const DAY_MS = 24 * 60 * 60 * 1000;

export function AdminEventCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { activeNurseryId: nurseryId, isLoading: activeNurseryLoading } = useActiveNurseryId();
  const { data: languagePref = 'both' } = useNurseryLanguagePref(nurseryId);
  const { classes, classesLoading, children, childrenLoading } = useEventFormData(nurseryId);
  const [problem, setProblem] = useState<string | null>(null);
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';

  const [startDefault] = useState(() => new Date(Date.now() + 60 * 60 * 1000));
  const form = useForm({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      titleAr: '',
      titleEn: '',
      descriptionAr: '',
      descriptionEn: '',
      startsAt: toLocalInput(startDefault),
      endsAt: '',
      location: '',
      category: 'activity' as EventFormValues['category'],
      targetScope: 'all' as EventFormValues['targetScope'],
      targetClassId: '',
      isUrgent: false,
      urgentDaysOfWeek: [] as number[],
      urgentHoursOfDay: [] as number[],
      urgentRepeatsWeekly: false,
      isPaid: false,
      price: undefined as number | undefined,
      permissionDeadline: toLocalInput(new Date(startDefault.getTime() - DAY_MS)),
      targetChildIds: [] as string[],
    },
  });

  const { watch, setValue } = form;
  const startsAt = watch('startsAt');

  // The replies close a day before the event unless the admin picks another time.
  useEffect(() => {
    const startMs = new Date(startsAt).getTime();
    if (!startsAt || Number.isNaN(startMs)) return;
    setValue('permissionDeadline', toLocalInput(new Date(startMs - DAY_MS)), { shouldValidate: false });
  }, [startsAt, setValue]);

  // The assistant can open this page with a title and a date filled in.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('xo_ai_prefill');
      if (!raw) return;
      const data = JSON.parse(raw) as Record<string, unknown>;
      if (data.type !== 'event') return;
      sessionStorage.removeItem('xo_ai_prefill');
      if (typeof data.title_en === 'string' && data.title_en) form.setValue('titleEn', data.title_en);
      if (typeof data.title_ar === 'string' && data.title_ar) form.setValue('titleAr', data.title_ar);
      if (typeof data.starts_at === 'string' && data.starts_at) {
        const d = new Date(data.starts_at);
        if (!Number.isNaN(d.getTime())) form.setValue('startsAt', toLocalInput(d));
      }
    } catch {
      /* a broken prefill is ignored */
    }
  }, [form]);

  const save = async (values: EventFormValues, publish: boolean) => {
    setProblem(null);
    if (!nurseryId) {
      setProblem(t('admin.events.createError'));
      return;
    }
    let newId: string;
    try {
      // Saved as a draft first; publishing is the server's step (event_publish).
      const { data, error } = await supabase
        .from('events')
        .insert({ ...eventRowPayload(values), nursery_id: nurseryId, status: 'draft' } as never)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      const id = (data as { id: string } | null)?.id;
      if (!id) throw new Error('no_event_id');
      newId = id;
      // Chosen children are asked from the draft; the whole nursery or a class when it opens.
      if (values.targetScope === 'individual' && values.targetChildIds.length > 0) {
        await syncEventChildren(newId, values.targetChildIds);
      }
    } catch (error) {
      console.error('Create event failed', error);
      setProblem(t(eventFlowErrorKey(error)));
      return;
    }

    if (publish) {
      try {
        const opened = await publishEvent(newId);
        // A check-in QR for every child asked (the permission rows exist now); the details page can issue them again.
        await issueEventQrCodes(newId).catch(() => undefined);
        toast.success(t('admin.events.create.publishSuccess'), { description: t('eventFlow.publish.done', { count: opened.notified }) });
      } catch (error) {
        // The draft is kept: publishing it again from the list does not make a copy.
        toast.error(t('eventFlow.publish.savedAsDraft'), { description: t(eventFlowErrorKey(error)) });
      }
    } else {
      toast.success(t('admin.events.createSuccess'));
    }
    queryClient.removeQueries({ queryKey: adminEventsListQueryKey(nurseryId) });
    navigate(`/admin/events${qs}${qs ? '&' : '?'}month=${values.startsAt.slice(0, 7)}`);
  };

  const onSaveDraft = form.handleSubmit((values) => save(values as EventFormValues, false), () => setProblem(null));
  const onPublish = form.handleSubmit((values) => save(values as EventFormValues, true), () => setProblem(null));
  const busy = form.formState.isSubmitting;
  const formAny = form as unknown as UseFormReturn<FieldValues>;

  return (
    <EventFormLayout
      icon="add_circle"
      title={t('admin.events.createTitle')}
      description={t('eventForm.createDescription')}
      backTo={`/admin/events${qs}`}
      problem={problem ?? (Object.keys(form.formState.errors).length ? t('eventForm.fixErrors') : null)}
      preview={<EventPreviewCard form={formAny} classes={classes} />}
      actions={
        <>
          <Button type="button" disabled={busy} onClick={() => void onPublish()} data-testid="event-publish">
            <MaterialSymbol name="send" size="text-base" className="rtl:rotate-180" />
            {t('admin.events.create.publish')}
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void onSaveDraft()} data-testid="event-save-draft">
            <MaterialSymbol name="draft" size="text-base" />
            {t('admin.events.create.saveDraft')}
          </Button>
          <p className="text-center text-xs text-on-surface-variant">{t('eventForm.publishHint')}</p>
        </>
      }
    >
      <EventFormFields
        form={formAny}
        showAr={languagePref === 'ar' || languagePref === 'both'}
        showEn={languagePref === 'en' || languagePref === 'both'}
        classes={classes}
        classesLoading={activeNurseryLoading || classesLoading}
        nurseryChildren={children}
        childrenLoading={activeNurseryLoading || childrenLoading}
      />
    </EventFormLayout>
  );
}

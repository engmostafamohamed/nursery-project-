import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { EventFormFields, type EventClassRow } from '@/components/admin/EventFormFields';
import { Button } from '@/components/ui/button';
import { useActiveNurseryId } from '@/hooks/useActiveNurseryId';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useNurseryChildrenPicker } from '@/hooks/useNurseryChildrenPicker';
import { useNurseryLanguagePref } from '@/hooks/useNurseryLanguagePref';
import { useUserProfile } from '@/hooks/useUserProfile';
import { adminEventsListQueryKey } from '@/hooks/useAdminEventsList';
import { createPermissionsForEventScope } from '@/lib/eventPermissionOps';
import { notifyParentsEventPublished } from '@/lib/eventPublishNotifications';
import { issueEventQrCodes } from '@/lib/eventQrOps';
import { supabase } from '@/lib/supabase';
import {
  eventFormSchema,
  eventPublishFormSchema,
  toIso,
  toLocalInput,
  type EventFormValues,
} from '@/pages/admin/eventFormSchema';

export function AdminEventCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const { activeNurseryId: nurseryId, isLoading: activeNurseryLoading } = useActiveNurseryId();
  const { data: languagePref = 'both' } = useNurseryLanguagePref(nurseryId);
  const isPreview = import.meta.env.DEV && searchParams.get('preview') === 'true';
  const qs = isPreview ? '?preview=true' : '';

  const now = new Date();
  const startDefault = new Date(now.getTime() + 60 * 60 * 1000);
  const deadlineDefault = new Date(startDefault.getTime() - 24 * 60 * 60 * 1000);

  const form = useForm({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      titleAr: '',
      titleEn: '',
      descriptionAr: '',
      descriptionEn: '',
      startsAt: toLocalInput(startDefault),
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
      permissionDeadline: toLocalInput(deadlineDefault),
      targetChildIds: [] as string[],
    },
  });

  const { watch, setValue } = form;
  const startsAt = watch('startsAt');

  useEffect(() => {
    if (!startsAt) return;
    const startMs = new Date(startsAt).getTime();
    if (Number.isNaN(startMs)) return;
    const computed = toLocalInput(new Date(startMs - 24 * 60 * 60 * 1000));
    setValue('permissionDeadline', computed, { shouldValidate: false });
  }, [startsAt, setValue]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('xo_ai_prefill');
      if (!raw) return;
      const data = JSON.parse(raw) as Record<string, unknown>;
      if (data.type !== 'event') return;
      sessionStorage.removeItem('xo_ai_prefill');
      if (typeof data.title_en === 'string' && data.title_en) {
        form.setValue('titleEn', data.title_en);
      }
      if (typeof data.title_ar === 'string' && data.title_ar) {
        form.setValue('titleAr', data.title_ar);
      }
      if (typeof data.starts_at === 'string' && data.starts_at) {
        const d = new Date(data.starts_at);
        if (!Number.isNaN(d.getTime())) {
          form.setValue('startsAt', toLocalInput(d));
        }
      }
    } catch {
      /* ignore */
    }
  }, [form]);

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

  const persistEvent = async (publish: boolean) => {
    const raw = form.getValues();
    const schema = publish ? eventPublishFormSchema : eventFormSchema;
    const parsedResult = schema.safeParse(raw);
    if (!parsedResult.success) {
      const code = parsedResult.error.issues[0]?.message;
      toast.error(t(`admin.events.errors.${code}`, { defaultValue: t('admin.events.createError') }));
      return;
    }
    const parsed: EventFormValues = parsedResult.data;
    if (!nurseryId) {
      console.error('Create event failed: no active nursery selected', {
        profileNurseryId: profile?.nursery_id ?? null,
      });
      toast.error(t('admin.events.createError'));
      return;
    }
    try {
      const titleAr = parsed.titleAr?.trim() || parsed.titleEn?.trim() || '';
      const titleEn = parsed.titleEn?.trim() || parsed.titleAr?.trim() || '';
      const deadlineRaw = parsed.permissionDeadline?.trim();
      const status = publish ? 'active' : 'draft';
      const payload = {
        nursery_id: nurseryId,
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
        status,
      };

      const { data: inserted, error: eventError } = await supabase
        .from('events')
        .insert(payload as never)
        .select('id')
        .maybeSingle();
      if (eventError) throw eventError;
      const newId = (inserted as { id: string } | null)?.id;
      if (!newId) throw new Error('no_event_id');

      const deadline = deadlineRaw ? toIso(deadlineRaw) : null;

      if (publish) {
        // Create permission rows for all targeted children when publishing.
        await createPermissionsForEventScope(newId, parsed.targetScope, {
          nurseryId,
          classId: parsed.targetScope === 'class' ? (parsed.targetClassId?.trim() || null) : null,
          childIds: parsed.targetScope === 'individual' ? parsed.targetChildIds : [],
          deadline,
        });
      } else if (parsed.targetScope === 'individual' && parsed.targetChildIds.length > 0) {
        // Pre-save individual selections while drafting (permissions are hidden until active).
        await createPermissionsForEventScope(newId, 'individual', {
          childIds: parsed.targetChildIds,
          deadline,
        });
      }

      if (publish) {
        try {
          await notifyParentsEventPublished({
            eventId: newId,
            nurseryId,
            titleAr,
            titleEn,
          });
        } catch {
          /* non-blocking */
        }
        try {
          // Mint a per-child check-in QR for every targeted child.
          await issueEventQrCodes(newId);
        } catch {
          /* non-blocking */
        }
      }

      toast.success(publish ? t('admin.events.create.publishSuccess') : t('admin.events.createSuccess'));
      queryClient.removeQueries({ queryKey: adminEventsListQueryKey(nurseryId) });
      const eventMonth = parsed.startsAt.slice(0, 7);
      navigate(`/admin/events${qs}${qs ? '&' : '?'}month=${eventMonth}`);
    } catch (error) {
      console.error('Create event failed', error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`${t('admin.events.createError')} ${message}`);
    }
  };

  const onSaveDraft = form.handleSubmit(() => void persistEvent(false));
  const onPublish = form.handleSubmit(() => void persistEvent(true));

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-1 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-on-surface">{t('admin.events.createTitle')}</h1>
        <Button asChild variant="outline">
          <Link to={`/admin/events${qs}`}>{t('admin.events.back')}</Link>
        </Button>
      </div>

      <form
        className="space-y-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4"
        onSubmit={(e) => e.preventDefault()}
        noValidate
      >
        <EventFormFields
          form={form as unknown as UseFormReturn<FieldValues>}
          showAr={showAr}
          showEn={showEn}
          showStatusSelect={false}
          classes={classes}
          classesLoading={activeNurseryLoading || classesQuery.isPending}
          nurseryChildren={nurseryChildren}
          childrenLoading={activeNurseryLoading || childrenPickerQuery.isPending}
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={form.formState.isSubmitting}
            onClick={() => void onSaveDraft()}
          >
            {t('admin.events.create.saveDraft')}
          </Button>
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={form.formState.isSubmitting}
            onClick={() => void onPublish()}
          >
            {t('admin.events.create.publish')}
          </Button>
        </div>
      </form>
    </div>
  );
}

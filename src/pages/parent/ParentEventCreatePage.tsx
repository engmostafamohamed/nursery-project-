import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuthSession } from '@/hooks/useAuthSession';
import { parentEventsCatalogQueryKey } from '@/hooks/useParentEventsCatalog';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  formatUrgentHour,
  sortUniqueNumbers,
  URGENT_EVENT_DAY_KEYS,
  URGENT_EVENT_HOURS,
} from '@/lib/eventUrgentSchedule';
import { supabase } from '@/lib/supabase';
import { toLocalInput } from '@/pages/admin/eventFormSchema';

type ParentChildOption = {
  id: string;
  full_name_ar: string;
  full_name_en: string;
  nursery_id: string;
};

const CATEGORIES = ['activity', 'trip', 'service', 'doctor_visit'] as const;

export function ParentEventCreatePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthSession();
  const profileQuery = useUserProfile(user?.id);

  const startDefault = useMemo(() => new Date(Date.now() + 60 * 60 * 1000), []);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState(() => toLocalInput(startDefault));
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('activity');
  const [childIds, setChildIds] = useState<string[]>([]);
  const [urgentDays, setUrgentDays] = useState<number[]>([]);
  const [urgentHours, setUrgentHours] = useState<number[]>([]);
  const [urgentRepeatsWeekly, setUrgentRepeatsWeekly] = useState(true);

  const childrenQuery = useQuery({
    queryKey: ['parent-event-create-children', user?.id],
    queryFn: async (): Promise<ParentChildOption[]> => {
      if (!user?.id) return [];
      const linksRes = await supabase.from('parent_children').select('child_id').eq('parent_id', user.id);
      if (linksRes.error) throw linksRes.error;
      const ids = ((linksRes.data ?? []) as { child_id: string }[]).map((r) => r.child_id);
      if (!ids.length) return [];
      const childRes = await supabase
        .from('children')
        .select('id, full_name_ar, full_name_en, nursery_id')
        .in('id', ids)
        .eq('status', 'active')
        .order('full_name_en', { ascending: true });
      if (childRes.error) throw childRes.error;
      return (childRes.data ?? []) as ParentChildOption[];
    },
    enabled: Boolean(user?.id),
  });

  const children = childrenQuery.data ?? [];
  const nurseryId = profileQuery.data?.nursery_id ?? children[0]?.nursery_id ?? null;
  const isAr = i18n.language.startsWith('ar');
  const childLabel = (child: ParentChildOption) =>
    (isAr ? child.full_name_ar : child.full_name_en) || child.full_name_en || child.full_name_ar;

  const toggleChild = (id: string) => {
    setChildIds((current) =>
      current.includes(id) ? current.filter((childId) => childId !== id) : [...current, id],
    );
  };

  const toggleDay = (day: number) => {
    setUrgentDays((current) =>
      current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort((a, b) => a - b),
    );
  };

  const addHour = (hour: number) => {
    setUrgentHours((current) =>
      current.includes(hour) ? current : [...current, hour].sort((a, b) => a - b),
    );
  };

  const removeHour = (hour: number) => {
    setUrgentHours((current) => current.filter((h) => h !== hour));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) throw new Error('title');
      if (!startsAt || Number.isNaN(new Date(startsAt).getTime())) throw new Error('date');
      if (new Date(startsAt) <= new Date()) throw new Error('future');
      if (!urgentDays.length) throw new Error('days');
      if (!urgentHours.length) throw new Error('hours');

      const payload = {
        p_title_ar: isAr ? trimmedTitle : '',
        p_title_en: isAr ? '' : trimmedTitle,
        p_description_ar: isAr ? description.trim() || null : null,
        p_description_en: isAr ? null : description.trim() || null,
        p_starts_at: new Date(startsAt).toISOString(),
        p_location: location.trim() || null,
        p_category: category,
        p_child_ids: childIds,
        p_permission_deadline: null,
        p_urgent_days_of_week: sortUniqueNumbers(urgentDays),
        p_urgent_hours_of_day: sortUniqueNumbers(urgentHours),
        p_urgent_repeats_weekly: urgentRepeatsWeekly,
      };

      const { data, error } = await supabase.rpc('create_parent_urgent_event' as never, payload as never);
      if (error) throw error;
      return data as string;
    },
    onSuccess: async (eventId) => {
      toast.success(t('parent.events.create.success'));
      await queryClient.invalidateQueries({
        queryKey: parentEventsCatalogQueryKey(user?.id, profileQuery.data?.nursery_id),
      });
      navigate(`/parent/events/${eventId}`);
    },
    onError: (err) => {
      console.error('Create parent urgent event failed', err);
      const code = err instanceof Error ? err.message : 'unknown';
      toast.error(t(`parent.events.create.errors.${code}`, { defaultValue: t('parent.events.create.error') }));
    },
  });

  if (!user?.id) return null;

  if (childrenQuery.isPending || profileQuery.isPending) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <LoadingSkeleton />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-on-surface">{t('parent.events.create.title')}</h1>
          <p className="mt-1 text-sm text-on-surface-variant">{t('parent.events.create.subtitle')}</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/parent/events">{t('parent.events.create.back')}</Link>
        </Button>
      </div>

      {!nurseryId ? (
        <p className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 text-sm text-error">
          {t('parent.events.noNursery')}
        </p>
      ) : (
        <form
          className="space-y-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="parent-event-title">{t('parent.events.create.fields.title')}</Label>
            <Input id="parent-event-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="parent-event-description">{t('parent.events.create.fields.description')}</Label>
            <Textarea
              id="parent-event-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="parent-event-starts">{t('parent.events.create.fields.startsAt')}</Label>
              <Input
                id="parent-event-starts"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="parent-event-category">{t('parent.events.create.fields.category')}</Label>
              <Select
                id="parent-event-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {t(`parent.events.categories.${cat}`)}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="parent-event-location">{t('parent.events.create.fields.location')}</Label>
            <Input id="parent-event-location" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-on-surface">
              {t('parent.events.create.fields.children')}
            </legend>
            <p className="text-xs text-on-surface-variant">{t('parent.events.create.hints.childrenOptional')}</p>
            {children.length ? (
              <div className="space-y-2 rounded-xl border border-outline-variant bg-surface p-3">
                {children.map((child) => (
                  <label key={child.id} className="flex cursor-pointer items-center gap-2 text-sm text-on-surface">
                    <Checkbox checked={childIds.includes(child.id)} onCheckedChange={() => toggleChild(child.id)} />
                    {childLabel(child)}
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-error">{t('parent.events.create.noChildren')}</p>
            )}
          </fieldset>

          <div className="space-y-3 rounded-2xl border border-error/20 bg-error-container/10 p-3">
            <div>
              <p className="text-sm font-semibold text-on-surface">
                {t('parent.events.create.fields.urgentSchedule')}
              </p>
              <p className="mt-0.5 text-xs text-on-surface-variant">
                {t('parent.events.create.hints.urgentSchedule')}
              </p>
            </div>

            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {URGENT_EVENT_DAY_KEYS.map((dayKey, day) => {
                const checked = urgentDays.includes(day);
                return (
                  <button
                    key={dayKey}
                    type="button"
                    aria-pressed={checked}
                    onClick={() => toggleDay(day)}
                    className={
                      'rounded-xl border px-2 py-2 text-xs font-medium transition-colors ' +
                      (checked
                        ? 'border-error bg-error text-white'
                        : 'border-outline-variant bg-surface text-on-surface-variant hover:border-error/40')
                    }
                  >
                    {t(`reminders.daysShort.${dayKey}`)}
                  </button>
                );
              })}
            </div>

            <div className="space-y-2">
              <Label htmlFor="parent-event-hour">{t('parent.events.create.fields.urgentHours')}</Label>
              <Select
                id="parent-event-hour"
                value=""
                onChange={(e) => {
                  if (e.target.value !== '') addHour(Number(e.target.value));
                }}
              >
                <option value="">{t('parent.events.create.fields.addHour')}</option>
                {URGENT_EVENT_HOURS.map((hour) => (
                  <option key={hour} value={hour} disabled={urgentHours.includes(hour)}>
                    {formatUrgentHour(hour)}
                  </option>
                ))}
              </Select>
              <div className="flex flex-wrap gap-2">
                {urgentHours.map((hour) => (
                  <span
                    key={hour}
                    className="inline-flex items-center gap-1.5 rounded-full bg-error/10 py-1 pe-1.5 ps-2.5 text-xs font-semibold text-error"
                  >
                    {formatUrgentHour(hour)}
                    <button type="button" onClick={() => removeHour(hour)} aria-label={t('common.remove')}>
                      <span className="material-symbols-outlined text-sm" aria-hidden>
                        close
                      </span>
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-outline-variant bg-surface p-3">
              <Checkbox
                checked={urgentRepeatsWeekly}
                onCheckedChange={(value) => setUrgentRepeatsWeekly(value === true)}
              />
              <span className="text-sm font-medium text-on-surface">
                {t('parent.events.create.fields.urgentRepeatsWeekly')}
              </span>
            </label>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button asChild type="button" variant="outline">
              <Link to="/parent/events">{t('common.cancel')}</Link>
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {t('parent.events.create.submit')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

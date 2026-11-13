import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldError, invalidFieldClass } from '@/components/ui/FieldError';
import { FormField, FormProblem } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { ChildOption } from '@/hooks/useParentChildren';
import { localName } from '@/lib/bilingualName';
import { formatUrgentHour, URGENT_EVENT_DAY_KEYS, URGENT_EVENT_HOURS } from '@/lib/eventUrgentSchedule';
import { cn } from '@/lib/utils';

import { EventCategoryPicker } from './EventCategoryPicker';
import { createFamilyEvent, eventFlowErrorKey } from './eventFlowApi';
import { toLocalInput } from './eventFormSchema';
import { EventFormSection } from './EventFormSection';
import { familyEventArgs, familyEventProblems, newFamilyEvent, scheduleOf, toggled, type FamilyEventDraft } from './familyEvent';

/** A toggle chip: a child, a weekday or an hour. */
function Chip({ selected, onClick, children, invalid = false }: { selected: boolean; onClick: () => void; children: React.ReactNode; invalid?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        selected ? 'border-primary bg-primary text-primary-foreground' : 'border-outline-variant bg-surface text-on-surface hover:border-primary/50',
        invalid && !selected && 'border-error/60',
      )}
    >
      {selected ? <MaterialSymbol name="check" size="text-base" /> : null}
      {children}
    </button>
  );
}

/**
 * A family tells the nursery about something for its children: which child, what, when and
 * where, and whether it repeats every week. On sending, the admins and the children's teachers are
 * told at once; the family is not asked to approve its own event.
 */
export function FamilyEventForm({ kids, onCreated }: { kids: ChildOption[]; onCreated: (eventId: string) => void }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith('ar');
  const [draft, setDraft] = useState<FamilyEventDraft>(() => newFamilyEvent(kids.map((k) => k.id)));
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [minStart] = useState(() => toLocalInput(new Date()));
  const create = useMutation({ mutationFn: () => createFamilyEvent(familyEventArgs(draft, isAr)) });

  const problems = familyEventProblems(draft);
  const shown = tried ? problems : {};
  const errorText = (key?: string) => (key ? t(`familyEvent.errors.${key}`) : null);
  const set = (patch: Partial<FamilyEventDraft>) => setDraft((d) => ({ ...d, ...patch }));
  // Until the family sets its own week, the repeat follows the start's weekday and hour.
  const setStart = (startsAt: string) => setDraft((d) => ({ ...d, startsAt, ...(d.repeatsWeekly ? {} : scheduleOf(startsAt)) }));
  const chosenNames = kids.filter((k) => draft.childIds.includes(k.id)).map((k) => localName(k.nameAr, k.nameEn, isAr));

  const submit = async () => {
    setTried(true);
    setProblem(null);
    if (Object.keys(problems).length || create.isPending) return;
    try {
      onCreated(await create.mutateAsync());
    } catch (error) {
      setProblem(t(eventFlowErrorKey(error)));
    }
  };

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <EventFormSection icon="child_care" title={t('familyEvent.who')} hint={t('familyEvent.whoHint')}>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('familyEvent.who')}>
          {kids.map((k) => (
            <Chip key={k.id} selected={draft.childIds.includes(k.id)} invalid={Boolean(shown.children)} onClick={() => set({ childIds: toggled(draft.childIds, k.id) })}>
              {localName(k.nameAr, k.nameEn, isAr)}
            </Chip>
          ))}
        </div>
        <FieldError message={errorText(shown.children)} />
      </EventFormSection>

      <EventFormSection icon="edit_note" title={t('familyEvent.what')}>
        <EventCategoryPicker value={draft.category} onChange={(category) => set({ category })} />
        <FormField id="family-event-title" label={t('familyEvent.title')} error={errorText(shown.title)}>
          <Input
            id="family-event-title"
            value={draft.title}
            maxLength={120}
            placeholder={t(`familyEvent.titlePlaceholder.${draft.category}`)}
            aria-invalid={Boolean(shown.title)}
            className={cn(shown.title && invalidFieldClass)}
            onChange={(e) => set({ title: e.target.value })}
          />
        </FormField>
        <FormField id="family-event-description" label={t('familyEvent.description')} hint={t('familyEvent.descriptionHint')} optional>
          <Textarea id="family-event-description" rows={3} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
        </FormField>
      </EventFormSection>

      <EventFormSection icon="schedule" title={t('familyEvent.when')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="family-event-start" label={t('familyEvent.startsAt')} error={errorText(shown.startsAt)}>
            <Input
              id="family-event-start"
              type="datetime-local"
              min={minStart}
              value={draft.startsAt}
              aria-invalid={Boolean(shown.startsAt)}
              className={cn(shown.startsAt && invalidFieldClass)}
              onChange={(e) => setStart(e.target.value)}
            />
          </FormField>
          <FormField id="family-event-location" label={t('familyEvent.location')} optional>
            <Input id="family-event-location" value={draft.location} placeholder={t('familyEvent.locationPlaceholder')} onChange={(e) => set({ location: e.target.value })} />
          </FormField>
        </div>
      </EventFormSection>

      <EventFormSection icon="event_repeat" title={t('familyEvent.repeat')} hint={t('familyEvent.repeatHint')} tone="warning">
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-outline-variant bg-surface p-3">
          <Checkbox
            checked={draft.repeatsWeekly}
            onCheckedChange={(value) => set({ repeatsWeekly: value === true, ...(value === true ? {} : scheduleOf(draft.startsAt)) })}
            data-testid="family-event-repeats"
          />
          <span className="text-sm font-medium text-on-surface">{t('familyEvent.repeatsWeekly')}</span>
        </label>
        {draft.repeatsWeekly ? (
          <div className="space-y-3">
            <div>
              <p className="mb-2 text-xs font-semibold text-on-surface-variant">{t('familyEvent.days')}</p>
              <div className="flex flex-wrap gap-2">
                {URGENT_EVENT_DAY_KEYS.map((key, day) => (
                  <Chip key={key} selected={draft.days.includes(day)} invalid={Boolean(shown.days)} onClick={() => set({ days: toggled(draft.days, day) })}>
                    {t(`reminders.daysShort.${key}`)}
                  </Chip>
                ))}
              </div>
              <FieldError message={errorText(shown.days)} />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-on-surface-variant">{t('familyEvent.hours')}</p>
              <div className="flex flex-wrap items-center gap-2">
                {[...draft.hours].sort((a, b) => a - b).map((hour) => (
                  <Chip key={hour} selected onClick={() => set({ hours: toggled(draft.hours, hour) })}>
                    <span dir="ltr">{formatUrgentHour(hour)}</span>
                  </Chip>
                ))}
                <Select
                  aria-label={t('familyEvent.addHour')}
                  value=""
                  className="h-10 w-auto"
                  onChange={(e) => e.target.value !== '' && set({ hours: toggled(draft.hours, Number(e.target.value)) })}
                >
                  <option value="">{t('familyEvent.addHour')}</option>
                  {URGENT_EVENT_HOURS.filter((h) => !draft.hours.includes(h)).map((h) => (
                    <option key={h} value={h}>{formatUrgentHour(h)}</option>
                  ))}
                </Select>
              </div>
              <FieldError message={errorText(shown.hours)} />
            </div>
          </div>
        ) : null}
      </EventFormSection>

      <p className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm text-on-surface" data-testid="family-event-who-is-told">
        <MaterialSymbol name="campaign" size="text-lg" className="shrink-0 text-primary" />
        {chosenNames.length
          ? t('familyEvent.toldNamed', { names: chosenNames.join(isAr ? '، ' : ', ') })
          : t('familyEvent.told')}
      </p>
      <FormProblem message={problem} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild type="button" variant="outline">
          <Link to="/parent/events">{t('common.cancel')}</Link>
        </Button>
        <Button type="submit" disabled={create.isPending} data-testid="family-event-submit">
          <MaterialSymbol name="send" size="text-base" className="me-1 rtl:-scale-x-100" />
          {create.isPending ? t('common.saving') : t('familyEvent.submit')}
        </Button>
      </div>
    </form>
  );
}

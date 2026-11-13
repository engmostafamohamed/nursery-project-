import { useMemo, useState } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Checkbox } from '@/components/ui/checkbox';
import { ChoiceCards } from '@/components/ui/ChoiceCards';
import { invalidFieldClass } from '@/components/ui/FieldError';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { localName } from '@/lib/bilingualName';
import { cn } from '@/lib/utils';

import { EVENT_SCOPES, SCOPE_ICON, type EventScope } from './events';
import type { EventChildPickerRow, EventClassRow } from './useEventFormData';

/**
 * Who an event is for: the whole nursery, one class, or children picked by name (found by search,
 * all at once or one by one). The families of the children asked get the permission request.
 */
export function EventAudienceFields({ form, classes, classesLoading, nurseryChildren, childrenLoading, errorOf }: {
  form: UseFormReturn<FieldValues>;
  classes: EventClassRow[];
  classesLoading: boolean;
  nurseryChildren: EventChildPickerRow[];
  childrenLoading: boolean;
  errorOf: (name: string) => string | null;
}) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language.startsWith('ar');
  const { register, watch, setValue } = form;
  const scope = (watch('targetScope') ?? 'all') as EventScope;
  const chosen = (watch('targetChildIds') as string[] | undefined) ?? [];
  const [search, setSearch] = useState('');

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? nurseryChildren.filter((c) => `${c.full_name_ar} ${c.full_name_en}`.toLowerCase().includes(q)) : nurseryChildren;
  }, [nurseryChildren, search]);

  const setChosen = (ids: string[]) => setValue('targetChildIds', [...new Set(ids)], { shouldValidate: true, shouldDirty: true });
  const toggle = (id: string) => setChosen(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);

  return (
    <div className="space-y-4">
      <ChoiceCards
        label={t('admin.events.create.fields.targetScope')}
        value={scope}
        onChange={(value) => setValue('targetScope', value, { shouldValidate: true, shouldDirty: true })}
        options={EVENT_SCOPES.map((value) => ({
          value,
          icon: SCOPE_ICON[value],
          label: t(`admin.events.create.scope.${value}`),
          hint: t(`eventForm.scopeHints.${value}`),
        }))}
        className="grid-cols-1 sm:grid-cols-3"
      />

      {scope === 'class' ? (
        <FormField id="event-class" label={t('admin.events.create.fields.targetClass')} error={errorOf('targetClassId')}>
          <Select id="event-class" disabled={classesLoading} className={cn(errorOf('targetClassId') && invalidFieldClass)} {...register('targetClassId')}>
            <option value="">{t('admin.events.create.placeholders.selectClass')}</option>
            {classes.map((row) => (
              <option key={row.id} value={row.id}>{localName(row.name_ar, row.name_en, isArabic)}</option>
            ))}
          </Select>
        </FormField>
      ) : null}

      {scope === 'individual' ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-on-surface">{t('admin.events.create.fields.targetChildren')}</p>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">{t('eventForm.childrenChosen', { count: chosen.length })}</span>
          </div>
          <p className="text-xs text-on-surface-variant">{t('admin.events.create.scope.individualHint')}</p>
          {childrenLoading ? (
            <p className="text-xs text-on-surface-variant">{t('admin.events.create.loadingChildren')}</p>
          ) : nurseryChildren.length === 0 ? (
            <p className="text-xs text-on-surface-variant">{t('admin.events.create.noChildrenInNursery')}</p>
          ) : (
            <div className="rounded-xl border border-outline-variant">
              <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant p-2">
                <div className="relative min-w-[12rem] flex-1">
                  <MaterialSymbol name="search" size="text-base" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('eventForm.searchChildren')} aria-label={t('eventForm.searchChildren')} className="h-10 ps-9" />
                </div>
                <button type="button" className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10" onClick={() => setChosen([...chosen, ...shown.map((c) => c.id)])}>
                  {t('eventForm.selectShown')}
                </button>
                {chosen.length ? (
                  <button type="button" className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-high" onClick={() => setChosen([])}>
                    {t('eventForm.clearChosen')}
                  </button>
                ) : null}
              </div>
              <ul className="max-h-56 divide-y divide-outline-variant overflow-y-auto">
                {shown.map((child) => (
                  <li key={child.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-on-surface hover:bg-surface-high">
                      <Checkbox checked={chosen.includes(child.id)} onCheckedChange={() => toggle(child.id)} />
                      <span className="min-w-0 truncate">{localName(child.full_name_ar, child.full_name_en, isArabic)}</span>
                    </label>
                  </li>
                ))}
                {!shown.length ? <li className="px-3 py-4 text-center text-xs text-on-surface-variant">{t('eventForm.noChildMatch')}</li> : null}
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { invalidFieldClass } from '@/components/ui/FieldError';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FOOD_ALLERGENS, type FoodAllergen } from '@/features/food-and-beverage/menu';
import { cn } from '@/lib/utils';

import {
  ALLERGY_SEVERITIES,
  allergyIssues,
  BLOOD_TYPES,
  conditionIssues,
  CONSENT_STATUSES,
  MEDICATION_METHODS,
  medicationIssues,
  NOTES_MAX,
  overviewDraft,
  overviewIssues,
  TEXT_MAX,
  VACCINE_PRESETS,
  vaccinationIssues,
  vaccinePresetFor,
  type Allergy,
  type AllergyDraft,
  type ChildHealthProfile,
  type Condition,
  type ConditionDraft,
  type Medication,
  type MedicationDraft,
  type OverviewDraft,
  type Vaccination,
  type VaccinationDraft,
  type VaccinePreset,
} from './childHealth';
import {
  allergyRow,
  conditionRow,
  healthErrorKey,
  medicationRow,
  saveHealthItem,
  saveHealthOverview,
  suggestFoodAllergens,
  vaccinationRow,
  type HealthItemKind,
} from './childHealthApi';
import { FormField, FormProblem } from './HealthUi';
import { useChildHealthChange } from './useChildHealthProfile';

/*
 * The forms of the health profile. Each checks its fields as they are typed (the problem shows under
 * the field once it has been left, or after a first try to save), saves, and on failure says why
 * inside the form.
 */

type Target = { childId: string; nurseryId: string; today: string };
const targetOf = (profile: ChildHealthProfile): Target => ({ childId: profile.child.id, nurseryId: profile.child.nurseryId, today: profile.today });

/** A draft, the fields that were left, and whether saving was tried. */
function useDraft<D extends object>(initial: () => D) {
  const [draft, setDraft] = useState<D>(initial);
  const [touched, setTouched] = useState<Partial<Record<keyof D, boolean>>>({});
  const [tried, setTried] = useState(false);
  return {
    draft,
    set: (patch: Partial<D>) => setDraft((d) => ({ ...d, ...patch })),
    touch: (field: keyof D) => setTouched((s) => ({ ...s, [field]: true })),
    shows: (field: keyof D) => tried || Boolean(touched[field]),
    tried,
    setTried,
  };
}

function HealthDialog({
  title,
  description,
  busy,
  problem,
  onClose,
  onSubmit,
  children,
  testId,
  wide = false,
}: {
  title: string;
  description?: string;
  busy: boolean;
  problem: string | null;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
  testId: string;
  wide?: boolean;
}) {
  const { t } = useTranslation();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy) onSubmit();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent
        className={cn('max-h-[92vh] overflow-y-auto', wide ? 'max-w-2xl' : 'max-w-lg')}
        data-testid={testId}
        {...(description ? {} : { 'aria-describedby': undefined })}
      >
        <form onSubmit={submit} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {children}
          <FormProblem message={problem} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Saving one item of a list, with the right message when it is done. */
function useItemSave(profile: ChildHealthProfile, kind: HealthItemKind, id: string | null, onClose: () => void) {
  const { t } = useTranslation();
  const target = targetOf(profile);
  const [problem, setProblem] = useState<string | null>(null);
  const change = useChildHealthChange(target.childId, (row: Record<string, unknown>) => saveHealthItem(kind, { ...target, id }, row));
  const save = async (row: Record<string, unknown>) => {
    setProblem(null);
    try {
      await change.mutateAsync(row);
      toast.success(t(`health.profile.saved.${kind}`));
      onClose();
    } catch (error) {
      setProblem(t(healthErrorKey(error)));
    }
  };
  return { save, busy: change.isPending, problem };
}

const errorText = (t: (k: string, o?: Record<string, unknown>) => string, issue: string | undefined, max = TEXT_MAX) =>
  issue ? t(`health.profile.issues.${issue}`, { max }) : null;

// -----------------------------------------------------------------------------------------------
export function OverviewDialog({ profile, onClose }: { profile: ChildHealthProfile; onClose: () => void }) {
  const { t } = useTranslation();
  const form = useDraft<OverviewDraft>(() => overviewDraft(profile));
  const issues = overviewIssues(form.draft);
  const [problem, setProblem] = useState<string | null>(null);
  const change = useChildHealthChange(profile.child.id, (draft: OverviewDraft) => saveHealthOverview(profile.child.id, draft));

  const submit = async () => {
    form.setTried(true);
    if (Object.keys(issues).length) return;
    setProblem(null);
    try {
      await change.mutateAsync(form.draft);
      toast.success(t('health.profile.saved.overview'));
      onClose();
    } catch (error) {
      setProblem(t(healthErrorKey(error)));
    }
  };

  const field = (key: keyof OverviewDraft, id: string, label: string, opts: { type?: 'tel'; optional?: boolean; hint?: string; placeholder?: string } = {}) => {
    const error = form.shows(key) ? errorText(t, issues[key]) : null;
    return (
      <FormField id={id} label={label} error={error} optional={opts.optional ?? true} hint={opts.hint}>
        <Input
          id={id}
          type={opts.type ?? 'text'}
          inputMode={opts.type === 'tel' ? 'tel' : undefined}
          dir={opts.type === 'tel' ? 'ltr' : undefined}
          value={form.draft[key]}
          placeholder={opts.placeholder}
          onChange={(e) => form.set({ [key]: e.target.value } as Partial<OverviewDraft>)}
          onBlur={() => form.touch(key)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : opts.hint ? `${id}-hint` : undefined}
          className={cn(error && invalidFieldClass)}
        />
      </FormField>
    );
  };

  return (
    <HealthDialog
      title={t('health.profile.overview.title')}
      description={t('health.profile.overview.description')}
      busy={change.isPending}
      problem={problem}
      onClose={onClose}
      onSubmit={() => void submit()}
      testId="overview-dialog"
      wide
    >
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-on-surface">{t('health.fields.bloodType')}</legend>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('health.fields.bloodType')}>
          {['', ...BLOOD_TYPES].map((type) => {
            const selected = form.draft.bloodType === type;
            return (
              <button
                key={type || 'unknown'}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => form.set({ bloodType: type })}
                className={cn(
                  'min-w-12 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
                  selected ? 'border-primary bg-primary text-primary-foreground' : 'border-outline-variant bg-surface text-on-surface hover:border-primary/60',
                )}
              >
                {type ? <span dir="ltr">{type}</span> : t('health.profile.overview.bloodUnknown')}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-3 border-t border-outline-variant pt-4">
        <legend className="text-sm font-semibold text-on-surface">{t('health.profile.doctor.pediatrician')}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {field('pediatricianName', 'ped-name', t('health.fields.pediatricianName'), { placeholder: t('health.profile.placeholders.doctor') })}
          {field('pediatricianPhone', 'ped-phone', t('health.fields.pediatricianPhone'), { type: 'tel', placeholder: t('health.profile.placeholders.phone') })}
          {field('pediatricianClinic', 'ped-clinic', t('health.fields.pediatricianClinic'))}
        </div>
      </fieldset>

      <fieldset className="space-y-3 border-t border-outline-variant pt-4">
        <legend className="text-sm font-semibold text-on-surface">{t('health.profile.overview.extraContact')}</legend>
        <p className="-mt-1 text-xs text-on-surface-variant">{t('health.profile.overview.extraContactHint')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {field('emergencyContactName', 'em-name', t('health.fields.emergencyContactName'))}
          {field('emergencyContactPhone', 'em-phone', t('health.fields.emergencyContactPhone'), { type: 'tel', placeholder: t('health.profile.placeholders.phone') })}
        </div>
      </fieldset>

      <fieldset className="space-y-3 border-t border-outline-variant pt-4">
        <legend className="text-sm font-semibold text-on-surface">{t('health.profile.doctor.insurance')}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {field('insuranceProvider', 'ins-provider', t('health.fields.insuranceProvider'))}
          {field('insurancePolicyNumber', 'ins-policy', t('health.fields.insurancePolicy'))}
        </div>
        <FormField
          id="ins-notes"
          label={t('health.fields.insuranceNotes')}
          optional
          error={form.shows('insuranceNotes') ? errorText(t, issues.insuranceNotes, NOTES_MAX) : null}
        >
          <Textarea
            id="ins-notes"
            className="min-h-20 text-sm"
            value={form.draft.insuranceNotes}
            onChange={(e) => form.set({ insuranceNotes: e.target.value })}
            onBlur={() => form.touch('insuranceNotes')}
          />
        </FormField>
      </fieldset>
    </HealthDialog>
  );
}

// -----------------------------------------------------------------------------------------------
export function AllergyDialog({ profile, item, onClose }: { profile: ChildHealthProfile; item: Allergy | null; onClose: () => void }) {
  const { t } = useTranslation();
  const form = useDraft<AllergyDraft>(() =>
    item
      ? { name: item.name, reaction: item.reaction ?? '', severity: item.severity, treatment: item.treatment ?? '', lastReactionDate: item.lastReactionDate ?? '', foodAllergens: item.foodAllergens }
      : { name: '', reaction: '', severity: 'moderate', treatment: '', lastReactionDate: '', foodAllergens: [] },
  );
  const issues = allergyIssues(form.draft, profile.today);
  const { save, busy, problem } = useItemSave(profile, 'allergy', item?.id ?? null, onClose);

  // The foods follow the name until they are chosen by hand.
  const [foodsChosen, setFoodsChosen] = useState(false);
  const [typedName, setTypedName] = useState(form.draft.name.trim());
  useEffect(() => {
    const timer = window.setTimeout(() => setTypedName(form.draft.name.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [form.draft.name]);
  const renamed = typedName !== (item?.name ?? '').trim();
  const suggestion = useQuery({
    queryKey: ['food-allergens-for', typedName],
    queryFn: () => suggestFoodAllergens(typedName),
    enabled: !foodsChosen && renamed && typedName !== '',
    staleTime: Infinity,
  });
  const foods: FoodAllergen[] = foodsChosen ? form.draft.foodAllergens : renamed ? (typedName ? suggestion.data ?? [] : []) : item?.foodAllergens ?? [];
  const toggleFood = (food: FoodAllergen) => {
    setFoodsChosen(true);
    form.set({ foodAllergens: foods.includes(food) ? foods.filter((f) => f !== food) : FOOD_ALLERGENS.filter((f) => f === food || foods.includes(f)) });
  };

  const submit = () => {
    form.setTried(true);
    if (Object.keys(issues).length) return;
    void save(allergyRow({ ...form.draft, foodAllergens: foods }));
  };
  const err = (field: keyof typeof issues, max = TEXT_MAX) => (form.shows(field) ? errorText(t, issues[field], max) : null);

  return (
    <HealthDialog
      title={item ? t('health.dialog.editAllergy') : t('health.dialog.addAllergy')}
      busy={busy}
      problem={problem}
      onClose={onClose}
      onSubmit={submit}
      testId="allergy-dialog"
      wide
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="allergy-name" label={t('health.fields.allergen')} error={err('name')}>
          <Input
            id="allergy-name"
            value={form.draft.name}
            placeholder={t('health.profile.placeholders.allergy')}
            onChange={(e) => form.set({ name: e.target.value })}
            onBlur={() => form.touch('name')}
            aria-invalid={Boolean(err('name'))}
            className={cn(err('name') && invalidFieldClass)}
          />
        </FormField>
        <FormField id="allergy-severity" label={t('health.fields.severity')}>
          <Select id="allergy-severity" value={form.draft.severity} onChange={(e) => form.set({ severity: e.target.value as AllergyDraft['severity'] })}>
            {ALLERGY_SEVERITIES.map((s) => (
              <option key={s} value={s}>{t(`health.severity.allergy.${s}`)}</option>
            ))}
          </Select>
        </FormField>
      </div>

      <fieldset className="space-y-2 rounded-xl border border-outline-variant p-3.5" data-testid="allergy-foods">
        <legend className="px-1 text-sm font-semibold text-on-surface">{t('health.profile.allergy.foodsLabel')}</legend>
        <p className="text-xs text-on-surface-variant">{t('health.profile.allergy.foodsHint')}</p>
        <div className="flex flex-wrap gap-1.5">
          {FOOD_ALLERGENS.map((food) => {
            const on = foods.includes(food);
            return (
              <button
                key={food}
                type="button"
                aria-pressed={on}
                onClick={() => toggleFood(food)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  on ? 'border-primary bg-primary text-primary-foreground' : 'border-outline-variant bg-surface text-on-surface hover:border-primary/60',
                )}
              >
                {on ? <MaterialSymbol name="check" size="text-sm" /> : null}
                {t(`fnb.allergens.${food}`)}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-on-surface-variant" aria-live="polite">
          {!foodsChosen && renamed && suggestion.isFetching
            ? t('health.profile.allergy.matching')
            : foods.length === 0
              ? t('health.profile.allergy.noFoods')
              : !foodsChosen && renamed
                ? t('health.profile.allergy.suggested')
                : null}
        </p>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="allergy-reaction" label={t('health.profile.allergy.reaction')} optional error={err('reaction')}>
          <Input id="allergy-reaction" value={form.draft.reaction} placeholder={t('health.profile.placeholders.reaction')} onChange={(e) => form.set({ reaction: e.target.value })} onBlur={() => form.touch('reaction')} />
        </FormField>
        <FormField id="allergy-last" label={t('health.profile.allergy.lastReaction')} optional error={err('lastReactionDate')}>
          <Input id="allergy-last" type="date" max={profile.today} value={form.draft.lastReactionDate} onChange={(e) => form.set({ lastReactionDate: e.target.value })} onBlur={() => form.touch('lastReactionDate')} className={cn(err('lastReactionDate') && invalidFieldClass)} />
        </FormField>
      </div>
      <FormField id="allergy-treatment" label={t('health.profile.allergy.treatment')} optional error={err('treatment', NOTES_MAX)}>
        <Textarea id="allergy-treatment" className="min-h-20 text-sm" value={form.draft.treatment} placeholder={t('health.profile.placeholders.treatment')} onChange={(e) => form.set({ treatment: e.target.value })} onBlur={() => form.touch('treatment')} />
      </FormField>
    </HealthDialog>
  );
}

// -----------------------------------------------------------------------------------------------
export function ConditionDialog({ profile, item, onClose }: { profile: ChildHealthProfile; item: Condition | null; onClose: () => void }) {
  const { t } = useTranslation();
  const form = useDraft<ConditionDraft>(() => ({
    name: item?.name ?? '',
    severity: item?.severity ?? '',
    diagnosisDate: item?.diagnosisDate ?? '',
    treatment: item?.treatment ?? '',
    triggers: item?.triggers ?? '',
    emergencyPlan: item?.emergencyPlan ?? '',
  }));
  const issues = conditionIssues(form.draft, profile.today);
  const { save, busy, problem } = useItemSave(profile, 'condition', item?.id ?? null, onClose);
  const err = (field: keyof ConditionDraft, max = TEXT_MAX) => (form.shows(field) ? errorText(t, issues[field], max) : null);
  const area = (field: 'treatment' | 'triggers' | 'emergencyPlan', id: string, label: string) => (
    <FormField id={id} label={label} optional error={err(field, NOTES_MAX)}>
      <Textarea id={id} className="min-h-20 text-sm" value={form.draft[field]} onChange={(e) => form.set({ [field]: e.target.value })} onBlur={() => form.touch(field)} />
    </FormField>
  );

  return (
    <HealthDialog
      title={item ? t('health.dialog.editCondition') : t('health.dialog.addCondition')}
      busy={busy}
      problem={problem}
      onClose={onClose}
      onSubmit={() => {
        form.setTried(true);
        if (!Object.keys(issues).length) void save(conditionRow(form.draft));
      }}
      testId="condition-dialog"
      wide
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="condition-name" label={t('health.fields.conditionName')} error={err('name')}>
          <Input id="condition-name" value={form.draft.name} placeholder={t('health.profile.placeholders.condition')} onChange={(e) => form.set({ name: e.target.value })} onBlur={() => form.touch('name')} className={cn(err('name') && invalidFieldClass)} />
        </FormField>
        <FormField id="condition-severity" label={t('health.fields.severity')} optional error={err('severity')}>
          <Input id="condition-severity" value={form.draft.severity} placeholder={t('health.profile.placeholders.conditionSeverity')} onChange={(e) => form.set({ severity: e.target.value })} onBlur={() => form.touch('severity')} />
        </FormField>
        <FormField id="condition-date" label={t('health.fields.diagnosisDate')} optional error={err('diagnosisDate')}>
          <Input id="condition-date" type="date" max={profile.today} value={form.draft.diagnosisDate} onChange={(e) => form.set({ diagnosisDate: e.target.value })} onBlur={() => form.touch('diagnosisDate')} className={cn(err('diagnosisDate') && invalidFieldClass)} />
        </FormField>
      </div>
      {area('emergencyPlan', 'condition-plan', t('health.profile.condition.plan'))}
      <div className="grid gap-3 sm:grid-cols-2">
        {area('treatment', 'condition-treatment', t('health.profile.condition.treatment'))}
        {area('triggers', 'condition-triggers', t('health.profile.condition.triggers'))}
      </div>
    </HealthDialog>
  );
}

// -----------------------------------------------------------------------------------------------
export function MedicationDialog({ profile, item, onClose }: { profile: ChildHealthProfile; item: Medication | null; onClose: () => void }) {
  const { t } = useTranslation();
  const form = useDraft<MedicationDraft>(() => ({
    name: item?.name ?? '',
    dosage: item?.dosage ?? '',
    times: item?.times ?? '',
    method: item?.method ?? 'oral',
    storage: item?.storage ?? '',
    expiryDate: item?.expiryDate ?? '',
    consent: item?.consent ?? 'pending',
  }));
  const issues = medicationIssues(form.draft);
  const { save, busy, problem } = useItemSave(profile, 'medication', item?.id ?? null, onClose);
  const err = (field: keyof MedicationDraft) => (form.shows(field) ? errorText(t, issues[field]) : null);
  const text = (field: 'name' | 'dosage' | 'times' | 'storage', id: string, label: string, placeholder?: string) => (
    <FormField id={id} label={label} optional={field !== 'name'} error={err(field)}>
      <Input id={id} value={form.draft[field]} placeholder={placeholder} onChange={(e) => form.set({ [field]: e.target.value })} onBlur={() => form.touch(field)} className={cn(err(field) && invalidFieldClass)} />
    </FormField>
  );

  return (
    <HealthDialog
      title={item ? t('health.dialog.editMedication') : t('health.dialog.addMedication')}
      busy={busy}
      problem={problem}
      onClose={onClose}
      onSubmit={() => {
        form.setTried(true);
        if (!Object.keys(issues).length) void save(medicationRow(form.draft));
      }}
      testId="medication-dialog"
      wide
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {text('name', 'med-name', t('health.fields.medicationName'), t('health.profile.placeholders.medication'))}
        {text('dosage', 'med-dosage', t('health.fields.dosage'), t('health.profile.placeholders.dosage'))}
        {text('times', 'med-times', t('health.profile.medication.times'), t('health.profile.placeholders.times'))}
        <FormField id="med-method" label={t('health.profile.medication.method')}>
          <Select id="med-method" value={form.draft.method} onChange={(e) => form.set({ method: e.target.value as MedicationDraft['method'] })}>
            {MEDICATION_METHODS.map((m) => (
              <option key={m} value={m}>{t(`health.method.${m}`)}</option>
            ))}
          </Select>
        </FormField>
        {text('storage', 'med-storage', t('health.profile.medication.storage'), t('health.profile.placeholders.storage'))}
        <FormField id="med-expiry" label={t('health.fields.expiry')} optional>
          <Input id="med-expiry" type="date" value={form.draft.expiryDate} onChange={(e) => form.set({ expiryDate: e.target.value })} />
        </FormField>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-on-surface">{t('health.fields.consent')}</legend>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('health.fields.consent')}>
          {CONSENT_STATUSES.map((c) => {
            const selected = form.draft.consent === c;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => form.set({ consent: c })}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                  selected ? 'border-primary bg-primary text-primary-foreground' : 'border-outline-variant bg-surface text-on-surface hover:border-primary/60',
                )}
              >
                {t(`health.profile.medication.consent.${c}`)}
              </button>
            );
          })}
        </div>
      </fieldset>
    </HealthDialog>
  );
}

// -----------------------------------------------------------------------------------------------
export function VaccinationDialog({ profile, item, onClose }: { profile: ChildHealthProfile; item: Vaccination | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const labelsOf = (preset: VaccinePreset) => [
    i18n.getFixedT('en')(`health.mohVaccines.${preset}`),
    i18n.getFixedT('ar')(`health.mohVaccines.${preset}`),
  ];
  const form = useDraft<VaccinationDraft>(() => {
    const preset = item ? vaccinePresetFor(item.name, labelsOf) : 'bcg';
    return {
      preset,
      customName: item && preset === 'other' ? item.name : '',
      dose: String(item?.dose ?? 1),
      givenOn: item?.givenOn ?? '',
      nextDue: item?.nextDue ?? '',
      givenBy: item?.givenBy ?? '',
      batch: item?.batch ?? '',
    };
  });
  const issues = vaccinationIssues(form.draft, profile.today);
  const { save, busy, problem } = useItemSave(profile, 'vaccination', item?.id ?? null, onClose);
  const err = (field: keyof VaccinationDraft) => (form.shows(field) ? errorText(t, issues[field]) : null);
  // A preset keeps the name it was saved with (in either language); a new one is named in the reader's.
  const vaccineName = form.draft.preset === 'other'
    ? form.draft.customName
    : item && vaccinePresetFor(item.name, labelsOf) === form.draft.preset ? item.name : t(`health.mohVaccines.${form.draft.preset}`);

  return (
    <HealthDialog
      title={item ? t('health.dialog.editVaccination') : t('health.dialog.addVaccination')}
      busy={busy}
      problem={problem}
      onClose={onClose}
      onSubmit={() => {
        form.setTried(true);
        if (!Object.keys(issues).length) void save(vaccinationRow(form.draft, vaccineName));
      }}
      testId="vaccination-dialog"
      wide
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="vac-preset" label={t('health.fields.vaccineName')}>
          <Select id="vac-preset" value={form.draft.preset} onChange={(e) => form.set({ preset: e.target.value as VaccinePreset })}>
            {VACCINE_PRESETS.map((p) => (
              <option key={p} value={p}>{t(`health.mohVaccines.${p}`)}</option>
            ))}
          </Select>
        </FormField>
        {form.draft.preset === 'other' ? (
          <FormField id="vac-custom" label={t('health.fields.customVaccine')} error={err('customName')}>
            <Input id="vac-custom" value={form.draft.customName} onChange={(e) => form.set({ customName: e.target.value })} onBlur={() => form.touch('customName')} className={cn(err('customName') && invalidFieldClass)} />
          </FormField>
        ) : null}
        <FormField id="vac-dose" label={t('health.fields.doseNumber')} error={err('dose')}>
          <Input id="vac-dose" type="number" inputMode="numeric" min={1} max={10} value={form.draft.dose} onChange={(e) => form.set({ dose: e.target.value })} onBlur={() => form.touch('dose')} className={cn(err('dose') && invalidFieldClass)} />
        </FormField>
        <FormField id="vac-given" label={t('health.fields.dateAdministered')} optional error={err('givenOn')}>
          <Input id="vac-given" type="date" max={profile.today} value={form.draft.givenOn} onChange={(e) => form.set({ givenOn: e.target.value })} onBlur={() => form.touch('givenOn')} className={cn(err('givenOn') && invalidFieldClass)} />
        </FormField>
        <FormField id="vac-next" label={t('health.fields.nextDue')} optional error={err('nextDue')}>
          <Input id="vac-next" type="date" value={form.draft.nextDue} onChange={(e) => form.set({ nextDue: e.target.value })} onBlur={() => form.touch('nextDue')} className={cn(err('nextDue') && invalidFieldClass)} />
        </FormField>
        <FormField id="vac-by" label={t('health.fields.administeredBy')} optional error={err('givenBy')}>
          <Input id="vac-by" value={form.draft.givenBy} onChange={(e) => form.set({ givenBy: e.target.value })} onBlur={() => form.touch('givenBy')} />
        </FormField>
        <FormField id="vac-batch" label={t('health.fields.batch')} optional error={err('batch')}>
          <Input id="vac-batch" value={form.draft.batch} onChange={(e) => form.set({ batch: e.target.value })} onBlur={() => form.touch('batch')} />
        </FormField>
      </div>
    </HealthDialog>
  );
}

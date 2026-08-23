import { useTranslation } from 'react-i18next';
import type { UseFormReturn } from 'react-hook-form';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { MaterialSymbol } from '@/components/ui/MaterialSymbol';
import { cn } from '@/lib/utils';

import type { ParentSignUpFormValues } from '@/features/parent-signup/parentSignUpValidation';
import {
  MEDICATION_CONSENT_OPTIONS,
  type MedicationConsentId,
} from '@/lib/admissions/medicationConsentOptions';

type Props = {
  form: UseFormReturn<ParentSignUpFormValues>;
};

export function StepMedicationConsents({ form }: Props) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';
  const selected = (form.watch('medicationConsents') ?? []) as MedicationConsentId[];

  const toggle = (id: MedicationConsentId) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    form.setValue('medicationConsents', next, { shouldDirty: true, shouldTouch: true });
  };

  const selectAll = () => {
    form.setValue(
      'medicationConsents',
      MEDICATION_CONSENT_OPTIONS.map((o) => o.id),
      { shouldDirty: true, shouldTouch: true },
    );
  };
  const clearAll = () => {
    form.setValue('medicationConsents', [], { shouldDirty: true, shouldTouch: true });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-on-surface">{t('signup.medicationConsents.title')}</h3>
        <p className="text-sm text-on-surface-variant">{t('signup.medicationConsents.description')}</p>
      </div>

      <div className="flex items-center justify-between rounded-xl bg-primary/5 px-4 py-2 text-xs">
        <span className="text-on-surface-variant">
          {t('signup.medicationConsents.selectedCount', { count: selected.length, total: MEDICATION_CONSENT_OPTIONS.length })}
        </span>
        <div className="flex items-center gap-3">
          <button type="button" onClick={selectAll} className="font-medium text-primary hover:underline">
            {t('signup.medicationConsents.selectAll')}
          </button>
          <button type="button" onClick={clearAll} className="font-medium text-on-surface-variant hover:underline">
            {t('signup.medicationConsents.clearAll')}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {MEDICATION_CONSENT_OPTIONS.map((opt) => {
          const checked = selected.includes(opt.id);
          const label = isArabic ? opt.labelAr : opt.labelEn;
          const description = isArabic ? opt.descriptionAr : opt.descriptionEn;
          return (
            <label
              key={opt.id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                checked
                  ? 'border-primary bg-primary/5'
                  : 'border-outline-variant bg-surface-container-lowest hover:border-primary/50',
              )}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => toggle(opt.id)}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <Label className="cursor-pointer text-sm font-medium text-on-surface">{label}</Label>
                <p className="mt-0.5 text-xs text-on-surface-variant">{description}</p>
              </div>
            </label>
          );
        })}
      </div>

      <div className="flex items-start gap-3 rounded-xl bg-surface-container px-4 py-3 text-xs text-on-surface-variant">
        <MaterialSymbol name="info" size="text-lg" className="text-primary" />
        <p>{t('signup.medicationConsents.disclaimer')}</p>
      </div>
    </div>
  );
}

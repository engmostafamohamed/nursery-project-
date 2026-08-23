import { useFieldArray, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { defaultAllergyRow } from '../childEnrollmentDefaults';
import type { ChildEnrollmentFormValues } from '../childEnrollmentTypes';

const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'];

const ALLERGEN_KEYS = [
  'peanuts',
  'tree_nuts',
  'milk',
  'eggs',
  'soy',
  'wheat',
  'shellfish',
  'fish',
  'other',
] as const;

const SEVERITY_KEYS = ['mild', 'moderate', 'severe', 'life_threatening'] as const;

export function ChildEnrollmentMedicalStep() {
  const { t } = useTranslation();
  const { register, watch, control } = useFormContext<ChildEnrollmentFormValues>();
  const hasAllergies = watch('hasAllergies');
  const hasConditions = watch('hasConditions');
  const hasMedications = watch('hasMedications');
  const allergiesWatch = watch('allergies');

  const allergiesArr = useFieldArray({ control, name: 'allergies' });
  const conditionsArr = useFieldArray({ control, name: 'conditions' });
  const medicationsArr = useFieldArray({ control, name: 'medications' });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Label>{t('childEnrollment.step2.bloodType')}</Label>
        <select
          className="h-11 w-full rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm"
          {...register('bloodType')}
        >
          <option value="">{t('childEnrollment.step2.select')}</option>
          {BLOOD.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      <section className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register('hasAllergies')} />
          {t('childEnrollment.step2.hasAllergies')}
        </label>
        {hasAllergies ? (
          <div className="space-y-2">
            {allergiesArr.fields.map((field, index) => (
              <div key={field.id} className="grid gap-2 rounded-lg border border-outline-variant p-3 md:grid-cols-2">
                <div className="space-y-1 md:col-span-2">
                  <Label>{t('childEnrollment.step2.allergen')}</Label>
                  <select
                    className="h-11 w-full rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm"
                    {...register(`allergies.${index}.allergenKey` as const)}
                  >
                    {ALLERGEN_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {t(`childEnrollment.allergens.${k}`)}
                      </option>
                    ))}
                  </select>
                </div>
                {allergiesWatch[index]?.allergenKey === 'other' ? (
                  <div className="space-y-1 md:col-span-2">
                    <Label>{t('childEnrollment.step2.allergenOther')}</Label>
                    <Input {...register(`allergies.${index}.allergenOther` as const)} />
                  </div>
                ) : null}
                <div className="space-y-1">
                  <Label>{t('childEnrollment.step2.severity')}</Label>
                  <select
                    className="h-11 w-full rounded-lg border border-outline-variant bg-surface text-foreground px-3 text-sm"
                    {...register(`allergies.${index}.severity` as const)}
                  >
                    {SEVERITY_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {t(`childEnrollment.severity.${k}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>{t('childEnrollment.step2.notes')}</Label>
                  <Input {...register(`allergies.${index}.notes` as const)} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>{t('childEnrollment.step2.protocol')}</Label>
                  <Textarea rows={2} {...register(`allergies.${index}.protocol` as const)} />
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => allergiesArr.append(defaultAllergyRow())}
            >
              {t('childEnrollment.step2.addAllergy')}
            </Button>
          </div>
        ) : null}
      </section>

      <section className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register('hasConditions')} />
          {t('childEnrollment.step2.hasConditions')}
        </label>
        {hasConditions ? (
          <div className="space-y-2">
            {conditionsArr.fields.map((field, index) => (
              <div key={field.id} className="grid gap-2 rounded-lg border border-outline-variant p-3 md:grid-cols-2">
                <Input placeholder={t('childEnrollment.step2.conditionName')} {...register(`conditions.${index}.name` as const)} />
                <Textarea placeholder={t('childEnrollment.step2.treatment')} {...register(`conditions.${index}.treatment` as const)} />
                <Input placeholder={t('childEnrollment.step2.triggers')} {...register(`conditions.${index}.triggers` as const)} />
                <Textarea placeholder={t('childEnrollment.step2.emergency')} {...register(`conditions.${index}.emergency` as const)} />
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => conditionsArr.append({ name: '', treatment: '', triggers: '', emergency: '' })}>
              {t('childEnrollment.step2.addCondition')}
            </Button>
          </div>
        ) : null}
      </section>

      <section className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register('hasMedications')} />
          {t('childEnrollment.step2.hasMedications')}
        </label>
        {hasMedications ? (
          <div className="space-y-2">
            {medicationsArr.fields.map((field, index) => (
              <div key={field.id} className="grid gap-2 rounded-lg border border-outline-variant p-3 md:grid-cols-2">
                <Input placeholder={t('childEnrollment.step2.medName')} {...register(`medications.${index}.name` as const)} />
                <Input placeholder={t('childEnrollment.step2.dosage')} {...register(`medications.${index}.dosage` as const)} />
                <Input placeholder={t('childEnrollment.step2.times')} {...register(`medications.${index}.times` as const)} />
                <Input type="date" {...register(`medications.${index}.expiry` as const)} />
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => medicationsArr.append({ name: '', dosage: '', times: '', expiry: '' })}>
              {t('childEnrollment.step2.addMedication')}
            </Button>
          </div>
        ) : null}
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <Label>{t('childEnrollment.step2.dietary')}</Label>
          <Textarea {...register('dietaryRestrictions')} rows={2} />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label>{t('childEnrollment.step2.specialNeeds')}</Label>
          <Textarea {...register('specialNeeds')} rows={2} />
        </div>
        <Input placeholder={t('childEnrollment.step2.pedName')} {...register('pediatricianName')} />
        <Input placeholder={t('childEnrollment.step2.pedPhone')} {...register('pediatricianPhone')} />
        <Input placeholder={t('childEnrollment.step2.pedClinic')} className="md:col-span-2" {...register('pediatricianClinic')} />
      </div>
    </div>
  );
}

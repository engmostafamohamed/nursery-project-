import { useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import {
  DAILY_ROUTINE_YES_NO_FIELDS,
  diaperSupplyOptions,
  genderOptions,
  napDurationOptions,
  pickupAuthorizationOptions,
  referralSourceOptions,
  schoolPreferenceOptions,
  toiletTrainingOptions,
  withEmptyOption,
  yesNoOptions,
} from '@/lib/admissions/applicationFormOptions';
import { MEDICATION_CONSENT_OPTIONS } from '@/lib/admissions/medicationConsentOptions';
import { ALLERGY_OPTIONS, OTHER_ALLERGY_VALUE, allergyLabel } from '@/lib/allergies';
import { nationalityOptions } from '@/lib/nationalities';
import { childDateOfBirthBounds } from '@/lib/onboardingDateBounds';
import { cn } from '@/lib/utils';

import { FieldErrorText, FormField } from './ApplicationField';
import { FieldValidationContext } from './fieldValidation';
import { PanelHeader } from './ApplicationPanelHeader';
import { StyledSelect } from './ApplicationSelect';
import {
  digitsOnly,
  nationalIdInputProps,
  phoneInputProps,
  type ParentApplicationChildForm,
  type ParentApplicationParentForm,
} from './applicationForm';
import { nestedCardClassName, stepCardClassName, textareaClassName } from './applicationStyles';

type Props = {
  /** 1–9: the parents, the family, the child, the school plan, health, emergency contacts, the daily routine, pickups, medication consents. */
  step: number;
  parentForm: ParentApplicationParentForm;
  childForm: ParentApplicationChildForm;
  setParentField: <K extends keyof ParentApplicationParentForm>(field: K, value: ParentApplicationParentForm[K]) => void;
  setChildField: <K extends keyof ParentApplicationChildForm>(field: K, value: ParentApplicationChildForm[K]) => void;
  /** The steps' names, in order (step n is labels[n - 1]). */
  labels: string[];
  disabled?: boolean;
};

/**
 * The application's information steps, the same for the family applying and the admin adding a
 * child. Field errors come from FieldValidationContext.
 */
export function ApplicationInfoStep({ step, parentForm, childForm, setParentField, setChildField, labels, disabled = false }: Props) {
  const { t, i18n } = useTranslation();
  const validation = useContext(FieldValidationContext);
  const childDobBounds = childDateOfBirthBounds();
  const childNationalityOptions = useMemo(() => {
    const options = nationalityOptions(i18n.language.startsWith('ar'));
    // Older applications stored nationality as free text; keep that value selectable so it still shows.
    const current = childForm.nationality.trim();
    return current && !options.some((option) => option.value === current)
      ? [{ value: current, label: current }, ...options]
      : options;
  }, [childForm.nationality, i18n.language]);

  return (
    <>
    {step === 1 ? (
      <fieldset disabled={disabled} className={stepCardClassName(1)}>
        <PanelHeader icon="account_circle" title={labels[0]} />
        <div className="grid gap-4">
          <div className={cn(nestedCardClassName, 'grid gap-4 md:grid-cols-2')}>
            <h3 className="md:col-span-2 text-sm font-semibold text-on-surface">{t('signup.fatherInfo', { defaultValue: 'Father information' })}</h3>
            <FormField name="father_full_name" label={t('signup.fatherFullName')}><Input placeholder={t('signup.examples.fatherFullName')} value={parentForm.father_full_name} onChange={(e) => setParentField('father_full_name', e.target.value)} /></FormField>
            <FormField label={t('signup.fatherJob')}><Input placeholder={t('signup.examples.fatherJob')} value={parentForm.father_job} onChange={(e) => setParentField('father_job', e.target.value)} /></FormField>
            <FormField name="father_mobile" label={t('signup.fatherMobile')}><Input {...phoneInputProps} placeholder={t('signup.examples.mobile')} value={parentForm.father_mobile} onChange={(e) => setParentField('father_mobile', digitsOnly(e.target.value))} /></FormField>
            <FormField name="father_email" label={t('signup.fatherEmail')}><Input type="email" placeholder={t('signup.examples.email')} value={parentForm.father_email} onChange={(e) => setParentField('father_email', e.target.value)} /></FormField>
            <FormField name="father_national_id" label={t('applications.nationalId', { defaultValue: 'National ID' })} className="md:col-span-2"><Input {...nationalIdInputProps} placeholder={t('signup.examples.nationalId')} value={parentForm.father_national_id} onChange={(e) => setParentField('father_national_id', digitsOnly(e.target.value))} /></FormField>
          </div>
          <div className={cn(nestedCardClassName, 'grid gap-4 md:grid-cols-2')}>
            <h3 className="md:col-span-2 text-sm font-semibold text-on-surface">{t('signup.motherInfo', { defaultValue: 'Mother information' })}</h3>
            <FormField name="mother_full_name" label={t('signup.motherFullName')}><Input placeholder={t('signup.examples.motherFullName')} value={parentForm.mother_full_name} onChange={(e) => setParentField('mother_full_name', e.target.value)} /></FormField>
            <FormField label={t('signup.motherJob')}><Input placeholder={t('signup.examples.motherJob')} value={parentForm.mother_job} onChange={(e) => setParentField('mother_job', e.target.value)} /></FormField>
            <FormField name="mother_mobile" label={t('signup.motherMobile')}><Input {...phoneInputProps} placeholder={t('signup.examples.mobile')} value={parentForm.mother_mobile} onChange={(e) => setParentField('mother_mobile', digitsOnly(e.target.value))} /></FormField>
            <FormField name="mother_email" label={t('signup.motherEmail')}><Input type="email" placeholder={t('signup.examples.email')} value={parentForm.mother_email} onChange={(e) => setParentField('mother_email', e.target.value)} /></FormField>
            <FormField name="mother_national_id" label={t('applications.nationalId', { defaultValue: 'National ID' })} className="md:col-span-2"><Input {...nationalIdInputProps} placeholder={t('signup.examples.nationalId')} value={parentForm.mother_national_id} onChange={(e) => setParentField('mother_national_id', digitsOnly(e.target.value))} /></FormField>
          </div>
        </div>
      </fieldset>
    ) : null}

    {step === 2 ? (
      <fieldset disabled={disabled} className={stepCardClassName(2)}>
        <PanelHeader icon="home" title={labels[1]} />
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label={t('signup.maritalStatus')}><Input placeholder={t('signup.examples.maritalStatus')} value={parentForm.marital_status} onChange={(e) => setParentField('marital_status', e.target.value)} /></FormField>
          <FormField name="address" label={t('applications.address')}><Input placeholder={t('signup.examples.address')} value={parentForm.address} onChange={(e) => setParentField('address', e.target.value)} /></FormField>
          <FormField name="emergency_contact" label={t('applications.emergencyContact')} className="md:col-span-2"><Input placeholder={t('signup.examples.emergencyContact')} value={parentForm.emergency_contact} onChange={(e) => setParentField('emergency_contact', e.target.value)} /></FormField>
          <div className="flex items-center gap-2 md:col-span-2">
            <input type="checkbox" checked={childForm.has_siblings} onChange={(e) => setChildField('has_siblings', e.target.checked)} />
            <Label>{t('signup.hasSiblings', { defaultValue: 'Has siblings' })}</Label>
          </div>
          {childForm.has_siblings ? (
            <FormField name="sibling_ages" label={t('signup.siblingAges')} className="md:col-span-2"><Input placeholder={t('signup.siblingAgesHint')} value={childForm.sibling_ages} onChange={(e) => setChildField('sibling_ages', e.target.value)} /></FormField>
          ) : null}
        </div>
      </fieldset>
    ) : null}

    {step === 3 ? (
      <fieldset disabled={disabled} className={stepCardClassName(3)}>
        <PanelHeader icon="child_care" title={labels[2]} body={t('applications.newChildInfoHint', { defaultValue: 'Parent and family data is already copied. Add the new child details here.' })} />
        <div className="grid gap-4 md:grid-cols-2">
          <FormField name="first_name" label={t('signup.childFirstName')}><Input placeholder={t('signup.examples.childFirstName')} value={childForm.first_name} onChange={(e) => setChildField('first_name', e.target.value)} /></FormField>
          <FormField name="middle_name" label={t('signup.childMiddleName')}><Input placeholder={t('signup.examples.childMiddleName')} value={childForm.middle_name} onChange={(e) => setChildField('middle_name', e.target.value)} /></FormField>
          <FormField name="last_name" label={t('signup.childLastName')}><Input placeholder={t('signup.examples.childLastName')} value={childForm.last_name} onChange={(e) => setChildField('last_name', e.target.value)} /></FormField>
          <FormField name="nickname" label={t('signup.childNickname')}><Input placeholder={t('signup.examples.childNickname')} value={childForm.nickname} onChange={(e) => setChildField('nickname', e.target.value)} /></FormField>
          <FormField name="dob" label={t('applications.childDob')} hint={t('signup.childAgeRange')}><Input type="date" min={childDobBounds.min} max={childDobBounds.max} value={childForm.dob} onChange={(e) => setChildField('dob', e.target.value)} /></FormField>
          <FormField label={t('applications.gender')}>
            <StyledSelect
              value={childForm.gender}
              onChange={(value) => setChildField('gender', value)}
              options={withEmptyOption(t, genderOptions(t))}
            />
          </FormField>
          <FormField name="nationality" label={t('signup.childNationality')} className="md:col-span-2">
            <SearchableSelect
              name="nationality"
              value={childForm.nationality}
              onChange={(value) => setChildField('nationality', value)}
              options={childNationalityOptions}
              searchPlaceholder={t('signup.nationalitySearch')}
            />
          </FormField>
        </div>
      </fieldset>
    ) : null}

    {step === 4 ? (
      <fieldset disabled={disabled} className={stepCardClassName(4)}>
        <PanelHeader icon="school" title={labels[3]} />
        <div className="grid gap-5 md:grid-cols-2">
          <FormField label={t('signup.department')}><Input placeholder={t('signup.examples.department')} value={childForm.department} onChange={(e) => setChildField('department', e.target.value)} /></FormField>
          <FormField label={t('signup.schoolPreference')}>
            <StyledSelect
              value={childForm.school_preference}
              onChange={(value) => setChildField('school_preference', value)}
              options={withEmptyOption(t, schoolPreferenceOptions(t))}
            />
          </FormField>
          <FormField label={t('signup.schoolAdmissionsPlan')}><Input placeholder={t('signup.examples.schoolAdmissionsPlan')} value={childForm.school_admissions_plan} onChange={(e) => setChildField('school_admissions_plan', e.target.value)} /></FormField>
          <FormField label={t('signup.academicYear')}><Input placeholder={t('signup.examples.academicYear')} value={childForm.academic_year} onChange={(e) => setChildField('academic_year', e.target.value)} /></FormField>
          <FormField label={t('signup.referralSource')}>
            <StyledSelect
              value={parentForm.referral_source}
              onChange={(value) => setParentField('referral_source', value)}
              options={withEmptyOption(t, referralSourceOptions(t))}
            />
          </FormField>
        </div>
      </fieldset>
    ) : null}

    {step === 5 ? (
      <fieldset disabled={disabled} className={stepCardClassName(5)}>
        <PanelHeader icon="health_and_safety" title={labels[4]} />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-outline-variant bg-surface p-4 lg:col-span-2">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={childForm.has_allergy}
                onChange={(e) => {
                  setChildField('has_allergy', e.target.checked);
                  if (!e.target.checked) {
                    setChildField('allergy_types', []);
                    setChildField('allergy_details', '');
                    setChildField('allergies', '');
                  }
                }}
              />
              {t('signup.hasAllergy')}
            </label>
            {childForm.has_allergy ? (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ALLERGY_OPTIONS.map((option) => {
                    const checked = childForm.allergy_types.includes(option.value);
                    return (
                      <label key={option.value} className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            setChildField(
                              'allergy_types',
                              event.target.checked
                                ? [...childForm.allergy_types, option.value]
                                : childForm.allergy_types.filter((value) => value !== option.value),
                            );
                          }}
                        />
                        {allergyLabel(option.value, false)}
                      </label>
                    );
                  })}
                </div>
                <FieldErrorText error={validation?.errorFor('allergy_types')} />
                {childForm.allergy_types.includes(OTHER_ALLERGY_VALUE) ? (
                  <FormField name="allergy_details" label={t('signup.allergyDetails')}><Input placeholder={t('signup.examples.allergyDetails')} value={childForm.allergy_details} onChange={(e) => setChildField('allergy_details', e.target.value)} /></FormField>
                ) : null}
                <FormField label={t('applications.allergies')}><textarea className={textareaClassName} placeholder={t('signup.examples.allergyDetails')} value={childForm.allergies} onChange={(e) => setChildField('allergies', e.target.value)} /></FormField>
              </>
            ) : null}
          </div>
          <div className="space-y-3 rounded-xl border border-outline-variant bg-surface p-4 lg:col-span-2">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={childForm.has_medical_condition}
                onChange={(e) => {
                  setChildField('has_medical_condition', e.target.checked);
                  if (!e.target.checked) setChildField('medical_conditions', '');
                }}
              />
              {t('signup.hasMedicalCondition')}
            </label>
            {childForm.has_medical_condition ? (
              <FormField name="medical_conditions" label={t('applications.medicalConditions')}><textarea className={textareaClassName} placeholder={t('signup.examples.medicalCondition')} value={childForm.medical_conditions} onChange={(e) => setChildField('medical_conditions', e.target.value)} /></FormField>
            ) : null}
          </div>
          <FormField label={t('applications.specialNeeds')} className="lg:col-span-2"><textarea className={textareaClassName} placeholder={t('signup.examples.specialNeeds')} value={childForm.special_needs} onChange={(e) => setChildField('special_needs', e.target.value)} /></FormField>
          <label className="flex items-center gap-2 text-sm lg:col-span-2"><input type="checkbox" checked={childForm.photo_privacy} onChange={(e) => setChildField('photo_privacy', e.target.checked)} />{t('applications.photoPrivacyConsent')}</label>
        </div>
      </fieldset>
    ) : null}

    {step === 6 ? (
      <fieldset disabled={disabled} className={stepCardClassName(6)}>
        <PanelHeader icon="emergency" title={labels[5]} />
        <div className="grid gap-4">
          <div className={cn(nestedCardClassName, 'grid gap-4 md:grid-cols-2')}>
            <FormField name="emergency_1_name" label={`${t('signup.contactName')} 1`}><Input placeholder={t('signup.examples.personName')} value={childForm.emergency_1_name} onChange={(e) => setChildField('emergency_1_name', e.target.value)} /></FormField>
            <FormField name="emergency_1_phone" label={t('signup.contactPhone')}><Input {...phoneInputProps} placeholder={t('signup.examples.mobile')} value={childForm.emergency_1_phone} onChange={(e) => setChildField('emergency_1_phone', digitsOnly(e.target.value))} /></FormField>
            <FormField name="emergency_1_relationship" label={t('signup.contactRelationship')} className="md:col-span-2"><Input placeholder={t('signup.examples.relationship')} value={childForm.emergency_1_relationship} onChange={(e) => setChildField('emergency_1_relationship', e.target.value)} /></FormField>
          </div>
          <div className={cn(nestedCardClassName, 'grid gap-4 md:grid-cols-2')}>
            <FormField name="emergency_2_name" label={`${t('signup.contactName')} 2`}><Input placeholder={t('signup.examples.personName')} value={childForm.emergency_2_name} onChange={(e) => setChildField('emergency_2_name', e.target.value)} /></FormField>
            <FormField name="emergency_2_phone" label={t('signup.contactPhone')}><Input {...phoneInputProps} placeholder={t('signup.examples.mobile')} value={childForm.emergency_2_phone} onChange={(e) => setChildField('emergency_2_phone', digitsOnly(e.target.value))} /></FormField>
            <FormField name="emergency_2_relationship" label={t('signup.contactRelationship')} className="md:col-span-2"><Input placeholder={t('signup.examples.relationship')} value={childForm.emergency_2_relationship} onChange={(e) => setChildField('emergency_2_relationship', e.target.value)} /></FormField>
          </div>
        </div>
      </fieldset>
    ) : null}

    {step === 7 ? (
      <fieldset disabled={disabled} className={stepCardClassName(7)}>
        <PanelHeader icon="restaurant" title={labels[6]} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <FormField label={t('signup.arrivalTime')}><Input type="time" value={childForm.arrival_time} onChange={(e) => setChildField('arrival_time', e.target.value)} /></FormField>
          {DAILY_ROUTINE_YES_NO_FIELDS.map(([field, labelKey]) => (
            <FormField key={field} label={t(labelKey)}>
              <StyledSelect
                value={childForm[field]}
                onChange={(value) => setChildField(field, value)}
                options={withEmptyOption(t, yesNoOptions(t))}
              />
            </FormField>
          ))}
          {childForm.sends_vitamins === 'Yes' ? (
            <FormField label={t('signup.vitaminDetails')}><Input placeholder={t('signup.vitaminDetailsHint')} value={childForm.vitamin_details} onChange={(e) => setChildField('vitamin_details', e.target.value)} /></FormField>
          ) : null}
          <FormField label={t('signup.diaperSupplyMethod')}>
            <StyledSelect
              value={childForm.diaper_supply_method}
              onChange={(value) => setChildField('diaper_supply_method', value)}
              options={withEmptyOption(t, diaperSupplyOptions(t))}
            />
          </FormField>
          <FormField label={t('signup.dailyDiaperCount')}><Input type="number" placeholder={t('signup.examples.dailyDiaperCount')} value={childForm.daily_diaper_count} onChange={(e) => setChildField('daily_diaper_count', e.target.value)} /></FormField>
          <FormField label={t('signup.rashCreamUsage')}><Input placeholder={t('signup.examples.rashCreamUsage')} value={childForm.rash_cream_usage} onChange={(e) => setChildField('rash_cream_usage', e.target.value)} /></FormField>
          <FormField label={t('signup.diaperChangeFrequency')}><Input placeholder={t('signup.examples.diaperChangeFrequency')} value={childForm.diaper_change_frequency} onChange={(e) => setChildField('diaper_change_frequency', e.target.value)} /></FormField>
          <FormField label={t('signup.toiletTrainingStatus')}>
            <StyledSelect
              value={childForm.toilet_training_status}
              onChange={(value) => setChildField('toilet_training_status', value)}
              options={withEmptyOption(t, toiletTrainingOptions(t))}
            />
          </FormField>
          <FormField name="nap_time_preference" label={t('signup.napTimePreference')}>
            <StyledSelect
              value={childForm.nap_time_preference}
              onChange={(value) => {
                setChildField('nap_time_preference', value);
                if (value !== 'Yes') setChildField('max_nap_time', '');
              }}
              options={withEmptyOption(t, yesNoOptions(t))}
            />
          </FormField>
          {childForm.nap_time_preference === 'Yes' ? (
            <FormField name="max_nap_time" label={t('signup.maxNapTime')}>
              <StyledSelect
                value={childForm.max_nap_time}
                onChange={(value) => setChildField('max_nap_time', value)}
                options={withEmptyOption(t, napDurationOptions(t))}
              />
            </FormField>
          ) : null}
        </div>
      </fieldset>
    ) : null}

    {step === 8 ? (
      <fieldset disabled={disabled} className={stepCardClassName(8)}>
        <PanelHeader icon="directions_car" title={labels[7]} />
        <div className="grid gap-4 xl:grid-cols-2">
          <div className={cn(nestedCardClassName, 'grid gap-4 md:grid-cols-2')}>
            <FormField name="pickup_1_name" label={`${t('signup.pickupName')} 1`}><Input placeholder={t('signup.examples.personName')} value={parentForm.pickup_1_name} onChange={(e) => setParentField('pickup_1_name', e.target.value)} /></FormField>
            <FormField name="pickup_1_phone" label={t('signup.pickupPhone')}><Input {...phoneInputProps} placeholder={t('signup.examples.mobile')} value={parentForm.pickup_1_phone} onChange={(e) => setParentField('pickup_1_phone', digitsOnly(e.target.value))} /></FormField>
            <FormField label={t('signup.pickupRelation')}><Input placeholder={t('signup.examples.pickupRelation')} value={parentForm.pickup_1_relation} onChange={(e) => setParentField('pickup_1_relation', e.target.value)} /></FormField>
            <FormField label={t('signup.pickupAuthorization')}>
              <StyledSelect
                value={parentForm.pickup_1_authorization}
                onChange={(value) => setParentField('pickup_1_authorization', value)}
                options={pickupAuthorizationOptions(t)}
              />
            </FormField>
          </div>
          <div className={cn(nestedCardClassName, 'grid gap-4 md:grid-cols-2')}>
            <FormField name="pickup_2_name" label={`${t('signup.pickupName')} 2`}><Input placeholder={t('signup.examples.personName')} value={parentForm.pickup_2_name} onChange={(e) => setParentField('pickup_2_name', e.target.value)} /></FormField>
            <FormField name="pickup_2_phone" label={t('signup.pickupPhone')}><Input {...phoneInputProps} placeholder={t('signup.examples.mobile')} value={parentForm.pickup_2_phone} onChange={(e) => setParentField('pickup_2_phone', digitsOnly(e.target.value))} /></FormField>
            <FormField label={t('signup.pickupRelation')}><Input placeholder={t('signup.examples.pickupRelation')} value={parentForm.pickup_2_relation} onChange={(e) => setParentField('pickup_2_relation', e.target.value)} /></FormField>
            <FormField label={t('signup.pickupAuthorization')}>
              <StyledSelect
                value={parentForm.pickup_2_authorization}
                onChange={(value) => setParentField('pickup_2_authorization', value)}
                options={pickupAuthorizationOptions(t)}
              />
            </FormField>
          </div>
        </div>
      </fieldset>
    ) : null}

    {step === 9 ? (
      <fieldset disabled={disabled} className={stepCardClassName(9)}>
        <PanelHeader
          icon="medication"
          title={labels[8]}
          body={t('signup.medicationConsents.description', {
            defaultValue: 'Select the emergency medication permissions that apply to this child.',
          })}
        />
        <div className="flex items-center justify-between rounded-xl bg-primary/5 px-4 py-2 text-xs">
          <span className="text-on-surface-variant">
            {t('signup.medicationConsents.selectedCount', {
              count: childForm.medication_consents.length,
              total: MEDICATION_CONSENT_OPTIONS.length,
            })}
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => setChildField('medication_consents', MEDICATION_CONSENT_OPTIONS.map((option) => option.id))}
            >
              {t('signup.medicationConsents.selectAll')}
            </button>
            <button
              type="button"
              className="font-medium text-on-surface-variant hover:underline"
              onClick={() => setChildField('medication_consents', [])}
            >
              {t('signup.medicationConsents.clearAll')}
            </button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {MEDICATION_CONSENT_OPTIONS.map((option) => {
            const checked = childForm.medication_consents.includes(option.id);
            return (
              <label
                key={option.id}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                  checked
                    ? 'border-primary bg-primary/5'
                    : 'border-outline-variant bg-surface hover:border-primary/50',
                )}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked}
                  onChange={(event) => {
                    setChildField(
                      'medication_consents',
                      event.target.checked
                        ? [...childForm.medication_consents, option.id]
                        : childForm.medication_consents.filter((id) => id !== option.id),
                    );
                  }}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-on-surface">{option.labelEn}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-on-surface-variant">{option.descriptionEn}</span>
                </span>
              </label>
            );
          })}
        </div>
        <div className="rounded-xl bg-surface-container px-4 py-3 text-xs text-on-surface-variant">
          {t('signup.medicationConsents.disclaimer')}
        </div>
      </fieldset>
    ) : null}
    </>
  );
}

import type { ApplicationReviewSection } from '@/components/parent/ApplicationReviewSummary';
import {
  DAILY_ROUTINE_YES_NO_FIELDS,
  diaperSupplyOptions,
  genderOptions,
  napDurationOptions,
  optionLabel,
  pickupAuthorizationOptions,
  referralSourceOptions,
  schoolPreferenceOptions,
  toiletTrainingOptions,
  yesNoOptions,
  type FormOption,
} from '@/lib/admissions/applicationFormOptions';
import { MEDICATION_CONSENT_OPTIONS } from '@/lib/admissions/medicationConsentOptions';
import { allergyLabel, OTHER_ALLERGY_VALUE } from '@/lib/allergies';
import { formatDate } from '@/lib/datetime';

import {
  applicationDocumentTypes,
  applicationStepIcons,
  DOCUMENTS_STEP,
  hasDocumentFile,
  requiredDocs,
  type ParentApplicationChildForm,
  type ParentApplicationParentForm,
} from './applicationForm';

export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Every answer of the application, grouped by step, as the review step shows it. */
export function applicationReviewSections({
  parentForm,
  childForm,
  latestDocs,
  stepLabels,
  nationalities,
  isArabic,
  t,
}: {
  parentForm: ParentApplicationParentForm;
  childForm: ParentApplicationChildForm;
  latestDocs: Record<string, Record<string, unknown>>;
  stepLabels: string[];
  nationalities: FormOption[];
  isArabic: boolean;
  t: Translate;
}): ApplicationReviewSection[] {
  const yesNo = (value: boolean) => (value ? t('common.yes', { defaultValue: 'Yes' }) : t('common.no', { defaultValue: 'No' }));
  const choice = (options: FormOption[], value: string) => (value ? optionLabel(options, value) : null);
  const yesNoChoices = yesNoOptions(t);
  const section = (step: number, groups: ApplicationReviewSection['groups']): ApplicationReviewSection => ({
    step,
    title: stepLabels[step - 1],
    icon: applicationStepIcons[step - 1],
    groups,
  });
  const parentRows = (prefix: 'father' | 'mother') => [
    { label: t(`signup.${prefix}FullName`), value: parentForm[`${prefix}_full_name`] },
    { label: t(`signup.${prefix}Job`), value: parentForm[`${prefix}_job`] },
    { label: t(`signup.${prefix}Mobile`), value: parentForm[`${prefix}_mobile`] },
    { label: t(`signup.${prefix}Email`), value: parentForm[`${prefix}_email`] },
    { label: t('applications.nationalId', { defaultValue: 'National ID' }), value: parentForm[`${prefix}_national_id`] },
  ];
  const contactRows = (n: 1 | 2) => [
    { label: t('signup.contactName'), value: childForm[`emergency_${n}_name`] },
    { label: t('signup.contactPhone'), value: childForm[`emergency_${n}_phone`] },
    { label: t('signup.contactRelationship'), value: childForm[`emergency_${n}_relationship`] },
  ];
  const pickupRows = (n: 1 | 2) => [
    { label: t('signup.pickupName'), value: parentForm[`pickup_${n}_name`] },
    { label: t('signup.pickupPhone'), value: parentForm[`pickup_${n}_phone`] },
    { label: t('signup.pickupRelation'), value: parentForm[`pickup_${n}_relation`] },
    { label: t('signup.pickupAuthorization'), value: choice(pickupAuthorizationOptions(t), parentForm[`pickup_${n}_authorization`]) },
  ];
  const consents = MEDICATION_CONSENT_OPTIONS.filter((option) => childForm.medication_consents.includes(option.id));

  return [
    section(1, [
      { title: t('signup.fatherInfo', { defaultValue: 'Father information' }), rows: parentRows('father') },
      { title: t('signup.motherInfo', { defaultValue: 'Mother information' }), rows: parentRows('mother') },
    ]),
    section(2, [{
      rows: [
        { label: t('signup.maritalStatus'), value: parentForm.marital_status },
        { label: t('applications.address'), value: parentForm.address },
        { label: t('applications.emergencyContact'), value: parentForm.emergency_contact },
        { label: t('signup.hasSiblings', { defaultValue: 'Has siblings' }), value: yesNo(childForm.has_siblings) },
        ...(childForm.has_siblings ? [{ label: t('signup.siblingAges'), value: childForm.sibling_ages }] : []),
      ],
    }]),
    section(3, [{
      rows: [
        { label: t('signup.childFirstName'), value: childForm.first_name },
        { label: t('signup.childMiddleName'), value: childForm.middle_name },
        { label: t('signup.childLastName'), value: childForm.last_name },
        { label: t('signup.childNickname'), value: childForm.nickname },
        { label: t('applications.childDob'), value: childForm.dob ? formatDate(childForm.dob) : null },
        { label: t('applications.gender'), value: choice(genderOptions(t), childForm.gender) },
        { label: t('signup.childNationality'), value: choice(nationalities, childForm.nationality) },
      ],
    }]),
    section(4, [{
      rows: [
        { label: t('signup.department'), value: childForm.department },
        { label: t('signup.schoolPreference'), value: choice(schoolPreferenceOptions(t), childForm.school_preference) },
        { label: t('signup.schoolAdmissionsPlan'), value: childForm.school_admissions_plan },
        { label: t('signup.academicYear'), value: childForm.academic_year },
        { label: t('signup.referralSource'), value: choice(referralSourceOptions(t), parentForm.referral_source) },
      ],
    }]),
    section(5, [{
      rows: [
        { label: t('signup.hasAllergy'), value: yesNo(childForm.has_allergy) },
        ...(childForm.has_allergy
          ? [
              {
                label: t('signup.allergyTypes'),
                value: childForm.allergy_types.map((value) => allergyLabel(value, isArabic)).join(isArabic ? '، ' : ', '),
              },
              ...(childForm.allergy_types.includes(OTHER_ALLERGY_VALUE)
                ? [{ label: t('signup.allergyDetails'), value: childForm.allergy_details }]
                : []),
              { label: t('applications.allergies'), value: childForm.allergies },
            ]
          : []),
        { label: t('signup.hasMedicalCondition'), value: yesNo(childForm.has_medical_condition) },
        ...(childForm.has_medical_condition
          ? [{ label: t('applications.medicalConditions'), value: childForm.medical_conditions }]
          : []),
        { label: t('applications.specialNeeds'), value: childForm.special_needs },
        { label: t('applications.photoPrivacyConsent'), value: yesNo(childForm.photo_privacy) },
      ],
    }]),
    section(6, [
      { title: t('applications.review.contactN', { n: 1 }), rows: contactRows(1) },
      { title: t('applications.review.contactN', { n: 2 }), rows: contactRows(2) },
    ]),
    section(7, [{
      rows: [
        { label: t('signup.arrivalTime'), value: childForm.arrival_time },
        ...DAILY_ROUTINE_YES_NO_FIELDS.map(([field, labelKey]) => ({ label: t(labelKey), value: choice(yesNoChoices, childForm[field]) })),
        ...(childForm.sends_vitamins === 'Yes' ? [{ label: t('signup.vitaminDetails'), value: childForm.vitamin_details }] : []),
        { label: t('signup.diaperSupplyMethod'), value: choice(diaperSupplyOptions(t), childForm.diaper_supply_method) },
        { label: t('signup.dailyDiaperCount'), value: childForm.daily_diaper_count },
        { label: t('signup.rashCreamUsage'), value: childForm.rash_cream_usage },
        { label: t('signup.diaperChangeFrequency'), value: childForm.diaper_change_frequency },
        { label: t('signup.toiletTrainingStatus'), value: choice(toiletTrainingOptions(t), childForm.toilet_training_status) },
        { label: t('signup.napTimePreference'), value: choice(yesNoChoices, childForm.nap_time_preference) },
        ...(childForm.nap_time_preference === 'Yes'
          ? [{ label: t('signup.maxNapTime'), value: choice(napDurationOptions(t), childForm.max_nap_time) }]
          : []),
      ],
    }]),
    section(8, [
      { title: t('applications.review.pickupN', { n: 1 }), rows: pickupRows(1) },
      { title: t('applications.review.pickupN', { n: 2 }), rows: pickupRows(2) },
    ]),
    section(9, [{
      chips: consents.map((option) => (isArabic ? option.labelAr : option.labelEn)),
      emptyText: t('applications.review.noneSelected'),
    }]),
    section(DOCUMENTS_STEP, [{
      rows: applicationDocumentTypes.map((docType) => {
        const uploaded = hasDocumentFile(latestDocs[docType]);
        const required = requiredDocs.some((requiredDoc) => requiredDoc === docType);
        return {
          label: t(`applications.documentTypes.${docType}`),
          value: uploaded
            ? t('applications.review.documentUploaded')
            : required
              ? t('applications.review.documentMissing')
              : t('applications.review.documentNotUploaded'),
          tone: uploaded ? 'success' as const : required ? 'warning' as const : 'muted' as const,
        };
      }),
    }]),
  ];
}

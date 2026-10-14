import { NAP_DURATION_VALUES } from '@/features/parent-signup/parentSignUpValidation';

/**
 * Choices offered by the parent application form. The form's selects and the review summary
 * both read them, so a stored value always shows with the same label.
 */

type Translate = (key: string, options?: Record<string, unknown>) => string;

export type FormOption = { value: string; label: string };

export function genderOptions(t: Translate): FormOption[] {
  return [
    { value: 'male', label: t('common.genderMale', { defaultValue: 'Male' }) },
    { value: 'female', label: t('common.genderFemale', { defaultValue: 'Female' }) },
  ];
}

export function schoolPreferenceOptions(t: Translate): FormOption[] {
  return [
    { value: 'british', label: t('signup.schoolBritish', { defaultValue: 'British' }) },
    { value: 'american', label: t('signup.schoolAmerican', { defaultValue: 'American' }) },
    { value: 'national', label: t('signup.schoolNational', { defaultValue: 'National' }) },
    { value: 'ib', label: t('signup.schoolIb', { defaultValue: 'IB' }) },
    { value: 'french', label: t('signup.schoolFrench', { defaultValue: 'French' }) },
    { value: 'canadian', label: t('signup.schoolCanadian', { defaultValue: 'Canadian' }) },
    { value: 'other', label: t('signup.schoolOther', { defaultValue: 'Other' }) },
  ];
}

export function referralSourceOptions(t: Translate): FormOption[] {
  return [
    { value: 'social_media', label: t('signup.refSocialMedia') },
    { value: 'tiktok', label: t('signup.refTikTok') },
    { value: 'friend', label: t('signup.refFriend') },
    { value: 'website', label: t('signup.refWebsite') },
    { value: 'walkIn', label: t('signup.refWalkIn') },
    { value: 'other', label: t('signup.refOther') },
  ];
}

/** Daily-routine answers are stored as 'Yes' / 'No'. */
export function yesNoOptions(t: Translate): FormOption[] {
  return [
    { value: 'Yes', label: t('common.yes', { defaultValue: 'Yes' }) },
    { value: 'No', label: t('common.no', { defaultValue: 'No' }) },
  ];
}

export function diaperSupplyOptions(t: Translate): FormOption[] {
  return [
    { value: 'Stock', label: t('signup.stock') },
    { value: 'On daily basis', label: t('signup.daily') },
  ];
}

export function toiletTrainingOptions(t: Translate): FormOption[] {
  return [
    { value: 'not_started', label: t('signup.notStarted') },
    { value: 'in_progress', label: t('signup.inProgress') },
    { value: 'completed', label: t('signup.completed') },
  ];
}

export function pickupAuthorizationOptions(t: Translate): FormOption[] {
  return [
    { value: 'anytime', label: t('signup.anytime', { defaultValue: 'Anytime' }) },
    { value: 'scheduled', label: t('signup.scheduled', { defaultValue: 'Scheduled' }) },
    { value: 'emergency_only', label: t('signup.emergencyOnly', { defaultValue: 'Emergency only' }) },
  ];
}

export function napDurationOptions(t: Translate): FormOption[] {
  return NAP_DURATION_VALUES.map((value) => ({
    value,
    label: value === '1' ? t('signup.napDurationOneHour') : t('signup.napDurationHours', { hours: value }),
  }));
}

/** Puts the "Select…" placeholder first, for a select that may be left empty. */
export function withEmptyOption(t: Translate, options: FormOption[]): FormOption[] {
  return [{ value: '', label: t('common.select') }, ...options];
}

/** The label shown for a stored value; an unknown value (older free text) shows as stored. */
export function optionLabel(options: FormOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

/** The daily-routine yes/no questions: form field and label key. */
export const DAILY_ROUTINE_YES_NO_FIELDS = [
  ['takes_breakfast_at_home', 'signup.takesBreakfastAtHome'],
  ['eats_nursery_meals', 'signup.eatsNurseryMeals'],
  ['extra_meal_preference', 'signup.acceptExtraMeals'],
  ['sends_extra_snacks', 'signup.acceptExtraSnacks'],
  ['water_preference', 'signup.acceptMineralWater'],
  ['sends_vitamins', 'signup.sendsVitamins'],
] as const;

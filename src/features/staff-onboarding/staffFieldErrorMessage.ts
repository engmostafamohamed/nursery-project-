import type { TFunction } from 'i18next';

/** Maps RHF/Zod message values to i18n (handles legacy short keys from superRefine). */
export function translateStaffFieldErrorMessage(t: TFunction, message: string | undefined): string {
  if (!message) return '';
  const m = String(message);
  if (m === 'required') return t('staffOnboarding.validation.required');
  if (m === 'terms') return t('staffOnboarding.validation.termsRequired');
  return t(m);
}

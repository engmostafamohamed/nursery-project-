export type IdentityType = 'national_id' | 'passport' | 'other';

const NATIONAL_ID_DIGITS = 14;
const NATIONAL_ID_NUMBER = /^\d{14}$/;

export const isIdentityType = (value: string | null | undefined): value is IdentityType =>
  value === 'national_id' || value === 'passport' || value === 'other';

/** Only a national ID card has a back side to capture. */
export const needsBackImage = (type: IdentityType) => type === 'national_id';

/** A national ID number is typed as digits only (max 14); passport and other numbers are free text. */
export function normalizeIdentityNumberInput(type: IdentityType, value: string): string {
  return type === 'national_id' ? value.replace(/\D/g, '').slice(0, NATIONAL_ID_DIGITS) : value;
}

export function identityNumberInputProps(type: IdentityType) {
  return type === 'national_id'
    ? { inputMode: 'numeric' as const, maxLength: NATIONAL_ID_DIGITS }
    : { inputMode: 'text' as const, maxLength: 80 };
}

/** i18n key describing what is wrong with an ID number, or null when it is acceptable. */
export function identityNumberErrorKey(type: IdentityType, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'qr.custom.errors.identityNumberRequired';
  if (type === 'national_id' && !NATIONAL_ID_NUMBER.test(trimmed)) return 'qr.custom.errors.nationalIdDigits';
  return null;
}

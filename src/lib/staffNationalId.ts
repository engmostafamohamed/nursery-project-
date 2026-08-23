/** Egyptian national ID: century digit 2 or 3 + 13 digits. */
export const EGYPTIAN_NATIONAL_ID = /^[23][0-9]{13}$/;

export function isValidEgyptianNationalId(raw: string): boolean {
  return EGYPTIAN_NATIONAL_ID.test(raw.replace(/\s/g, ''));
}

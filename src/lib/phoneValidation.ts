/**
 * International mobile (simpler Egypt-centric UX):
 * - + then 8–15 digits (E.164-style), or
 * - 0 then 8–15 more digits (local; stored as +20 + national digits without leading 0).
 */
export function isValidInternationalMobile(input: string): boolean {
  const s = input.replace(/\s/g, '');
  if (!s) return false;
  if (s.startsWith('+')) {
    const digits = s.slice(1).replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15;
  }
  if (s.startsWith('0')) {
    const rest = s.slice(1).replace(/\D/g, '');
    return rest.length >= 8 && rest.length <= 15;
  }
  return false;
}

/**
 * Normalized storage: E.164-style with leading +.
 * - Values starting with + are digit-stripped after +.
 * - Values starting with 0 are treated as local numbers defaulting to Egypt (+20).
 */
export function normalizeInternationalMobile(input: string): string {
  const s = input.replace(/\s/g, '');
  if (!s) return '';
  if (s.startsWith('+')) {
    const digits = s.slice(1).replace(/\D/g, '');
    return digits ? `+${digits}` : '';
  }
  if (s.startsWith('0')) {
    const rest = s.slice(1).replace(/\D/g, '');
    if (!rest) return '';
    return `+20${rest}`;
  }
  return '';
}

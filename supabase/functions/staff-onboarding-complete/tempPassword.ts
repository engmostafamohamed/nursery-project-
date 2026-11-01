/**
 * A newly onboarded staff member's first password: random for each person, shown once to whoever
 * onboarded them, and replaced by the staff member at their first sign-in (must_change_password).
 *
 * Three groups of four, e.g. "kP7m-Qx4t-Hb9w" (about 70 bits): easy to read out or type from a
 * note, with no 0/O, 1/l/I look-alikes, and at least one lower case letter, capital and digit.
 */
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const ALPHABET = LOWER + UPPER + DIGITS;

/** A uniform index below n from the platform's secure random source. */
function randomIndex(n: number): number {
  const limit = Math.floor(0x100000000 / n) * n;
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value);
  while (value[0] >= limit);
  return value[0] % n;
}

export function tempPassword(): string {
  let chars: string;
  do chars = Array.from({ length: 12 }, () => ALPHABET[randomIndex(ALPHABET.length)]).join('');
  while (!/[a-z]/.test(chars) || !/[A-Z]/.test(chars) || !/[2-9]/.test(chars));
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}

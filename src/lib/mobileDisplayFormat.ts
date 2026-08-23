/**
 * Display helper for mobile fields: show spaced groups while storing digits/+ only.
 * Placeholder style: +20 101 234 5678
 */
export function formatMobileDisplayForInput(stored: string): string {
  const s = stored.replace(/\s/g, '');
  if (!s) return '';
  if (!s.startsWith('+')) {
    const d = s.replace(/\D/g, '');
    if (!d.length) return s.startsWith('0') ? '0' : '';
    if (s.startsWith('0')) {
      const rest = d.replace(/^0/, '');
      return `0 ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6, 10)}`.trim();
    }
    return d;
  }
  const digits = s.slice(1).replace(/\D/g, '');
  if (!digits) return '+';
  let out = `+${digits.slice(0, 2)}`;
  if (digits.length > 2) out += ` ${digits.slice(2, 5)}`;
  if (digits.length > 5) out += ` ${digits.slice(5, 8)}`;
  if (digits.length > 8) out += ` ${digits.slice(8, 15)}`;
  return out.trim();
}

/** Normalize to +digits or 0local for validation (spaces stripped). */
export function stripMobileInputDisplay(display: string): string {
  return display.replace(/\s/g, '');
}

/**
 * A money amount for display: thousands separators, and piastres only when there are any
 * (10596 → "10,596", 3532.5 → "3,532.50"). Latin digits in both languages, like the rest of
 * the app's amounts. Wrap it with the currency label, e.g. t('invoice.egpAmount', { amount }).
 */
export function formatMoneyAmount(amount: number): string {
  const rounded = Math.round((Number.isFinite(amount) ? amount : 0) * 100) / 100;
  const whole = Number.isInteger(rounded);
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

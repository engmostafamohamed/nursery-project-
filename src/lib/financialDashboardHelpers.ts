/** Date range presets for the admin financial dashboard (filters + KPI period). */
export type FinancialDashboardPreset = 'this_month' | 'last_month' | 'custom';

export type IsoRange = { from: string; to: string };

const PAYMOB_METHODS = new Set([
  'card',
  'fawry',
  'instapay',
  'vodafone_cash',
  'orange_cash',
  'paymob',
]);

export function bucketPaymentMethod(method: string): 'cash' | 'bank_transfer' | 'paymob' | 'other' {
  const m = (method || '').toLowerCase();
  if (m === 'cash') return 'cash';
  if (m === 'bank_transfer') return 'bank_transfer';
  if (PAYMOB_METHODS.has(m)) return 'paymob';
  return 'other';
}

export function paymentMatchesMethodFilter(
  method: string,
  filter: 'all' | 'cash' | 'bank_transfer' | 'paymob',
): boolean {
  if (filter === 'all') return true;
  return bucketPaymentMethod(method) === filter;
}

/** Aligns with `useFinancialReports` month boundaries (local calendar). */
export function rangeForPreset(
  preset: FinancialDashboardPreset,
  customFrom?: string,
  customTo?: string,
): IsoRange | null {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (preset === 'this_month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(start.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    return { from: start.toISOString(), to: end.toISOString() };
  }

  if (preset === 'last_month') {
    start.setMonth(start.getMonth() - 1, 1);
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime());
    end.setMonth(end.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    return { from: start.toISOString(), to: end.toISOString() };
  }

  if (!customFrom || !customTo) return null;
  return {
    from: `${customFrom}T00:00:00.000`,
    to: `${customTo}T23:59:59.999`,
  };
}

export function previousIsoRange(range: IsoRange): IsoRange {
  const fromMs = new Date(range.from).getTime();
  const toMs = new Date(range.to).getTime();
  const len = Math.max(0, toMs - fromMs);
  const prevToMs = fromMs - 1;
  const prevFromMs = prevToMs - len;
  return { from: new Date(prevFromMs).toISOString(), to: new Date(prevToMs).toISOString() };
}

export function paidOnOrBeforeDueDate(dueDate: string, paidAt: string | null): boolean {
  if (!paidAt) return false;
  const due = dueDate.slice(0, 10);
  const paid = paidAt.slice(0, 10);
  return paid <= due;
}

/** Last 6 calendar months including current, oldest first. Each bucket is full local month. */
export function lastSixMonthBuckets(): IsoRange[] {
  const now = new Date();
  const buckets: IsoRange[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    buckets.push({ from: start.toISOString(), to: end.toISOString() });
  }
  return buckets;
}

export function monthKeyFromRange(range: IsoRange): string {
  return new Date(range.from).toISOString().slice(0, 7);
}

/** Display name from nursery language preference (users table has AR/EN names). */
export function pickParentDisplayName(
  pref: 'ar' | 'en' | 'both',
  ar: string | null,
  en: string | null,
  fallback: string,
): string {
  if (pref === 'en') return en || ar || fallback;
  if (pref === 'ar') return ar || en || fallback;
  return ar || en || fallback;
}

export function csvEscapeCell(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

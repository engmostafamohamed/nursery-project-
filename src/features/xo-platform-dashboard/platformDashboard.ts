import { supabase } from '@/lib/supabase';

/*
 * The XO platform home page's data: one call to get_xo_platform_dashboard (the database adds it all
 * up for the whole platform), plus the small calculations the page draws from it.
 * Days and months are Cairo days; money follows the nursery finance page (collected = completed
 * payments, still owed = open invoices less their completed payments).
 */

export type KeyCount = { key: string | null; count: number };

export type MonthCount = { month: string; count: number };

export type NurseryRow = {
  id: string;
  name_ar: string;
  name_en: string;
  city: string | null;
  subscription_status: string | null;
  subscription_plan: string | null;
  created_at: string;
  active_children: number;
  teachers: number;
  /** Children checked in, and children expected, over the open days of the last 30 days. */
  present_30: number;
  expected_30: number;
  collected_this_month: number;
  outstanding: number;
  overdue_count: number;
};

export type InvoiceStatus = 'paid' | 'pending' | 'overdue';

export type PlatformDashboard = {
  /** Today in Cairo, YYYY-MM-DD. */
  today: string;
  nurseries: {
    total: number;
    active: number;
    trial: number;
    suspended: number;
    new_this_month: number;
    by_status: KeyCount[];
    by_plan: KeyCount[];
    by_city: KeyCount[];
  };
  children: {
    active: number;
    pending: number;
    new_this_month: number;
    new_last_month: number;
    girls: number;
    boys: number;
    /** Whole years of age; 5 means 5 and over. */
    by_age: Array<{ years: number; count: number }>;
    monthly_enrollments: MonthCount[];
  };
  users: { total: number; new_this_month: number; by_role: KeyCount[] };
  finance: {
    collected_this_month: number;
    collected_last_month: number;
    outstanding: number;
    /** Open invoices carry what is still owed; paid ones their amount. */
    by_status: Array<{ status: InvoiceStatus; count: number; amount: number }>;
    /** 1 = up to 30 days late, 2 = 31-60, 3 = 61-90, 4 = over 90. */
    aging: Array<{ band: number; count: number; amount: number }>;
    monthly: Array<{ month: string; billed: number; collected: number }>;
    by_method: Array<{ key: string; count: number; amount: number }>;
  };
  attendance: {
    present: number;
    expected: number;
    daily: Array<{ date: string; present: number; expected: number }>;
  };
  admissions: {
    inquiries: number;
    applications: number;
    approved: number;
    inquiries_new: number;
    applications_pending: number;
  };
  /** Every nursery, most active children first. */
  by_nursery: NurseryRow[];
};

export async function fetchPlatformDashboard(): Promise<PlatformDashboard> {
  const { data, error } = await supabase.rpc('get_xo_platform_dashboard' as never);
  if (error) throw error;
  return data as unknown as PlatformDashboard;
}

/** present out of expected as a percentage with one decimal; null when nobody was expected. */
export function ratePercent(present: number, expected: number): number | null {
  if (!(expected > 0)) return null;
  return Math.round((present / expected) * 1000) / 10;
}

/** All four lateness bands, in order, with the empty ones as zero. */
export function agingBands(aging: PlatformDashboard['finance']['aging']) {
  return [1, 2, 3, 4].map((band) => {
    const row = aging.find((a) => a.band === band);
    return { band, count: row?.count ?? 0, amount: row?.amount ?? 0 };
  });
}

/** Ages 0 to 5+, in order, with the empty ones as zero. */
export function ageBands(byAge: PlatformDashboard['children']['by_age']) {
  return [0, 1, 2, 3, 4, 5].map((years) => ({ years, count: byAge.find((a) => a.years === years)?.count ?? 0 }));
}

export const INVOICE_STATUS_ORDER: InvoiceStatus[] = ['paid', 'pending', 'overdue'];

/** Paid, pending and overdue in that order, each with its share of all invoices (by count). */
export function invoiceStatusParts(byStatus: PlatformDashboard['finance']['by_status']) {
  const total = byStatus.reduce((sum, s) => sum + s.count, 0);
  return INVOICE_STATUS_ORDER.map((status) => {
    const row = byStatus.find((s) => s.status === status);
    const count = row?.count ?? 0;
    return { status, count, amount: row?.amount ?? 0, share: total > 0 ? count / total : 0 };
  });
}

/**
 * The biggest `limit - 1` groups, and the rest folded into one "other" row (key `__other`), so a
 * long tail (many cities, say) stays one readable list.
 */
export function topWithOther(rows: KeyCount[], limit: number): KeyCount[] {
  if (rows.length <= limit) return rows;
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const head = sorted.slice(0, limit - 1);
  const rest = sorted.slice(limit - 1).reduce((sum, r) => sum + r.count, 0);
  return [...head, { key: '__other', count: rest }];
}

/** Children per teacher, one decimal; null for a nursery without teachers. */
export function childrenPerTeacher(row: Pick<NurseryRow, 'active_children' | 'teachers'>): number | null {
  if (!(row.teachers > 0)) return null;
  return Math.round((row.active_children / row.teachers) * 10) / 10;
}

/** The first day of a YYYY-MM month as a local date (for month names). */
export function monthStart(month: string): Date {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1);
}

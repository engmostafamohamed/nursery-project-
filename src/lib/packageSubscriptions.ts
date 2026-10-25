// The packages page's subscriptions card: the totals, each package's numbers, which subscriptions a
// number lists (the same ones it counts) and the table's filters. Plain functions over the rows
// get_package_subscriptions returns.

export type PackageKind = 'tuition' | 'extra_hours';
export type BillingPeriodKind = 'monthly' | 'quarterly' | 'half_annual' | 'annual';
export const BILLING_PERIODS: BillingPeriodKind[] = ['monthly', 'quarterly', 'half_annual', 'annual'];

/** One subscription (get_package_subscriptions). */
export type SubscriptionRow = {
  kind: PackageKind;
  subscription_id: string;
  package_id: string;
  package_name_ar: string | null;
  package_name_en: string | null;
  child_id: string;
  child_name_ar: string | null;
  child_name_en: string | null;
  class_name_ar: string | null;
  class_name_en: string | null;
  parent_id: string | null;
  parent_name_ar: string | null;
  parent_name_en: string | null;
  parent_phone: string | null;
  billing_period: BillingPeriodKind | null;
  duration_months: number | null;
  price: number;
  included_hours: number | null;
  hours_used: number | null;
  status: 'active' | 'cancelled' | 'expired';
  started_on: string | null;
  ended_on: string | null;
  invoiced: boolean;
  invoices: number;
  billed: number;
  paid: number;
  awaiting: number;
  unpaid: number;
  overdue: number;
  next_due_date: string | null;
};

/**
 * Where a subscription's money stands, by its most pressing part: past due, not paid, sent and
 * waiting for the nursery to confirm, paid in full; or no invoice at all, or none in the period.
 */
export type PaymentState = 'overdue' | 'unpaid' | 'awaiting' | 'paid' | 'not_invoiced' | 'nothing_due';
export const PAYMENT_STATES: PaymentState[] = ['paid', 'awaiting', 'unpaid', 'overdue', 'not_invoiced', 'nothing_due'];

const n = (value: number | string | null | undefined) => Number(value ?? 0);

export function paymentState(row: SubscriptionRow): PaymentState {
  if (!row.invoiced) return 'not_invoiced';
  if (n(row.overdue) > 0) return 'overdue';
  if (n(row.unpaid) > 0) return 'unpaid';
  if (n(row.awaiting) > 0) return 'awaiting';
  if (n(row.billed) > 0) return 'paid';
  return 'nothing_due';
}

/** Adds money without floating-point crumbs (amounts have two decimals). */
function sumMoney(rows: SubscriptionRow[], pick: (row: SubscriptionRow) => number | string): number {
  return Math.round(rows.reduce((total, row) => total + n(pick(row)) * 100, 0)) / 100;
}

export type SubscriptionTotals = {
  subscriptions: number;
  active: number;
  children: number;
  parents: number;
  billed: number;
  paid: number;
  awaiting: number;
  unpaid: number;
  overdue: number;
  /** Subscriptions that have never been invoiced. */
  notInvoiced: number;
};

export function summarize(rows: SubscriptionRow[]): SubscriptionTotals {
  return {
    subscriptions: rows.length,
    active: rows.filter((row) => row.status === 'active').length,
    children: new Set(rows.map((row) => row.child_id)).size,
    parents: new Set(rows.map((row) => row.parent_id).filter(Boolean)).size,
    billed: sumMoney(rows, (row) => row.billed),
    paid: sumMoney(rows, (row) => row.paid),
    awaiting: sumMoney(rows, (row) => row.awaiting),
    unpaid: sumMoney(rows, (row) => row.unpaid),
    overdue: sumMoney(rows, (row) => row.overdue),
    notInvoiced: rows.filter((row) => !row.invoiced).length,
  };
}

/** A package of the nursery's catalogue, so packages nobody has taken still show (with 0). */
export type CatalogPackage = { id: string; kind: PackageKind; name_ar: string | null; name_en: string | null; active: boolean };

export type PackageSummary = SubscriptionTotals & {
  packageId: string;
  kind: PackageKind;
  nameAr: string | null;
  nameEn: string | null;
  /** Still offered (a package taken off sale keeps its subscribers). */
  offered: boolean;
};

/** Each package's numbers: the catalogue's packages first (fixed, then extra hours), then any others subscribed to. */
export function byPackage(rows: SubscriptionRow[], catalog: CatalogPackage[]): PackageSummary[] {
  const groups = new Map<string, SubscriptionRow[]>();
  for (const row of rows) groups.set(row.package_id, [...(groups.get(row.package_id) ?? []), row]);
  const summaries: PackageSummary[] = catalog.map((pkg) => ({
    ...summarize(groups.get(pkg.id) ?? []),
    packageId: pkg.id,
    kind: pkg.kind,
    nameAr: pkg.name_ar,
    nameEn: pkg.name_en,
    offered: pkg.active,
  }));
  const known = new Set(catalog.map((pkg) => pkg.id));
  for (const [packageId, packageRows] of groups) {
    if (known.has(packageId)) continue;
    summaries.push({
      ...summarize(packageRows),
      packageId,
      kind: packageRows[0].kind,
      nameAr: packageRows[0].package_name_ar,
      nameEn: packageRows[0].package_name_en,
      offered: false,
    });
  }
  const order: Record<PackageKind, number> = { tuition: 0, extra_hours: 1 };
  return summaries.sort((a, b) => order[a.kind] - order[b.kind]);
}

/** The numbers of the card a list can open from: the totals, or one package. */
export type SubscriptionTile = 'subscriptions' | 'billed' | 'paid' | 'awaiting' | 'unpaid' | `package:${string}`;

/** The subscriptions a number counts: their sum of that column is the number. */
export function rowsForTile(tile: SubscriptionTile, rows: SubscriptionRow[]): SubscriptionRow[] {
  if (tile.startsWith('package:')) {
    const id = tile.slice('package:'.length);
    return rows.filter((row) => row.package_id === id);
  }
  switch (tile) {
    case 'billed':
      return rows.filter((row) => n(row.billed) > 0);
    case 'paid':
      return rows.filter((row) => n(row.paid) > 0);
    case 'awaiting':
      return rows.filter((row) => n(row.awaiting) > 0);
    case 'unpaid':
      return rows.filter((row) => n(row.unpaid) > 0);
    default:
      return rows;
  }
}

export type SubscriptionFilters = {
  search: string;
  packageId: 'all' | string;
  status: 'all' | 'active' | 'ended';
  payment: 'all' | PaymentState;
  billingPeriod: 'all' | BillingPeriodKind;
};

export const NO_FILTERS: SubscriptionFilters = { search: '', packageId: 'all', status: 'all', payment: 'all', billingPeriod: 'all' };

export function hasFilters(filters: SubscriptionFilters): boolean {
  return Boolean(filters.search.trim()) || filters.packageId !== 'all' || filters.status !== 'all' || filters.payment !== 'all' || filters.billingPeriod !== 'all';
}

/** The table's filters: a child or parent name, the package, running or ended, the money's state, the billing period. */
export function filterSubscriptions(rows: SubscriptionRow[], filters: SubscriptionFilters): SubscriptionRow[] {
  const words = filters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    if (filters.packageId !== 'all' && row.package_id !== filters.packageId) return false;
    if (filters.status === 'active' && row.status !== 'active') return false;
    if (filters.status === 'ended' && row.status === 'active') return false;
    if (filters.payment !== 'all' && paymentState(row) !== filters.payment) return false;
    if (filters.billingPeriod !== 'all' && row.billing_period !== filters.billingPeriod) return false;
    if (words.length) {
      const haystack = [row.child_name_ar, row.child_name_en, row.parent_name_ar, row.parent_name_en, row.parent_phone].join(' ').toLowerCase();
      if (!words.every((word) => haystack.includes(word))) return false;
    }
    return true;
  });
}

export type SubscriptionSortKey = 'child' | 'package' | 'started' | 'billed' | 'paid' | 'unpaid';

export function sortSubscriptions(rows: SubscriptionRow[], key: SubscriptionSortKey, direction: 'asc' | 'desc', lang: string): SubscriptionRow[] {
  const ar = lang.startsWith('ar');
  const name = (a: string | null, b: string | null) => (ar ? a || b : b || a) || '';
  const collator = new Intl.Collator(ar ? 'ar' : 'en');
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((x, y) => {
    let by = 0;
    if (key === 'child') by = collator.compare(name(x.child_name_ar, x.child_name_en), name(y.child_name_ar, y.child_name_en));
    else if (key === 'package') by = collator.compare(name(x.package_name_ar, x.package_name_en), name(y.package_name_ar, y.package_name_en));
    else if (key === 'started') by = (x.started_on ?? '').localeCompare(y.started_on ?? '');
    else by = n(x[key]) - n(y[key]);
    if (by !== 0) return by * sign;
    return collator.compare(name(x.child_name_ar, x.child_name_en), name(y.child_name_ar, y.child_name_en));
  });
}

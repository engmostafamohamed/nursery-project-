/*
 * Kitchen sales and children's extras as plain data and rules (no React, no network): prices after
 * discounts, the month's totals, what each request allows, the checks the forms make (the database
 * makes the same: kitchen_charge_core, save_kitchen_discount, order_child_extra), and reading the
 * database's answers.
 */
import { isFoodAllergen, type FoodAllergen } from '@/features/food-and-beverage/menu';

export const EXTRA_KINDS = ['meal', 'drink', 'snack'] as const;
export type ExtraKind = (typeof EXTRA_KINDS)[number];
const isExtraKind = (v: unknown): v is ExtraKind => (EXTRA_KINDS as readonly unknown[]).includes(v);

export const DISCOUNT_AUDIENCES = ['all_staff', 'all_children', 'staff_member', 'child'] as const;
export type DiscountAudience = (typeof DISCOUNT_AUDIENCES)[number];

export type ChargeBilling = 'open' | 'deducted' | 'invoiced' | 'paid' | 'no_parent' | 'cancelled';
export type RequestStatus = 'waiting_parent' | 'approved' | 'declined' | 'served' | 'cancelled' | 'expired';
const REQUEST_STATUSES: RequestStatus[] = ['waiting_parent', 'approved', 'declined', 'served', 'cancelled', 'expired'];

export const MAX_EXTRA_QUANTITY = 10;
export const NOTE_MAX = 200;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A price after a percentage discount, to the piastre. */
export function discounted(price: number, percent: number): number {
  return round2(price * (1 - percent / 100));
}

/** What a taking costs: before the discount, the discount, and what is charged. */
export function chargePreview(unitPrice: number, quantity: number, percent: number): { gross: number; discount: number; net: number } {
  const gross = round2(unitPrice * quantity);
  const discount = round2((gross * percent) / 100);
  return { gross, discount, net: round2(gross - discount) };
}

/** Packs to units, e.g. 10 cartons of 12 → 120. */
export function packsToUnits(packs: number, packSize: number | null): number {
  return round2(packs * (packSize && packSize > 0 ? packSize : 1));
}

/** The problem with a quantity typed for a taking, or null. */
export function quantityIssue(text: string, inStock: number, max = 1000): 'required' | 'invalid' | 'zero' | 'too_many' | 'more_than_stock' | null {
  const v = text.trim();
  if (!v) return 'required';
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return 'invalid';
  const n = Number(v);
  if (n === 0) return 'zero';
  if (n > max) return 'too_many';
  if (n > inStock + 1e-9) return 'more_than_stock';
  return null;
}

// -----------------------------------------------------------------------------------------------
// Charges

export type KitchenCharge = {
  id: string;
  itemName: string;
  unit: string;
  consumer: 'child' | 'staff';
  personId: string;
  nameAr: string;
  nameEn: string;
  classAr: string | null;
  classEn: string | null;
  quantity: number;
  unitPrice: number;
  gross: number;
  discountNameAr: string | null;
  discountNameEn: string | null;
  discountPercent: number;
  discountAmount: number;
  net: number;
  chargedOn: string;
  createdAt: string;
  billing: ChargeBilling;
  cancelReason: string | null;
  fromRequest: boolean;
  byAr: string;
  byEn: string;
};

export type SalesTotals = { count: number; gross: number; discount: number; net: number; children: number; staff: number; staffOpen: number };

/** The month's totals; cancelled charges are left out. */
export function salesTotals(charges: KitchenCharge[]): SalesTotals {
  const live = charges.filter((c) => c.billing !== 'cancelled');
  const sum = (list: KitchenCharge[], pick: (c: KitchenCharge) => number) => round2(list.reduce((s, c) => s + pick(c), 0));
  return {
    count: live.length,
    gross: sum(live, (c) => c.gross),
    discount: sum(live, (c) => c.discountAmount),
    net: sum(live, (c) => c.net),
    children: sum(live.filter((c) => c.consumer === 'child'), (c) => c.net),
    staff: sum(live.filter((c) => c.consumer === 'staff'), (c) => c.net),
    staffOpen: sum(live.filter((c) => c.billing === 'open'), (c) => c.net),
  };
}

/** Whether a charge can still be cancelled (its stock returned and its line removed). */
export const canCancelCharge = (c: Pick<KitchenCharge, 'billing'>) => c.billing === 'open' || c.billing === 'invoiced' || c.billing === 'no_parent';

export type ChargeFilter = 'all' | 'child' | 'staff';
export function filterCharges(charges: KitchenCharge[], who: ChargeFilter, search: string): KitchenCharge[] {
  const term = search.trim().toLowerCase();
  return charges.filter((c) => (who === 'all' || c.consumer === who)
    && (!term || [c.itemName, c.nameAr, c.nameEn].some((v) => v.toLowerCase().includes(term))));
}

// -----------------------------------------------------------------------------------------------
// Discounts

export type KitchenDiscount = {
  id: string;
  nameAr: string;
  nameEn: string;
  audience: DiscountAudience;
  personId: string | null;
  personAr: string | null;
  personEn: string | null;
  itemId: string | null;
  itemName: string | null;
  percent: number;
  startsOn: string | null;
  endsOn: string | null;
  active: boolean;
};

export type DiscountDraft = {
  nameAr: string;
  nameEn: string;
  audience: DiscountAudience;
  personId: string;
  itemId: string;
  percent: string;
  startsOn: string;
  endsOn: string;
  active: boolean;
};
export type DiscountField = keyof DiscountDraft;

export function discountIssues(d: DiscountDraft): Partial<Record<DiscountField, string>> {
  const issues: Partial<Record<DiscountField, string>> = {};
  if (!d.nameAr.trim()) issues.nameAr = 'name_required';
  else if (d.nameAr.trim().length > 80) issues.nameAr = 'name_too_long';
  if (!d.nameEn.trim()) issues.nameEn = 'name_required';
  else if (d.nameEn.trim().length > 80) issues.nameEn = 'name_too_long';
  if ((d.audience === 'staff_member' || d.audience === 'child') && !d.personId) issues.personId = 'person_required';
  const p = d.percent.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(p) || Number(p) <= 0 || Number(p) > 100) issues.percent = 'percent_invalid';
  if (d.startsOn && d.endsOn && d.endsOn < d.startsOn) issues.endsOn = 'ends_before_start';
  return issues;
}

/** Whether a discount applies on a day. */
export function discountLive(d: Pick<KitchenDiscount, 'active' | 'startsOn' | 'endsOn'>, today: string): boolean {
  return d.active && (!d.startsOn || d.startsOn <= today) && (!d.endsOn || d.endsOn >= today);
}

/** The best discount for a taking, as the database picks it (kitchen_best_discount), or null. */
export function bestDiscount(
  discounts: KitchenDiscount[],
  taking: { itemId: string; consumer: 'child' | 'staff'; personId: string },
  today: string,
): KitchenDiscount | null {
  const fits = (d: KitchenDiscount) =>
    discountLive(d, today)
    && (!d.itemId || d.itemId === taking.itemId)
    && (taking.consumer === 'staff'
      ? d.audience === 'all_staff' || (d.audience === 'staff_member' && d.personId === taking.personId)
      : d.audience === 'all_children' || (d.audience === 'child' && d.personId === taking.personId));
  return discounts.filter(fits).sort((a, b) => b.percent - a.percent)[0] ?? null;
}

// -----------------------------------------------------------------------------------------------
// Children's extras

export type ExtraItem = {
  id: string;
  name: string;
  unit: string;
  kind: ExtraKind;
  price: number;
  discountPercent: number;
  discountNameAr: string | null;
  discountNameEn: string | null;
  finalPrice: number;
  inStock: boolean;
  allergens: FoodAllergen[];
  conflicts: FoodAllergen[];
  preApproved: boolean;
};

export type ExtraRequest = {
  id: string;
  itemName: string;
  quantity: number;
  forDate: string;
  source: 'parent' | 'staff';
  status: RequestStatus;
  note: string | null;
  amount: number | null;
  byAr: string;
  byEn: string;
};

/** Whether the parents' enrollment answers let staff serve an extra of this kind without asking. */
export function preApproved(kind: ExtraKind, consent: { meals: boolean; snacks: boolean }): boolean {
  return kind === 'meal' ? consent.meals : consent.snacks;
}

/** The food allergens of an item the child is allergic to. */
export function allergyConflicts(itemAllergens: string[], childAllergens: string[]): FoodAllergen[] {
  return itemAllergens.filter((a): a is FoodAllergen => isFoodAllergen(a) && childAllergens.includes(a));
}

/** Requests waiting for the parent first, then the coming ones, then the rest, latest first. */
export function sortRequests<T extends Pick<ExtraRequest, 'status' | 'forDate'>>(items: T[]): T[] {
  const rank = (s: RequestStatus) => (s === 'waiting_parent' ? 0 : s === 'approved' ? 1 : 2);
  return [...items].sort((a, b) => rank(a.status) - rank(b.status) || (rank(a.status) < 2 ? a.forDate.localeCompare(b.forDate) : b.forDate.localeCompare(a.forDate)));
}

export type OrderDraft = { itemId: string; quantity: string; dates: string[]; note: string };
export function orderIssues(d: OrderDraft): Partial<Record<keyof OrderDraft, string>> {
  const issues: Partial<Record<keyof OrderDraft, string>> = {};
  if (!d.itemId) issues.itemId = 'item_required';
  const q = d.quantity.trim();
  if (!/^\d{1,2}$/.test(q) || Number(q) < 1 || Number(q) > MAX_EXTRA_QUANTITY) issues.quantity = 'quantity_invalid';
  if (!d.dates.length) issues.dates = 'dates_required';
  if (d.note.trim().length > NOTE_MAX) issues.note = 'note_too_long';
  return issues;
}

// -----------------------------------------------------------------------------------------------
// Reading the database's answers

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const list = (v: unknown): Json[] => (Array.isArray(v) ? v.filter((x): x is Json => Boolean(x) && typeof x === 'object') : []);
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const textOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const day = (v: unknown) => (typeof v === 'string' ? v.slice(0, 10) : '');
const foods = (v: unknown): FoodAllergen[] => (Array.isArray(v) ? v.filter((x): x is FoodAllergen => typeof x === 'string' && isFoodAllergen(x)) : []);
const BILLINGS: ChargeBilling[] = ['open', 'deducted', 'invoiced', 'paid', 'no_parent', 'cancelled'];

function toCharge(c: Json): KitchenCharge {
  return {
    id: text(c.id),
    itemName: text(c.item_name),
    unit: text(c.unit),
    consumer: c.consumer === 'child' ? 'child' : 'staff',
    personId: text(c.person_id),
    nameAr: text(c.name_ar),
    nameEn: text(c.name_en),
    classAr: textOrNull(c.class_ar),
    classEn: textOrNull(c.class_en),
    quantity: num(c.quantity),
    unitPrice: num(c.unit_price),
    gross: num(c.gross),
    discountNameAr: textOrNull(c.discount_name_ar),
    discountNameEn: textOrNull(c.discount_name_en),
    discountPercent: num(c.discount_percent),
    discountAmount: num(c.discount_amount),
    net: num(c.net),
    chargedOn: day(c.charged_on),
    createdAt: text(c.created_at),
    billing: (BILLINGS as unknown[]).includes(c.billing) ? (c.billing as ChargeBilling) : 'open',
    cancelReason: textOrNull(c.cancel_reason),
    fromRequest: c.from_request === true,
    byAr: text(c.by_ar),
    byEn: text(c.by_en),
  };
}

function toRequest(r: Json): ExtraRequest {
  return {
    id: text(r.id),
    itemName: text(r.item_name),
    quantity: num(r.quantity),
    forDate: day(r.for_date),
    source: r.source === 'parent' ? 'parent' : 'staff',
    status: (REQUEST_STATUSES as unknown[]).includes(r.status) ? (r.status as RequestStatus) : 'expired',
    note: textOrNull(r.note),
    amount: r.amount == null ? null : num(r.amount),
    byAr: text(r.by_ar),
    byEn: text(r.by_en),
  };
}

function toExtraItem(i: Json): ExtraItem {
  return {
    id: text(i.id),
    name: text(i.name),
    unit: text(i.unit),
    kind: isExtraKind(i.kind) ? i.kind : 'snack',
    price: num(i.price),
    discountPercent: num(i.discount_percent),
    discountNameAr: textOrNull(i.discount_name_ar),
    discountNameEn: textOrNull(i.discount_name_en),
    finalPrice: i.final_price == null ? num(i.price) : num(i.final_price),
    inStock: i.in_stock === true,
    allergens: foods(i.allergens),
    conflicts: foods(i.conflicts),
    preApproved: i.pre_approved === true,
  };
}

export type StaffPerson = { id: string; nameAr: string; nameEn: string; role: string };
export type TodayRequest = ExtraRequest & { childId: string; nameAr: string; nameEn: string; classAr: string | null; classEn: string | null };
export type KitchenSales = {
  today: string;
  month: string;
  charges: KitchenCharge[];
  discounts: KitchenDiscount[];
  requestsToday: TodayRequest[];
  staff: StaffPerson[];
  staffOpen: Array<{ id: string; nameAr: string; nameEn: string; open: number }>;
};

export function toKitchenSales(raw: unknown): KitchenSales {
  const r = obj(raw);
  return {
    today: day(r.today),
    month: text(r.month),
    charges: list(r.charges).map(toCharge),
    discounts: list(r.discounts).map((d) => ({
      id: text(d.id),
      nameAr: text(d.name_ar),
      nameEn: text(d.name_en),
      audience: (DISCOUNT_AUDIENCES as readonly unknown[]).includes(d.audience) ? (d.audience as DiscountAudience) : 'all_children',
      personId: textOrNull(d.person_id),
      personAr: textOrNull(d.person_ar),
      personEn: textOrNull(d.person_en),
      itemId: textOrNull(d.item_id),
      itemName: textOrNull(d.item_name),
      percent: num(d.percent),
      startsOn: textOrNull(d.starts_on),
      endsOn: textOrNull(d.ends_on),
      active: d.active !== false,
    })),
    requestsToday: list(r.requests_today).map((q) => ({
      ...toRequest({ ...q, for_date: r.today }),
      childId: text(q.child_id),
      nameAr: text(q.name_ar),
      nameEn: text(q.name_en),
      classAr: textOrNull(q.class_ar),
      classEn: textOrNull(q.class_en),
    })),
    staff: list(r.staff).map((s) => ({ id: text(s.id), nameAr: text(s.name_ar), nameEn: text(s.name_en), role: text(s.role) })),
    staffOpen: list(r.staff_open).map((s) => ({ id: text(s.id), nameAr: text(s.name_ar), nameEn: text(s.name_en), open: num(s.open) })),
  };
}

export type FamilyChildExtras = {
  childId: string;
  nameAr: string;
  nameEn: string;
  today: string;
  openDays: string[];
  consent: { meals: boolean; snacks: boolean };
  extras: ExtraItem[];
  requests: ExtraRequest[];
};

export function toFamilyExtras(raw: unknown): FamilyChildExtras[] {
  return list(raw).map((c) => ({
    childId: text(c.child_id),
    nameAr: text(c.name_ar),
    nameEn: text(c.name_en),
    today: day(c.today),
    openDays: Array.isArray(c.open_days) ? c.open_days.map(day).filter(Boolean) : [],
    consent: { meals: c.accepts_meals === true, snacks: c.accepts_snacks === true },
    extras: list(c.extras).map(toExtraItem),
    requests: list(c.requests).map(toRequest),
  }));
}

export type ClassChildExtras = {
  childId: string;
  nameAr: string;
  nameEn: string;
  classAr: string;
  classEn: string;
  here: boolean;
  consent: { meals: boolean; snacks: boolean };
  requests: ExtraRequest[];
  allergens: string[];
};
export type ClassExtras = { today: string; children: ClassChildExtras[]; items: ExtraItem[] };

export function toClassExtras(raw: unknown): ClassExtras {
  const r = obj(raw);
  const allergies = obj(r.allergies);
  return {
    today: day(r.today),
    children: list(r.children).map((c) => ({
      childId: text(c.child_id),
      nameAr: text(c.name_ar),
      nameEn: text(c.name_en),
      classAr: text(c.class_ar),
      classEn: text(c.class_en),
      here: c.here === true,
      consent: { meals: c.accepts_meals === true, snacks: c.accepts_snacks === true },
      requests: list(c.requests).map((q) => toRequest({ ...q, for_date: r.today })),
      allergens: Array.isArray(allergies[text(c.child_id)]) ? (allergies[text(c.child_id)] as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    })),
    items: list(r.items).map(toExtraItem),
  };
}

export type StaffItem = { id: string; name: string; unit: string; price: number; discountPercent: number; discountNameAr: string | null; discountNameEn: string | null; finalPrice: number; inStock: boolean; quantity: number };
export type MyKitchenAccount = { today: string; month: string; openTotal: number; charges: KitchenCharge[]; items: StaffItem[]; payslipMonths: Record<string, string> };

export function toMyKitchenAccount(raw: unknown): MyKitchenAccount {
  const r = obj(raw);
  const charges = list(r.charges);
  return {
    today: day(r.today),
    month: text(r.month),
    openTotal: num(r.open_total),
    charges: charges.map((c) => toCharge({ ...c, consumer: 'staff' })),
    payslipMonths: Object.fromEntries(charges.filter((c) => typeof c.payslip_month === 'string').map((c) => [text(c.id), text(c.payslip_month)])),
    items: list(r.items).map((i) => ({
      id: text(i.id),
      name: text(i.name),
      unit: text(i.unit),
      price: num(i.price),
      discountPercent: num(i.discount_percent),
      discountNameAr: textOrNull(i.discount_name_ar),
      discountNameEn: textOrNull(i.discount_name_en),
      finalPrice: num(i.final_price),
      inStock: i.in_stock === true,
      quantity: num(i.quantity),
    })),
  };
}

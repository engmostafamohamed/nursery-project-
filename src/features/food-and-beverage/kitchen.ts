import { addDays } from './menuPeriod';
import type { FoodAllergen } from './menu';

/*
 * The nursery's stock as plain data and rules: the kitchen's section and the store's (one stock,
 * stock_scope in the database), what an item's state is (out, low, expired, expiring soon), the
 * page's totals, and the checks on a stock change (the database refuses the same:
 * record_kitchen_movement, save_kitchen_item).
 */

export const KITCHEN_CATEGORIES = ['food', 'drinks', 'kitchen_supplies'] as const;
export type KitchenCategory = (typeof KITCHEN_CATEGORIES)[number];
/** The rest of the nursery's things: classroom supplies, cleaning, hygiene, first aid, toys, furniture. */
export const STORE_CATEGORIES = ['supplies', 'cleaning', 'hygiene', 'medical', 'toys', 'furniture', 'other'] as const;
export type StoreCategory = (typeof STORE_CATEGORIES)[number];
export const STOCK_CATEGORIES = [...KITCHEN_CATEGORIES, ...STORE_CATEGORIES] as const;
export type StockCategory = (typeof STOCK_CATEGORIES)[number];
export type StockSection = 'kitchen' | 'store';
/** What a page shows: one section or both. */
export type StockScope = StockSection | 'all';

export const isStockCategory = (v: unknown): v is StockCategory => (STOCK_CATEGORIES as readonly unknown[]).includes(v);
export const sectionOf = (category: StockCategory): StockSection => ((KITCHEN_CATEGORIES as readonly string[]).includes(category) ? 'kitchen' : 'store');
export const categoriesOf = (scope: StockScope): readonly StockCategory[] =>
  scope === 'kitchen' ? KITCHEN_CATEGORIES : scope === 'store' ? STORE_CATEGORIES : STOCK_CATEGORIES;

export const CATEGORY_ICON: Record<StockCategory, string> = {
  food: 'grocery', drinks: 'local_drink', kitchen_supplies: 'soup_kitchen',
  supplies: 'palette', cleaning: 'cleaning_services', hygiene: 'baby_changing_station', medical: 'medical_services',
  toys: 'toys', furniture: 'chair', other: 'category',
};

export const MOVEMENT_KINDS = ['restocked', 'used', 'issued', 'spoiled', 'counted'] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];
/** What the history shows: the changes above, and an item charged to someone or put back. */
export const HISTORY_KINDS = [...MOVEMENT_KINDS, 'charged', 'returned'] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];
export const EXTRA_KINDS = ['meal', 'drink', 'snack'] as const;
export type ItemExtraKind = (typeof EXTRA_KINDS)[number];
/** Units offered when adding an item; any other can be typed. */
export const COMMON_UNITS = ['kg', 'g', 'liter', 'piece', 'pack', 'box', 'can', 'bottle', 'dozen', 'roll', 'set', 'sheet'] as const;
export const LOCATION_MAX = 60;
export const SUPPLIER_MAX = 80;
/** An item expiring within this many days is flagged. */
export const EXPIRING_SOON_DAYS = 3;

export type KitchenItem = {
  id: string;
  name: string;
  category: StockCategory;
  section: StockSection;
  /** Where it is kept (store room, shelf…). */
  location: string | null;
  /** Whether the viewer may change it (the kitchen's and the store's editors differ). */
  canEdit: boolean;
  quantity: number;
  unit: string;
  lowStockLevel: number;
  expiresOn: string | null;
  lastRestocked: string | null;
  /** What the nursery pays for one unit, and what a child and a member of staff pay (none: not sold). */
  unitCost: number | null;
  childPrice: number | null;
  staffPrice: number | null;
  /** Bought in packs of this many units (a carton of 12). */
  packSize: number | null;
  packUnit: string | null;
  /** Offered on the menu as an extra of this kind. */
  extraKind: ItemExtraKind | null;
  foodAllergens: FoodAllergen[];
};

export type StockMovement = {
  id: string;
  itemId: string;
  itemName: string;
  unit: string;
  kind: HistoryKind;
  change: number;
  quantityAfter: number;
  note: string | null;
  byAr: string | null;
  byEn: string | null;
  /** Who an item was charged to. */
  forAr: string | null;
  forEn: string | null;
  category: StockCategory | null;
  /** An issue: the class it went to and who took it. */
  classId: string | null;
  classAr: string | null;
  classEn: string | null;
  takenByAr: string | null;
  takenByEn: string | null;
  /** A delivery: who supplied it. */
  supplier: string | null;
  /** What a unit was worth when it moved, and the movement's worth. */
  unitCost: number | null;
  value: number | null;
  at: string;
};

/** What the stock is worth at cost (items without a cost left out), and how many in stock have none. */
export function stockValue(items: Pick<KitchenItem, 'quantity' | 'unitCost'>[]): { value: number; uncosted: number } {
  let value = 0;
  let uncosted = 0;
  for (const item of items) {
    if (item.unitCost === null) uncosted += item.quantity > 0 ? 1 : 0;
    else value += Math.max(item.quantity, 0) * item.unitCost;
  }
  return { value: Math.round(value * 100) / 100, uncosted };
}

export type StockFlags = { out: boolean; low: boolean; expired: boolean; expiringSoon: boolean };

/** What needs attention on an item, on the nursery's day `today` (YYYY-MM-DD). */
export function stockFlags(item: Pick<KitchenItem, 'quantity' | 'lowStockLevel' | 'expiresOn'>, today: string): StockFlags {
  const out = item.quantity <= 0;
  const expired = Boolean(item.expiresOn && item.quantity > 0 && item.expiresOn < today);
  return {
    out,
    low: !out && item.lowStockLevel > 0 && item.quantity <= item.lowStockLevel,
    expired,
    expiringSoon: Boolean(item.expiresOn && item.quantity > 0 && !expired && item.expiresOn <= addDays(today, EXPIRING_SOON_DAYS)),
  };
}

/** Items that need attention first (expired, out, low, expiring), then by name. */
export function sortForAttention(items: KitchenItem[], today: string): KitchenItem[] {
  const rank = (item: KitchenItem) => {
    const f = stockFlags(item, today);
    return f.expired ? 0 : f.out ? 1 : f.low ? 2 : f.expiringSoon ? 3 : 4;
  };
  return [...items].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export type StockTotals = { items: number; out: number; low: number; expired: number; expiringSoon: number };

export function stockTotals(items: KitchenItem[], today: string): StockTotals {
  const flags = items.map((i) => stockFlags(i, today));
  return {
    items: items.length,
    out: flags.filter((f) => f.out).length,
    low: flags.filter((f) => f.low).length,
    expired: flags.filter((f) => f.expired).length,
    expiringSoon: flags.filter((f) => f.expiringSoon).length,
  };
}

export type QuantityIssue = 'required' | 'invalid' | 'zero' | 'more_than_stock';

/** What is wrong with a quantity typed for a stock change; counting may be zero, taking may not exceed what is there. */
export function movementIssue(kind: MovementKind, text: string, current: number): QuantityIssue | null {
  const trimmed = text.trim();
  if (!trimmed) return 'required';
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return 'invalid';
  const quantity = Number(trimmed);
  if (kind !== 'counted' && quantity === 0) return 'zero';
  if ((kind === 'used' || kind === 'issued' || kind === 'spoiled') && quantity > current + 1e-9) return 'more_than_stock';
  return null;
}

/** The quantity after a change, as the database works it out. */
export function quantityAfter(kind: MovementKind, quantity: number, current: number): number {
  const next = kind === 'restocked' ? current + quantity : kind === 'counted' ? quantity : current - quantity;
  return Math.round(next * 100) / 100;
}

export type ItemDraft = {
  name: string;
  category: StockCategory;
  location: string;
  unit: string;
  lowStockLevel: string;
  expiresOn: string;
  unitCost: string;
  childPrice: string;
  staffPrice: string;
  packSize: string;
  packUnit: string;
  extraKind: ItemExtraKind | '';
  foodAllergens: FoodAllergen[];
};
export type ItemIssue = 'name_required' | 'name_too_long' | 'unit_required' | 'level_invalid' | 'price_invalid' | 'pack_invalid' | 'pack_unit_required' | 'extra_needs_price' | 'location_too_long';
export type ItemField = 'name' | 'unit' | 'lowStockLevel' | 'unitCost' | 'childPrice' | 'staffPrice' | 'packSize' | 'packUnit' | 'extraKind' | 'location';

const AMOUNT = /^\d+(\.\d{1,2})?$/;

/** A new item's draft (in the first category of the page's section), or an item's as it is. */
export function itemDraft(item: KitchenItem | null, scope: StockScope = 'kitchen'): ItemDraft {
  const money = (v: number | null) => (v == null ? '' : String(v));
  return item
    ? {
        name: item.name, category: item.category, location: item.location ?? '', unit: item.unit, lowStockLevel: String(item.lowStockLevel), expiresOn: item.expiresOn ?? '',
        unitCost: money(item.unitCost), childPrice: money(item.childPrice), staffPrice: money(item.staffPrice),
        packSize: money(item.packSize), packUnit: item.packUnit ?? '', extraKind: item.extraKind ?? '', foodAllergens: item.foodAllergens,
      }
    : { name: '', category: categoriesOf(scope)[0], location: '', unit: scope === 'store' ? 'piece' : 'kg', lowStockLevel: '1', expiresOn: '', unitCost: '', childPrice: '', staffPrice: '', packSize: '', packUnit: '', extraKind: '', foodAllergens: [] };
}

export function itemIssues(draft: ItemDraft): Partial<Record<ItemField, ItemIssue>> {
  const issues: Partial<Record<ItemField, ItemIssue>> = {};
  if (!draft.name.trim()) issues.name = 'name_required';
  else if (draft.name.trim().length > 80) issues.name = 'name_too_long';
  if (!draft.unit.trim() || draft.unit.trim().length > 20) issues.unit = 'unit_required';
  if (!AMOUNT.test(draft.lowStockLevel.trim())) issues.lowStockLevel = 'level_invalid';
  for (const field of ['unitCost', 'childPrice', 'staffPrice'] as const) {
    const v = draft[field].trim();
    if (v && (!AMOUNT.test(v) || Number(v) > 100000)) issues[field] = 'price_invalid';
  }
  const pack = draft.packSize.trim();
  if (pack && (!AMOUNT.test(pack) || Number(pack) < 1 || Number(pack) > 10000)) issues.packSize = 'pack_invalid';
  else if (pack && !draft.packUnit.trim()) issues.packUnit = 'pack_unit_required';
  else if (!pack && draft.packUnit.trim()) issues.packSize = 'pack_invalid';
  if (draft.extraKind && sectionOf(draft.category) === 'kitchen' && !draft.childPrice.trim()) issues.extraKind = 'extra_needs_price';
  if (draft.location.trim().length > LOCATION_MAX) issues.location = 'location_too_long';
  return issues;
}

/** A delivery's price and supplier: blank, or an amount; the supplier at most SUPPLIER_MAX characters. */
export function restockIssue(unitCost: string, supplier: string): 'price_invalid' | 'supplier_too_long' | null {
  const cost = unitCost.trim();
  if (cost && (!AMOUNT.test(cost) || Number(cost) > 100000)) return 'price_invalid';
  if (supplier.trim().length > SUPPLIER_MAX) return 'supplier_too_long';
  return null;
}

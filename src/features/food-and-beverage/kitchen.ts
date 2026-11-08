import { addDays } from './menu';

/*
 * Kitchen stock as plain data and rules: what an item's state is (out, low, expired, expiring
 * soon), the page's totals, and the checks on a stock change (the database refuses the same:
 * record_kitchen_movement).
 */

export const KITCHEN_CATEGORIES = ['food', 'drinks', 'kitchen_supplies'] as const;
export type KitchenCategory = (typeof KITCHEN_CATEGORIES)[number];
export const MOVEMENT_KINDS = ['restocked', 'used', 'spoiled', 'counted'] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];
/** Units offered when adding an item; any other can be typed. */
export const COMMON_UNITS = ['kg', 'g', 'liter', 'piece', 'pack', 'box', 'can', 'bottle', 'dozen'] as const;
/** An item expiring within this many days is flagged. */
export const EXPIRING_SOON_DAYS = 3;

export type KitchenItem = {
  id: string;
  name: string;
  category: KitchenCategory;
  quantity: number;
  unit: string;
  lowStockLevel: number;
  expiresOn: string | null;
  lastRestocked: string | null;
};

export type StockMovement = {
  id: string;
  itemId: string;
  itemName: string;
  unit: string;
  kind: MovementKind;
  change: number;
  quantityAfter: number;
  note: string | null;
  byAr: string | null;
  byEn: string | null;
  at: string;
};

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
  if ((kind === 'used' || kind === 'spoiled') && quantity > current + 1e-9) return 'more_than_stock';
  return null;
}

/** The quantity after a change, as the database works it out. */
export function quantityAfter(kind: MovementKind, quantity: number, current: number): number {
  const next = kind === 'restocked' ? current + quantity : kind === 'counted' ? quantity : current - quantity;
  return Math.round(next * 100) / 100;
}

export type ItemDraft = { name: string; category: KitchenCategory; unit: string; lowStockLevel: string; expiresOn: string };
export type ItemIssue = 'name_required' | 'name_too_long' | 'unit_required' | 'level_invalid';

export function itemIssues(draft: ItemDraft): Partial<Record<'name' | 'unit' | 'lowStockLevel', ItemIssue>> {
  const issues: Partial<Record<'name' | 'unit' | 'lowStockLevel', ItemIssue>> = {};
  if (!draft.name.trim()) issues.name = 'name_required';
  else if (draft.name.trim().length > 80) issues.name = 'name_too_long';
  if (!draft.unit.trim() || draft.unit.trim().length > 20) issues.unit = 'unit_required';
  if (!/^\d+(\.\d{1,2})?$/.test(draft.lowStockLevel.trim())) issues.lowStockLevel = 'level_invalid';
  return issues;
}

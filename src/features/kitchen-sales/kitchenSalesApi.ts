/*
 * Kitchen sales and children's extras over the network. Every read and write is a database function
 * (the service worker answers table reads from its cache first, so a change would not show at once).
 */
import { supabase } from '@/lib/supabase';

import {
  toClassExtras,
  toFamilyExtras,
  toKitchenSales,
  toMyKitchenAccount,
  type ClassExtras,
  type DiscountDraft,
  type FamilyChildExtras,
  type KitchenSales,
  type MyKitchenAccount,
} from './kitchenSales';

const rpc = async <T>(name: string, args: Record<string, unknown> | undefined, map: (raw: unknown) => T): Promise<T> => {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  return map(data);
};

export const fetchKitchenSales = (nurseryId: string, month: string) =>
  rpc<KitchenSales>('get_kitchen_sales', { p_nursery_id: nurseryId, p_month: `${month}-01` }, toKitchenSales);
export const fetchFamilyExtras = () => rpc<FamilyChildExtras[]>('get_family_extras', undefined, toFamilyExtras);
export const fetchClassExtras = () => rpc<ClassExtras>('get_class_extras', undefined, toClassExtras);
export const fetchMyKitchenAccount = (month: string) => rpc<MyKitchenAccount>('get_my_kitchen_account', { p_month: `${month}-01` }, toMyKitchenAccount);

export type KitchenChild = { id: string; nameAr: string; nameEn: string; classAr: string | null; classEn: string | null };
export const searchKitchenChildren = (nurseryId: string, query: string) =>
  rpc<KitchenChild[]>('search_kitchen_children', { p_nursery_id: nurseryId, p_query: query }, (raw) =>
    (Array.isArray(raw) ? raw : []).map((c: Record<string, unknown>) => ({
      id: String(c.id ?? ''),
      nameAr: String(c.name_ar ?? ''),
      nameEn: String(c.name_en ?? ''),
      classAr: typeof c.class_ar === 'string' ? c.class_ar : null,
      classEn: typeof c.class_en === 'string' ? c.class_en : null,
    })),
  );

/** A member of staff takes an item (for themselves, or recorded by the kitchen for someone). */
export const chargeStaffItem = (input: { itemId: string; quantity: number; staffUserId?: string | null; note?: string; key: string }) =>
  rpc<string>('charge_staff_kitchen_item', {
    p_item_id: input.itemId,
    p_quantity: input.quantity,
    p_staff_user_id: input.staffUserId || null,
    p_note: input.note?.trim() || null,
    p_idempotency_key: input.key,
  }, (raw) => String(raw ?? ''));

/** The store charges a child an item (diapers, a uniform): out of stock, on the family's extras invoice; the parents are told. */
export const chargeChildStockItem = (input: { childId: string; itemId: string; quantity: number; note?: string; key: string }) =>
  rpc<string>('charge_child_stock_item', {
    p_child_id: input.childId,
    p_item_id: input.itemId,
    p_quantity: input.quantity,
    p_note: input.note?.trim() || null,
    p_idempotency_key: input.key,
  }, (raw) => String(raw ?? ''));

/** Staff give a child an extra: served now with the parents' consent, otherwise it waits for them. */
export const giveChildExtra = (input: { childId: string; itemId: string; quantity: number; note?: string; key: string }) =>
  rpc<{ status: 'served' | 'waiting_parent' }>('give_child_extra', {
    p_child_id: input.childId,
    p_item_id: input.itemId,
    p_quantity: input.quantity,
    p_note: input.note?.trim() || null,
    p_idempotency_key: input.key,
  }, (raw) => ({ status: (raw as { status?: string } | null)?.status === 'served' ? 'served' : 'waiting_parent' }));

export const orderChildExtra = (input: { childId: string; itemId: string; quantity: number; dates: string[]; note?: string }) =>
  rpc<number>('order_child_extra', {
    p_child_id: input.childId,
    p_item_id: input.itemId,
    p_quantity: input.quantity,
    p_dates: input.dates,
    p_note: input.note?.trim() || null,
  }, (raw) => Number(raw ?? 0));

export const decideChildExtra = (requestId: string, approve: boolean) =>
  rpc<void>('decide_child_extra', { p_request_id: requestId, p_approve: approve }, () => undefined);
export const serveChildExtra = (requestId: string, key: string) =>
  rpc<void>('serve_child_extra', { p_request_id: requestId, p_idempotency_key: key }, () => undefined);
export const cancelChildExtra = (requestId: string) => rpc<void>('cancel_child_extra', { p_request_id: requestId }, () => undefined);
export const cancelKitchenCharge = (chargeId: string, reason: string) =>
  rpc<void>('cancel_kitchen_charge', { p_charge_id: chargeId, p_reason: reason.trim() }, () => undefined);

export const saveKitchenDiscount = (nurseryId: string, id: string | null, d: DiscountDraft) =>
  rpc<string>('save_kitchen_discount', {
    p_nursery_id: nurseryId,
    p_id: id,
    p_name_ar: d.nameAr.trim(),
    p_name_en: d.nameEn.trim(),
    p_audience: d.audience,
    p_person_id: d.audience === 'staff_member' || d.audience === 'child' ? d.personId : null,
    p_item_id: d.itemId || null,
    p_percent: Number(d.percent),
    p_starts_on: d.startsOn || null,
    p_ends_on: d.endsOn || null,
    p_active: d.active,
  }, (raw) => String(raw ?? ''));

const CODES = [
  'kitchen_forbidden', 'kitchen_not_enough', 'kitchen_not_for_sale', 'kitchen_allergy', 'kitchen_invalid_quantity', 'kitchen_invalid_dates',
  'kitchen_invalid_note', 'kitchen_person_invalid', 'kitchen_request_closed', 'kitchen_charge_settled', 'kitchen_charge_closed',
  'kitchen_reason_required', 'kitchen_discount_invalid', 'kitchen_item_not_found', 'kitchen_item_invalid', 'menu_forbidden',
] as const;

/** The text key for a failed call (kitchenSales.errors.<code>). */
export function kitchenErrorKey(error: unknown): string {
  const message = (error as { message?: string } | null)?.message ?? '';
  const hit = CODES.find((c) => message.includes(c));
  if (hit) return `kitchenSales.errors.${hit}`;
  if (/failed to fetch|network|load failed/i.test(message)) return 'kitchenSales.errors.network';
  return 'kitchenSales.errors.failed';
}

/** The detail of an error (e.g. the allergens of kitchen_allergy, the stock of kitchen_not_enough). */
export const errorDetail = (error: unknown): string => String((error as { details?: string } | null)?.details ?? '');

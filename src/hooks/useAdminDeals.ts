import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { count, list, numberOrNull, obj, oneOf, text, textOrNull } from '@/lib/jsonRead';
import { DEAL_APPLIES_FOR, type DealAppliesFor } from '@/lib/packageForms';
import { callRpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

export const adminDealsKey = (nurseryId: string | null | undefined) => ['admin-deals', nurseryId] as const;

export type DealDiscountType = 'percentage' | 'fixed_amount';

export type AssignedPackageRef = {
  id: string;
  nameAr: string;
  nameEn: string;
  kind: 'tuition' | 'hours';
};

/** Who a deal has actually reached: the invoices that carry its discount, their families, the amount. */
export type DealUsage = {
  invoices: number;
  families: number;
  amount: number;
  familyNames: { parentId: string; nameAr: string; nameEn: string }[];
};

export type DealRow = {
  id: string;
  nursery_id: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  discount_type: DealDiscountType;
  discount_value: number;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  created_at: string;
  applies_for: DealAppliesFor;
  applies_invoices: number | null;
  /** Packages (tuition + extra-hours) this deal is on. */
  assigned_packages: AssignedPackageRef[];
  usage: DealUsage;
};

export type DealInput = {
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  discount_type: DealDiscountType;
  discount_value: number;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  /** The first invoice when not given (the database's default). */
  applies_for?: DealAppliesFor;
  applies_invoices?: number | null;
};

const NO_USAGE: DealUsage = { invoices: 0, families: 0, amount: 0, familyNames: [] };

/** Whether a deal is currently claimable: active and inside its optional start/end window. */
export function isDealCurrentlyActive(deal: Pick<DealRow, 'active' | 'starts_at' | 'ends_at'>): boolean {
  if (!deal.active) return false;
  const now = Date.now();
  if (deal.starts_at && new Date(deal.starts_at).getTime() > now) return false;
  if (deal.ends_at && new Date(deal.ends_at).getTime() <= now) return false;
  return true;
}

/** The resulting price after a deal's discount, clamped at zero — same math as the admission
 * invoice RPC, for an admin-facing preview (not itself charged anywhere). */
export function applyDealToPrice(price: number, deal: Pick<DealRow, 'discount_type' | 'discount_value'>): number {
  const discount = deal.discount_type === 'percentage' ? Math.round(price * deal.discount_value) / 100 : deal.discount_value;
  return Math.max(price - discount, 0);
}

const packageRefs = (value: unknown, kind: AssignedPackageRef['kind']): AssignedPackageRef[] =>
  list(value).map((p) => ({ id: text(p.id), nameAr: text(p.name_ar), nameEn: text(p.name_en), kind }));

/** One deal as get_deals_overview returns it (or as a write returns its row, without packages or usage). */
export function toDealRow(raw: unknown): DealRow {
  const d = obj(raw);
  const usage = obj(d.usage);
  return {
    id: text(d.id),
    nursery_id: text(d.nursery_id),
    name_ar: text(d.name_ar),
    name_en: text(d.name_en),
    description_ar: textOrNull(d.description_ar),
    description_en: textOrNull(d.description_en),
    discount_type: oneOf(d.discount_type, ['percentage', 'fixed_amount'] as const, 'percentage'),
    discount_value: numberOrNull(d.discount_value) ?? 0,
    starts_at: textOrNull(d.starts_at),
    ends_at: textOrNull(d.ends_at),
    active: d.active !== false,
    created_at: text(d.created_at),
    applies_for: oneOf(d.applies_for, DEAL_APPLIES_FOR, 'first_invoice'),
    applies_invoices: numberOrNull(d.applies_invoices),
    assigned_packages: [...packageRefs(d.tuition_packages, 'tuition'), ...packageRefs(d.extra_hours_packages, 'hours')],
    usage: {
      invoices: count(usage.invoices),
      families: count(usage.families),
      amount: numberOrNull(usage.amount) ?? 0,
      familyNames: list(usage.family_names).map((f) => ({ parentId: text(f.parent_id), nameAr: text(f.name_ar), nameEn: text(f.name_en) })),
    },
  };
}

const DEAL_COLUMNS =
  'id, nursery_id, name_ar, name_en, description_ar, description_en, discount_type, discount_value, starts_at, ends_at, active, created_at, applies_for, applies_invoices';

/** A deal row just written: its packages and usage stay as they were until the overview is read again. */
function fromWritten(data: unknown, previous?: DealRow): DealRow {
  return { ...toDealRow(data), assigned_packages: previous?.assigned_packages ?? [], usage: previous?.usage ?? NO_USAGE };
}

export function useAdminDeals(nurseryId: string | null | undefined) {
  const queryClient = useQueryClient();
  const key = adminDealsKey(nurseryId);

  // Read through a function: the service worker answers table reads from its cache first, so a
  // deal just saved would not show at once.
  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<DealRow[]> =>
      nurseryId ? list(await callRpc('get_deals_overview', { p_nursery_id: nurseryId })).map(toDealRow) : [],
    enabled: Boolean(nurseryId),
  });

  const create = useMutation({
    mutationFn: async (input: DealInput): Promise<DealRow> => {
      if (!nurseryId) throw new Error('Missing nursery');
      const { data, error } = await supabase
        .from('deals')
        .insert({ ...input, nursery_id: nurseryId } as never)
        .select(DEAL_COLUMNS)
        .single();
      if (error) throw error;
      return fromWritten(data);
    },
    // Write the new row straight into the cache instead of only invalidating — invalidation
    // only *schedules* a background refetch, so a dialog reading `query.data` right after this
    // mutation resolves could still momentarily see the old (pre-create) list.
    onSuccess: (created) => {
      queryClient.setQueryData<DealRow[]>(key, (old) => [created, ...(old ?? [])]);
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: DealInput }): Promise<DealRow> => {
      const { data, error } = await supabase.from('deals').update(input as never).eq('id', id).select(DEAL_COLUMNS).single();
      if (error) throw error;
      return fromWritten(data, queryClient.getQueryData<DealRow[]>(key)?.find((d) => d.id === id));
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<DealRow[]>(key, (old) => (old ?? []).map((d) => (d.id === updated.id ? updated : d)));
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('deals').update({ active } as never).eq('id', id);
      if (error) throw error;
      return { id, active };
    },
    onSuccess: ({ id, active }) => {
      queryClient.setQueryData<DealRow[]>(key, (old) => (old ?? []).map((d) => (d.id === id ? { ...d, active } : d)));
    },
  });

  return { query, create, update, toggleActive };
}

/** The custom discounts made in one editor session that the package did not end up using. */
export function dealsToDiscard(created: readonly string[], keptDealId: string | null): string[] {
  return created.filter((id) => id !== keptDealId);
}

/**
 * A custom discount made inline while editing a package is a real `deals` row from the moment it
 * is created. This deletes the ones the package did not keep — when the editor is cancelled, or
 * another deal was saved — so unused "Custom discount" rows do not pile up on the Deals page.
 */
export function useInlineDealCleanup(nurseryId: string | null | undefined) {
  const queryClient = useQueryClient();
  const [created, setCreated] = useState<string[]>([]);

  const track = useCallback((dealId: string) => setCreated((prev) => [...prev, dealId]), []);

  const discard = useCallback(
    async (keptDealId: string | null) => {
      const unused = dealsToDiscard(created, keptDealId);
      setCreated([]);
      if (!unused.length) return;
      const { error } = await supabase.from('deals').delete().in('id', unused);
      if (error) return; // Harmless: the unused deal just stays listed on the Deals page.
      queryClient.setQueryData<DealRow[]>(adminDealsKey(nurseryId), (old) => (old ?? []).filter((d) => !unused.includes(d.id)));
    },
    [created, nurseryId, queryClient],
  );

  return { track, discard };
}

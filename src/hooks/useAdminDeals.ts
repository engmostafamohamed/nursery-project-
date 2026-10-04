import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export const adminDealsKey = (nurseryId: string | null | undefined) => ['admin-deals', nurseryId] as const;

export type DealDiscountType = 'percentage' | 'fixed_amount';

export type AssignedChildRef = { id: string; nameAr: string; nameEn: string };

export type AssignedPackageRef = {
  id: string;
  nameAr: string;
  nameEn: string;
  kind: 'tuition' | 'hours';
  children: AssignedChildRef[];
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
  /** Packages (tuition + extra-hours) currently assigned to this deal. */
  assigned_count: number;
  assigned_packages: AssignedPackageRef[];
  /** Unique children currently enrolled in any package assigned to this deal. */
  children_count: number;
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
};

function money(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

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

export function useAdminDeals(nurseryId: string | null | undefined) {
  const queryClient = useQueryClient();
  const key = adminDealsKey(nurseryId);

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<DealRow[]> => {
      if (!nurseryId) return [];
      const { data, error } = await supabase
        .from('deals')
        .select('id, nursery_id, name_ar, name_en, description_ar, description_en, discount_type, discount_value, starts_at, ends_at, active, created_at')
        .eq('nursery_id', nurseryId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const ids = rows.map((row) => row.id as string);

      const refMap = new Map<string, AssignedPackageRef[]>();
      if (ids.length) {
        const [tuitionRes, hoursRes] = await Promise.all([
          supabase.from('tuition_packages').select('id, name_ar, name_en, deal_id').in('deal_id', ids),
          supabase.from('packages').select('id, name_ar, name_en, deal_id').in('deal_id', ids),
        ]);
        type PkgRow = { id: string; name_ar: string; name_en: string; deal_id: string | null };
        const tuitionPkgs = (tuitionRes.data ?? []) as PkgRow[];
        const hoursPkgs = (hoursRes.data ?? []) as PkgRow[];

        type ChildJoinRow = { child_id: string; children: { id?: string; full_name_ar: string; full_name_en: string } | null };
        const [tuitionChildren, hoursChildren] = await Promise.all([
          tuitionPkgs.length
            ? supabase
                .from('child_tuition_subscriptions')
                .select('child_id, tuition_package_id, status, children (full_name_ar, full_name_en)')
                .eq('status', 'active')
                .in(
                  'tuition_package_id',
                  tuitionPkgs.map((p) => p.id),
                )
            : Promise.resolve({ data: [] }),
          hoursPkgs.length
            ? supabase
                .from('child_packages')
                .select('child_id, package_id, status, children (full_name_ar, full_name_en)')
                .eq('status', 'active')
                .in(
                  'package_id',
                  hoursPkgs.map((p) => p.id),
                )
            : Promise.resolve({ data: [] }),
        ]);

        const childrenByTuitionPkg = new Map<string, AssignedChildRef[]>();
        for (const row of (tuitionChildren.data ?? []) as Array<ChildJoinRow & { tuition_package_id: string }>) {
          const arr = childrenByTuitionPkg.get(row.tuition_package_id) ?? [];
          arr.push({ id: row.child_id, nameAr: row.children?.full_name_ar ?? '', nameEn: row.children?.full_name_en ?? '' });
          childrenByTuitionPkg.set(row.tuition_package_id, arr);
        }
        const childrenByHoursPkg = new Map<string, AssignedChildRef[]>();
        for (const row of (hoursChildren.data ?? []) as Array<ChildJoinRow & { package_id: string }>) {
          const arr = childrenByHoursPkg.get(row.package_id) ?? [];
          arr.push({ id: row.child_id, nameAr: row.children?.full_name_ar ?? '', nameEn: row.children?.full_name_en ?? '' });
          childrenByHoursPkg.set(row.package_id, arr);
        }

        const push = (row: PkgRow, kind: AssignedPackageRef['kind'], children: AssignedChildRef[]) => {
          if (!row.deal_id) return;
          const arr = refMap.get(row.deal_id) ?? [];
          arr.push({ id: row.id, nameAr: row.name_ar, nameEn: row.name_en, kind, children });
          refMap.set(row.deal_id, arr);
        };
        for (const row of tuitionPkgs) push(row, 'tuition', childrenByTuitionPkg.get(row.id) ?? []);
        for (const row of hoursPkgs) push(row, 'hours', childrenByHoursPkg.get(row.id) ?? []);
      }

      return rows.map((row) => {
        const assigned = refMap.get(row.id as string) ?? [];
        const uniqueChildIds = new Set(assigned.flatMap((pkg) => pkg.children.map((c) => c.id)));
        return {
          ...(row as Omit<DealRow, 'discount_value' | 'assigned_count' | 'assigned_packages' | 'children_count'>),
          discount_value: money(row.discount_value),
          assigned_count: assigned.length,
          assigned_packages: assigned,
          children_count: uniqueChildIds.size,
        };
      }) as DealRow[];
    },
    enabled: Boolean(nurseryId),
  });

  const DEAL_COLUMNS =
    'id, nursery_id, name_ar, name_en, description_ar, description_en, discount_type, discount_value, starts_at, ends_at, active, created_at';

  const create = useMutation({
    mutationFn: async (input: DealInput): Promise<DealRow> => {
      if (!nurseryId) throw new Error('Missing nursery');
      const { data, error } = await supabase
        .from('deals')
        .insert({ ...input, nursery_id: nurseryId } as never)
        .select(DEAL_COLUMNS)
        .single();
      if (error) throw error;
      const row = data as Omit<DealRow, 'discount_value' | 'assigned_count' | 'assigned_packages' | 'children_count'> & {
        discount_value: unknown;
      };
      return { ...row, discount_value: money(row.discount_value), assigned_count: 0, assigned_packages: [], children_count: 0 };
    },
    // Write the new row straight into the cache instead of only invalidating — invalidation
    // only *schedules* a background refetch, so a dialog reading `query.data` right after this
    // mutation resolves could still momentarily see the old (pre-create) list.
    onSuccess: (created) => {
      queryClient.setQueryData<DealRow[]>(key, (old) => [created, ...(old ?? [])]);
    },
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: DealInput;
    }): Promise<Omit<DealRow, 'assigned_count' | 'assigned_packages' | 'children_count'>> => {
      const { data, error } = await supabase.from('deals').update(input as never).eq('id', id).select(DEAL_COLUMNS).single();
      if (error) throw error;
      const row = data as Omit<DealRow, 'discount_value' | 'assigned_count' | 'assigned_packages' | 'children_count'> & {
        discount_value: unknown;
      };
      return { ...row, discount_value: money(row.discount_value) };
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<DealRow[]>(key, (old) => (old ?? []).map((d) => (d.id === updated.id ? { ...d, ...updated } : d)));
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

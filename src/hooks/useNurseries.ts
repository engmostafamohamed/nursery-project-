import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type {
  Nursery,
  NurseryListFilters,
  NurseryListItem,
  NurseryStats,
  NurseryUserSummary,
  PricingModel,
  SubscriptionPlan,
} from '@/types/nursery';

const LIST_QUERY_KEY = 'xo-admin-nurseries';

function mapNurseryRowToListItem(row: Nursery): NurseryListItem {
  const status = (row.subscription_status ?? 'trial') as Nursery['subscription_status'];
  const plan = row.subscription_plan as SubscriptionPlan | null;
  return {
    id: row.id,
    nameAr: row.name_ar,
    nameEn: row.name_en,
    city: row.city,
    phone: row.phone,
    languagePref: row.language_pref,
    subscriptionStatus: status ?? 'trial',
    subscriptionPlan: plan,
    trialEndsAt: row.trial_ends_at,
  };
}

export function useNurseriesList(filters: NurseryListFilters) {
  const query = useQuery({
    queryKey: [LIST_QUERY_KEY, filters],
    queryFn: async (): Promise<NurseryListItem[]> => {
      let queryBuilder = supabase.from('nurseries').select('*');

      if (filters.city !== 'all' && filters.city.trim()) {
        queryBuilder = queryBuilder.eq('city', filters.city.trim());
      }
      if (filters.subscriptionStatus !== 'all') {
        queryBuilder = queryBuilder.eq('subscription_status', filters.subscriptionStatus);
      }

      const { data, error } = await queryBuilder;
      if (error) throw error;

      let rows = (data ?? []) as Nursery[];

      if (filters.search.trim()) {
        const q = filters.search.trim().toLowerCase();
        rows = rows.filter(
          (n) =>
            n.name_ar.toLowerCase().includes(q) ||
            n.name_en.toLowerCase().includes(q),
        );
      }

      return rows.map(mapNurseryRowToListItem);
    },
  });

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useNursery(id: string | null | undefined) {
  const query = useQuery({
    queryKey: ['xo-admin-nursery', id],
    queryFn: async (): Promise<Nursery | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('nurseries')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data as Nursery | null) ?? null;
    },
    enabled: Boolean(id),
  });

  return {
    nursery: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export interface CreateNurseryPayload {
  nameAr: string;
  nameEn: string;
  city: string;
  phone: string;
  languagePref: 'ar' | 'en' | 'both';
  logoFileUrl: string | null;
  opensAt: string | null;
  closesAt: string | null;
  workingDays: number[];
  /** Departments this nursery offers; the parent signup form reads them. */
  departments: string[];
  subscriptionPlan: SubscriptionPlan;
  pricingModel: PricingModel;
  baseFee: number | null;
  perChildRate: number | null;
  hourlyRate: number | null;
  adminNameAr: string;
  adminNameEn: string;
  adminEmail: string;
  adminPhone: string;
}

interface CreateNurseryResult {
  nursery: Nursery;
  adminUserId: string;
}

type FunctionErrorPayload = { error?: string; error_message?: string };

async function getFunctionErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const payload = (await context.clone().json()) as FunctionErrorPayload;
      return payload.error_message || payload.error || (error as Error).message;
    } catch {
      return (error as Error).message;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

export function useCreateNursery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateNurseryPayload): Promise<CreateNurseryResult> => {
      const { data, error } = await supabase.functions.invoke('xo-create-nursery', { body: payload });
      if (error) {
        const message = await getFunctionErrorMessage(error);
        const err = new Error(message);
        (err as Error & { code?: string }).code = message;
        throw err;
      }

      const result = data as CreateNurseryResult | FunctionErrorPayload | null;
      if (!result || 'error' in result) {
        const message = result?.error_message || result?.error || 'create_nursery_failed';
        const err = new Error(message);
        (err as Error & { code?: string }).code = message;
        throw err;
      }

      return result;
      /*

      const existingEmail = await supabase
        .from('users')
        .select('id')
        .ilike('email', payload.adminEmail.trim())
        .maybeSingle();
      if (existingEmail.error && existingEmail.error.code !== 'PGRST116') {
        throw existingEmail.error;
      }
      if (existingEmail.data) {
        const err = new Error('email_not_unique');
        (err as Error & { code?: string }).code = 'email_not_unique';
        throw err;
      }

      const now = new Date();
      const trialEnds = new Date(now.getTime());
      trialEnds.setDate(trialEnds.getDate() + 30);

      const workingDaysStr = payload.workingDays.map((d) => String(d));

      const { data: nurseryRow, error: nurseryError } = await supabase
        .from('nurseries')
        .insert({
          name_ar: payload.nameAr,
          name_en: payload.nameEn,
          city: payload.city,
          phone: payload.phone,
          language_pref: payload.languagePref,
          logo_url: payload.logoFileUrl,
          opens_at: payload.opensAt,
          closes_at: payload.closesAt,
          working_days: workingDaysStr,
          subscription_plan: payload.subscriptionPlan,
          subscription_status: 'trial',
          trial_ends_at: trialEnds.toISOString(),
          pricing_model: payload.pricingModel,
          base_fee: payload.baseFee !== null ? String(payload.baseFee) : null,
          per_child_fee: payload.perChildRate !== null ? String(payload.perChildRate) : null,
        } as never)
        .select('*')
        .single();

      if (nurseryError) throw nurseryError;
      const nursery = nurseryRow as Nursery;

      const { error: settingsError } = await supabase
        .from('nursery_settings')
        .insert({ nursery_id: nursery.id } as never)
        .select('*')
        .single();
      if (settingsError && settingsError.code !== '23505') {
        throw settingsError;
      }

      const tempPassword = generateTemporaryPassword();

      const { data: userRow, error: userError } = await supabase
        .from('users')
        .insert({
          nursery_id: nursery.id,
          role: 'branch_admin',
          name_ar: payload.adminNameAr,
          name_en: payload.adminNameEn,
          email: payload.adminEmail,
          phone: payload.adminPhone,
          status: 'active',
          language_pref: payload.languagePref,
        } as never)
        .select('id')
        .single();

      if (userError) {
        throw userError;
      }

      const adminUserId = (userRow as { id: string }).id;

      try {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-dispatch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            type: 'welcome_branch_admin',
            email: payload.adminEmail,
            payload: {
              nursery_name_en: payload.nameEn,
              admin_name_en: payload.adminNameEn,
              temp_password: tempPassword,
            },
          }),
        });
      } catch {
        // Email dispatch is best-effort — nursery creation still succeeds if this fails.
      }

      return { nursery, adminUserId };
      */
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: [LIST_QUERY_KEY] });
      void queryClient.invalidateQueries({ queryKey: ['xo-admin-nursery', result.nursery.id] });
    },
  });
}

export interface UpdateNurseryPayload {
  id: string;
  nameAr: string;
  nameEn: string;
  city: string;
  phone: string;
  languagePref: 'ar' | 'en' | 'both';
  logoFileUrl: string | null;
  opensAt: string | null;
  closesAt: string | null;
  workingDays: number[];
  departments: string[];
  pricingModel: PricingModel;
  baseFee: number | null;
  perChildRate: number | null;
  hourlyRate: number | null;
}

export function useUpdateNursery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpdateNurseryPayload): Promise<Nursery> => {
      const workingDaysStr = payload.workingDays.map((d) => String(d));

      const { data, error } = await supabase
        .from('nurseries')
        .update({
          name_ar: payload.nameAr,
          name_en: payload.nameEn,
          city: payload.city,
          phone: payload.phone,
          language_pref: payload.languagePref,
          logo_url: payload.logoFileUrl,
          opens_at: payload.opensAt,
          closes_at: payload.closesAt,
          working_days: workingDaysStr,
          departments: payload.departments,
          pricing_model: payload.pricingModel,
          base_fee: payload.baseFee !== null ? String(payload.baseFee) : null,
          per_child_fee: payload.perChildRate !== null ? String(payload.perChildRate) : null,
        } as never)
        .eq('id', payload.id)
        .select('*')
        .single();

      if (error) throw error;
      return data as Nursery;
    },
    onSuccess: (nursery) => {
      void queryClient.invalidateQueries({ queryKey: [LIST_QUERY_KEY] });
      void queryClient.invalidateQueries({ queryKey: ['xo-admin-nursery', nursery.id] });
    },
  });
}

export type AssignNurseryAdminPayload = {
  nurseryId: string;
  adminNameAr: string;
  adminNameEn: string;
  adminEmail: string;
  adminPhone: string;
};

export type AssignNurseryAdminResult = {
  adminUserId: string;
  email: string;
  /** email-dispatch is a stub today, so the caller has to hand this over manually. */
  tempPassword: string;
};

/** Adds a branch_admin to a nursery that already exists (xo-create-nursery only does new ones). */
export function useAssignNurseryAdmin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: AssignNurseryAdminPayload): Promise<AssignNurseryAdminResult> => {
      const { data, error } = await supabase.functions.invoke('xo-assign-nursery-admin', { body: payload });
      if (error) {
        const message = await getFunctionErrorMessage(error);
        const err = new Error(message);
        (err as Error & { code?: string }).code = message;
        throw err;
      }

      const result = data as AssignNurseryAdminResult | FunctionErrorPayload | null;
      if (!result || 'error' in result) {
        const failure = result as FunctionErrorPayload | null;
        const message = failure?.error_message || failure?.error || 'assign_admin_failed';
        const err = new Error(message);
        (err as Error & { code?: string }).code = message;
        throw err;
      }

      return result as AssignNurseryAdminResult;
    },
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['xo-admin-nursery-users', variables.nurseryId] });
    },
  });
}

export function useNurseryUsers(nurseryId: string | null | undefined) {
  const query = useQuery({
    queryKey: ['xo-admin-nursery-users', nurseryId],
    queryFn: async (): Promise<NurseryUserSummary[]> => {
      if (!nurseryId) return [];
      const { data, error } = await supabase
        .from('users')
        .select('id, role, name_ar, name_en, email, phone, status')
        .eq('nursery_id', nurseryId);
      if (error) throw error;
      return (data ?? []) as NurseryUserSummary[];
    },
    enabled: Boolean(nurseryId),
  });

  return {
    users: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useNurseryStats(nurseryId: string | null | undefined) {
  const query = useQuery({
    queryKey: ['xo-admin-nursery-stats', nurseryId],
    queryFn: async (): Promise<NurseryStats | null> => {
      if (!nurseryId) return null;

      const [childrenRes, staffRes, parentsRes] = await Promise.all([
        supabase
          .from('children')
          .select('id', { count: 'exact', head: true })
          .eq('nursery_id', nurseryId),
        supabase
          .from('staff')
          .select('id', { count: 'exact', head: true })
          .eq('nursery_id', nurseryId),
        supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('nursery_id', nurseryId)
          .eq('role', 'parent'),
      ]);

      if (childrenRes.error) throw childrenRes.error;
      if (staffRes.error) throw staffRes.error;
      if (parentsRes.error) throw parentsRes.error;

      return {
        totalChildren: childrenRes.count ?? 0,
        totalStaff: staffRes.count ?? 0,
        activeParents: parentsRes.count ?? 0,
      };
    },
    enabled: Boolean(nurseryId),
  });

  return {
    stats: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}


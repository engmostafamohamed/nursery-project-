import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { StaffContractType, StaffDepartment } from '@/types/tables';

/** Merged staff_profiles row + users; id is staff_profiles.id when present, else users.id for routing. */
export type StaffProfileView = {
  id: string;
  user_id: string;
  nursery_id: string;
  employee_id: string;
  department: StaffDepartment;
  position: string;
  hire_date: string;
  contract_type: StaffContractType;
  salary_amount: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  address: string | null;
  national_id: string | null;
  hasStaffProfile: boolean;
  user: Record<string, unknown> | null;
};

export type StaffProfileInput = {
  user_id: string;
  nursery_id: string;
  employee_id: string;
  department: StaffDepartment;
  position: string;
  hire_date: string;
  contract_type: StaffContractType;
  salary_amount: number | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  address: string | null;
  national_id: string | null;
  qualifications_json: Record<string, unknown>[];
  documents_json: Record<string, unknown>[];
};

interface UserRoleEmbed {
  name_en: string | null;
  name_ar: string | null;
  base_role: string | null;
  base_department: string | null;
  /** null = manage all; [] = none; [...] = specific position keys */
  managed_position_keys: string[] | null;
}

function userToView(u: {
  id: string;
  name_ar: string;
  name_en: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
  role_data?: UserRoleEmbed | null;
}): Record<string, unknown> {
  return {
    id: u.id,
    name_ar: u.name_ar,
    name_en: u.name_en,
    full_name_ar: u.name_ar,
    full_name_en: u.name_en,
    email: u.email,
    phone: u.phone,
    role: u.role,
    role_data: u.role_data ?? null,
    status: u.status,
  };
}

export function useStaff(nurseryId?: string) {
  const qc = useQueryClient();
  const staffQuery = useQuery({
    queryKey: ['staff-profiles', nurseryId],
    queryFn: async () => {
      if (!nurseryId) return [];

      const usersRes = await supabase
        .from('users')
        .select(
          'id, name_ar, name_en, email, role, status, phone, role_data:role_id(name_en, name_ar, base_role, base_department, managed_position_keys)',
        )
        .eq('nursery_id', nurseryId)
        .in('role', ['teacher', 'manager', 'branch_admin', 'chain_super_admin']);

      if (usersRes.error) throw usersRes.error;
      const users = (usersRes.data ?? []) as unknown as Array<{
        id: string;
        name_ar: string;
        name_en: string;
        email: string | null;
        role: string;
        status: string;
        phone: string | null;
        role_data: UserRoleEmbed | null;
      }>;

      const userIds = users.map((u) => u.id);
      if (!userIds.length) return [] as StaffProfileView[];

      const profilesRes = await supabase.from('staff_profiles').select('*').eq('nursery_id', nurseryId).in('user_id', userIds);

      if (profilesRes.error) throw profilesRes.error;
      const profiles = (profilesRes.data ?? []) as Array<Record<string, unknown>>;
      const profileByUserId = new Map(profiles.map((p) => [String(p.user_id), p]));

      return users.map((u) => {
        const sp = profileByUserId.get(u.id);
        const userView = userToView(u);
        if (sp) {
          return {
            ...sp,
            id: String(sp.id),
            user_id: u.id,
            nursery_id: nurseryId,
            hasStaffProfile: true,
            user: userView,
          } as StaffProfileView;
        }
        return {
          id: u.id,
          user_id: u.id,
          nursery_id: nurseryId,
          employee_id: '—',
          department: 'teaching' as StaffDepartment,
          position: '—',
          hire_date: new Date().toISOString().slice(0, 10),
          contract_type: 'full_time' as StaffContractType,
          salary_amount: null,
          emergency_contact_name: null,
          emergency_contact_phone: null,
          address: null,
          national_id: null,
          hasStaffProfile: false,
          user: userView,
        } as StaffProfileView;
      });
    },
    enabled: Boolean(nurseryId),
  });

  const upsertStaff = useMutation({
    mutationFn: async (payload: StaffProfileInput & { id?: string }) => {
      const normalized: StaffProfileInput & { id?: string } = {
        ...payload,
        emergency_contact_name: payload.emergency_contact_name?.trim() || null,
        emergency_contact_phone: payload.emergency_contact_phone?.trim() || null,
        address: payload.address?.trim() || null,
        national_id: payload.national_id?.trim() || null,
      };
      if (normalized.id) {
        const res = await supabase.from('staff_profiles').update(normalized as never).eq('id', normalized.id);
        if (res.error) throw res.error;
        return normalized.id;
      }
      const res = await supabase.from('staff_profiles').insert(normalized as never).select('id').single();
      if (res.error) throw res.error;
      return (res.data as { id: string }).id;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['staff-profiles'] }),
  });

  const deactivateStaff = useMutation({
    mutationFn: async (args: { profileId: string; userId: string; hasStaffProfile: boolean }) => {
      const userRes = await supabase.from('users').update({ status: 'inactive' } as never).eq('id', args.userId);
      if (userRes.error) throw userRes.error;
      if (args.hasStaffProfile) {
        const profileRes = await supabase.from('staff_profiles').update({ position: 'Inactive' } as never).eq('id', args.profileId);
        if (profileRes.error) throw profileRes.error;
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['staff-profiles'] }),
  });

  return {
    staff: staffQuery.data ?? [],
    isLoading: staffQuery.isLoading,
    saveStaff: upsertStaff.mutateAsync,
    deactivateStaff: deactivateStaff.mutateAsync,
  };
}

/**
 * Cross-nursery variant of useStaff. Does NOT filter by nursery_id — server-side
 * RLS enforces visibility: xo_super_admin sees every nursery, chain_super_admin
 * sees their chain, everyone else gets back only their own nursery's rows.
 *
 * Each returned row carries `nursery_id` so the UI can render a Nursery column
 * when the caller has cross-nursery visibility.
 */
export function useAllStaff() {
  const staffQuery = useQuery({
    queryKey: ['staff-profiles', 'all'],
    queryFn: async () => {
      const usersRes = await supabase
        .from('users')
        .select(
          'id, nursery_id, name_ar, name_en, email, role, status, phone, role_data:role_id(name_en, name_ar, base_role, base_department)',
        )
        .in('role', ['teacher', 'manager', 'branch_admin', 'chain_super_admin']);

      if (usersRes.error) throw usersRes.error;
      const users = (usersRes.data ?? []) as unknown as Array<{
        id: string;
        nursery_id: string | null;
        name_ar: string;
        name_en: string;
        email: string | null;
        role: string;
        status: string;
        phone: string | null;
        role_data: UserRoleEmbed | null;
      }>;

      const userIds = users.map((u) => u.id);
      if (!userIds.length) return [] as StaffProfileView[];

      const profilesRes = await supabase
        .from('staff_profiles')
        .select('*')
        .in('user_id', userIds);

      if (profilesRes.error) throw profilesRes.error;
      const profiles = (profilesRes.data ?? []) as Array<Record<string, unknown>>;
      const profileByUserId = new Map(profiles.map((p) => [String(p.user_id), p]));

      return users.map((u) => {
        const sp = profileByUserId.get(u.id);
        const userView = userToView(u);
        if (sp) {
          return {
            ...sp,
            id: String(sp.id),
            user_id: u.id,
            nursery_id: String(sp.nursery_id ?? u.nursery_id ?? ''),
            hasStaffProfile: true,
            user: userView,
          } as StaffProfileView;
        }
        return {
          id: u.id,
          user_id: u.id,
          nursery_id: u.nursery_id ?? '',
          employee_id: '—',
          department: 'teaching' as StaffDepartment,
          position: '—',
          hire_date: new Date().toISOString().slice(0, 10),
          contract_type: 'full_time' as StaffContractType,
          salary_amount: null,
          emergency_contact_name: null,
          emergency_contact_phone: null,
          address: null,
          national_id: null,
          hasStaffProfile: false,
          user: userView,
        } as StaffProfileView;
      });
    },
  });

  return {
    staff: staffQuery.data ?? [],
    isLoading: staffQuery.isLoading,
  };
}

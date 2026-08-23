import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export const packagesKey = (nurseryId: string | null | undefined) =>
  ['admin-packages', nurseryId] as const;
export const packageAssignmentsKey = (packageId: string | null | undefined) =>
  ['admin-package-assignments', packageId] as const;

export type CoverageType = 'unlimited' | 'hours_quota';

export type PackageRow = {
  id: string;
  nursery_id: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  coverage_type: CoverageType;
  included_hours: number | null;
  price: number;
  active: boolean;
  created_at: string;
  assigned_count: number;
};

export type PackageInput = {
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  coverage_type: CoverageType;
  included_hours: number | null;
  price: number;
  active: boolean;
};

export type PackageAssignment = {
  id: string;
  child_id: string;
  status: 'active' | 'cancelled';
  hours_used: number;
  childNameAr: string;
  childNameEn: string;
};

export function useAdminPackages(nurseryId: string | null | undefined) {
  const queryClient = useQueryClient();
  const key = packagesKey(nurseryId);

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<PackageRow[]> => {
      if (!nurseryId) return [];
      const { data, error } = await supabase
        .from('packages')
        .select(
          'id, nursery_id, name_ar, name_en, description_ar, description_en, coverage_type, included_hours, price, active, created_at',
        )
        .eq('nursery_id', nurseryId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const pkgs = (data ?? []) as Omit<PackageRow, 'assigned_count'>[];
      if (!pkgs.length) return [];

      const { data: counts } = await supabase
        .from('child_packages')
        .select('package_id')
        .eq('status', 'active')
        .in(
          'package_id',
          pkgs.map((p) => p.id),
        );
      const countMap = new Map<string, number>();
      for (const r of (counts ?? []) as { package_id: string }[]) {
        countMap.set(r.package_id, (countMap.get(r.package_id) ?? 0) + 1);
      }
      return pkgs.map((p) => ({ ...p, assigned_count: countMap.get(p.id) ?? 0 }));
    },
    enabled: Boolean(nurseryId),
  });

  const create = useMutation({
    mutationFn: async (input: PackageInput) => {
      if (!nurseryId) throw new Error('Missing nursery');
      const { error } = await supabase
        .from('packages')
        .insert({ ...input, nursery_id: nurseryId } as never);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: PackageInput }) => {
      const { error } = await supabase.from('packages').update(input as never).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('packages').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  useEffect(() => {
    if (!nurseryId) return;
    const channel = supabase
      .channel(`admin-packages-${nurseryId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'packages' }, () =>
        void queryClient.invalidateQueries({ queryKey: key }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'child_packages' }, () =>
        void queryClient.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [nurseryId, queryClient, key]);

  return { query, create, update, remove };
}

export function usePackageAssignments(
  packageId: string | null | undefined,
  nurseryId: string | null | undefined,
) {
  const queryClient = useQueryClient();
  const key = packageAssignmentsKey(packageId);

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<PackageAssignment[]> => {
      if (!packageId) return [];
      const { data, error } = await supabase
        .from('child_packages')
        .select('id, child_id, status, hours_used, children (full_name_ar, full_name_en)')
        .eq('package_id', packageId)
        .eq('status', 'active');
      if (error) throw error;
      type Row = {
        id: string;
        child_id: string;
        status: 'active' | 'cancelled';
        hours_used: number;
        children:
          | { full_name_ar: string; full_name_en: string }
          | { full_name_ar: string; full_name_en: string }[]
          | null;
      };
      return ((data ?? []) as Row[]).map((r) => {
        const c = Array.isArray(r.children) ? r.children[0] : r.children;
        return {
          id: r.id,
          child_id: r.child_id,
          status: r.status,
          hours_used: r.hours_used,
          childNameAr: c?.full_name_ar ?? '',
          childNameEn: c?.full_name_en ?? '',
        };
      });
    },
    enabled: Boolean(packageId),
  });

  const assign = useMutation({
    mutationFn: async (childId: string) => {
      if (!packageId || !nurseryId) throw new Error('Missing context');
      // Enforce one active package per child: clear any existing active one.
      await supabase
        .from('child_packages')
        .update({ status: 'cancelled' } as never)
        .eq('child_id', childId)
        .eq('status', 'active');
      const { error } = await supabase.from('child_packages').insert({
        package_id: packageId,
        child_id: childId,
        nursery_id: nurseryId,
        status: 'active',
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ['admin-packages', nurseryId] });
    },
  });

  const unassign = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from('child_packages')
        .update({ status: 'cancelled' } as never)
        .eq('id', assignmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ['admin-packages', nurseryId] });
    },
  });

  return { query, assign, unassign };
}

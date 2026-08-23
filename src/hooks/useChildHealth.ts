import { useQuery } from '@tanstack/react-query';

import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/lib/supabase';
import type {
  ChildAllergiesRow,
  ChildChronicConditionsRow,
  ChildHealthRecordsRow,
  ChildMedicationsRow,
  ChildVaccinationsRow,
} from '@/types/tables/child_health';

export type ChildHealthChild = {
  id: string;
  nursery_id: string;
  full_name_ar: string;
  full_name_en: string;
  avatar_url: string | null;
  class_id: string | null;
};

export type ChildHealthBundle = {
  child: ChildHealthChild;
  record: ChildHealthRecordsRow;
  allergies: ChildAllergiesRow[];
  conditions: ChildChronicConditionsRow[];
  medications: ChildMedicationsRow[];
  vaccinations: ChildVaccinationsRow[];
};

async function ensureHealthRecord(childId: string, nurseryId: string): Promise<ChildHealthRecordsRow> {
  const existing = await supabase
    .from('child_health_records')
    .select('*')
    .eq('child_id', childId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as ChildHealthRecordsRow;
  const inserted = await supabase
    .from('child_health_records')
    .insert({ child_id: childId, nursery_id: nurseryId } as never)
    .select('*')
    .single();
  if (!inserted.error) return inserted.data as ChildHealthRecordsRow;
  const retry = await supabase.from('child_health_records').select('*').eq('child_id', childId).maybeSingle();
  if (retry.error) throw retry.error;
  if (retry.data) return retry.data as ChildHealthRecordsRow;
  throw inserted.error;
}

export function useChildHealth(childId: string | undefined) {
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const role = profile?.role;
  const adminNurseryId = profile?.nursery_id;

  return useQuery({
    queryKey: ['child-health-bundle', childId, role, adminNurseryId],
    queryFn: async (): Promise<ChildHealthBundle | null> => {
      if (!childId || !user?.id) return null;
      const isParent = role === 'parent';
      if (!isParent && !adminNurseryId) return null;

      let childQuery = supabase
        .from('children')
        .select('id, nursery_id, full_name_ar, full_name_en, avatar_url, class_id')
        .eq('id', childId);
      if (!isParent) {
        childQuery = childQuery.eq('nursery_id', adminNurseryId as string);
      }
      const childRes = await childQuery.maybeSingle();
      if (childRes.error) throw childRes.error;
      const childRow = childRes.data as ChildHealthChild | null;
      if (!childRow) return null;

      const record = await ensureHealthRecord(childRow.id, childRow.nursery_id);

      const [al, cond, med, vac] = await Promise.all([
        supabase.from('child_allergies').select('*').eq('child_id', childRow.id).order('created_at'),
        supabase.from('child_chronic_conditions').select('*').eq('child_id', childRow.id).order('created_at'),
        supabase.from('child_medications').select('*').eq('child_id', childRow.id).order('created_at'),
        supabase.from('child_vaccinations').select('*').eq('child_id', childRow.id).order('created_at'),
      ]);
      if (al.error) throw al.error;
      if (cond.error) throw cond.error;
      if (med.error) throw med.error;
      if (vac.error) throw vac.error;

      return {
        child: childRow,
        record,
        allergies: (al.data ?? []) as ChildAllergiesRow[],
        conditions: (cond.data ?? []) as ChildChronicConditionsRow[],
        medications: (med.data ?? []) as ChildMedicationsRow[],
        vaccinations: (vac.data ?? []) as ChildVaccinationsRow[],
      };
    },
    enabled: Boolean(childId && user?.id && (role === 'parent' || Boolean(adminNurseryId))),
  });
}

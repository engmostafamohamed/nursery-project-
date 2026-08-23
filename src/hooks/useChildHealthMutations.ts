import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type {
  ChildAllergiesRow,
  ChildChronicConditionsRow,
  ChildHealthRecordsRow,
  ChildMedicationsRow,
  ChildVaccinationsRow,
} from '@/types/tables/child_health';

function invalidateChildHealth(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['child-health-bundle'] });
  void qc.invalidateQueries({ queryKey: ['health-alerts-dashboard'] });
}

export function useUpdateHealthRecord(childId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<ChildHealthRecordsRow>) => {
      const { data, error } = await supabase
        .from('child_health_records')
        .update(patch as never)
        .eq('child_id', childId)
        .select('*')
        .single();
      if (error) throw error;
      return data as ChildHealthRecordsRow;
    },
    onSuccess: () => invalidateChildHealth(qc),
  });
}

export function useAllergyMutations(_childId: string) {
  const qc = useQueryClient();
  const insert = useMutation({
    mutationFn: async (row: Omit<ChildAllergiesRow, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase.from('child_allergies').insert(row as never).select('*').single();
      if (error) throw error;
      return data as ChildAllergiesRow;
    },
    onSuccess: () => invalidateChildHealth(qc),
  });
  const update = useMutation({
    mutationFn: async (args: { id: string; patch: Partial<ChildAllergiesRow> }) => {
      const { error } = await supabase.from('child_allergies').update(args.patch as never).eq('id', args.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateChildHealth(qc),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('child_allergies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateChildHealth(qc),
  });
  return { insert, update, remove };
}

export function useConditionMutations(_childId: string) {
  const qc = useQueryClient();
  const insert = useMutation({
    mutationFn: async (row: Omit<ChildChronicConditionsRow, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase.from('child_chronic_conditions').insert(row as never).select('*').single();
      if (error) throw error;
      return data as ChildChronicConditionsRow;
    },
    onSuccess: () => invalidateChildHealth(qc),
  });
  const update = useMutation({
    mutationFn: async (args: { id: string; patch: Partial<ChildChronicConditionsRow> }) => {
      const { error } = await supabase.from('child_chronic_conditions').update(args.patch as never).eq('id', args.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateChildHealth(qc),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('child_chronic_conditions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateChildHealth(qc),
  });
  return { insert, update, remove };
}

export function useMedicationMutations(_childId: string) {
  const qc = useQueryClient();
  const insert = useMutation({
    mutationFn: async (row: Omit<ChildMedicationsRow, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase.from('child_medications').insert(row as never).select('*').single();
      if (error) throw error;
      return data as ChildMedicationsRow;
    },
    onSuccess: () => invalidateChildHealth(qc),
  });
  const update = useMutation({
    mutationFn: async (args: { id: string; patch: Partial<ChildMedicationsRow> }) => {
      const { error } = await supabase.from('child_medications').update(args.patch as never).eq('id', args.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateChildHealth(qc),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('child_medications').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateChildHealth(qc),
  });
  return { insert, update, remove };
}

export function useVaccinationMutations(_childId: string) {
  const qc = useQueryClient();
  const insert = useMutation({
    mutationFn: async (row: Omit<ChildVaccinationsRow, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase.from('child_vaccinations').insert(row as never).select('*').single();
      if (error) throw error;
      return data as ChildVaccinationsRow;
    },
    onSuccess: () => invalidateChildHealth(qc),
  });
  const update = useMutation({
    mutationFn: async (args: { id: string; patch: Partial<ChildVaccinationsRow> }) => {
      const { error } = await supabase.from('child_vaccinations').update(args.patch as never).eq('id', args.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateChildHealth(qc),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('child_vaccinations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateChildHealth(qc),
  });
  return { insert, update, remove };
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { ClassStaffRole } from '@/types/tables';

export type StaffPerson = {
  id: string;
  name_ar: string | null;
  name_en: string | null;
  email: string | null;
  phone: string | null;
};

export type ClassStaffMember = StaffPerson & { role: ClassStaffRole };

export type NurseryClassRow = {
  id: string;
  nursery_id: string;
  name_ar: string;
  name_en: string;
  grade_level: string | null;
  capacity: number | null;
  room_number: string | null;
  lead: StaffPerson | null;
  assistants: StaffPerson[];
  child_count: number;
};

export type ClassWithStaff = NurseryClassRow;

async function fetchUsersByIds(ids: string[]): Promise<Map<string, StaffPerson>> {
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from('users')
    .select('id, name_ar, name_en, email, phone')
    .in('id', ids);
  if (error) throw error;
  return new Map(
    (data ?? []).map((u: Record<string, unknown>) => [
      String(u.id),
      {
        id: String(u.id),
        name_ar: (u.name_ar as string | null) ?? null,
        name_en: (u.name_en as string | null) ?? null,
        email: (u.email as string | null) ?? null,
        phone: (u.phone as string | null) ?? null,
      },
    ]),
  );
}

/** All classes for a nursery, with lead, assistants, and child counts. */
export function useNurseryClasses(nurseryId: string | null | undefined) {
  return useQuery({
    queryKey: ['nursery-classes', nurseryId ?? null],
    enabled: Boolean(nurseryId),
    queryFn: async (): Promise<NurseryClassRow[]> => {
      if (!nurseryId) return [];
      const { data: classRows, error } = await supabase
        .from('classes')
        .select('id, nursery_id, name_ar, name_en, grade_level, capacity, room_number')
        .eq('nursery_id', nurseryId)
        .is('deleted_at', null)
        .order('name_en', { ascending: true });
      if (error) throw error;
      const classes = (classRows ?? []) as Array<{
        id: string;
        nursery_id: string;
        name_ar: string;
        name_en: string;
        grade_level: string | null;
        capacity: number | null;
        room_number: string | null;
      }>;
      if (!classes.length) return [];
      const classIds = classes.map((c) => c.id);

      const [staffRes, childRes] = await Promise.all([
        supabase
          .from('class_staff')
          .select('class_id, user_id, role')
          .in('class_id', classIds),
        supabase
          .from('children')
          .select('class_id')
          .in('class_id', classIds)
          .eq('status', 'active'),
      ]);
      if (staffRes.error) throw staffRes.error;
      if (childRes.error) throw childRes.error;
      const staffRows = (staffRes.data ?? []) as Array<{ class_id: string; user_id: string; role: ClassStaffRole }>;
      const childRows = (childRes.data ?? []) as Array<{ class_id: string | null }>;

      const userMap = await fetchUsersByIds(Array.from(new Set(staffRows.map((s) => s.user_id))));
      const childCountByClass = new Map<string, number>();
      for (const c of childRows) {
        if (!c.class_id) continue;
        childCountByClass.set(c.class_id, (childCountByClass.get(c.class_id) ?? 0) + 1);
      }

      return classes.map((c) => {
        const members = staffRows.filter((s) => s.class_id === c.id);
        const leadRow = members.find((m) => m.role === 'lead');
        const assistants = members
          .filter((m) => m.role === 'assistant')
          .map((m) => userMap.get(m.user_id))
          .filter((u): u is StaffPerson => Boolean(u));
        return {
          ...c,
          lead: leadRow ? userMap.get(leadRow.user_id) ?? null : null,
          assistants,
          child_count: childCountByClass.get(c.id) ?? 0,
        };
      });
    },
  });
}

/** Single class with lead + assistants. Roster fetched separately. */
export function useClassWithStaff(classId: string | null | undefined) {
  return useQuery({
    queryKey: ['class-with-staff', classId ?? null],
    enabled: Boolean(classId),
    queryFn: async (): Promise<ClassWithStaff | null> => {
      if (!classId) return null;
      const { data: classRow, error } = await supabase
        .from('classes')
        .select('id, nursery_id, name_ar, name_en, grade_level, capacity, room_number')
        .eq('id', classId)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      if (!classRow) return null;
      const c = classRow as {
        id: string;
        nursery_id: string;
        name_ar: string;
        name_en: string;
        grade_level: string | null;
        capacity: number | null;
        room_number: string | null;
      };
      const [{ data: staffRows, error: staffErr }, { count: childCount, error: childErr }] = await Promise.all([
        supabase
          .from('class_staff')
          .select('user_id, role')
          .eq('class_id', classId),
        supabase
          .from('children')
          .select('id', { count: 'exact', head: true })
          .eq('class_id', classId)
          .eq('status', 'active'),
      ]);
      if (staffErr) throw staffErr;
      if (childErr) throw childErr;
      const members = (staffRows ?? []) as Array<{ user_id: string; role: ClassStaffRole }>;
      const userMap = await fetchUsersByIds(members.map((m) => m.user_id));
      const leadRow = members.find((m) => m.role === 'lead');
      const assistants = members
        .filter((m) => m.role === 'assistant')
        .map((m) => userMap.get(m.user_id))
        .filter((u): u is StaffPerson => Boolean(u));
      return {
        ...c,
        lead: leadRow ? userMap.get(leadRow.user_id) ?? null : null,
        assistants,
        child_count: childCount ?? 0,
      };
    },
  });
}

/** Teachers belonging to the nursery — used to populate lead/assistant pickers. */
export function useNurseryTeachers(nurseryId: string | null | undefined) {
  return useQuery({
    queryKey: ['nursery-teachers', nurseryId ?? null],
    enabled: Boolean(nurseryId),
    queryFn: async (): Promise<StaffPerson[]> => {
      if (!nurseryId) return [];
      const { data, error } = await supabase
        .from('users')
        .select('id, name_ar, name_en, email, phone')
        .eq('nursery_id', nurseryId)
        .eq('role', 'teacher')
        .eq('status', 'active')
        .order('name_en', { ascending: true });
      if (error) throw error;
      return (data ?? []) as StaffPerson[];
    },
  });
}

/** Children assigned to a class. */
export type ClassRosterChild = {
  id: string;
  full_name_ar: string;
  full_name_en: string;
  dob: string | null;
  status: string | null;
};

export function useClassRoster(classId: string | null | undefined) {
  return useQuery({
    queryKey: ['class-roster', classId ?? null],
    enabled: Boolean(classId),
    queryFn: async (): Promise<ClassRosterChild[]> => {
      if (!classId) return [];
      const { data, error } = await supabase
        .from('children')
        .select('id, full_name_ar, full_name_en, dob, status')
        .eq('class_id', classId)
        .order('full_name_en', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClassRosterChild[];
    },
  });
}

/** Children in the nursery without a class — picker for "add to class". */
export function useUnassignedChildren(nurseryId: string | null | undefined) {
  return useQuery({
    queryKey: ['unassigned-children', nurseryId ?? null],
    enabled: Boolean(nurseryId),
    queryFn: async (): Promise<ClassRosterChild[]> => {
      if (!nurseryId) return [];
      const { data, error } = await supabase
        .from('children')
        .select('id, full_name_ar, full_name_en, dob, status')
        .eq('nursery_id', nurseryId)
        .is('class_id', null)
        .eq('status', 'active')
        .order('full_name_en', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClassRosterChild[];
    },
  });
}

/* ---------------- mutations ---------------- */

export function useUpdateClassDetails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      classId: string;
      name_ar: string;
      name_en: string;
      grade_level: string | null;
      room_number: string | null;
      capacity: number | null;
    }) => {
      const { classId, ...patch } = params;
      const { error } = await supabase.from('classes').update(patch as never).eq('id', classId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['class-with-staff', vars.classId] });
      qc.invalidateQueries({ queryKey: ['nursery-classes'] });
    },
  });
}

export function useCreateClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      nursery_id: string;
      name_ar: string;
      name_en: string;
      grade_level: string | null;
      room_number: string | null;
      capacity: number | null;
    }): Promise<string> => {
      const { data, error } = await supabase
        .from('classes')
        .insert(params as never)
        .select('id')
        .single();
      if (error) throw error;
      return String((data as { id: string }).id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nursery-classes'] });
    },
  });
}

export function useDeleteClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (classId: string) => {
      // Soft delete: keep the record but mark it deleted so it is hidden from
      // all class lists/detail queries (which filter `.is('deleted_at', null)`).
      const { error } = await supabase
        .from('classes')
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq('id', classId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nursery-classes'] });
    },
  });
}

export function useSetClassLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { classId: string; userId: string | null }) => {
      const { error } = await supabase.rpc('set_class_lead', {
        p_class_id: params.classId,
        p_user_id: params.userId,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['class-with-staff', vars.classId] });
      qc.invalidateQueries({ queryKey: ['nursery-classes'] });
      qc.invalidateQueries({ queryKey: ['teacher-classes'] });
    },
  });
}

export function useAddClassAssistant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { classId: string; userId: string }) => {
      const { error } = await supabase
        .from('class_staff')
        .insert({ class_id: params.classId, user_id: params.userId, role: 'assistant' } as never);
      if (error && !String(error.message).toLowerCase().includes('duplicate')) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['class-with-staff', vars.classId] });
      qc.invalidateQueries({ queryKey: ['nursery-classes'] });
      qc.invalidateQueries({ queryKey: ['teacher-classes'] });
    },
  });
}

export function useRemoveClassStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { classId: string; userId: string }) => {
      const { error } = await supabase
        .from('class_staff')
        .delete()
        .eq('class_id', params.classId)
        .eq('user_id', params.userId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['class-with-staff', vars.classId] });
      qc.invalidateQueries({ queryKey: ['nursery-classes'] });
      qc.invalidateQueries({ queryKey: ['teacher-classes'] });
    },
  });
}

export function useAssignChildToClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      childId: string;
      classId: string | null;
      sourceClassId?: string | null;
    }) => {
      const { error } = await supabase
        .from('children')
        .update({ class_id: params.classId } as never)
        .eq('id', params.childId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['class-roster'] });
      qc.invalidateQueries({ queryKey: ['unassigned-children'] });
      qc.invalidateQueries({ queryKey: ['nursery-classes'] });
      // Refresh both source and destination class detail queries so child_count
      // / capacity stays accurate after add / remove / move.
      if (vars.classId) qc.invalidateQueries({ queryKey: ['class-with-staff', vars.classId] });
      if (vars.sourceClassId) qc.invalidateQueries({ queryKey: ['class-with-staff', vars.sourceClassId] });
    },
  });
}

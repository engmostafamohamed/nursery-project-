import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { classProfileKeys } from '@/features/classes/useClassProfile';
import { groupClassStaff } from '@/lib/classStaff';
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
  /** The backup teacher who covers the class when the lead is away. */
  substitute: StaffPerson | null;
  assistants: StaffPerson[];
  /** The carers beside the teachers. */
  nannies: StaffPerson[];
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

/**
 * All classes for a nursery, with their team and child counts (get_nursery_classes): read through a
 * function so a class just created, changed or deleted shows at once (the service worker answers
 * table reads from its cache first).
 */
export function useNurseryClasses(nurseryId: string | null | undefined) {
  return useQuery({
    queryKey: ['nursery-classes', nurseryId ?? null],
    enabled: Boolean(nurseryId),
    queryFn: async (): Promise<NurseryClassRow[]> => {
      if (!nurseryId) return [];
      const { data, error } = await supabase.rpc('get_nursery_classes' as never, { p_nursery_id: nurseryId } as never);
      if (error) throw error;
      const rows = (Array.isArray(data) ? data : []) as Array<{
        id: string;
        nursery_id: string;
        name_ar: string;
        name_en: string;
        grade_level: string | null;
        capacity: number | null;
        room_number: string | null;
        child_count: number;
        staff: Array<StaffPerson & { user_id: string; role: ClassStaffRole }>;
      }>;
      return rows.map(({ staff, ...c }) => ({
        ...c,
        child_count: Number(c.child_count) || 0,
        ...groupClassStaff(
          staff.map((p) => ({ user_id: p.user_id, role: p.role })),
          new Map(staff.map((p) => [p.user_id, { id: p.user_id, name_ar: p.name_ar, name_en: p.name_en, email: p.email, phone: p.phone }])),
        ),
      }));
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
      return {
        ...c,
        ...groupClassStaff(members, userMap),
        child_count: childCount ?? 0,
      };
    },
  });
}

/** Teachers belonging to the nursery — used to populate the lead, backup and assistant pickers. */
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
      qc.invalidateQueries({ queryKey: classProfileKeys.all });
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
      qc.invalidateQueries({ queryKey: classProfileKeys.all });
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
      qc.invalidateQueries({ queryKey: classProfileKeys.all });
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
      qc.invalidateQueries({ queryKey: classProfileKeys.all });
      qc.invalidateQueries({ queryKey: ['teacher-classes'] });
    },
  });
}

/** Sets the class's backup teacher, or clears it with `userId: null`. */
export function useSetClassSubstitute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { classId: string; userId: string | null }) => {
      const { error } = await supabase.rpc('set_class_substitute', {
        p_class_id: params.classId,
        p_user_id: params.userId,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['class-with-staff', vars.classId] });
      qc.invalidateQueries({ queryKey: ['nursery-classes'] });
      qc.invalidateQueries({ queryKey: classProfileKeys.all });
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
      qc.invalidateQueries({ queryKey: classProfileKeys.all });
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
      qc.invalidateQueries({ queryKey: classProfileKeys.all });
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
      qc.invalidateQueries({ queryKey: classProfileKeys.all });
      // Refresh both source and destination class detail queries so child_count
      // / capacity stays accurate after add / remove / move.
      if (vars.classId) qc.invalidateQueries({ queryKey: ['class-with-staff', vars.classId] });
      if (vars.sourceClassId) qc.invalidateQueries({ queryKey: ['class-with-staff', vars.sourceClassId] });
    },
  });
}

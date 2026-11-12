/*
 * A class's editing over the network: every read and write is a database function, so a change
 * shows at once (the service worker answers table reads from its cache first).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { classProfileKeys } from '@/features/classes/useClassProfile';
import { callRpc } from '@/lib/rpc';

import { capacityOf, toClassEditor, type ClassDraft, type ClassEditor } from './classEditor';


export const classEditorKeys = {
  all: ['class-editor'] as const,
  one: (nurseryId: string | null | undefined, classId: string | null | undefined) => ['class-editor', nurseryId ?? null, classId ?? null] as const,
};

/** The class (by id) or a new one in `nurseryId`, with its children, candidates and the other classes. */
export function useClassEditor(nurseryId: string | null | undefined, classId: string | null | undefined) {
  return useQuery({
    queryKey: classEditorKeys.one(nurseryId, classId),
    queryFn: async (): Promise<ClassEditor> => toClassEditor(await callRpc('get_class_editor', { p_nursery_id: nurseryId ?? null, p_class_id: classId ?? null })),
    enabled: Boolean(classId || nurseryId),
  });
}

/** Everything that shows classes and their children reads again after a change. */
function useRefreshClasses() {
  const qc = useQueryClient();
  return () => {
    for (const key of [classEditorKeys.all, ['nursery-classes'], ['class-with-staff'], ['class-roster'], ['unassigned-children'], ['class-teams'],
      classProfileKeys.all, ['teacher-classes'], ['my-classes'], ['children']]) {
      void qc.invalidateQueries({ queryKey: key });
    }
  };
}

export function useSaveClass() {
  const refresh = useRefreshClasses();
  return useMutation({
    mutationFn: async (input: { nurseryId: string | null; id: string | null; draft: ClassDraft }): Promise<string> => {
      const d = input.draft;
      return String(await callRpc('save_class', {
        p_nursery_id: input.nurseryId,
        p_id: input.id,
        p_name_ar: d.nameAr.trim() || null,
        p_name_en: d.nameEn.trim() || null,
        p_grade_level: d.gradeLevel.trim() || null,
        p_room_number: d.roomNumber.trim() || null,
        p_capacity: capacityOf(d),
      }));
    },
    onSuccess: refresh,
  });
}

/** Puts children in a class, or (classId null) takes them out of theirs. */
export function useMoveChildren() {
  const refresh = useRefreshClasses();
  return useMutation({
    mutationFn: async (input: { childIds: string[]; classId: string | null; overCapacityOk?: boolean }) =>
      (await callRpc('move_children_to_class', { p_child_ids: input.childIds, p_class_id: input.classId, p_over_capacity_ok: input.overCapacityOk ?? false })) as { moved: number },
    onSuccess: refresh,
  });
}

export function useDeleteClassSafely() {
  const refresh = useRefreshClasses();
  return useMutation({
    mutationFn: async (input: { classId: string; moveTo: string | null }) =>
      (await callRpc('delete_class', { p_class_id: input.classId, p_move_to: input.moveTo })) as { moved: number },
    onSuccess: refresh,
  });
}

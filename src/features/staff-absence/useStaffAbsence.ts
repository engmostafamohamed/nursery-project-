import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { classProfileKeys } from '@/features/classes/useClassProfile';

import { cancelAbsence, fetchMyAbsences, fetchStaffAbsences, reportAbsence } from './staffAbsenceApi';
import type { AbsenceDraft } from './staffAbsence';

export const staffAbsenceKeys = {
  all: ['staff-absence'] as const,
  mine: () => ['staff-absence', 'mine'] as const,
  nursery: (nurseryId: string | null | undefined, from: string, to: string) => ['staff-absence', 'nursery', nurseryId, from, to] as const,
};

export function useMyAbsences(enabled = true) {
  return useQuery({ queryKey: staffAbsenceKeys.mine(), queryFn: fetchMyAbsences, enabled });
}

export function useStaffAbsences(nurseryId: string | null | undefined, from: string, to: string) {
  return useQuery({
    queryKey: staffAbsenceKeys.nursery(nurseryId, from, to),
    queryFn: () => fetchStaffAbsences(nurseryId as string, from, to),
    enabled: Boolean(nurseryId),
  });
}

/** Reporting or cancelling an absence; every absence list and cover view is read again after. */
export function useAbsenceChanges() {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: staffAbsenceKeys.all });
    void queryClient.invalidateQueries({ queryKey: classProfileKeys.all });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };
  const report = useMutation({ mutationFn: (d: AbsenceDraft) => reportAbsence(d), onSuccess: refresh });
  const cancel = useMutation({ mutationFn: (id: string) => cancelAbsence(id), onSuccess: refresh });
  return { report, cancel };
}

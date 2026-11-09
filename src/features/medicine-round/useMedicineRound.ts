import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchMedicineRound } from './medicineRoundApi';

export const medicineRoundKeys = {
  all: ['medicine-round'] as const,
  round: (nurseryId: string | null) => ['medicine-round', nurseryId] as const,
};

/** Today's round; read again every minute so doses move from later to due to overdue on time. */
export function useMedicineRound(nurseryId: string | null, enabled = true) {
  return useQuery({
    queryKey: medicineRoundKeys.round(nurseryId),
    queryFn: () => fetchMedicineRound(nurseryId),
    refetchInterval: 60_000,
    enabled,
  });
}

/** Recording or undoing a dose; the round and the child's health profile are read again. */
export function useRoundChange<TInput>(run: (input: TInput) => Promise<void>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: medicineRoundKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['child-health-profile'] });
    },
  });
}

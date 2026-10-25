import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { DateRange } from '@/lib/attendancePeriods';
import type { SubscriptionRow } from '@/lib/packageSubscriptions';
import { supabase } from '@/lib/supabase';

/**
 * Every package subscription with its money (get_package_subscriptions): all time when `range` is
 * null, else the subscriptions running in those days and the invoices issued in them. The previous
 * period's rows stay on screen, marked as placeholder, while the next one loads.
 */
export function usePackageSubscriptions(nurseryId: string | null | undefined, range: DateRange | null, enabled = true) {
  return useQuery({
    queryKey: ['package-subscriptions', nurseryId, range?.from ?? null, range?.to ?? null],
    queryFn: async (): Promise<SubscriptionRow[]> => {
      const { data, error } = await supabase.rpc(
        'get_package_subscriptions' as never,
        { p_nursery_id: nurseryId, p_from: range?.from ?? null, p_to: range?.to ?? null } as never,
      );
      if (error) throw error;
      return (data ?? []) as SubscriptionRow[];
    },
    enabled: Boolean(nurseryId) && enabled,
    placeholderData: keepPreviousData,
  });
}

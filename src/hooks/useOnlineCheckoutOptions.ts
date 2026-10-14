import { useQuery } from '@tanstack/react-query';

import { fetchOnlineCheckoutOptions, type OnlineCheckoutOptions } from '@/lib/paymob/checkout';

const UNAVAILABLE: OnlineCheckoutOptions = { available: false, testMode: false };

/**
 * Whether online (Paymob) checkout can be offered for a nursery. Only the server knows whether
 * Paymob is configured. If the check fails (e.g. the function is not deployed yet), online
 * checkout is simply not offered and the manual methods keep working.
 */
export function useOnlineCheckoutOptions(nurseryId: string | null | undefined) {
  const query = useQuery({
    queryKey: ['online-checkout-options', nurseryId],
    enabled: Boolean(nurseryId),
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: () => fetchOnlineCheckoutOptions(nurseryId as string),
  });

  return {
    options: query.data ?? UNAVAILABLE,
    isLoading: Boolean(nurseryId) && query.isLoading,
  };
}

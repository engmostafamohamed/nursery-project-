import { useQuery } from '@tanstack/react-query';

import { useAuthSession } from '@/hooks/useAuthSession';

import { fetchParentBilling, fetchParentInvoice } from './parentBillingApi';

/** Query keys of the parent's bills; invalidatePaymentQueries refreshes both after a payment. */
export const parentBillingKeys = {
  all: ['parent-billing'] as const,
  list: (parentId: string | undefined) => ['parent-billing', 'list', parentId] as const,
  invoice: (invoiceId: string | undefined) => ['parent-billing', 'invoice', invoiceId] as const,
};

export function useParentBilling() {
  const { user } = useAuthSession();
  return useQuery({
    queryKey: parentBillingKeys.list(user?.id),
    queryFn: fetchParentBilling,
    enabled: Boolean(user?.id),
  });
}

export function useParentInvoice(invoiceId: string | undefined) {
  return useQuery({
    queryKey: parentBillingKeys.invoice(invoiceId),
    queryFn: () => fetchParentInvoice(invoiceId!),
    enabled: Boolean(invoiceId),
  });
}

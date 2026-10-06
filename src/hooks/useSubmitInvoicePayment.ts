import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuthSession } from '@/hooks/useAuthSession';
import { submitInvoicePayment, type ParentPaymentMethodCode } from '@/lib/paymentApi';

export type SubmitPaymentInput = {
  invoiceId: string;
  amount: number;
  method: ParentPaymentMethodCode;
  reference?: string | null;
  /** Same key for every retry of this one payment, so it is never recorded twice. */
  idempotencyKey: string;
};

/**
 * A parent's payment goes to the nursery's finance team for confirmation. The server checks the
 * invoice is theirs and still open, caps the amount at the unpaid balance, refuses a repeat of
 * the same payment, and notifies finance; the invoice shows "In review" until it is confirmed.
 */
export function useSubmitInvoicePayment() {
  const { user } = useAuthSession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SubmitPaymentInput) => {
      if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('payment_invalid_amount');
      return submitInvoicePayment(input);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['parent-invoices', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['parent-pending-payment-attempts', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['invoice-details'] });
      void queryClient.invalidateQueries({ queryKey: ['payment-history'] });
      void queryClient.invalidateQueries({ queryKey: ['application-package-invoice'] });
      // A payment on an application invoice submits the application (DB trigger).
      void queryClient.invalidateQueries({ queryKey: ['application-detail'] });
      void queryClient.invalidateQueries({ queryKey: ['parent-applications'] });
      void queryClient.invalidateQueries({ queryKey: ['parent-dashboard-feed'] });
      void queryClient.invalidateQueries({ queryKey: ['parent-dashboard-children'] });
    },
  });
}

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuthSession } from '@/hooks/useAuthSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/lib/supabase';

export type SubmitPaymentInput = {
  invoiceId: string;
  amount: number;
  invoiceNumber: string;
};

/**
 * One-click "Pay Now" for parents. There is no payment-method selection: the
 * parent submits the payment, which is recorded as a `payment_attempts` row
 * (status `pending_confirmation`) and routed to the nursery's finance/HR team
 * to accept or reject. The invoice shows as "In review" until they confirm it.
 */
export function useSubmitInvoicePayment() {
  const { user } = useAuthSession();
  const { data: profile } = useUserProfile(user?.id);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SubmitPaymentInput) => {
      const nurseryId = profile?.nursery_id ?? null;
      if (!user?.id || !nurseryId) throw new Error('Missing user or nursery');

      const insertRes = await supabase.from('payment_attempts').insert({
        invoice_id: input.invoiceId,
        parent_id: user.id,
        nursery_id: nurseryId,
        amount: input.amount.toFixed(2),
        payment_method: 'manual',
        status: 'pending_confirmation',
      } as never);
      if (insertRes.error) throw insertRes.error;

      // Route to finance/HR managers plus the branch/chain admins who can confirm.
      const [adminsRes, financeRes] = await Promise.all([
        supabase.from('users').select('id').eq('nursery_id', nurseryId).in('role', ['branch_admin', 'chain_super_admin']),
        supabase
          .from('users')
          .select('id')
          .eq('nursery_id', nurseryId)
          .eq('role', 'manager')
          .in('department', ['finance', 'hr']),
      ]);
      if (adminsRes.error) throw adminsRes.error;
      if (financeRes.error) throw financeRes.error;
      const recipientIds = [
        ...new Set([...(adminsRes.data ?? []), ...(financeRes.data ?? [])].map((r) => (r as { id: string }).id)),
      ];
      if (recipientIds.length) {
        await supabase.from('notifications').insert(
          recipientIds.map((id) => ({
            nursery_id: nurseryId,
            user_id: id,
            type: 'payment_attempt_created',
            title_ar: 'دفعة بانتظار الموافقة',
            title_en: 'Payment awaiting approval',
            body_ar: `قام ولي الأمر بإرسال دفعة للفاتورة ${input.invoiceNumber} للمراجعة.`,
            body_en: `A parent submitted a payment for invoice ${input.invoiceNumber} for review.`,
            channel: 'push',
            read: false,
            sent_at: new Date().toISOString(),
          })) as never,
        );
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['parent-invoices', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['parent-pending-payment-attempts', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['invoice-details'] });
    },
  });
}

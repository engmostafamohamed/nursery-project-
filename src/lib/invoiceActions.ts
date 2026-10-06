import { templateNotificationRow } from '@/lib/notificationText';
import { recordInvoicePayment, type RecordPaymentResult } from '@/lib/paymentApi';
import { supabase } from '@/lib/supabase';

export { confirmPaymentAttempt, rejectPaymentAttempt } from '@/lib/paymentApi';

interface MarkPaidInput {
  invoiceId: string;
  amount: number;
  paymentMethod: string;
  paidAt: string;
  /** Same key for retries of this one action (double click, network retry). */
  idempotencyKey: string;
}

interface CancelInvoiceInput {
  invoiceId: string;
}

interface ReminderInput {
  invoiceId: string;
  nurseryId: string;
  parentId: string;
  parentEmail: string | null;
  parentPhone: string | null;
  parentLanguage: 'ar' | 'en';
  invoiceNumber: string;
  amount: number;
}

/**
 * Records money received outside the app in one server transaction: the payment row (never
 * more than the unpaid balance), the invoice status, the parent's notification and loyalty
 * points. Repeating it — or marking an already-paid invoice — records nothing new.
 */
export function markInvoiceAsPaid(input: MarkPaidInput): Promise<RecordPaymentResult> {
  return recordInvoicePayment({
    invoiceId: input.invoiceId,
    amount: input.amount,
    method: input.paymentMethod,
    paidAt: input.paidAt,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function cancelInvoice(input: CancelInvoiceInput) {
  const { error } = await supabase
    .from('invoices')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', input.invoiceId);
  if (error) throw error;
}

export async function sendInvoiceReminder(input: ReminderInput) {
  await supabase.from('notifications').insert(
    templateNotificationRow({
      nurseryId: input.nurseryId,
      userId: input.parentId,
      type: 'invoice_reminder',
      params: { invoice_number: input.invoiceNumber, amount: input.amount, currency: 'EGP' },
      actionLink: `/parent/invoices/${input.invoiceId}`,
      channel: 'push',
    }) as never,
  );

  if (input.parentEmail) {
    await supabase.functions.invoke('email-dispatch', {
      body: {
        trigger_type: 'invoice',
        recipient_email: input.parentEmail,
        language: input.parentLanguage,
        nursery_id: input.nurseryId,
        user_id: input.parentId,
        data: { amount: String(input.amount) },
      },
    });
  }

  if (input.parentPhone) {
    await supabase.functions.invoke('whatsapp-dispatch', {
      body: {
        trigger_type: 'invoice_ready',
        recipient_phone: input.parentPhone,
        language: input.parentLanguage,
        nursery_id: input.nurseryId,
        user_id: input.parentId,
        data: { amount: String(input.amount) },
      },
    });
  }
}

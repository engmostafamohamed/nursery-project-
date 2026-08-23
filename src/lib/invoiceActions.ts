import { supabase } from '@/lib/supabase';
import { awardPaymentPoints } from '@/lib/loyaltyPoints';

interface MarkPaidInput {
  invoiceId: string;
  nurseryId: string;
  parentId: string;
  invoiceNumber: string;
  amount: number;
  paymentMethod: string;
  paidAt: string;
}

interface CancelInvoiceInput {
  invoiceId: string;
}

interface ReminderInput {
  nurseryId: string;
  parentId: string;
  parentEmail: string | null;
  parentPhone: string | null;
  parentLanguage: 'ar' | 'en';
  invoiceNumber: string;
  amount: number;
}

export async function markInvoiceAsPaid(input: MarkPaidInput) {
  const { error } = await supabase
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: new Date(input.paidAt).toISOString(),
      payment_method: input.paymentMethod,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', input.invoiceId);
  if (error) throw error;

  await supabase.from('notifications').insert({
    nursery_id: input.nurseryId,
    user_id: input.parentId,
    type: 'invoice_paid',
    title_ar: 'تم تأكيد سداد الفاتورة',
    title_en: 'Invoice payment confirmed',
    body_ar: `تم تأكيد سداد الفاتورة ${input.invoiceNumber} بقيمة ${input.amount} جنيه.`,
    body_en: `Invoice ${input.invoiceNumber} payment of EGP ${input.amount} has been confirmed.`,
    channel: 'push',
    read: false,
    sent_at: new Date().toISOString(),
  } as never);

  // Loyalty is a non-critical side effect. Never let it block confirmation —
  // e.g. a finance manager may lack RLS to write loyalty rows.
  try {
    const settingsRes = await supabase
      .from('nursery_settings')
      .select('loyalty_enabled, points_per_egp')
      .eq('nursery_id', input.nurseryId)
      .maybeSingle();
    if (!settingsRes.error) {
      const settings = (settingsRes.data ?? {}) as { loyalty_enabled?: boolean; points_per_egp?: string | null };
      if (settings.loyalty_enabled) {
        await awardPaymentPoints({
          nurseryId: input.nurseryId,
          parentId: input.parentId,
          invoiceId: input.invoiceId,
          amount: input.amount,
          pointsPerEgp: Number(settings.points_per_egp ?? 0),
        });
      }
    }
  } catch {
    // Swallow — the invoice is already marked paid and the parent notified.
  }
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
  await supabase.from('notifications').insert({
    nursery_id: input.nurseryId,
    user_id: input.parentId,
    type: 'invoice_reminder',
    title_ar: 'تذكير بفاتورة مستحقة',
    title_en: 'Invoice reminder',
    body_ar: `تذكير: الفاتورة ${input.invoiceNumber} بقيمة ${input.amount} جنيه ما زالت مستحقة.`,
    body_en: `Reminder: invoice ${input.invoiceNumber} of EGP ${input.amount} is still due.`,
    channel: 'push',
    read: false,
    sent_at: new Date().toISOString(),
  } as never);

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

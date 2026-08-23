import { getAdminClient } from '../_shared/admin.ts';
import { logNotification } from '../_shared/dispatch.ts';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';

type InvoiceRow = {
  id: string;
  nursery_id: string;
  parent_id: string;
  generated_invoice_number: string | null;
  amount: string;
  due_date: string;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  last_reminder_sent_at: string | null;
};

type ParentRow = {
  id: string;
  phone: string | null;
  email: string | null;
  language_pref: string | null;
};

type ReminderTiming = 7 | 3 | 1 | -1 | -3 | -7;

function daysUntilDue(dueDate: string): number {
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / 86400000);
}

function shouldSend(lastReminderAt: string | null): boolean {
  if (!lastReminderAt) return true;
  const last = new Date(lastReminderAt);
  const now = new Date();
  return !(
    last.getUTCFullYear() === now.getUTCFullYear() &&
    last.getUTCMonth() === now.getUTCMonth() &&
    last.getUTCDate() === now.getUTCDate()
  );
}

function channelsForTiming(timing: ReminderTiming) {
  if (timing === 7) return { push: true, email: true, whatsapp: false, sms: false };
  if (timing === 3 || timing === 1) return { push: true, email: true, whatsapp: true, sms: false };
  return { push: true, email: true, whatsapp: true, sms: true };
}

function messages(invoice: InvoiceRow, timing: ReminderTiming) {
  const number = invoice.generated_invoice_number ?? invoice.id.slice(0, 8);
  const amount = invoice.amount;
  if (timing > 0) {
    return {
      titleAr: 'تذكير فاتورة',
      titleEn: 'Invoice Reminder',
      bodyAr: `تذكير: الفاتورة ${number} بقيمة ${amount} جنيه تستحق خلال ${timing} يوم. ادفع الآن لتجنب أي رسوم.`,
      bodyEn: `Reminder: Invoice ${number} for EGP ${amount} is due in ${timing} day(s). Pay now to avoid late fees.`,
    };
  }
  const overdueDays = Math.abs(timing);
  return {
    titleAr: 'تنبيه فاتورة متأخرة',
    titleEn: 'Overdue Invoice Alert',
    bodyAr: `عاجل: الفاتورة ${number} بقيمة ${amount} جنيه متأخرة ${overdueDays} يوم. يرجى السداد فورًا.`,
    bodyEn: `Urgent: Invoice ${number} for EGP ${amount} is ${overdueDays} day(s) overdue. Please pay immediately.`,
  };
}

async function invokeChannelFunction(
  fnName: 'email-dispatch' | 'whatsapp-dispatch' | 'sms-dispatch',
  payload: Record<string, unknown>,
) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) return;
  await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: `Bearer ${serviceRole}`,
      apikey: serviceRole,
    },
    body: JSON.stringify(payload),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = getAdminClient();
    const invoicesRes = await supabase
      .from('invoices')
      .select('id, nursery_id, parent_id, generated_invoice_number, amount, due_date, status, last_reminder_sent_at')
      .eq('status', 'pending');
    if (invoicesRes.error) throw new Error(invoicesRes.error.message);
    const invoices = (invoicesRes.data ?? []) as InvoiceRow[];
    if (!invoices.length) return jsonResponse({ ok: true, sent: 0 });

    const parentIds = [...new Set(invoices.map((row) => row.parent_id))];
    const parentsRes = await supabase
      .from('users')
      .select('id, phone, email, language_pref')
      .in('id', parentIds);
    if (parentsRes.error) throw new Error(parentsRes.error.message);
    const parentMap = new Map((parentsRes.data ?? []).map((row) => [row.id, row as ParentRow]));

    let sent = 0;
    for (const invoice of invoices) {
      const timing = daysUntilDue(invoice.due_date);
      if (![7, 3, 1, -1, -3, -7].includes(timing)) continue;
      if (!shouldSend(invoice.last_reminder_sent_at)) continue;
      // TODO Feature 5.5: gate reminders by a dedicated settings.reminders_enabled flag.
      const parent = parentMap.get(invoice.parent_id);
      if (!parent) continue;
      const timingTyped = timing as ReminderTiming;
      const msg = messages(invoice, timingTyped);
      const channels = channelsForTiming(timingTyped);
      const language = parent.language_pref === 'en' ? 'en' : 'ar';

      if (channels.email && parent.email) {
        await invokeChannelFunction('email-dispatch', {
          trigger_type: 'invoice',
          recipient_email: parent.email,
          language,
          nursery_id: invoice.nursery_id,
          user_id: parent.id,
          data: { amount: invoice.amount },
        });
      }
      if (channels.whatsapp && parent.phone) {
        await invokeChannelFunction('whatsapp-dispatch', {
          trigger_type: 'custom',
          recipient_phone: parent.phone,
          language,
          nursery_id: invoice.nursery_id,
          user_id: parent.id,
          data: { message_ar: msg.bodyAr, message_en: msg.bodyEn },
        });
      }
      if (channels.sms && parent.phone) {
        await invokeChannelFunction('sms-dispatch', {
          trigger_type: 'payment_overdue',
          recipient_phone: parent.phone,
          language,
          nursery_id: invoice.nursery_id,
          user_id: parent.id,
          data: { amount: invoice.amount },
        });
      }
      if (channels.push) {
        await logNotification({
          supabase,
          nurseryId: invoice.nursery_id,
          userId: parent.id,
          triggerType: timing > 0 ? 'invoice_due_reminder' : 'invoice_overdue_reminder',
          channel: 'push',
          language,
          titleAr: msg.titleAr,
          titleEn: msg.titleEn,
          bodyAr: msg.bodyAr,
          bodyEn: msg.bodyEn,
        });
      }

      await supabase
        .from('invoices')
        .update({ last_reminder_sent_at: new Date().toISOString() } as never)
        .eq('id', invoice.id);
      sent += 1;
    }

    return jsonResponse({ ok: true, sent });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
});

import { getAdminClient } from '../_shared/admin.ts';
import { countChannelToday, logNotification, pickLanguage, pickText } from '../_shared/dispatch.ts';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';

type TriggerType =
  | 'attendance_checkin'
  | 'attendance_checkout'
  | 'payment_overdue'
  | 'invoice_ready'
  | 'broadcast'
  | 'custom';

interface RequestBody {
  trigger_type: TriggerType;
  recipient_phone: string;
  language?: 'ar' | 'en';
  nursery_id: string;
  user_id: string;
  data?: Record<string, string | number | boolean | null>;
}

function buildTemplate(triggerType: TriggerType, data: RequestBody['data']) {
  const childName = String(data?.child_name ?? 'Child');
  const amount = String(data?.amount ?? '');
  const arByType: Record<TriggerType, string> = {
    attendance_checkin: `تم تسجيل حضور ${childName} بنجاح.`,
    attendance_checkout: `تم تسجيل انصراف ${childName} بنجاح.`,
    payment_overdue: `لديك دفعة متأخرة بقيمة ${amount}.`,
    invoice_ready: `تم إصدار فاتورة جديدة بقيمة ${amount}.`,
    broadcast: String(data?.message_ar ?? 'رسالة جديدة من الحضانة.'),
    custom: String(data?.message_ar ?? 'تحديث جديد من XO Nursery.'),
  };
  const enByType: Record<TriggerType, string> = {
    attendance_checkin: `${childName} has been checked in.`,
    attendance_checkout: `${childName} has been checked out.`,
    payment_overdue: `You have an overdue payment of ${amount}.`,
    invoice_ready: `A new invoice of ${amount} is ready.`,
    broadcast: String(data?.message_en ?? 'New message from the nursery.'),
    custom: String(data?.message_en ?? 'New update from XO Nursery.'),
  };

  return {
    titleAr: 'إشعار واتساب',
    titleEn: 'WhatsApp Alert',
    bodyAr: arByType[triggerType],
    bodyEn: enByType[triggerType],
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = (await req.json()) as RequestBody;
    if (!body.trigger_type || !body.recipient_phone || !body.nursery_id || !body.user_id) {
      return jsonResponse({ error: 'trigger_type, recipient_phone, nursery_id, user_id are required' }, 400);
    }

    const supabase = getAdminClient();
    const sentToday = await countChannelToday(supabase, body.user_id, 'whatsapp');
    // TODO Phase 3: Replace hardcoded limit with settings.max_whatsapp_per_parent_per_day.
    if (sentToday >= 10) {
      return jsonResponse({ error: 'Daily WhatsApp limit reached (10 per parent)' }, 429);
    }

    const language = pickLanguage(body.language);
    const template = buildTemplate(body.trigger_type, body.data);
    const text = pickText(language, template.bodyAr, template.bodyEn);

    // Stubbed 360dialog call until credentials are added.
    console.log('[whatsapp-dispatch] 360dialog payload', {
      to: body.recipient_phone,
      trigger_type: body.trigger_type,
      text,
    });

    await logNotification({
      supabase,
      nurseryId: body.nursery_id,
      userId: body.user_id,
      triggerType: `whatsapp_${body.trigger_type}`,
      channel: 'whatsapp',
      language,
      titleAr: template.titleAr,
      titleEn: template.titleEn,
      bodyAr: template.bodyAr,
      bodyEn: template.bodyEn,
    });

    return jsonResponse({ ok: true, provider: '360dialog_stub' });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
});

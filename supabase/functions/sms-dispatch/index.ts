import { getAdminClient } from '../_shared/admin.ts';
import {
  isAtLeastFiveMinutesAgo,
  logNotification,
  pickLanguage,
  pickText,
} from '../_shared/dispatch.ts';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';

type SmsTrigger = 'otp_login' | 'payment_overdue_fallback' | 'emergency_broadcast_fallback';

interface RequestBody {
  trigger_type: SmsTrigger;
  recipient_phone: string;
  language?: 'ar' | 'en';
  nursery_id: string;
  user_id: string;
  data?: Record<string, string | number | boolean | null>;
  whatsapp_failed_at?: string;
}

function smsContent(trigger: SmsTrigger, data: RequestBody['data']) {
  const code = String(data?.otp_code ?? '000000');
  const amount = String(data?.amount ?? '');
  return {
    titleAr: 'إشعار SMS',
    titleEn: 'SMS Alert',
    bodyAr:
      trigger === 'otp_login'
        ? `رمز التحقق الخاص بك: ${code}`
        : trigger === 'payment_overdue_fallback'
          ? `دفعتك المتأخرة ${amount}. يرجى السداد في أقرب وقت.`
          : String(data?.message_ar ?? 'تنبيه طارئ من الحضانة.'),
    bodyEn:
      trigger === 'otp_login'
        ? `Your OTP code is: ${code}`
        : trigger === 'payment_overdue_fallback'
          ? `Your overdue amount is ${amount}. Please pay as soon as possible.`
          : String(data?.message_en ?? 'Emergency alert from nursery.'),
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

    if (body.trigger_type !== 'otp_login') {
      if (!body.whatsapp_failed_at || !isAtLeastFiveMinutesAgo(body.whatsapp_failed_at)) {
        return jsonResponse({ error: 'SMS fallback requires WhatsApp failure older than 5 minutes' }, 400);
      }
    }

    const supabase = getAdminClient();
    const language = pickLanguage(body.language);
    const content = smsContent(body.trigger_type, body.data);
    const text = pickText(language, content.bodyAr, content.bodyEn);

    // Stubbed SMS Misr call until API key is configured.
    console.log('[sms-dispatch] SMS Misr payload', {
      to: body.recipient_phone,
      trigger_type: body.trigger_type,
      text,
    });

    await logNotification({
      supabase,
      nurseryId: body.nursery_id,
      userId: body.user_id,
      triggerType: `sms_${body.trigger_type}`,
      channel: 'sms',
      language,
      titleAr: content.titleAr,
      titleEn: content.titleEn,
      bodyAr: content.bodyAr,
      bodyEn: content.bodyEn,
    });

    return jsonResponse({ ok: true, provider: 'sms_misr_stub' });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
});

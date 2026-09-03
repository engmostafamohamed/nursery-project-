import { getAdminClient } from '../_shared/admin.ts';
import { logNotification, pickLanguage, pickText } from '../_shared/dispatch.ts';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';

type EmailTrigger = 'welcome' | 'invoice' | 'password_reset' | 'trial_expiry';

interface RequestBody {
  trigger_type: EmailTrigger;
  recipient_email: string;
  language?: 'ar' | 'en';
  nursery_id: string;
  user_id: string;
  data?: Record<string, string | number | boolean | null>;
}

function template(triggerType: EmailTrigger, data: RequestBody['data']) {
  const name = String(data?.name ?? 'Parent');
  const amount = String(data?.amount ?? '');
  const code = String(data?.otp_code ?? '');
  const titleArByType: Record<EmailTrigger, string> = {
    welcome: 'مرحباً بك في XO Nursery',
    invoice: 'فاتورة جديدة',
    password_reset: 'إعادة تعيين كلمة المرور',
    trial_expiry: 'تنبيه انتهاء الفترة التجريبية',
  };
  const titleEnByType: Record<EmailTrigger, string> = {
    welcome: 'Welcome to XO Nursery',
    invoice: 'New invoice',
    password_reset: 'Reset your password',
    trial_expiry: 'Trial expiration alert',
  };
  const bodyArByType: Record<EmailTrigger, string> = {
    welcome: `مرحباً ${name}، شكراً لانضمامك إلى XO Nursery.`,
    invoice: `تم إنشاء فاتورة جديدة بقيمة ${amount}.`,
    password_reset: 'يمكنك إعادة تعيين كلمة المرور من الرابط المرسل.',
    trial_expiry: 'ستنتهي الفترة التجريبية قريباً. يرجى الترقية للاستمرار.',
  };
  const bodyEnByType: Record<EmailTrigger, string> = {
    welcome: `Hi ${name}, thank you for joining XO Nursery.`,
    invoice: `A new invoice of ${amount} has been generated.`,
    password_reset: code
      ? `Your password reset verification code is: ${code}`
      : 'You can reset your password from the sent link.',
    trial_expiry: 'Your trial will expire soon. Please upgrade to continue.',
  };

  return {
    titleAr: titleArByType[triggerType],
    titleEn: titleEnByType[triggerType],
    bodyAr: triggerType === 'password_reset' && code
      ? `Your password reset verification code is: ${code}`
      : bodyArByType[triggerType],
    bodyEn: bodyEnByType[triggerType],
  };
}

function buildHtml(language: 'ar' | 'en', title: string, body: string): string {
  const footer = language === 'ar' ? 'فريق XO Nursery' : 'XO Nursery Team';
  return `
    <div style="font-family: Inter, Arial, sans-serif; background:#f7f9fb; padding:24px;">
      <div style="max-width:640px; margin:auto; background:#ffffff; border-radius:12px; overflow:hidden;">
        <div style="background:#001f3f; color:#ffffff; padding:16px 20px;">
          <strong>XO Nursery</strong>
        </div>
        <div style="padding:20px;">
          <h2 style="margin:0 0 12px;">${title}</h2>
          <p style="margin:0 0 16px; color:#191c1e;">${body}</p>
          <hr style="border:none; border-top:1px solid #e6e8ea;" />
          <p style="margin-top:12px; color:#74777f; font-size:12px;">${footer}</p>
        </div>
      </div>
    </div>
  `;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = (await req.json()) as RequestBody;
    if (!body.trigger_type || !body.recipient_email || !body.nursery_id || !body.user_id) {
      return jsonResponse({ error: 'trigger_type, recipient_email, nursery_id, user_id are required' }, 400);
    }

    const supabase = getAdminClient();
    const language = pickLanguage(body.language);
    const content = template(body.trigger_type, body.data);
    const title = pickText(language, content.titleAr, content.titleEn);
    const textBody = pickText(language, content.bodyAr, content.bodyEn);
    const html = buildHtml(language, title, textBody);

    // Stubbed Resend call until API key is configured.
    console.log('[email-dispatch] Resend payload', {
      to: body.recipient_email,
      trigger_type: body.trigger_type,
      subject: title,
      html,
    });

    await logNotification({
      supabase,
      nurseryId: body.nursery_id,
      userId: body.user_id,
      triggerType: `email_${body.trigger_type}`,
      channel: 'email',
      language,
      titleAr: content.titleAr,
      titleEn: content.titleEn,
      bodyAr: content.bodyAr,
      bodyEn: content.bodyEn,
    });

    return jsonResponse({ ok: true, provider: 'resend_stub' });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
});

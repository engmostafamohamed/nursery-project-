// The words of each email, SMS and WhatsApp message the app sends, in Arabic and English. These
// leave the system as text, so they are written here; the database keeps only the message type.
import type { Channel, Language } from './messaging.ts';

type Data = Record<string, string | number | boolean | null | undefined>;

type Parts = { subject: string; lines: string[]; link?: { path: string; label: string } };
type Template = (data: Data, lang: Language) => Parts;

const APP = 'XO Nursery';

const str = (value: unknown, fallback = '') => (value == null ? fallback : String(value).trim() || fallback);
const money = (value: unknown, lang: Language) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return str(value);
  const amount = n.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { maximumFractionDigits: 2 });
  return lang === 'ar' ? `${amount} جنيه` : `EGP ${amount}`;
};
const pick = (lang: Language, ar: string, en: string) => (lang === 'ar' ? ar : en);

const EMAIL: Record<string, Template> = {
  password_reset: (d, l) => ({
    subject: pick(l, 'رمز التحقق الخاص بك', 'Your verification code'),
    lines: [
      pick(l, `رمز التحقق هو ${str(d.otp_code)}.`, `Your verification code is ${str(d.otp_code)}.`),
      pick(l, 'إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة.', "If you didn't ask for this code, ignore this message."),
    ],
  }),
  invoice: (d, l) => ({
    subject: pick(l, 'فاتورة جديدة', 'New invoice'),
    lines: [
      pick(l, `تم إصدار فاتورة جديدة بقيمة ${money(d.amount, l)}.`, `A new invoice of ${money(d.amount, l)} is ready.`),
      pick(l, 'يمكنك مراجعتها ودفعها من تطبيق ولي الأمر.', 'You can review and pay it in the parent app.'),
    ],
    link: { path: '/parent/invoices', label: pick(l, 'عرض الفواتير', 'View invoices') },
  }),
  application_invite: (d, l) => ({
    subject: pick(l, 'أكمل تسجيل طفلك', "Complete your child's registration"),
    lines: [pick(l, 'دعتك الحضانة لإكمال طلب تسجيل طفلك من تطبيق ولي الأمر.', "The nursery invited you to complete your child's registration in the parent app.")],
    link: d.application_id
      ? { path: `/parent/applications/${encodeURIComponent(str(d.application_id))}`, label: pick(l, 'إكمال الطلب', 'Complete the application') }
      : undefined,
  }),
  application_approved: (_d, l) => ({
    subject: pick(l, 'تم قبول طلب التسجيل', 'Your application was accepted'),
    lines: [pick(l, 'يسعدنا إبلاغك بقبول طلب تسجيل طفلك. ستجد التفاصيل في تطبيق ولي الأمر.', "We're happy to tell you your child's application was accepted. You'll find the details in the parent app.")],
    link: { path: '/parent', label: pick(l, 'فتح التطبيق', 'Open the app') },
  }),
  application_rejected: (d, l) => ({
    subject: pick(l, 'بخصوص طلب التسجيل', 'About your application'),
    lines: [
      pick(l, 'نأسف، لم يتم قبول طلب التسجيل.', "We're sorry, the application was not accepted."),
      ...(str(d.reason) ? [pick(l, `السبب: ${str(d.reason)}`, `Reason: ${str(d.reason)}`)] : []),
    ],
  }),
  application_documents_pending: (d, l) => ({
    subject: pick(l, 'مطلوب مستندات لطلب التسجيل', 'Documents needed for your application'),
    lines: [
      pick(l, 'تحتاج الحضانة إلى مستندات إضافية لإكمال مراجعة الطلب.', 'The nursery needs more documents to finish reviewing the application.'),
      ...(str(d.reason) ? [pick(l, `ملاحظة: ${str(d.reason)}`, `Note: ${str(d.reason)}`)] : []),
    ],
    link: { path: '/parent/applications', label: pick(l, 'رفع المستندات', 'Upload documents') },
  }),
  inquiry_confirmation: (d, l) => ({
    subject: pick(l, 'استلمنا استفسارك', 'We received your inquiry'),
    lines: [
      pick(
        l,
        `مرحبًا ${str(d.parent_name, 'ولي الأمر')}، استلمنا استفسارك${str(d.child_name) ? ` عن ${str(d.child_name)}` : ''} وسنتواصل معك قريبًا.`,
        `Hello ${str(d.parent_name, 'there')}, we received your inquiry${str(d.child_name) ? ` about ${str(d.child_name)}` : ''} and will be in touch soon.`,
      ),
    ],
  }),
  waitlist_opening: (d, l) => ({
    subject: pick(l, 'يوجد مكان متاح', 'A place is available'),
    lines: [
      pick(
        l,
        `أصبح هناك مكان متاح${str(d.class_name) ? ` في ${str(d.class_name)}` : ''}. تواصل مع الحضانة لحجزه.`,
        `A place has opened${str(d.class_name) ? ` in ${str(d.class_name)}` : ''}. Contact the nursery to reserve it.`,
      ),
    ],
  }),
  parent_account_invite: (_d, l) => ({
    subject: pick(l, 'حساب ولي الأمر جاهز', 'Your parent account is ready'),
    lines: [
      pick(l, 'أنشأت الحضانة حسابك في تطبيق ولي الأمر.', 'The nursery created your account in the parent app.'),
      pick(l, 'استخدم "نسيت كلمة المرور" في صفحة الدخول لتعيين كلمة المرور.', 'Use "Forgot password" on the sign-in page to set your password.'),
    ],
    link: { path: '/login', label: pick(l, 'تسجيل الدخول', 'Sign in') },
  }),
};

const SMS: Record<string, Template> = {
  otp_login: (d, l) => ({
    subject: pick(l, 'رمز التحقق', 'Verification code'),
    lines: [pick(l, `رمز ${APP}: ${str(d.otp_code)}`, `${APP} code: ${str(d.otp_code)}`)],
  }),
};

const WHATSAPP: Record<string, Template> = {
  invoice_ready: (d, l) => ({
    subject: pick(l, 'فاتورة جديدة', 'New invoice'),
    lines: [pick(l, `تم إصدار فاتورة جديدة بقيمة ${money(d.amount, l)}. يمكنك دفعها من تطبيق ولي الأمر.`, `A new invoice of ${money(d.amount, l)} is ready. You can pay it in the parent app.`)],
  }),
  waitlist_opening: (d, l) => EMAIL.waitlist_opening(d, l),
  payment_overdue: (d, l) => ({
    subject: pick(l, 'دفعة متأخرة', 'Overdue payment'),
    lines: [pick(l, `لديك دفعة متأخرة بقيمة ${money(d.amount, l)}.`, `You have an overdue payment of ${money(d.amount, l)}.`)],
  }),
  attendance_checkin: (d, l) => ({
    subject: pick(l, 'تسجيل حضور', 'Check-in'),
    lines: [pick(l, `تم تسجيل حضور ${str(d.child_name, 'طفلك')}.`, `${str(d.child_name, 'Your child')} has been checked in.`)],
  }),
  attendance_checkout: (d, l) => ({
    subject: pick(l, 'تسجيل انصراف', 'Check-out'),
    lines: [pick(l, `تم تسجيل انصراف ${str(d.child_name, 'طفلك')}.`, `${str(d.child_name, 'Your child')} has been checked out.`)],
  }),
  broadcast: (d, l) => ({
    subject: pick(l, 'رسالة من الحضانة', 'Message from the nursery'),
    lines: [pick(l, str(d.message_ar, str(d.message_en)), str(d.message_en, str(d.message_ar)))],
  }),
};
WHATSAPP.custom = WHATSAPP.broadcast;

const BY_CHANNEL: Record<Channel, Record<string, Template>> = { email: EMAIL, sms: SMS, whatsapp: WHATSAPP };

/** Messages a parent may send to themselves: their own verification codes. Everything else is staff only. */
export const SELF_SERVICE_TYPES: Record<Channel, ReadonlySet<string>> = {
  email: new Set(['password_reset']),
  sms: new Set(['otp_login']),
  whatsapp: new Set(),
};

export function isKnownMessageType(channel: Channel, type: string): boolean {
  return Object.prototype.hasOwnProperty.call(BY_CHANNEL[channel], type);
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/** Subject, plain text and (for email) HTML of a message. Links need APP_BASE_URL (the app's address). */
export function renderMessage(channel: Channel, type: string, data: Data, lang: Language, appBaseUrl?: string) {
  const parts = BY_CHANNEL[channel][type](data, lang);
  const base = appBaseUrl?.trim().replace(/\/$/, '');
  const link = parts.link && base ? { url: `${base}${parts.link.path}`, label: parts.link.label } : null;
  const text = [...parts.lines, ...(link ? [`${link.label}: ${link.url}`] : [])].join('\n');
  if (channel !== 'email') return { subject: parts.subject, text };

  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const html = `<div dir="${dir}" style="font-family: Inter, Arial, sans-serif; background:#f7f9fb; padding:24px;">
  <div style="max-width:640px; margin:auto; background:#ffffff; border-radius:12px; overflow:hidden;">
    <div style="background:#001f3f; color:#ffffff; padding:16px 20px;"><strong>${APP}</strong></div>
    <div style="padding:20px; color:#191c1e;">
      <h2 style="margin:0 0 12px;">${escapeHtml(parts.subject)}</h2>
      ${parts.lines.map((line) => `<p style="margin:0 0 12px;">${escapeHtml(line)}</p>`).join('\n      ')}
      ${link ? `<p style="margin:16px 0;"><a href="${escapeHtml(link.url)}" style="background:#5c63d6; color:#ffffff; padding:10px 16px; border-radius:8px; text-decoration:none;">${escapeHtml(link.label)}</a></p>` : ''}
      <hr style="border:none; border-top:1px solid #e6e8ea;" />
      <p style="margin-top:12px; color:#74777f; font-size:12px;">${pick(lang, `فريق ${APP}`, `${APP} Team`)}</p>
    </div>
  </div>
</div>`;
  return { subject: parts.subject, text, html };
}

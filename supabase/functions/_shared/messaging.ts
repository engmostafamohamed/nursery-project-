// Sends an email, SMS or WhatsApp message through its provider, or records it in demo mode.
//
// Each channel is live as soon as its provider's variables are set (Supabase → Edge Functions →
// Secrets); until then it runs in demo mode: nothing leaves the server and the caller is told so.
// MESSAGING_MODE=demo keeps every channel in demo mode even with keys set (e.g. on staging).
//
//   email    → Resend:     RESEND_API_KEY, EMAIL_FROM ("XO Nursery <no-reply@your-domain>")
//   sms      → SMS Misr:   SMS_MISR_USERNAME, SMS_MISR_PASSWORD, SMS_MISR_SENDER
//                          (SMS_MISR_ENVIRONMENT: 1 live, 2 test; default 1)
//   whatsapp → 360dialog:  WHATSAPP_360DIALOG_API_KEY (WHATSAPP_360DIALOG_URL optional)

export type Channel = 'email' | 'sms' | 'whatsapp';
export type DeliveryMode = 'live' | 'demo';
export type Language = 'ar' | 'en';

type Env = { get(name: string): string | undefined };

const set = (env: Env, name: string) => Boolean(env.get(name)?.trim());

/** Live when the channel's provider is configured, unless MESSAGING_MODE=demo. */
export function deliveryMode(channel: Channel, env: Env = Deno.env): DeliveryMode {
  if (env.get('MESSAGING_MODE')?.trim().toLowerCase() === 'demo') return 'demo';
  if (channel === 'email') return set(env, 'RESEND_API_KEY') && set(env, 'EMAIL_FROM') ? 'live' : 'demo';
  if (channel === 'sms') {
    return set(env, 'SMS_MISR_USERNAME') && set(env, 'SMS_MISR_PASSWORD') && set(env, 'SMS_MISR_SENDER') ? 'live' : 'demo';
  }
  return set(env, 'WHATSAPP_360DIALOG_API_KEY') ? 'live' : 'demo';
}

export const PROVIDER: Record<Channel, string> = { email: 'resend', sms: 'sms_misr', whatsapp: '360dialog' };

/**
 * An Egyptian mobile number in international form without "+": 01012345678 → 201012345678.
 * Other numbers keep their digits. Returns null when there are too few digits to be a number.
 */
export function internationalMobile(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('01')) digits = `2${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/** Roughly valid email address (the provider does the real check). */
export function isEmailAddress(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) && raw.length <= 320;
}

/** "m***@example.com" / "2010*****678": enough to recognise in logs, not to reuse. */
export function maskRecipient(channel: Channel, recipient: string): string {
  if (channel === 'email') {
    const [name, domain] = recipient.split('@');
    return `${name?.slice(0, 1) ?? ''}***@${domain ?? ''}`;
  }
  return recipient.length > 7 ? `${recipient.slice(0, 4)}${'*'.repeat(recipient.length - 7)}${recipient.slice(-3)}` : '***';
}

export type OutboundMessage = {
  channel: Channel;
  /** Email address, or a mobile number already in international form. */
  to: string;
  language: Language;
  subject: string;
  text: string;
  html?: string;
};

export type DeliveryResult = { mode: DeliveryMode; provider: string; providerMessageId: string | null };

async function sendEmail(message: OutboundMessage, env: Env): Promise<string | null> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.get('EMAIL_FROM'),
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    }),
  });
  const body = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (!res.ok) throw new Error(`resend_${res.status}: ${body?.message ?? 'request failed'}`);
  return body?.id ?? null;
}

async function sendSms(message: OutboundMessage, env: Env): Promise<string | null> {
  const url = new URL(env.get('SMS_MISR_URL')?.trim() || 'https://smsmisr.com/api/SMS/');
  url.searchParams.set('environment', env.get('SMS_MISR_ENVIRONMENT')?.trim() || '1');
  url.searchParams.set('username', env.get('SMS_MISR_USERNAME') ?? '');
  url.searchParams.set('password', env.get('SMS_MISR_PASSWORD') ?? '');
  url.searchParams.set('sender', env.get('SMS_MISR_SENDER') ?? '');
  url.searchParams.set('mobile', message.to);
  // 1 English, 2 Arabic.
  url.searchParams.set('language', message.language === 'ar' ? '2' : '1');
  url.searchParams.set('message', message.text);
  const res = await fetch(url, { method: 'POST' });
  const body = (await res.json().catch(() => null)) as { code?: string | number; SMSID?: string | number } | null;
  // SMS Misr answers 1901 when the message is accepted.
  if (!res.ok || String(body?.code) !== '1901') throw new Error(`sms_misr_${body?.code ?? res.status}`);
  return body?.SMSID != null ? String(body.SMSID) : null;
}

async function sendWhatsApp(message: OutboundMessage, env: Env): Promise<string | null> {
  const base = env.get('WHATSAPP_360DIALOG_URL')?.trim() || 'https://waba-v2.360dialog.io';
  // A free-text message reaches the person only within 24 hours of their last message to the
  // business number; outside that window WhatsApp requires an approved template.
  const res = await fetch(`${base.replace(/\/$/, '')}/messages`, {
    method: 'POST',
    headers: { 'D360-API-KEY': env.get('WHATSAPP_360DIALOG_API_KEY') ?? '', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: message.to,
      type: 'text',
      text: { body: message.text },
    }),
  });
  const body = (await res.json().catch(() => null)) as { messages?: Array<{ id?: string }>; error?: { message?: string } } | null;
  if (!res.ok) throw new Error(`360dialog_${res.status}: ${body?.error?.message ?? 'request failed'}`);
  return body?.messages?.[0]?.id ?? null;
}

/** Sends the message, or in demo mode only logs that it would have been sent. */
export async function deliver(message: OutboundMessage, env: Env = Deno.env): Promise<DeliveryResult> {
  const mode = deliveryMode(message.channel, env);
  const provider = PROVIDER[message.channel];
  if (mode === 'demo') {
    // No text in the log: it can hold a verification code.
    console.log(`[messaging] demo ${message.channel} to ${maskRecipient(message.channel, message.to)}: ${message.subject}`);
    return { mode, provider: 'demo', providerMessageId: null };
  }
  const providerMessageId =
    message.channel === 'email'
      ? await sendEmail(message, env)
      : message.channel === 'sms'
        ? await sendSms(message, env)
        : await sendWhatsApp(message, env);
  return { mode, provider, providerMessageId };
}

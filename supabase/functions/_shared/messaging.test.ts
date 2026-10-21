// Messages: demo or live per channel, phone numbers, who may send what, the message texts, and the
// providers' requests (fetch is replaced, so nothing is sent).
// Run: npx deno test --no-lock supabase/functions/_shared/messaging.test.ts
import { assertEquals, assertMatch, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1';

import { messagePermission, type CallerProfile, type MessageTarget } from './messagePermission.ts';
import { isKnownMessageType, renderMessage } from './messageTemplates.ts';
import { deliver, deliveryMode, internationalMobile, maskRecipient } from './messaging.ts';

const env = (vars: Record<string, string>) => ({ get: (name: string) => vars[name] });

Deno.test('each channel is demo until its provider is configured', () => {
  assertEquals(deliveryMode('email', env({})), 'demo');
  assertEquals(deliveryMode('email', env({ RESEND_API_KEY: 'k' })), 'demo');
  assertEquals(deliveryMode('email', env({ RESEND_API_KEY: 'k', EMAIL_FROM: 'XO <a@b.co>' })), 'live');
  assertEquals(deliveryMode('sms', env({ SMS_MISR_USERNAME: 'u', SMS_MISR_PASSWORD: 'p' })), 'demo');
  assertEquals(deliveryMode('sms', env({ SMS_MISR_USERNAME: 'u', SMS_MISR_PASSWORD: 'p', SMS_MISR_SENDER: 's' })), 'live');
  assertEquals(deliveryMode('whatsapp', env({ WHATSAPP_360DIALOG_API_KEY: 'k' })), 'live');
  // MESSAGING_MODE=demo keeps a configured channel in demo.
  assertEquals(deliveryMode('whatsapp', env({ WHATSAPP_360DIALOG_API_KEY: 'k', MESSAGING_MODE: 'demo' })), 'demo');
});

Deno.test('mobile numbers in international form', () => {
  assertEquals(internationalMobile('01012345678'), '201012345678');
  assertEquals(internationalMobile('+20 101 234 5678'), '201012345678');
  assertEquals(internationalMobile('00201012345678'), '201012345678');
  assertEquals(internationalMobile('12345'), null);
  assertEquals(maskRecipient('sms', '201012345678'), '2010*****678');
  assertEquals(maskRecipient('email', 'mona@example.com'), 'm***@example.com');
});

const nursery = '00000000-0000-4000-a000-00000000000a';
const caller = (role: string, patch: Partial<CallerProfile> = {}): CallerProfile => ({
  id: 'u1', role, nursery_id: nursery, chain_id: null, ...patch,
});
const target = (patch: Partial<MessageTarget> = {}): MessageTarget => ({
  channel: 'email', type: 'invoice', nurseryId: nursery, nurseryChainId: 'chain-1', userId: 'parent-1', recipientNurseryId: nursery, ...patch,
});

Deno.test('staff message their own nursery; parents only their own codes', () => {
  assertEquals(messagePermission(caller('branch_admin'), target()), 'allowed');
  assertEquals(messagePermission(caller('manager'), target()), 'allowed');
  assertEquals(messagePermission(caller('branch_admin', { nursery_id: 'other' }), target()), 'other_nursery');
  assertEquals(messagePermission(caller('chain_super_admin', { nursery_id: null, chain_id: 'chain-1' }), target()), 'allowed');
  assertEquals(messagePermission(caller('chain_super_admin', { nursery_id: null, chain_id: 'chain-2' }), target()), 'other_nursery');
  assertEquals(messagePermission(caller('xo_super_admin', { nursery_id: null }), target()), 'allowed');
  assertEquals(messagePermission(caller('teacher'), target()), 'not_staff');
  // A named recipient account must be in that nursery.
  assertEquals(messagePermission(caller('branch_admin'), target({ recipientNurseryId: 'other' })), 'recipient_elsewhere');
  // No account (enquiry, waitlist): staff only.
  assertEquals(messagePermission(caller('branch_admin'), target({ userId: null, recipientNurseryId: null })), 'allowed');

  const parent = caller('parent', { id: 'parent-1' });
  assertEquals(messagePermission(parent, target({ type: 'password_reset' })), 'allowed');
  assertEquals(messagePermission(parent, target({ channel: 'sms', type: 'otp_login' })), 'allowed');
  assertEquals(messagePermission(parent, target({ type: 'password_reset', userId: 'someone-else' })), 'parent_not_self_service');
  assertEquals(messagePermission(parent, target({ type: 'invoice' })), 'parent_not_self_service');
  assertEquals(messagePermission(parent, target({ channel: 'whatsapp', type: 'broadcast' })), 'parent_not_self_service');
});

Deno.test('every message type the app sends has words, in both languages', () => {
  const used: Array<['email' | 'sms' | 'whatsapp', string]> = [
    ['email', 'password_reset'], ['email', 'invoice'], ['email', 'application_invite'], ['email', 'application_approved'],
    ['email', 'application_rejected'], ['email', 'application_documents_pending'], ['email', 'inquiry_confirmation'],
    ['email', 'waitlist_opening'], ['email', 'parent_account_invite'], ['sms', 'otp_login'], ['whatsapp', 'invoice_ready'],
    ['whatsapp', 'waitlist_opening'],
  ];
  for (const [channel, type] of used) {
    assertEquals(isKnownMessageType(channel, type), true, `${channel}/${type}`);
    for (const lang of ['ar', 'en'] as const) {
      const message = renderMessage(channel, type, { otp_code: '123456', amount: 3500, class_name: 'Stars', reason: 'x' }, lang);
      assertMatch(message.subject, /\S/);
      assertMatch(message.text, /\S/);
    }
  }
  assertEquals(isKnownMessageType('sms', 'invoice'), false);
  assertEquals(isKnownMessageType('email', 'toString'), false);
});

Deno.test('message texts carry the data, links only with the app address, and escape HTML', () => {
  const code = renderMessage('email', 'password_reset', { otp_code: '482913' }, 'en');
  assertStringIncludes(code.text, '482913');
  const invoice = renderMessage('email', 'invoice', { amount: 3500 }, 'en', 'https://app.example.com/');
  assertStringIncludes(invoice.text, 'EGP 3,500');
  assertStringIncludes(invoice.text, 'https://app.example.com/parent/invoices');
  assertEquals(renderMessage('email', 'invoice', { amount: 3500 }, 'en').text.includes('http'), false);
  const rejected = renderMessage('email', 'application_rejected', { reason: '<script>x</script>' }, 'ar');
  assertStringIncludes(rejected.html ?? '', '&lt;script&gt;');
  assertStringIncludes(rejected.html ?? '', 'dir="rtl"');
});

Deno.test('live sending calls each provider, and a provider error fails the delivery', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const realFetch = globalThis.fetch;
  let reply: { status: number; body: unknown } = { status: 200, body: {} };
  globalThis.fetch = ((url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return Promise.resolve(new Response(JSON.stringify(reply.body), { status: reply.status }));
  }) as typeof fetch;
  try {
    reply = { status: 200, body: { id: 'em_1' } };
    const email = await deliver(
      { channel: 'email', to: 'mona@example.com', language: 'en', subject: 'Hi', text: 'Body' },
      env({ RESEND_API_KEY: 'key', EMAIL_FROM: 'XO <no-reply@x.co>' }),
    );
    assertEquals(email, { mode: 'live', provider: 'resend', providerMessageId: 'em_1' });
    assertEquals(calls[0].url, 'https://api.resend.com/emails');
    assertEquals((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer key');

    reply = { status: 200, body: { code: '1901', SMSID: 77 } };
    const sms = await deliver(
      { channel: 'sms', to: '201012345678', language: 'ar', subject: 'Code', text: 'رمز 1' },
      env({ SMS_MISR_USERNAME: 'u', SMS_MISR_PASSWORD: 'p', SMS_MISR_SENDER: 's' }),
    );
    assertEquals(sms.providerMessageId, '77');
    const smsUrl = new URL(calls[1].url);
    assertEquals(smsUrl.origin + smsUrl.pathname, 'https://smsmisr.com/api/SMS/');
    assertEquals(smsUrl.searchParams.get('mobile'), '201012345678');
    assertEquals(smsUrl.searchParams.get('language'), '2');

    reply = { status: 200, body: { code: '1903' } };
    await assertRejects(
      () => deliver({ channel: 'sms', to: '201012345678', language: 'en', subject: 'C', text: 'c' }, env({ SMS_MISR_USERNAME: 'u', SMS_MISR_PASSWORD: 'p', SMS_MISR_SENDER: 's' })),
      Error,
      'sms_misr_1903',
    );

    reply = { status: 200, body: { messages: [{ id: 'wamid.1' }] } };
    const whatsapp = await deliver(
      { channel: 'whatsapp', to: '201012345678', language: 'ar', subject: 'S', text: 'T' },
      env({ WHATSAPP_360DIALOG_API_KEY: 'd360' }),
    );
    assertEquals(whatsapp.providerMessageId, 'wamid.1');
    assertEquals(calls[3].url, 'https://waba-v2.360dialog.io/messages');
    assertEquals((calls[3].init.headers as Record<string, string>)['D360-API-KEY'], 'd360');

    // Demo: no request at all.
    const before = calls.length;
    const demo = await deliver({ channel: 'email', to: 'a@b.co', language: 'en', subject: 'S', text: 'T' }, env({}));
    assertEquals(demo, { mode: 'demo', provider: 'demo', providerMessageId: null });
    assertEquals(calls.length, before);
  } finally {
    globalThis.fetch = realFetch;
  }
});

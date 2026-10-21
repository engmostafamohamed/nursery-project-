// The request handler shared by email-dispatch, sms-dispatch and whatsapp-dispatch: checks who is
// asking, sends the message (or records it in demo mode), and logs the delivery.
//
// Request body: { trigger_type, recipient_email | recipient_phone, language?, nursery_id, user_id?, data? }
// Response: { ok, mode: 'live' | 'demo', provider, delivery_id } or { error }.
//
// In demo mode a message for an app user also appears in that user's notifications (verification
// codes and invoices), so these flows can be tried before the provider is connected.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

import { getAdminClient } from './admin.ts';
import { corsHeaders, jsonResponse } from './http.ts';
import { messagePermission, PARENT_DAILY_LIMIT, type CallerProfile } from './messagePermission.ts';
import { isKnownMessageType, renderMessage } from './messageTemplates.ts';
import { deliver, deliveryMode, internationalMobile, isEmailAddress, PROVIDER, type Channel, type Language } from './messaging.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RequestBody = {
  trigger_type?: unknown;
  recipient_email?: unknown;
  recipient_phone?: unknown;
  language?: unknown;
  nursery_id?: unknown;
  user_id?: unknown;
  data?: unknown;
};

type Data = Record<string, string | number | boolean | null>;

/** In demo mode, the in-app copy of a message for an app user: its template and parameters. */
function demoInAppCopy(channel: Channel, type: string, data: Data): { templateKey: string; params: Record<string, unknown> } | null {
  if ((channel === 'email' && type === 'password_reset') || (channel === 'sms' && type === 'otp_login')) {
    return { templateKey: `demo_message_${type}`, params: { code: String(data.otp_code ?? '') } };
  }
  if ((channel === 'email' && type === 'invoice') || (channel === 'whatsapp' && type === 'invoice_ready')) {
    const amount = Number(data.amount);
    return { templateKey: `demo_message_${type}`, params: Number.isFinite(amount) ? { amount } : {} };
  }
  return null;
}

async function callerProfile(req: Request, admin: SupabaseClient): Promise<CallerProfile | null> {
  const token = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return null;
  const { data: auth, error } = await admin.auth.getUser(token);
  if (error || !auth.user) return null;
  const { data: profile } = await admin.from('users').select('id, role, nursery_id, chain_id').eq('id', auth.user.id).maybeSingle();
  return (profile as CallerProfile | null) ?? null;
}

function plainData(value: unknown): Data {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Data = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item == null || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      out[key] = typeof item === 'string' ? item.slice(0, 1000) : (item as Data[string]);
    }
  }
  return out;
}

export function serveDispatch(channel: Channel) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400);
    }

    const type = typeof body.trigger_type === 'string' ? body.trigger_type : '';
    if (!isKnownMessageType(channel, type)) return jsonResponse({ error: 'unknown_message_type' }, 400);
    const nurseryId = typeof body.nursery_id === 'string' && UUID.test(body.nursery_id) ? body.nursery_id : null;
    if (!nurseryId) return jsonResponse({ error: 'nursery_id_required' }, 400);
    const userId = typeof body.user_id === 'string' && UUID.test(body.user_id) ? body.user_id : null;
    const rawRecipient = String((channel === 'email' ? body.recipient_email : body.recipient_phone) ?? '').trim();
    const recipient =
      channel === 'email' ? (isEmailAddress(rawRecipient) ? rawRecipient.toLowerCase() : null) : internationalMobile(rawRecipient);
    if (!recipient) return jsonResponse({ error: 'invalid_recipient' }, 400);
    const language: Language = body.language === 'en' ? 'en' : 'ar';
    const data = plainData(body.data);

    const admin = getAdminClient();
    const caller = await callerProfile(req, admin);
    if (!caller) return jsonResponse({ error: 'Unauthorized' }, 401);

    const [nurseryRes, recipientRes] = await Promise.all([
      admin.from('nurseries').select('chain_id').eq('id', nurseryId).maybeSingle(),
      userId ? admin.from('users').select('nursery_id').eq('id', userId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (!nurseryRes.data) return jsonResponse({ error: 'Forbidden' }, 403);
    const permission = messagePermission(caller, {
      channel,
      type,
      nurseryId,
      nurseryChainId: (nurseryRes.data as { chain_id: string | null }).chain_id,
      userId,
      recipientNurseryId: (recipientRes.data as { nursery_id: string | null } | null)?.nursery_id ?? null,
    });
    if (permission !== 'allowed') return jsonResponse({ error: 'Forbidden', reason: permission }, 403);

    if (caller.role === 'parent') {
      const { count } = await admin
        .from('message_deliveries')
        .select('id', { count: 'exact', head: true })
        .eq('requested_by', caller.id)
        .eq('channel', channel)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      if ((count ?? 0) >= PARENT_DAILY_LIMIT) return jsonResponse({ error: 'too_many_messages' }, 429);
    }

    const message = renderMessage(channel, type, data, language, Deno.env.get('APP_BASE_URL'));
    let mode = deliveryMode(channel);
    let provider = mode === 'demo' ? 'demo' : PROVIDER[channel];
    let providerMessageId: string | null = null;
    let failure: string | null = null;
    try {
      const result = await deliver({ channel, to: recipient, language, ...message });
      ({ mode, provider, providerMessageId } = result);
    } catch (error) {
      failure = (error instanceof Error ? error.message : String(error)).slice(0, 500);
      console.error(`[${channel}-dispatch] delivery failed:`, failure);
    }

    const { data: logRow, error: logError } = await admin
      .from('message_deliveries')
      .insert({
        nursery_id: nurseryId,
        channel,
        message_type: type,
        recipient,
        user_id: userId,
        requested_by: caller.id,
        mode,
        status: failure ? 'failed' : 'sent',
        provider,
        provider_message_id: providerMessageId,
        error: failure,
      })
      .select('id')
      .single();
    if (logError) console.error(`[${channel}-dispatch] could not log the delivery:`, logError.message);

    const copy = !failure && mode === 'demo' && userId ? demoInAppCopy(channel, type, data) : null;
    if (copy) {
      const { error } = await admin.from('notifications').insert({
        nursery_id: nurseryId,
        user_id: userId,
        type: 'demo_message',
        template_key: copy.templateKey,
        template_params: copy.params,
        read: false,
        channel: 'in_app',
        sent_at: new Date().toISOString(),
        urgency: 'normal',
      });
      if (error) console.error(`[${channel}-dispatch] could not add the demo copy:`, error.message);
    }

    if (failure) return jsonResponse({ ok: false, error: 'delivery_failed', mode, provider }, 502);
    return jsonResponse({ ok: true, mode, provider, delivery_id: (logRow as { id: string } | null)?.id ?? null });
  });
}

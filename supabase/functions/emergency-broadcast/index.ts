import { getAdminClient } from '../_shared/admin.ts';
import { logNotification, pickLanguage } from '../_shared/dispatch.ts';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';

interface RequestBody {
  nursery_id: string;
  message: string;
  message_ar?: string;
  message_en?: string;
}

type ParentRow = {
  id: string;
  phone: string | null;
  email: string | null;
  language_pref: string | null;
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Emergency broadcast timed out')), ms);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = (await req.json()) as RequestBody;
    if (!body.nursery_id || !body.message) {
      return jsonResponse({ error: 'nursery_id and message are required' }, 400);
    }

    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('users')
      .select('id, phone, email, language_pref')
      .eq('nursery_id', body.nursery_id)
      .eq('role', 'parent')
      .eq('status', 'active');
    if (error) throw new Error(error.message);

    const parents = (data ?? []) as ParentRow[];
    const jobs = parents.map(async (parent) => {
      const lang = pickLanguage(parent.language_pref ?? undefined);
      const messageAr = body.message_ar ?? body.message;
      const messageEn = body.message_en ?? body.message;

      if (parent.phone) {
        // Stubbed WhatsApp + SMS provider calls.
        console.log('[emergency-broadcast] whatsapp', { to: parent.phone, message: lang === 'ar' ? messageAr : messageEn });
        console.log('[emergency-broadcast] sms', { to: parent.phone, message: lang === 'ar' ? messageAr : messageEn });
      }

      console.log('[emergency-broadcast] push', { user_id: parent.id, message: lang === 'ar' ? messageAr : messageEn });

      await Promise.all([
        logNotification({
          supabase,
          nurseryId: body.nursery_id,
          userId: parent.id,
          triggerType: 'emergency_broadcast',
          channel: 'whatsapp',
          language: lang,
          titleAr: 'تنبيه طارئ',
          titleEn: 'Emergency Alert',
          bodyAr: messageAr,
          bodyEn: messageEn,
        }),
        logNotification({
          supabase,
          nurseryId: body.nursery_id,
          userId: parent.id,
          triggerType: 'emergency_broadcast',
          channel: 'sms',
          language: lang,
          titleAr: 'تنبيه طارئ',
          titleEn: 'Emergency Alert',
          bodyAr: messageAr,
          bodyEn: messageEn,
        }),
        logNotification({
          supabase,
          nurseryId: body.nursery_id,
          userId: parent.id,
          triggerType: 'emergency_broadcast',
          channel: 'push',
          language: lang,
          titleAr: 'تنبيه طارئ',
          titleEn: 'Emergency Alert',
          bodyAr: messageAr,
          bodyEn: messageEn,
        }),
      ]);
    });

    await withTimeout(Promise.allSettled(jobs), 30_000);
    return jsonResponse({ ok: true, parent_count: parents.length });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
});

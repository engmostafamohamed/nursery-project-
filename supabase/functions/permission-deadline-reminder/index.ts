import { getAdminClient } from '../_shared/admin.ts';
import { logNotification } from '../_shared/dispatch.ts';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';

type PendingPermission = {
  id: string;
  event_id: string | null;
  deadline: string | null;
  child_id: string;
};

type EventRow = { id: string; title_ar: string; title_en: string; nursery_id: string };
type ParentLink = { child_id: string; parent_id: string };
type ParentRow = { id: string; phone: string | null; language_pref: string | null };

function in24To48HourWindow(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  return diff > 24 * 60 * 60 * 1000 && diff <= 48 * 60 * 60 * 1000;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = getAdminClient();
    const permissionsRes = await supabase
      .from('permissions')
      .select('id, event_id, deadline, child_id')
      .eq('status', 'pending')
      .not('deadline', 'is', null);
    if (permissionsRes.error) throw new Error(permissionsRes.error.message);
    const pending = ((permissionsRes.data ?? []) as PendingPermission[]).filter(
      (row) => row.deadline && row.event_id && in24To48HourWindow(row.deadline),
    );
    if (!pending.length) return jsonResponse({ ok: true, reminders_sent: 0 });

    const eventIds = [...new Set(pending.map((row) => row.event_id!))];
    const eventsRes = await supabase
      .from('events')
      .select('id, title_ar, title_en, nursery_id')
      .in('id', eventIds);
    if (eventsRes.error) throw new Error(eventsRes.error.message);
    const eventMap = new Map((eventsRes.data ?? []).map((e) => [e.id, e as EventRow]));

    const childIds = [...new Set(pending.map((row) => row.child_id))];
    const linksRes = await supabase
      .from('parent_children')
      .select('child_id, parent_id')
      .in('child_id', childIds);
    if (linksRes.error) throw new Error(linksRes.error.message);
    const links = (linksRes.data ?? []) as ParentLink[];
    const parentIds = [...new Set(links.map((l) => l.parent_id))];

    const usersRes = await supabase
      .from('users')
      .select('id, phone, language_pref')
      .in('id', parentIds);
    if (usersRes.error) throw new Error(usersRes.error.message);
    const parentMap = new Map((usersRes.data ?? []).map((u) => [u.id, u as ParentRow]));

    let reminders = 0;
    for (const permission of pending) {
      const event = eventMap.get(permission.event_id!);
      if (!event) continue;
      const parents = links.filter((l) => l.child_id === permission.child_id).map((l) => parentMap.get(l.parent_id)).filter(Boolean) as ParentRow[];
      for (const parent of parents) {
        const language = parent.language_pref === 'en' ? 'en' : 'ar';
        const bodyAr = `تذكير: موافقة مطلوبة لفعالية ${event.title_ar}. الموعد النهائي غداً.`;
        const bodyEn = `Reminder: Permission needed for ${event.title_en}. Deadline tomorrow.`;

        if (parent.phone) {
          const supabaseUrl = Deno.env.get('SUPABASE_URL');
          const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
          if (supabaseUrl && serviceRole) {
            await fetch(`${supabaseUrl}/functions/v1/whatsapp-dispatch`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                authorization: `Bearer ${serviceRole}`,
                apikey: serviceRole,
              },
              body: JSON.stringify({
                trigger_type: 'custom',
                recipient_phone: parent.phone,
                language,
                nursery_id: event.nursery_id,
                user_id: parent.id,
                data: { message_ar: bodyAr, message_en: bodyEn },
              }),
            });
          }
        }

        await logNotification({
          supabase,
          nurseryId: event.nursery_id,
          userId: parent.id,
          triggerType: 'permission_deadline_reminder',
          channel: 'whatsapp',
          language,
          titleAr: 'تذكير موافقة',
          titleEn: 'Permission Reminder',
          bodyAr,
          bodyEn,
        });
        reminders += 1;
      }
    }

    return jsonResponse({ ok: true, reminders_sent: reminders });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
});

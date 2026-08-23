import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

import { getAdminClient } from '../_shared/admin.ts';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    return jsonResponse({ error: 'Server misconfiguration' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !authData.user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = (await req.json()) as { token?: string };
    const rawToken = typeof body.token === 'string' ? body.token.trim() : '';
    if (!rawToken) {
      return jsonResponse({ error: 'token is required' }, 400);
    }

    const { data: profile, error: profileErr } = await userClient
      .from('users')
      .select('role, nursery_id')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (profileErr || !profile || profile.role !== 'teacher' || !profile.nursery_id) {
      return jsonResponse({ error: 'Only nursery teachers can verify QR tokens' }, 403);
    }

    const teacherNurseryId = profile.nursery_id as string;

    const admin = getAdminClient();
    const { data: tok, error: tokErr } = await admin
      .from('qr_tokens')
      .select('id, child_id, nursery_id, event_id, expires_at, purpose, delegate_name, single_use, consumed_at, issued_by')
      .eq('token', rawToken)
      .maybeSingle();

    if (tokErr || !tok) {
      return jsonResponse({ error: 'Invalid QR code' }, 404);
    }

    const row = tok as {
      id: string;
      child_id: string;
      nursery_id: string;
      event_id: string | null;
      expires_at: string;
      purpose: string | null;
      delegate_name: string | null;
      single_use: boolean | null;
      consumed_at: string | null;
      issued_by: string | null;
    };

    if (row.nursery_id !== teacherNurseryId) {
      return jsonResponse({ error: 'QR code is for a different nursery' }, 403);
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return jsonResponse({ error: 'QR code has expired' }, 400);
    }

    if (row.single_use && row.consumed_at) {
      return jsonResponse(
        { error: 'This one-time QR has already been used' },
        400,
      );
    }

    const { data: childRow, error: childErr } = await admin
      .from('children')
      .select('id, nursery_id, full_name_ar, full_name_en, status')
      .eq('id', row.child_id)
      .maybeSingle();

    if (childErr || !childRow) {
      return jsonResponse({ error: 'Child not found' }, 404);
    }

    const child = childRow as {
      id: string;
      nursery_id: string;
      full_name_ar: string;
      full_name_en: string;
      status: string;
    };

    if (child.nursery_id !== teacherNurseryId || child.status !== 'active') {
      return jsonResponse({ error: 'Child is not active in this nursery' }, 400);
    }

    // Event check-in: record attendance (idempotent) instead of the pickup flow.
    if ((row.purpose ?? '') === 'event') {
      if (!row.event_id) {
        return jsonResponse({ error: 'Invalid event QR code' }, 400);
      }
      const { data: evRow, error: evErr } = await admin
        .from('events')
        .select('id, nursery_id, status, title_ar, title_en')
        .eq('id', row.event_id)
        .maybeSingle();
      if (evErr || !evRow) {
        return jsonResponse({ error: 'Event not found' }, 404);
      }
      const ev = evRow as {
        id: string;
        nursery_id: string;
        status: string;
        title_ar: string;
        title_en: string;
      };
      if (ev.nursery_id !== teacherNurseryId) {
        return jsonResponse({ error: 'QR code is for a different nursery' }, 403);
      }
      if (String(ev.status).toLowerCase() === 'cancelled') {
        return jsonResponse({ error: 'This event has been cancelled' }, 400);
      }

      const { data: existingAtt } = await admin
        .from('event_attendance')
        .select('id')
        .eq('event_id', ev.id)
        .eq('child_id', child.id)
        .maybeSingle();

      let alreadyCheckedIn = Boolean(existingAtt);
      if (!alreadyCheckedIn) {
        const { error: attErr } = await admin.from('event_attendance').insert({
          event_id: ev.id,
          child_id: child.id,
          nursery_id: teacherNurseryId,
          checked_in_by: authData.user.id,
        } as never);
        if (attErr) {
          // A concurrent scan may have inserted first — treat unique violation as already checked in.
          const msg = String(attErr.message ?? '').toLowerCase();
          if (msg.includes('duplicate') || String((attErr as { code?: string }).code) === '23505') {
            alreadyCheckedIn = true;
          } else {
            return jsonResponse({ error: attErr.message }, 500);
          }
        }
      }

      return jsonResponse({
        qr_token_id: row.id,
        purpose: 'event',
        event_id: ev.id,
        event_title_ar: ev.title_ar,
        event_title_en: ev.title_en,
        child_id: child.id,
        nursery_id: child.nursery_id,
        full_name_ar: child.full_name_ar,
        full_name_en: child.full_name_en,
        already_checked_in: alreadyCheckedIn,
      });
    }

    if (row.single_use) {
      // Stamp consumed_at so a second scan of the same QR is rejected above.
      await admin
        .from('qr_tokens')
        .update({ consumed_at: new Date().toISOString() } as never)
        .eq('id', row.id);
    }

    return jsonResponse({
      qr_token_id: row.id,
      child_id: child.id,
      nursery_id: child.nursery_id,
      full_name_ar: child.full_name_ar,
      full_name_en: child.full_name_en,
      purpose: row.purpose ?? 'parent',
      delegate_name: row.delegate_name,
      single_use: Boolean(row.single_use),
      issued_by: row.issued_by,
    });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});

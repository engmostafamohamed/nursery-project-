import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

import { getAdminClient } from '../_shared/admin.ts';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';

// Roles allowed to publish events / issue event QR codes.
const ADMIN_ROLES = new Set(['branch_admin', 'manager', 'chain_super_admin', 'xo_super_admin']);
const TOKEN_TTL_AFTER_START_MS = 2 * 24 * 60 * 60 * 1000; // valid until ~2 days after the event starts

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

    const body = (await req.json()) as { event_id?: string };
    const eventId = typeof body.event_id === 'string' ? body.event_id : '';
    if (!eventId) {
      return jsonResponse({ error: 'event_id is required' }, 400);
    }

    const admin = getAdminClient();

    // Load the event (service role; we authorize the caller separately below).
    const { data: eventRow, error: eventErr } = await admin
      .from('events')
      .select('id, nursery_id, starts_at')
      .eq('id', eventId)
      .maybeSingle();
    if (eventErr) return jsonResponse({ error: eventErr.message }, 500);
    const event = eventRow as { id: string; nursery_id: string; starts_at: string } | null;
    if (!event) return jsonResponse({ error: 'Event not found' }, 404);

    // Authorize: admin/manager of the event's nursery (or xo/chain).
    const { data: profile, error: profileErr } = await userClient
      .from('users')
      .select('role, nursery_id')
      .eq('id', authData.user.id)
      .maybeSingle();
    if (profileErr || !profile?.role) {
      return jsonResponse({ error: 'Profile not found' }, 403);
    }
    const role = profile.role as string;
    const nurseryScoped = role === 'branch_admin' || role === 'manager';
    if (
      !ADMIN_ROLES.has(role) ||
      (nurseryScoped && profile.nursery_id !== event.nursery_id)
    ) {
      return jsonResponse({ error: 'Not allowed to issue QR codes for this event' }, 403);
    }

    // Targeted children = those that already have an event permission row.
    // (createPermissionsForEventScope runs before this in the publish flow and
    // covers all / class / individual scopes uniformly.)
    const { data: permRows, error: permErr } = await admin
      .from('permissions')
      .select('child_id')
      .eq('event_id', eventId)
      .eq('permission_type', 'event');
    if (permErr) return jsonResponse({ error: permErr.message }, 500);
    const targetChildIds = [
      ...new Set(((permRows ?? []) as { child_id: string }[]).map((r) => r.child_id).filter(Boolean)),
    ];
    if (targetChildIds.length === 0) {
      return jsonResponse({ issued: 0, skipped: 0 });
    }

    // Skip children that already have an event token (idempotent re-publish).
    const { data: existingRows, error: existErr } = await admin
      .from('qr_tokens')
      .select('child_id')
      .eq('event_id', eventId)
      .eq('purpose', 'event');
    if (existErr) return jsonResponse({ error: existErr.message }, 500);
    const existing = new Set(((existingRows ?? []) as { child_id: string }[]).map((r) => r.child_id));
    const toIssue = targetChildIds.filter((id) => !existing.has(id));
    if (toIssue.length === 0) {
      return jsonResponse({ issued: 0, skipped: targetChildIds.length });
    }

    const expiresAtIso = new Date(
      new Date(event.starts_at).getTime() + TOKEN_TTL_AFTER_START_MS,
    ).toISOString();

    const rows = toIssue.map((child_id) => ({
      child_id,
      nursery_id: event.nursery_id,
      event_id: eventId,
      token: `${crypto.randomUUID()}-${Date.now()}`,
      expires_at: expiresAtIso,
      purpose: 'event',
      single_use: false,
      issued_by: authData.user.id,
    }));

    const { error: insErr } = await admin.from('qr_tokens').insert(rows as never);
    if (insErr) return jsonResponse({ error: insErr.message }, 500);

    return jsonResponse({ issued: rows.length, skipped: existing.size });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});

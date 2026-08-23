import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

import { getAdminClient } from '../_shared/admin.ts';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days for pickup/display QR
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const SHORT_TTL_CAP_SECONDS = 5 * 60; // non–extended roles (e.g. teacher)
// Delegate (one-time) pickup QRs cap at 7 days — narrower window since
// the named delegate is meant for a specific upcoming pickup, not standing access.
const DELEGATE_MAX_TTL_SECONDS = 7 * 24 * 60 * 60;

const EXTENDED_TTL_ROLES = new Set(['parent', 'branch_admin', 'chain_super_admin', 'xo_super_admin']);

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

    const body = (await req.json()) as {
      child_id?: string;
      nursery_id?: string;
      ttl_seconds?: number;
      purpose?: 'parent' | 'delegate';
      delegate_name?: string;
      single_use?: boolean;
      rotate?: boolean;
      revoke_token_id?: string;
    };

    // Revoke path: invalidate a previously-issued token. Only the original
    // issuer may revoke. Delete the row so a screenshot of the QR can no longer
    // resolve via qr-verify (the .maybeSingle on token lookup will return null).
    if (typeof body.revoke_token_id === 'string' && body.revoke_token_id.length > 0) {
      const admin = getAdminClient();
      const { data: tokenRow, error: lookupErr } = await admin
        .from('qr_tokens')
        .select('id, issued_by')
        .eq('id', body.revoke_token_id)
        .maybeSingle();
      if (lookupErr) {
        return jsonResponse({ error: lookupErr.message }, 500);
      }
      const row = tokenRow as { id: string; issued_by: string | null } | null;
      if (!row) return jsonResponse({ error: 'Token not found' }, 404);
      if (row.issued_by !== authData.user.id) {
        return jsonResponse({ error: 'You can only revoke tokens you issued' }, 403);
      }
      const { error: delErr } = await admin.from('qr_tokens').delete().eq('id', row.id);
      if (delErr) return jsonResponse({ error: delErr.message }, 500);
      return jsonResponse({ revoked: true });
    }

    const { child_id, nursery_id } = body;
    if (!child_id || !nursery_id) {
      return jsonResponse({ error: 'child_id and nursery_id are required' }, 400);
    }
    const purpose: 'parent' | 'delegate' = body.purpose === 'delegate' ? 'delegate' : 'parent';
    const delegateName =
      typeof body.delegate_name === 'string' ? body.delegate_name.trim().slice(0, 80) : '';
    if (purpose === 'delegate' && !delegateName) {
      return jsonResponse({ error: 'delegate_name is required for delegate QRs' }, 400);
    }
    const singleUse = purpose === 'delegate' ? true : Boolean(body.single_use);
    const rotate = Boolean(body.rotate);

    const { data: child, error: childErr } = await userClient
      .from('children')
      .select('id')
      .eq('id', child_id)
      .eq('nursery_id', nursery_id)
      .maybeSingle();

    if (childErr || !child) {
      return jsonResponse({ error: 'Child not found' }, 404);
    }

    const { data: profile, error: profileErr } = await userClient
      .from('users')
      .select('role')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (profileErr || !profile?.role) {
      return jsonResponse({ error: 'Profile not found' }, 403);
    }

    const role = profile.role as string;
    const canExtendedTtl = EXTENDED_TTL_ROLES.has(role);

    const admin = getAdminClient();

    // Parent (and admin/chain) "static" pickup QR: one persistent token per
    // (issued_by, child) pair. Reuse the existing one unless `rotate=true` was
    // explicitly requested. Stored with a far-future expiry so the existing
    // expiry check in qr-verify keeps working uniformly.
    if (purpose === 'parent' && !singleUse && canExtendedTtl) {
      const FAR_FUTURE_ISO = '9999-12-31T23:59:59.000Z';
      if (rotate) {
        // Invalidate any existing static parent tokens for this pair.
        await admin
          .from('qr_tokens')
          .delete()
          .eq('issued_by', authData.user.id)
          .eq('child_id', child_id)
          .eq('purpose', 'parent')
          .eq('single_use', false);
      } else {
        const { data: existing } = await admin
          .from('qr_tokens')
          .select('token, expires_at')
          .eq('issued_by', authData.user.id)
          .eq('child_id', child_id)
          .eq('purpose', 'parent')
          .eq('single_use', false)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const row = existing as { token: string; expires_at: string } | null;
        if (row && new Date(row.expires_at).getTime() > Date.now()) {
          return jsonResponse({
            token: row.token,
            expires_at: row.expires_at,
            expires_in: Math.max(0, Math.floor((new Date(row.expires_at).getTime() - Date.now()) / 1000)),
            purpose: 'parent',
            delegate_name: null,
            single_use: false,
          });
        }
      }

      const newToken = `${crypto.randomUUID()}-${Date.now()}`;
      const { error: insErr } = await admin.from('qr_tokens').insert({
        child_id,
        nursery_id,
        token: newToken,
        expires_at: FAR_FUTURE_ISO,
        purpose: 'parent',
        delegate_name: null,
        single_use: false,
        issued_by: authData.user.id,
      } as never);
      if (insErr) {
        return jsonResponse({ error: insErr.message }, 500);
      }
      return jsonResponse({
        token: newToken,
        expires_at: FAR_FUTURE_ISO,
        expires_in: 0,
        purpose: 'parent',
        delegate_name: null,
        single_use: false,
      });
    }

    // Delegate (one-time) QRs and other short-lived issuance go through the
    // standard TTL clamp + insert path.
    let ttl = DEFAULT_TTL_SECONDS;
    if (typeof body.ttl_seconds === 'number' && Number.isFinite(body.ttl_seconds)) {
      ttl = Math.floor(body.ttl_seconds);
    }

    if (!canExtendedTtl) {
      ttl = Math.min(Math.max(ttl, MIN_TTL_SECONDS), SHORT_TTL_CAP_SECONDS);
    } else {
      const cap = purpose === 'delegate' ? DELEGATE_MAX_TTL_SECONDS : MAX_TTL_SECONDS;
      ttl = Math.min(Math.max(ttl, MIN_TTL_SECONDS), cap);
    }

    const token = `${crypto.randomUUID()}-${Date.now()}`;
    const expiresAt = new Date(Date.now() + ttl * 1000);
    const expiresAtIso = expiresAt.toISOString();

    const { error: insErr } = await admin.from('qr_tokens').insert({
      child_id,
      nursery_id,
      token,
      expires_at: expiresAtIso,
      purpose,
      delegate_name: purpose === 'delegate' ? delegateName : null,
      single_use: singleUse,
      issued_by: authData.user.id,
    } as never);

    if (insErr) {
      return jsonResponse({ error: insErr.message }, 500);
    }

    return jsonResponse({
      token,
      expires_at: expiresAtIso,
      expires_in: ttl,
      purpose,
      delegate_name: purpose === 'delegate' ? delegateName : null,
      single_use: singleUse,
    });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});

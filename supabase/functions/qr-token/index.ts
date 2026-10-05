import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

import { getAdminClient } from '../_shared/admin.ts';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days for pickup/display QR
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const SHORT_TTL_CAP_SECONDS = 5 * 60; // non–extended roles (e.g. teacher)
// Delegate (one-time) pickup QRs cap at 7 days - narrower window since
// the named delegate is meant for a specific upcoming pickup, not standing access.
const DELEGATE_MAX_TTL_SECONDS = 7 * 24 * 60 * 60;

const EXTENDED_TTL_ROLES = new Set(['parent', 'branch_admin', 'chain_super_admin', 'xo_super_admin']);

type PickupDetailsBody = {
  pickup_person_full_name?: string;
  pickup_relationship?: string;
  pickup_identity_type?: 'national_id' | 'passport' | 'other';
  pickup_identity_number?: string;
  pickup_identity_image_path?: string;
  pickup_identity_back_image_path?: string;
  pickup_notes?: string;
  require_id_capture?: boolean;
};

const NATIONAL_ID_NUMBER = /^\d{14}$/;

/** Trims and bounds the custom-QR pickup person fields shared by create and edit. */
function readPickupDetails(body: PickupDetailsBody, fallbackFullName: string) {
  const isNationalId = body.pickup_identity_type === 'national_id';
  return {
    fullName:
      typeof body.pickup_person_full_name === 'string'
        ? body.pickup_person_full_name.trim().slice(0, 120)
        : fallbackFullName,
    relationship:
      typeof body.pickup_relationship === 'string' ? body.pickup_relationship.trim().slice(0, 60) : '',
    identityType:
      body.pickup_identity_type === 'passport' || body.pickup_identity_type === 'other'
        ? body.pickup_identity_type
        : body.pickup_identity_type === 'national_id'
          ? 'national_id'
          : null,
    identityNumber:
      typeof body.pickup_identity_number === 'string' ? body.pickup_identity_number.trim().slice(0, 80) : '',
    identityImagePath:
      typeof body.pickup_identity_image_path === 'string' ? body.pickup_identity_image_path.trim().slice(0, 500) : '',
    // Only a national ID card has a back side; ignore one sent for other ID types.
    identityBackImagePath:
      isNationalId && typeof body.pickup_identity_back_image_path === 'string'
        ? body.pickup_identity_back_image_path.trim().slice(0, 500)
        : '',
    notes: typeof body.pickup_notes === 'string' ? body.pickup_notes.trim().slice(0, 300) : '',
    requireIdCapture: body.require_id_capture !== false,
  };
}

/** Error message when custom-QR pickup details are incomplete or point outside the nursery, else null. */
function pickupDetailsError(details: ReturnType<typeof readPickupDetails>, nurseryId: string): string | null {
  if (!details.fullName) return 'pickup_person_full_name is required for custom pickup QRs';
  if (!details.identityType || !details.identityNumber) {
    return 'identity type and number are required for custom pickup QRs';
  }
  if (details.identityType === 'national_id' && !NATIONAL_ID_NUMBER.test(details.identityNumber)) {
    return 'national ID number must be exactly 14 digits';
  }
  if (!details.identityImagePath) return 'identity image is required for custom pickup QRs';
  if (details.identityType === 'national_id' && !details.identityBackImagePath) {
    return 'both sides of the national ID card are required';
  }
  const nurseryPrefix = `application-documents:${nurseryId}/`;
  if (
    !details.identityImagePath.startsWith(nurseryPrefix) ||
    (details.identityBackImagePath && !details.identityBackImagePath.startsWith(nurseryPrefix))
  ) {
    return 'identity image path is invalid for this nursery';
  }
  return null;
}

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

    const body = (await req.json()) as PickupDetailsBody & {
      child_id?: string;
      nursery_id?: string;
      ttl_seconds?: number;
      purpose?: 'parent' | 'delegate';
      delegate_name?: string;
      single_use?: boolean;
      rotate?: boolean;
      revoke_token_id?: string;
      rotate_token_id?: string;
      status_token_id?: string;
      edit_token_id?: string;
      status?: 'active' | 'inactive';
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

    if (typeof body.rotate_token_id === 'string' && body.rotate_token_id.length > 0) {
      const admin = getAdminClient();
      const { data: tokenRow, error: lookupErr } = await admin
        .from('qr_tokens')
        .select('id, issued_by, purpose, consumed_at, expires_at')
        .eq('id', body.rotate_token_id)
        .maybeSingle();
      if (lookupErr) {
        return jsonResponse({ error: lookupErr.message }, 500);
      }

      const row = tokenRow as {
        id: string;
        issued_by: string | null;
        purpose: string | null;
        consumed_at: string | null;
        expires_at: string;
      } | null;
      if (!row) return jsonResponse({ error: 'Token not found' }, 404);
      if (row.issued_by !== authData.user.id) {
        return jsonResponse({ error: 'You can only rotate tokens you issued' }, 403);
      }
      if (row.purpose !== 'delegate') {
        return jsonResponse({ error: 'Only custom pickup QRs can be rotated here' }, 400);
      }
      if (row.consumed_at) {
        return jsonResponse({ error: 'Used QR codes cannot be rotated. Generate a new code with the same data.' }, 400);
      }

      const newToken = `${crypto.randomUUID()}-${Date.now()}`;
      const { error: updateErr } = await admin
        .from('qr_tokens')
        .update({ token: newToken } as never)
        .eq('id', row.id);
      if (updateErr) return jsonResponse({ error: updateErr.message }, 500);

      return jsonResponse({
        rotated: true,
        id: row.id,
        token: newToken,
        expires_at: row.expires_at,
      });
    }

    if (typeof body.status_token_id === 'string' && body.status_token_id.length > 0) {
      const admin = getAdminClient();
      const { data: tokenRow, error: lookupErr } = await admin
        .from('qr_tokens')
        .select('id, issued_by, child_id, purpose, consumed_at')
        .eq('id', body.status_token_id)
        .maybeSingle();
      if (lookupErr) {
        return jsonResponse({ error: lookupErr.message }, 500);
      }

      const row = tokenRow as {
        id: string;
        issued_by: string | null;
        child_id: string;
        purpose: string | null;
        consumed_at: string | null;
      } | null;
      if (!row) return jsonResponse({ error: 'Token not found' }, 404);
      if (row.issued_by !== authData.user.id) {
        return jsonResponse({ error: 'You can only update tokens you issued' }, 403);
      }
      if (row.purpose !== 'delegate') {
        return jsonResponse({ error: 'Only custom pickup QRs can change status' }, 400);
      }
      if (body.status !== 'active' && body.status !== 'inactive') {
        return jsonResponse({ error: 'status must be active or inactive' }, 400);
      }
      if (body.status === 'active' && row.consumed_at) {
        return jsonResponse({ error: 'Used QR codes cannot be reactivated. Generate a new code with the same data.' }, 400);
      }

      if (body.status === 'active') {
        const { count, error: activeCountErr } = await admin
          .from('qr_tokens')
          .select('id', { count: 'exact', head: true })
          .eq('issued_by', authData.user.id)
          .eq('child_id', row.child_id)
          .eq('purpose', 'delegate')
          .is('consumed_at', null)
          .gt('expires_at', new Date().toISOString())
          .neq('id', row.id);
        if (activeCountErr) {
          return jsonResponse({ error: activeCountErr.message }, 500);
        }
        if ((count ?? 0) >= 3) {
          return jsonResponse({
            error: 'You can only keep 3 active custom pickup QRs per child. Delete one to activate another.',
          }, 400);
        }
      }

      const ttl =
        typeof body.ttl_seconds === 'number' && Number.isFinite(body.ttl_seconds)
          ? Math.min(Math.max(Math.floor(body.ttl_seconds), MIN_TTL_SECONDS), DELEGATE_MAX_TTL_SECONDS)
          : DELEGATE_MAX_TTL_SECONDS;
      const expiresAtIso =
        body.status === 'active'
          ? new Date(Date.now() + ttl * 1000).toISOString()
          : new Date(Date.now() - 1000).toISOString();

      const { error: updateErr } = await admin
        .from('qr_tokens')
        .update({ expires_at: expiresAtIso } as never)
        .eq('id', row.id);
      if (updateErr) return jsonResponse({ error: updateErr.message }, 500);

      return jsonResponse({
        updated: true,
        id: row.id,
        status: body.status,
        expires_at: expiresAtIso,
      });
    }

    // Edit path: change the pickup person's details on a custom QR the caller issued
    // (and its expiry, while it is active). The token string is kept, so an already
    // shared or printed QR keeps working and staff see the new details at the gate.
    if (typeof body.edit_token_id === 'string' && body.edit_token_id.length > 0) {
      const admin = getAdminClient();
      const { data: tokenRow, error: lookupErr } = await admin
        .from('qr_tokens')
        .select('id, issued_by, nursery_id, purpose, consumed_at, expires_at')
        .eq('id', body.edit_token_id)
        .maybeSingle();
      if (lookupErr) {
        return jsonResponse({ error: lookupErr.message }, 500);
      }

      const row = tokenRow as {
        id: string;
        issued_by: string | null;
        nursery_id: string;
        purpose: string | null;
        consumed_at: string | null;
        expires_at: string;
      } | null;
      if (!row) return jsonResponse({ error: 'Token not found' }, 404);
      if (row.issued_by !== authData.user.id) {
        return jsonResponse({ error: 'You can only edit tokens you issued' }, 403);
      }
      if (row.purpose !== 'delegate') {
        return jsonResponse({ error: 'Only custom pickup QRs can be edited' }, 400);
      }
      if (row.consumed_at) {
        return jsonResponse({ error: 'Used QR codes cannot be edited. Generate a new code with the same data.' }, 400);
      }

      const details = readPickupDetails(body, '');
      const detailsError = pickupDetailsError(details, row.nursery_id);
      if (detailsError) return jsonResponse({ error: detailsError }, 400);

      const updates: Record<string, unknown> = {
        delegate_name: details.fullName.slice(0, 80),
        pickup_person_full_name: details.fullName,
        pickup_relationship: details.relationship || null,
        pickup_identity_type: details.identityType,
        pickup_identity_number: details.identityNumber,
        pickup_identity_image_path: details.identityImagePath,
        pickup_identity_back_image_path: details.identityBackImagePath || null,
        pickup_notes: details.notes || null,
        require_id_capture: details.requireIdCapture,
      };
      // Reactivating an inactive QR goes through the status path (it enforces the active limit).
      const isActive = new Date(row.expires_at).getTime() > Date.now();
      if (isActive && typeof body.ttl_seconds === 'number' && Number.isFinite(body.ttl_seconds)) {
        const ttl = Math.min(Math.max(Math.floor(body.ttl_seconds), MIN_TTL_SECONDS), DELEGATE_MAX_TTL_SECONDS);
        updates.expires_at = new Date(Date.now() + ttl * 1000).toISOString();
      }

      const { error: updateErr } = await admin
        .from('qr_tokens')
        .update(updates as never)
        .eq('id', row.id);
      if (updateErr) return jsonResponse({ error: updateErr.message }, 500);

      return jsonResponse({
        edited: true,
        id: row.id,
        expires_at: (updates.expires_at as string | undefined) ?? row.expires_at,
      });
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
    const details = readPickupDetails(body, delegateName);
    const {
      fullName: pickupPersonFullName,
      relationship: pickupRelationship,
      identityType: pickupIdentityType,
      identityNumber: pickupIdentityNumber,
      identityImagePath: pickupIdentityImagePath,
      identityBackImagePath: pickupIdentityBackImagePath,
      notes: pickupNotes,
      requireIdCapture,
    } = details;

    if (purpose === 'delegate') {
      const detailsError = pickupDetailsError(details, nursery_id);
      if (detailsError) return jsonResponse({ error: detailsError }, 400);
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

    if (purpose === 'delegate') {
      const { count, error: activeCountErr } = await admin
        .from('qr_tokens')
        .select('id', { count: 'exact', head: true })
        .eq('issued_by', authData.user.id)
        .eq('child_id', child_id)
        .eq('purpose', 'delegate')
        .is('consumed_at', null)
        .gt('expires_at', new Date().toISOString());

      if (activeCountErr) {
        return jsonResponse({ error: activeCountErr.message }, 500);
      }
      if ((count ?? 0) >= 3) {
        return jsonResponse({
          error: 'You can only keep 3 active custom pickup QRs per child. Delete one to create another.',
        }, 400);
      }
    }

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
          .select('id, token, expires_at')
          .eq('issued_by', authData.user.id)
          .eq('child_id', child_id)
          .eq('purpose', 'parent')
          .eq('single_use', false)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const row = existing as { id: string; token: string; expires_at: string } | null;
        if (row && new Date(row.expires_at).getTime() > Date.now()) {
          return jsonResponse({
            id: row.id,
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
      const { data: insertedToken, error: insErr } = await admin.from('qr_tokens').insert({
        child_id,
        nursery_id,
        token: newToken,
        expires_at: FAR_FUTURE_ISO,
        purpose: 'parent',
        delegate_name: null,
        pickup_person_full_name: null,
        pickup_relationship: null,
        pickup_identity_type: null,
        pickup_identity_number: null,
        pickup_identity_image_path: null,
        pickup_notes: null,
        require_id_capture: true,
        single_use: false,
        issued_by: authData.user.id,
      } as never).select('id').single();
      if (insErr) {
        return jsonResponse({ error: insErr.message }, 500);
      }
      const inserted = insertedToken as { id: string } | null;
      return jsonResponse({
        id: inserted?.id ?? null,
        token: newToken,
        expires_at: FAR_FUTURE_ISO,
        expires_in: 0,
        purpose: 'parent',
        delegate_name: null,
        pickup_person_full_name: null,
        pickup_relationship: null,
        pickup_identity_type: null,
        pickup_identity_number: null,
        pickup_identity_image_path: null,
        pickup_notes: null,
        require_id_capture: true,
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

    const { data: insertedToken, error: insErr } = await admin.from('qr_tokens').insert({
      child_id,
      nursery_id,
      token,
      expires_at: expiresAtIso,
      purpose,
      delegate_name: purpose === 'delegate' ? delegateName : null,
      pickup_person_full_name: purpose === 'delegate' ? pickupPersonFullName : null,
      pickup_relationship: purpose === 'delegate' ? pickupRelationship || null : null,
      pickup_identity_type: purpose === 'delegate' ? pickupIdentityType : null,
      pickup_identity_number: purpose === 'delegate' ? pickupIdentityNumber : null,
      pickup_identity_image_path: purpose === 'delegate' ? pickupIdentityImagePath : null,
      pickup_identity_back_image_path: purpose === 'delegate' ? pickupIdentityBackImagePath || null : null,
      pickup_notes: purpose === 'delegate' ? pickupNotes || null : null,
      require_id_capture: requireIdCapture,
      single_use: singleUse,
      issued_by: authData.user.id,
    } as never).select('id').single();

    if (insErr) {
      return jsonResponse({ error: insErr.message }, 500);
    }
    const inserted = insertedToken as { id: string } | null;

    return jsonResponse({
      id: inserted?.id ?? null,
      token,
      expires_at: expiresAtIso,
      expires_in: ttl,
      purpose,
      delegate_name: purpose === 'delegate' ? delegateName : null,
      pickup_person_full_name: purpose === 'delegate' ? pickupPersonFullName : null,
      pickup_relationship: purpose === 'delegate' ? pickupRelationship || null : null,
      pickup_identity_type: purpose === 'delegate' ? pickupIdentityType : null,
      pickup_identity_number: purpose === 'delegate' ? pickupIdentityNumber : null,
      pickup_identity_image_path: purpose === 'delegate' ? pickupIdentityImagePath : null,
      pickup_identity_back_image_path: purpose === 'delegate' ? pickupIdentityBackImagePath || null : null,
      pickup_notes: purpose === 'delegate' ? pickupNotes || null : null,
      require_id_capture: requireIdCapture,
      single_use: singleUse,
    });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});

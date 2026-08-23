import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

import { getAdminClient } from '../_shared/admin.ts';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';

/**
 * Adds a branch_admin to a nursery that already exists.
 *
 * xo-create-nursery already builds a branch_admin, but only as part of creating a new
 * nursery — so a nursery that ends up with no admin (or loses one) had no way back.
 * Same checks and same resulting row, just without the nursery insert.
 */
type Body = {
  nurseryId: string;
  adminNameAr: string;
  adminNameEn: string;
  adminEmail: string;
  adminPhone: string;
};

function generateTemporaryPassword(): string {
  const base = crypto.randomUUID().replace(/-/g, '');
  return `${base.slice(0, 10)}A1`;
}

function cleanEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function authEmailExists(admin: ReturnType<typeof getAdminClient>, email: string): Promise<boolean> {
  const perPage = 1000;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = (data as { users?: Array<{ email?: string | null }> } | null)?.users ?? [];
    if (users.some((user) => cleanEmail(user.email ?? '') === email)) return true;
    if (users.length < perPage) return false;
  }

  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return jsonResponse({ error: 'Server misconfiguration' }, 500);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !authData.user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = (await req.json()) as Body;
    if (!body.nurseryId || !body.adminNameAr?.trim() || !body.adminNameEn?.trim() || !body.adminEmail?.trim()) {
      return jsonResponse({ error: 'Missing required fields' }, 400);
    }

    const admin = getAdminClient();
    const { data: caller, error: callerErr } = await admin
      .from('users')
      .select('id, role')
      .eq('id', authData.user.id)
      .maybeSingle();
    if (callerErr) return jsonResponse({ error: callerErr.message }, 500);
    const callerRole = (caller as { role?: string | null } | null)?.role;
    if (callerRole !== 'xo_super_admin' && callerRole !== 'chain_super_admin') {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    const { data: nursery, error: nurseryErr } = await admin
      .from('nurseries')
      .select('id, name_en, language_pref')
      .eq('id', body.nurseryId)
      .is('deleted_at', null)
      .maybeSingle();
    if (nurseryErr) return jsonResponse({ error: nurseryErr.message }, 500);
    if (!nursery) return jsonResponse({ error: 'Invalid nursery' }, 400);

    const adminEmail = cleanEmail(body.adminEmail);
    const { data: existingPublicUser, error: existingPublicErr } = await admin
      .from('users')
      .select('id, role, nursery_id')
      .ilike('email', adminEmail)
      .maybeSingle();
    if (existingPublicErr) return jsonResponse({ error: existingPublicErr.message }, 500);
    if (existingPublicUser) {
      const role = (existingPublicUser as { role?: string | null }).role;
      const nurseryId = (existingPublicUser as { nursery_id?: string | null }).nursery_id;
      return jsonResponse({
        error: role === 'parent' && !nurseryId ? 'email_used_by_unassigned_parent' : 'email_used_by_existing_user',
        role,
      }, 409);
    }

    if (await authEmailExists(admin, adminEmail)) {
      return jsonResponse({ error: 'email_used_by_auth_account' }, 409);
    }

    const languagePref = (nursery as { language_pref?: string | null }).language_pref ?? 'both';
    const tempPassword = generateTemporaryPassword();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: adminEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        name_ar: body.adminNameAr.trim(),
        name_en: body.adminNameEn.trim(),
        phone: body.adminPhone?.trim() ?? '',
        language_pref: languagePref,
      },
    });
    if (createErr || !created.user) {
      return jsonResponse({ error: createErr?.message ?? 'Admin auth user creation failed' }, 400);
    }

    const adminUserId = created.user.id;
    const { error: updateUserErr } = await admin
      .from('users')
      .update({
        nursery_id: body.nurseryId,
        role: 'branch_admin',
        name_ar: body.adminNameAr.trim(),
        name_en: body.adminNameEn.trim(),
        email: adminEmail,
        phone: body.adminPhone?.trim() ?? null,
        status: 'active',
        language_pref: languagePref,
        onboarding_completed: true,
      } as never)
      .eq('id', adminUserId);

    if (updateUserErr) {
      await admin.auth.admin.deleteUser(adminUserId);
      return jsonResponse({ error: updateUserErr.message }, 500);
    }

    try {
      await admin.functions.invoke('email-dispatch', {
        body: {
          type: 'welcome_branch_admin',
          email: adminEmail,
          payload: {
            nursery_name_en: (nursery as { name_en?: string | null }).name_en ?? '',
            admin_name_en: body.adminNameEn.trim(),
            temp_password: tempPassword,
          },
        },
      });
    } catch {
      // Best effort — the admin account is already usable with the temporary password.
    }

    // email-dispatch is currently a stub that sends nothing, so the caller has to be
    // able to hand the password over manually.
    return jsonResponse({ adminUserId, email: adminEmail, tempPassword });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

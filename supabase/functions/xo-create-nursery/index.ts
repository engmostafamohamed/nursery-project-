import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

import { getAdminClient } from '../_shared/admin.ts';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';

type Body = {
  nameAr: string;
  nameEn: string;
  city: string;
  phone: string;
  languagePref: 'ar' | 'en' | 'both';
  logoFileUrl: string | null;
  opensAt: string | null;
  closesAt: string | null;
  workingDays: number[];
  departments: string[] | null;
  subscriptionPlan: 'starter' | 'professional' | 'enterprise';
  pricingModel: 'fixed' | 'per_child' | 'hourly' | 'hybrid';
  baseFee: number | null;
  perChildRate: number | null;
  hourlyRate: number | null;
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
    if (
      !body.nameAr?.trim() ||
      !body.nameEn?.trim() ||
      !body.city?.trim() ||
      !body.phone?.trim() ||
      !body.adminNameAr?.trim() ||
      !body.adminNameEn?.trim() ||
      !body.adminEmail?.trim() ||
      !body.adminPhone?.trim()
    ) {
      return jsonResponse({ error: 'Missing required fields' }, 400);
    }
    if (!Array.isArray(body.workingDays) || body.workingDays.length < 1) {
      return jsonResponse({ error: 'Select at least one working day' }, 400);
    }

    const admin = getAdminClient();
    const { data: caller, error: callerErr } = await admin
      .from('users')
      .select('id, role')
      .eq('id', authData.user.id)
      .maybeSingle();
    if (callerErr) return jsonResponse({ error: callerErr.message }, 500);
    if (caller?.role !== 'xo_super_admin') return jsonResponse({ error: 'Forbidden' }, 403);

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

    const now = new Date();
    const trialEnds = new Date(now.getTime());
    trialEnds.setDate(trialEnds.getDate() + 30);

    const { data: nurseryRow, error: nurseryErr } = await admin
      .from('nurseries')
      .insert({
        name_ar: body.nameAr.trim(),
        name_en: body.nameEn.trim(),
        city: body.city.trim(),
        phone: body.phone.trim(),
        language_pref: body.languagePref,
        logo_url: body.logoFileUrl?.trim() || null,
        opens_at: body.opensAt,
        closes_at: body.closesAt,
        working_days: body.workingDays.map((d) => String(d)),
        // Parent signup reads this; fall back so its dropdown is never empty.
        departments: Array.isArray(body.departments) && body.departments.length > 0
          ? body.departments.map((d) => String(d).trim()).filter(Boolean)
          : ['English', 'French'],
        subscription_plan: body.subscriptionPlan,
        subscription_status: 'trial',
        trial_ends_at: trialEnds.toISOString(),
        pricing_model: body.pricingModel,
        base_fee: body.baseFee !== null ? String(body.baseFee) : null,
        per_child_fee: body.perChildRate !== null ? String(body.perChildRate) : null,
      } as never)
      .select('*')
      .single();

    if (nurseryErr || !nurseryRow) {
      return jsonResponse({ error: nurseryErr?.message ?? 'Nursery insert failed' }, 500);
    }

    const nursery = nurseryRow as { id: string };
    const { error: settingsErr } = await admin.from('nursery_settings').insert({ nursery_id: nursery.id } as never);
    if (settingsErr && settingsErr.code !== '23505') {
      await admin.from('nurseries').delete().eq('id', nursery.id);
      return jsonResponse({ error: settingsErr.message }, 500);
    }

    const tempPassword = generateTemporaryPassword();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: adminEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        name_ar: body.adminNameAr.trim(),
        name_en: body.adminNameEn.trim(),
        phone: body.adminPhone.trim(),
        language_pref: body.languagePref,
      },
    });
    if (createErr || !created.user) {
      await admin.from('nurseries').delete().eq('id', nursery.id);
      return jsonResponse({ error: createErr?.message ?? 'Admin auth user creation failed' }, 400);
    }

    const adminUserId = created.user.id;
    const { error: updateUserErr } = await admin
      .from('users')
      .update({
        nursery_id: nursery.id,
        role: 'branch_admin',
        name_ar: body.adminNameAr.trim(),
        name_en: body.adminNameEn.trim(),
        email: adminEmail,
        phone: body.adminPhone.trim(),
        status: 'active',
        language_pref: body.languagePref,
        onboarding_completed: true,
      } as never)
      .eq('id', adminUserId);

    if (updateUserErr) {
      await admin.auth.admin.deleteUser(adminUserId);
      await admin.from('nurseries').delete().eq('id', nursery.id);
      return jsonResponse({ error: updateUserErr.message }, 500);
    }

    try {
      await admin.functions.invoke('email-dispatch', {
        body: {
          type: 'welcome_branch_admin',
          email: adminEmail,
          payload: {
            nursery_name_en: body.nameEn.trim(),
            admin_name_en: body.adminNameEn.trim(),
            temp_password: tempPassword,
          },
        },
      });
    } catch {
      // Email dispatch is best-effort; nursery creation still succeeds.
    }

    return jsonResponse({ nursery: nurseryRow, adminUserId });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

import { getAdminClient } from '../_shared/admin.ts';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';

type Body = {
  email: string;
};

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

    const admin = getAdminClient();
    const { data: caller, error: callerErr } = await admin
      .from('users')
      .select('id, role')
      .eq('id', authData.user.id)
      .maybeSingle();
    if (callerErr) return jsonResponse({ error: callerErr.message }, 500);
    if (caller?.role !== 'xo_super_admin') return jsonResponse({ error: 'Forbidden' }, 403);

    const body = (await req.json()) as Body;
    const email = cleanEmail(body.email ?? '');
    if (!email) return jsonResponse({ available: false, reason: 'email_required' }, 400);

    const { data: existingPublicUser, error: existingPublicErr } = await admin
      .from('users')
      .select('id, role, nursery_id')
      .ilike('email', email)
      .maybeSingle();
    if (existingPublicErr) return jsonResponse({ error: existingPublicErr.message }, 500);

    if (existingPublicUser) {
      const row = existingPublicUser as { role?: string | null; nursery_id?: string | null };
      return jsonResponse({
        available: false,
        reason: row.role === 'parent' && !row.nursery_id
          ? 'email_used_by_unassigned_parent'
          : 'email_used_by_existing_user',
        role: row.role,
      });
    }

    if (await authEmailExists(admin, email)) {
      return jsonResponse({ available: false, reason: 'email_used_by_auth_account' });
    }

    return jsonResponse({ available: true });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

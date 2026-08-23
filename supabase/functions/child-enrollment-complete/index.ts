import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

import { getAdminClient } from '../_shared/admin.ts';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';

type ParentPayload = {
  full_name_ar: string;
  full_name_en: string;
  national_id: string;
  mobile: string;
  email: string | null;
  occupation: string;
  workplace: string;
};

type PickupPayload = {
  name: string;
  phone: string;
  relation: string | null;
  photo_path: string | null;
};

type Body = {
  nursery_id: string;
  child: {
    full_name_ar: string;
    full_name_en: string;
    dob: string;
    gender: string;
    nationality: string;
    birth_certificate_number: string;
    avatar_url: string | null;
    photo_privacy_restricted: boolean;
  };
  enrollment_extended_json: Record<string, unknown>;
  father: ParentPayload | null;
  mother: ParentPayload | null;
  pickups: PickupPayload[];
};

function randomPassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/** Align with client E.164: + and 8–15 digits, or legacy 01… Egyptian → +20… */
function normalizeMobile(m: string): string | null {
  const s = m.trim().replace(/\s/g, '');
  if (!s) return null;
  if (s.startsWith('+')) {
    const digits = s.slice(1).replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
    return null;
  }
  const d = s.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('01')) return `+20${d.slice(1)}`;
  if (d.length >= 8 && d.length <= 15 && d.startsWith('0')) return `+20${d.slice(1)}`;
  return null;
}

async function ensureParentUser(admin: ReturnType<typeof getAdminClient>, nurseryId: string, p: ParentPayload): Promise<string | null> {
  const mobile = normalizeMobile(p.mobile);
  if (!mobile) return null;

  // Match on both phone spellings: this flow writes the normalized +20 form, but parent
  // self-signup stores whatever the parent typed (01…), so one lookup misses the other.
  const rawMobile = p.mobile?.trim() ?? '';
  const phoneCandidates = [...new Set([mobile, rawMobile].filter(Boolean))];
  const { data: byPhone } = await admin
    .from('users')
    .select('id')
    .eq('nursery_id', nurseryId)
    .in('phone', phoneCandidates)
    .maybeSingle();
  if (byPhone?.id) return byPhone.id as string;

  // Email is the actual unique key in auth. Without this, a parent whose phone is stored
  // in the other format falls through to createUser and the whole enrolment 500s with
  // "A user with this email address has already been registered".
  const trimmedEmail = p.email?.trim() ?? '';
  if (trimmedEmail) {
    const { data: byEmail } = await admin
      .from('users')
      .select('id')
      .ilike('email', trimmedEmail)
      .maybeSingle();
    if (byEmail?.id) return byEmail.id as string;
  }

  const email = (trimmedEmail || `${mobile.replace(/\D/g, '')}@parent.placeholder.xo`) as string;
  const password = randomPassword();
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name_ar: p.full_name_ar,
      name_en: p.full_name_en,
    },
  });
  if (cErr || !created.user) throw new Error(cErr?.message ?? 'create parent failed');

  const uid = created.user.id;
  const { error: uErr } = await admin
    .from('users')
    .update({
      nursery_id: nurseryId,
      name_ar: p.full_name_ar,
      name_en: p.full_name_en,
      email,
      phone: mobile,
      role: 'parent',
      status: 'active',
      onboarding_completed: true,
    } as never)
    .eq('id', uid);
  if (uErr) throw new Error(uErr.message);

  return uid;
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
    if (!body.nursery_id || !body.child?.full_name_ar?.trim() || !body.child?.dob) {
      return jsonResponse({ error: 'Missing required fields' }, 400);
    }

    const admin = getAdminClient();
    const { data: caller } = await admin
      .from('users')
      .select('id, role, nursery_id')
      .eq('id', authData.user.id)
      .maybeSingle();
    if (
      !caller ||
      (caller.role !== 'branch_admin' && caller.role !== 'chain_super_admin' && caller.role !== 'xo_super_admin')
    ) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }
    if (caller.role === 'branch_admin' && caller.nursery_id !== body.nursery_id) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    let fatherId = body.father?.mobile ? await ensureParentUser(admin, body.nursery_id, body.father) : null;
    let motherId = body.mother?.mobile ? await ensureParentUser(admin, body.nursery_id, body.mother) : null;
    if (fatherId && motherId && fatherId === motherId) {
      motherId = null;
    }

    const { data: childRow, error: childErr } = await admin
      .from('children')
      .insert({
        nursery_id: body.nursery_id,
        full_name_ar: body.child.full_name_ar.trim(),
        full_name_en: body.child.full_name_en.trim() || body.child.full_name_ar.trim(),
        dob: body.child.dob,
        enrollment_date: new Date().toISOString().slice(0, 10),
        status: 'active',
        photo_privacy_restricted: body.child.photo_privacy_restricted,
        avatar_url: body.child.avatar_url,
        enrollment_extended_json: body.enrollment_extended_json,
      } as never)
      .select('id')
      .single();

    if (childErr || !childRow) return jsonResponse({ error: childErr?.message ?? 'child insert failed' }, 500);

    const childId = (childRow as { id: string }).id;

    const links: { parent_id: string; child_id: string }[] = [];
    if (fatherId) links.push({ parent_id: fatherId, child_id: childId });
    if (motherId && motherId !== fatherId) links.push({ parent_id: motherId, child_id: childId });
    if (links.length > 0) {
      const { error: pcErr } = await admin.from('parent_children').insert(links as never);
      if (pcErr) return jsonResponse({ error: pcErr.message }, 500);
    }

    if (body.pickups.length > 0) {
      const rows = body.pickups.map((p) => ({
        child_id: childId,
        name: p.name,
        phone: p.phone,
        relation: p.relation,
        photo_url: p.photo_path,
        active: true,
      }));
      const { error: puErr } = await admin.from('authorized_pickups').insert(rows as never);
      if (puErr) return jsonResponse({ error: puErr.message }, 500);
    }

    return jsonResponse({ child_id: childId });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});

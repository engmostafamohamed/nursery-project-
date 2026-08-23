/**
 * Full staff onboarding: user (new or promoted) + staff_profiles + staff_schedules.
 * Client uploads files afterward using returned staff_profile_id.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

import { getAdminClient } from '../_shared/admin.ts';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';
import {
  buildHrExtendedJson,
  employmentUiToDb,
  generateEmployeeId,
  positionToDepartment,
  type StaffOnboardingCompletePayload,
} from './mapStaffProfile.ts';

// function randomPassword(): string {
//   const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
//   return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
// }

/** Shared default password for all newly onboarded staff. They sign in with
 *  this immediately (and it shows on the login page's demo panel); staff are
 *  expected to change it from inside the app afterward. */
const DEFAULT_STAFF_PASSWORD = 'Demo2026!';

function timeWithSeconds(t: string): string {
  return t.length === 5 ? `${t}:00` : t;
}

/** Merge snake_case keys into camelCase so client camelCase and any snake_case proxy bodies both work. */
function mergeCamelCaseBody(raw: Record<string, unknown>): Record<string, unknown> {
  const camel: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const ck = k.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
    camel[ck] = v;
  }
  return { ...camel, ...raw };
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

    const raw = (await req.json()) as Record<string, unknown>;
    const b = mergeCamelCaseBody(raw) as StaffOnboardingCompletePayload;
    if (!b.nurseryId || !b.termsAccepted) {
      return jsonResponse({ error: 'Missing required fields' }, 400);
    }
    if (b.gender !== 'male' && b.gender !== 'female') {
      return jsonResponse({ error: 'Invalid gender' }, 400);
    }
    if (!Array.isArray(b.workingDays) || b.workingDays.length < 1) {
      return jsonResponse({ error: 'Invalid working days' }, 400);
    }

    const admin = getAdminClient();
    const { data: caller } = await admin
      .from('users')
      .select('id, role, department, nursery_id, chain_id')
      .eq('id', authData.user.id)
      .maybeSingle();
    const role = caller?.role as string | undefined;
    const dept = caller?.department as string | undefined;

    // Allowed roles for staff onboarding:
    //   branch_admin   — own nursery
    //   chain_super_admin — own chain
    //   xo_super_admin — any
    //   manager + department='hr' — own nursery (HR specialisation)
    // Manager Finance and other manager variants are blocked.
    const isManagerHr = role === 'manager' && dept === 'hr';
    const allowedRole =
      role === 'branch_admin' ||
      role === 'chain_super_admin' ||
      role === 'xo_super_admin' ||
      isManagerHr;
    if (!caller || !allowedRole) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }
    if ((role === 'branch_admin' || isManagerHr) && caller.nursery_id !== b.nurseryId) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }
    if (role === 'chain_super_admin') {
      const chainId = caller.chain_id as string | null | undefined;
      if (!chainId) {
        return jsonResponse({ error: 'Nursery not in your chain' }, 403);
      }
      const { data: nurseryInChain, error: chainNurseryErr } = await admin
        .from('nurseries')
        .select('id')
        .eq('id', b.nurseryId)
        .eq('chain_id', chainId)
        .maybeSingle();
      if (chainNurseryErr || !nurseryInChain) {
        return jsonResponse({ error: 'Nursery not in your chain' }, 403);
      }
    }

    let userId: string;
    let createdNewAuthUser = false;

    if (b.userMode === 'new') {
      if (!b.newNameAr?.trim() || !b.newMobile?.trim()) {
        return jsonResponse({ error: 'Missing name or mobile for new user' }, 400);
      }
      const email = b.newEmail?.trim() || `${b.newMobile.replace(/\D/g, '')}@staff.placeholder.xo`;

      // Pre-check: if an auth user with this email already exists, return a
      // friendly error instead of the cryptic 422 from auth.admin.createUser.
      // Common cause: re-clicking Submit with the same mobile number after a
      // prior successful onboarding (placeholder email derived from mobile).
      const { data: existingPage } = await admin.auth.admin.listUsers({ page: 1, perPage: 1, email } as never);
      const existing = (existingPage as { users?: Array<{ id: string; email?: string | null }> } | null)?.users?.[0];
      if (existing) {
        return jsonResponse({
          error: 'staff_already_exists',
          error_message: `A staff member with this mobile number (${b.newMobile}) is already registered. Use a different mobile number, or open the existing staff record at /admin/staff/directory.`,
          existing_user_id: existing.id,
        }, 409);
      }

      const password = DEFAULT_STAFF_PASSWORD;
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name_ar: b.newNameAr, name_en: b.newNameEn, phone: b.newMobile },
      });
      if (createErr || !created.user) {
        // Race condition fallback: another simultaneous request beat us to it.
        const friendly = /duplicate|already|exists/i.test(createErr?.message ?? '')
          ? `A staff member with this mobile number (${b.newMobile}) is already registered.`
          : (createErr?.message ?? 'createUser failed');
        return jsonResponse({ error: 'create_user_failed', error_message: friendly }, 400);
      }
      userId = created.user.id;
      createdNewAuthUser = true;

      const { error: updErr } = await admin
        .from('users')
        .update({
          nursery_id: b.nurseryId,
          role: 'teacher',
          name_ar: b.newNameAr,
          name_en: b.newNameEn || b.newNameAr,
          email,
          phone: b.newMobile,
          status: 'active',
          onboarding_completed: true,
        } as never)
        .eq('id', userId);
      if (updErr) {
        await admin.auth.admin.deleteUser(userId);
        return jsonResponse({ error: updErr.message }, 500);
      }
    } else {
      const eid = b.existingUserId?.trim();
      if (!eid) return jsonResponse({ error: 'existingUserId required' }, 400);
      userId = eid;
      const { error: promoteErr } = await admin
        .from('users')
        .update({ role: 'teacher', onboarding_completed: true } as never)
        .eq('id', userId)
        .eq('nursery_id', b.nurseryId);
      if (promoteErr) return jsonResponse({ error: promoteErr.message }, 500);
    }

    const employeeId = b.employeeId?.trim() || generateEmployeeId();
    const department = positionToDepartment(b.position);
    const contractType = employmentUiToDb(b.employmentType);
    const hrExtended = buildHrExtendedJson(b);
    const qualifications = [
      { type: 'onboarding', completed_at: new Date().toISOString(), payload: hrExtended },
    ];

    const { data: inserted, error: insErr } = await admin
      .from('staff_profiles')
      .insert({
        user_id: userId,
        nursery_id: b.nurseryId,
        employee_id: employeeId,
        department,
        position: b.position,
        hire_date: b.startDate,
        contract_type: contractType,
        salary_amount: String(Number(b.baseSalary)),
        emergency_contact_name: b.emergencyName,
        emergency_contact_phone: b.emergencyPhone || '',
        address: null,
        national_id: b.nationalId,
        qualifications_json: qualifications,
        documents_json: [],
        hr_extended_json: hrExtended,
      } as never)
      .select('id')
      .single();

    if (insErr || !inserted) {
      if (createdNewAuthUser) await admin.auth.admin.deleteUser(userId);
      return jsonResponse({ error: insErr?.message ?? 'staff_profiles insert failed' }, 500);
    }

    const staffProfileId = (inserted as { id: string }).id;
    let scheduleError: string | undefined;

    for (const day of b.workingDays) {
      const { error: schErr } = await admin.from('staff_schedules').insert({
        staff_id: staffProfileId,
        nursery_id: b.nurseryId,
        day_of_week: day,
        start_time: timeWithSeconds(b.workStartTime),
        end_time: timeWithSeconds(b.workEndTime),
        is_working_day: true,
      } as never);
      if (schErr) {
        scheduleError = schErr.message;
        break;
      }
    }

    return jsonResponse({
      user_id: userId,
      staff_profile_id: staffProfileId,
      employee_id: employeeId,
      ...(scheduleError ? { schedule_error: scheduleError } : {}),
    });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});

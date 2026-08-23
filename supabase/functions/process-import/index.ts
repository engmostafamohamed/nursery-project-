import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';
import { corsHeaders, jsonResponse } from '../_shared/http.ts';

type ColumnMapping = {
  excelColumn: string;
  dbTable: string;
  dbColumn: string;
  confidence: number;
  transformLogic?: string;
};

const RICH_TABLES = new Set([
  'children',
  'users',
  'parent_children',
  'child_dietary_preferences',
  'child_diaper_care',
  'child_allergies',
  'authorized_pickups',
  'authorized_pickup_2',
  'emergency_contact',
  'emergency_contact_2',
  'family',
]);

const parseBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (['yes', 'true', '1', 'y', 'نعم'].includes(normalized)) return true;
  if (['no', 'false', '0', 'n', 'لا', 'na', 'n/a', '-'].includes(normalized)) return false;
  return null;
};

const isMissing = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') {
    const t = value.trim().toLowerCase();
    return t === '' || t === 'na' || t === 'n/a' || t === '-' || t === 'لا يوجد' || t === 'لا';
  }
  return false;
};

const applyTransform = (value: unknown, transformLogic?: string): unknown => {
  if (!transformLogic) return value;
  if (transformLogic === 'parse_boolean') return parseBoolean(value);
  if (transformLogic === 'comma_separated_array') {
    if (typeof value !== 'string') return [];
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return value;
};

const excelSerialToIsoDate = (serial: number): string | null => {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  const date = new Date(utcValue * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const parseDateLike = (value: unknown): string | null => {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return excelSerialToIsoDate(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      return excelSerialToIsoDate(Number(trimmed));
    }
    // Handle M/D/YYYY common in Google-Forms exports
    const slashy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (slashy) {
      const [, m, d, y] = slashy;
      const yr = y.length === 2 ? `20${y}` : y;
      const mm = m.padStart(2, '0');
      const dd = d.padStart(2, '0');
      return `${yr}-${mm}-${dd}`;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return null;
};

// Excel time fractions: 0.375 = 09:00, 0.5 = 12:00. Also accepts "9:00", "9:00 AM".
const parseTimeLike = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && value >= 0 && value < 1) {
    const totalMin = Math.round(value * 24 * 60);
    const h = Math.floor(totalMin / 60).toString().padStart(2, '0');
    const m = (totalMin % 60).toString().padStart(2, '0');
    return `${h}:${m}:00`;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const ampm = trimmed.match(/^(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)$/i);
    if (ampm) {
      let h = parseInt(ampm[1], 10);
      const m = parseInt(ampm[2] ?? '0', 10);
      const isPm = ampm[3].toLowerCase() === 'pm';
      if (h === 12) h = isPm ? 12 : 0;
      else if (isPm) h += 12;
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`;
    }
    const hm = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (hm) {
      const h = parseInt(hm[1], 10).toString().padStart(2, '0');
      return `${h}:${hm[2]}:${hm[3] ?? '00'}`;
    }
  }
  return null;
};

// Egypt phone normalization to E.164. Accepts 01XXXXXXXXX, 1XXXXXXXXX (lost leading 0), already +20...
const normalizePhone = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  let s = String(value).replace(/[\s\-().]/g, '');
  if (!s) return null;
  if (s.startsWith('+')) return s;
  if (s.startsWith('00')) return `+${s.slice(2)}`;
  // Egypt mobile is 10 digits starting with 1; landline area codes start with 2,3,4,5
  if (/^0\d{9,10}$/.test(s)) s = s.slice(1);
  if (/^\d{9,11}$/.test(s)) return `+20${s}`;
  return s; // fallback: return as-is rather than dropping
};

const normalizeNationality = (value: unknown): string | null => {
  if (isMissing(value)) return null;
  const raw = String(value).trim();
  const lower = raw.toLowerCase();
  if (['egyptain', 'egyption', 'egypt', 'مصري', 'مصر', 'egyptian'].includes(lower)) {
    return 'Egyptian';
  }
  // Title-case fallback
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
};

const normalizeNapPreference = (value: unknown): 'same_as_nursery' | 'custom' | 'no_nap' => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (['same_as_nursery', 'same as nursery', 'default', 'normal', 'نفس الحضانة'].includes(raw)) return 'same_as_nursery';
  if (['custom', 'special', 'حسب الطلب', 'مخصص'].includes(raw)) return 'custom';
  if (['no_nap', 'no nap', 'none', 'no', 'false', 'لا', 'بدون'].includes(raw)) return 'no_nap';
  return 'same_as_nursery';
};

const normalizeChildFieldValue = (column: string, value: unknown): unknown => {
  if (column === 'dob') return parseDateLike(value);
  if (column === 'enrollment_date') return parseDateLike(value);
  if (column === 'nap_preference') return normalizeNapPreference(value);
  if (column === 'nationality') return normalizeNationality(value);
  if (column === 'school_preference') {
    const raw = String(value ?? '').trim().toLowerCase();
    if (['international', 'intl', 'ig', 'انترناشونال', 'دولي'].includes(raw)) return 'international';
    if (['national', 'nat', 'arabic', 'وطني', 'عربي'].includes(raw)) return 'national';
    if (['bilingual', 'bi', 'dual', 'لغات', 'ثنائي اللغة'].includes(raw)) return 'bilingual';
    return 'bilingual';
  }
  if (column === 'referral_source') {
    const raw = String(value ?? '').trim().toLowerCase();
    if (['website', 'web', 'site', 'موقع', 'الموقع'].includes(raw)) return 'website';
    if (['friend', 'family', 'friend/family', 'word of mouth', 'صديق', 'قريب'].includes(raw)) return 'friend_family';
    if (['social', 'social media', 'facebook', 'instagram', 'سوشيال', 'فيسبوك', 'انستجرام'].includes(raw)) return 'social_media';
    if (['sibling', 'brother', 'sister', 'sibling at nursery', 'اخ', 'اخت'].includes(raw)) return 'sibling_at_nursery';
    return 'other';
  }
  if (column === 'toilet_training_status') {
    const raw = String(value ?? '').trim().toLowerCase();
    if (['not_started', 'not started', 'none', 'لا', 'غير مدرب', 'not toilet trained'].includes(raw)) return 'not_started';
    if (['in_progress', 'in progress', 'training', 'partial', 'جاري', 'under training'].includes(raw)) return 'in_progress';
    if (['completed', 'done', 'trained', 'yes', 'true', 'مكتمل', 'مدرب'].includes(raw)) return 'completed';
    return 'not_started';
  }
  return value;
};

// Normalize free-text "any allergies?" answers. Returns null if effectively "no allergies".
const parseAllergyText = (value: unknown): string | null => {
  if (isMissing(value)) return null;
  const t = String(value).trim();
  if (/^(no|none|nothing|nope)$/i.test(t)) return null;
  if (t === 'لا') return null;
  return t;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return jsonResponse({ error: 'Server misconfiguration' }, 500);

  const authHeader = req.headers.get('Authorization');
  const bearer = authHeader?.match(/^Bearer\s+(.+)$/i);
  const accessToken = bearer?.[1]?.trim();
  if (!accessToken) return jsonResponse({ error: 'Unauthorized' }, 401);

  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authErr } = await userClient.auth.getUser(accessToken);
  if (authErr || !authData.user) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body: { importJobId: string };
  try { body = await req.json(); }
  catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { importJobId } = body;
  if (!importJobId) return jsonResponse({ error: 'importJobId required' }, 400);

  const serviceClient = createClient(supabaseUrl, serviceKey);

  const { data: job, error: jobErr } = await serviceClient
    .from('import_jobs')
    .select('*')
    .eq('id', importJobId)
    .single();
  if (jobErr || !job) return jsonResponse({ error: 'Import job not found' }, 404);
  if (job.initiated_by !== authData.user.id) return jsonResponse({ error: 'Unauthorized' }, 403);

  await serviceClient
    .from('import_jobs')
    .update({ status: 'importing', started_at: new Date().toISOString() })
    .eq('id', importJobId);

  const fileData = job.file_data as Record<string, unknown>[];
  const configuredMappings = (
    job.user_confirmed_mapping?.mappings ??
    job.ai_detected_format?.mappings ??
    []
  ) as ColumnMapping[];

  let successCount = 0;
  const errors: { row: number; message: string }[] = [];

  // Cache parent auth ids by email so we don't invite the same parent twice in one run
  const parentAuthIdByEmail = new Map<string, string>();

  // Resolve or create a parent auth user, scoped to this nursery to prevent
  // cross-tenant linking. Returns auth user id (== public.users.id) or throws
  // with a descriptive message when the email belongs to a user in another
  // nursery — caller can decide whether to skip the parent link or fail the row.
  const ensure = (cond: unknown, msg: string): asserts cond => {
    if (!cond) throw new Error(msg);
  };

  const resolveParent = async (
    email: string,
    namePayload: { name_ar?: string; name_en?: string; phone?: string },
    nurseryId: string,
  ): Promise<string> => {
    const norm = email.trim().toLowerCase();
    ensure(norm, 'Empty parent email');
    const cached = parentAuthIdByEmail.get(norm);
    if (cached) return cached;

    // Tenant-safe lookup: only reuse a user that is already in THIS nursery and is a parent.
    const sameNursery = await serviceClient
      .from('users')
      .select('id, role, nursery_id')
      .eq('email', norm)
      .eq('nursery_id', nurseryId)
      .maybeSingle();
    if (sameNursery.error) throw new Error(`users lookup failed: ${sameNursery.error.message}`);
    if (sameNursery.data?.id) {
      ensure(sameNursery.data.role === 'parent', `Email ${norm} already exists in this nursery with role=${sameNursery.data.role}; refusing to relink as parent`);
      parentAuthIdByEmail.set(norm, sameNursery.data.id as string);
      return sameNursery.data.id as string;
    }

    // If the email is bound to a different nursery, refuse — never reassign tenancy.
    const elsewhere = await serviceClient
      .from('users')
      .select('id, nursery_id')
      .eq('email', norm)
      .maybeSingle();
    if (elsewhere.error) throw new Error(`cross-nursery lookup failed: ${elsewhere.error.message}`);
    ensure(!elsewhere.data, `Email ${norm} already belongs to a user in another nursery; manual reconciliation required`);

    // No public.users row — invite. The handle_new_user trigger will populate
    // public.users with role=parent; the upsert below sets nursery context.
    const invite = await serviceClient.auth.admin.inviteUserByEmail(norm, {
      data: {
        name_ar: namePayload.name_ar ?? norm.split('@')[0],
        name_en: namePayload.name_en ?? namePayload.name_ar ?? norm.split('@')[0],
        language_pref: 'ar',
      },
    });
    const authId = invite.data?.user?.id;
    ensure(authId, `Failed to invite parent ${norm}: ${invite.error?.message ?? 'unknown error'}`);

    // Race-tolerant: trigger may or may not have fired yet; upsert by id covers both cases.
    const upsert = await serviceClient
      .from('users')
      .upsert({
        id: authId,
        email: norm,
        nursery_id: nurseryId,
        role: 'parent',
        status: 'active',
        name_ar: namePayload.name_ar ?? norm.split('@')[0],
        name_en: namePayload.name_en ?? namePayload.name_ar ?? norm.split('@')[0],
        phone: namePayload.phone ?? null,
        language_pref: 'ar',
        onboarding_completed: false,
      }, { onConflict: 'id' });
    if (upsert.error) throw new Error(`users upsert after invite failed: ${upsert.error.message}`);

    parentAuthIdByEmail.set(norm, authId);
    return authId;
  };

  // Wrap a Supabase query result so that a `{ error }` becomes a thrown Error.
  const must = <T,>(result: { error: { message: string } | null; data?: T }, ctx: string): T | undefined => {
    if (result.error) throw new Error(`${ctx}: ${result.error.message}`);
    return result.data;
  };

  for (let i = 0; i < fileData.length; i++) {
    const row = fileData[i] ?? {};
    try {
      const childPayload: Record<string, unknown> = {
        nursery_id: job.nursery_id,
        status: 'active',
        enrollment_date: new Date().toISOString().slice(0, 10),
      };
      const motherPayload: Record<string, unknown> = { role: 'parent' };
      const fatherPayload: Record<string, unknown> = { role: 'parent' };
      const dietaryPayload: Record<string, unknown> = {};
      const diaperPayload: Record<string, unknown> = {};
      const familyPayload: Record<string, unknown> = {};
      const allergyPayload: Record<string, unknown> = {};
      const pickup1Payload: Record<string, unknown> = {};
      const pickup2Payload: Record<string, unknown> = {};
      const ec1Payload: Record<string, unknown> = {};
      const ec2Payload: Record<string, unknown> = {};
      const dailyCare: Record<string, unknown> = {};

      for (const mapping of configuredMappings) {
        const rawValue = row[mapping.excelColumn];
        if (rawValue === undefined || rawValue === null || rawValue === '') continue;
        const transformedValue = applyTransform(rawValue, mapping.transformLogic);
        const t = mapping.dbTable;
        const c = mapping.dbColumn;
        if (t === 'children') {
          childPayload[c] = normalizeChildFieldValue(c, transformedValue);
        } else if (t === 'users' && c === 'lead_source') {
          // Mirror lead_source onto children too — canonical home is per-enrollment.
          childPayload.lead_source = transformedValue;
          motherPayload.lead_source = transformedValue;
        } else if (t === 'users') {
          // Heuristic: any users-table column with prefix "father_" goes to father, default = mother
          const isFather = /^father/i.test(c) || c === 'father_email';
          const target = isFather ? fatherPayload : motherPayload;
          const cleanCol = c.replace(/^(father_|mother_)/i, '');
          if (cleanCol === 'phone' || cleanCol === 'mobile') {
            target.phone = normalizePhone(transformedValue);
          } else {
            target[cleanCol] = transformedValue;
          }
        } else if (t === 'child_dietary_preferences') {
          dietaryPayload[c] = c.endsWith('_time') || c === 'usual_arrival_time'
            ? parseTimeLike(transformedValue) ?? transformedValue
            : transformedValue;
        } else if (t === 'child_diaper_care') {
          diaperPayload[c] = transformedValue;
        } else if (t === 'child_allergies') {
          allergyPayload[c] = transformedValue;
        } else if (t === 'authorized_pickups') {
          if (c === 'phone' || c === 'mobile_phone') pickup1Payload[c] = normalizePhone(transformedValue);
          else pickup1Payload[c] = transformedValue;
        } else if (t === 'authorized_pickup_2') {
          if (c === 'phone' || c === 'mobile_phone') pickup2Payload[c] = normalizePhone(transformedValue);
          else pickup2Payload[c] = transformedValue;
        } else if (t === 'emergency_contact') {
          if (c === 'phone') ec1Payload[c] = normalizePhone(transformedValue);
          else ec1Payload[c] = transformedValue;
        } else if (t === 'emergency_contact_2') {
          if (c === 'phone') ec2Payload[c] = normalizePhone(transformedValue);
          else ec2Payload[c] = transformedValue;
        } else if (t === 'family') {
          familyPayload[c] = transformedValue;
        } else if (!RICH_TABLES.has(t)) {
          // Unknown destination: stash on daily_care_preferences as a passthrough
          dailyCare[`${t}.${c}`] = transformedValue;
        }
      }

      // Mirror name fields
      if (!childPayload.full_name_ar && childPayload.full_name_en) childPayload.full_name_ar = childPayload.full_name_en;
      if (!childPayload.full_name_en && childPayload.full_name_ar) childPayload.full_name_en = childPayload.full_name_ar;
      if (!childPayload.full_name_ar && !childPayload.full_name_en) throw new Error('Missing child name mapping');

      // Embed family + emergency contacts on the child record
      const emergencyContacts: Array<Record<string, unknown>> = [];
      if (Object.keys(ec1Payload).length > 0) emergencyContacts.push(ec1Payload);
      if (Object.keys(ec2Payload).length > 0) emergencyContacts.push(ec2Payload);
      if (emergencyContacts.length) childPayload.emergency_contacts = emergencyContacts;
      if (Object.keys(dailyCare).length) childPayload.daily_care_preferences = dailyCare;
      if (Object.keys(familyPayload).length) {
        childPayload.enrollment_extended_json = { family: familyPayload };
      }

      // Idempotent re-run: if a child with same (nursery_id, normalized name, dob)
      // already exists, reuse its id and let the parent linking + sister table
      // upserts heal any partial previous state. New inserts only happen when
      // there's no match.
      const dupNameAr = String(childPayload.full_name_ar ?? '').trim();
      const dupNameEn = String(childPayload.full_name_en ?? '').trim();
      const dupDob = childPayload.dob as string | null | undefined;

      let childId: string;
      let nurseryId: string;
      let isExisting = false;

      if (dupDob) {
        const dup = await serviceClient
          .from('children')
          .select('id, nursery_id')
          .eq('nursery_id', job.nursery_id)
          .eq('dob', dupDob)
          .or(`full_name_ar.eq.${dupNameAr},full_name_en.eq.${dupNameEn}`)
          .maybeSingle();
        if (dup.error && !dup.error.message.includes('multiple')) {
          throw new Error(`duplicate check failed: ${dup.error.message}`);
        }
        if (dup.data?.id) {
          childId = dup.data.id as string;
          nurseryId = dup.data.nursery_id as string;
          isExisting = true;
        }
      }

      if (!isExisting) {
        const childInsert = await serviceClient
          .from('children')
          .insert(childPayload)
          .select('id, nursery_id')
          .single();
        if (childInsert.error || !childInsert.data) throw new Error(childInsert.error?.message ?? 'Failed to create child record');
        childId = childInsert.data.id as string;
        nurseryId = childInsert.data.nursery_id as string;
      } else {
        // Heal: refresh enrollment_extended_json + emergency_contacts + daily_care_preferences in place.
        const refresh: Record<string, unknown> = {};
        if (childPayload.emergency_contacts) refresh.emergency_contacts = childPayload.emergency_contacts;
        if (childPayload.daily_care_preferences) refresh.daily_care_preferences = childPayload.daily_care_preferences;
        if (childPayload.enrollment_extended_json) refresh.enrollment_extended_json = childPayload.enrollment_extended_json;
        if (childPayload.lead_source) refresh.lead_source = childPayload.lead_source;
        if (Object.keys(refresh).length) {
          must(await serviceClient.from('children').update(refresh).eq('id', childId!), 'children heal');
        }
      }

      // Sister tables — any failure here triggers a row-level rollback below.
      try {
        // For idempotent re-runs, clear previous sister rows first so we don't
        // double up. The compensating rollback below also reaches them.
        if (isExisting) {
          await serviceClient.from('child_dietary_preferences').delete().eq('child_id', childId);
          await serviceClient.from('child_diaper_care').delete().eq('child_id', childId);
          await serviceClient.from('child_allergies').delete().eq('child_id', childId);
          await serviceClient.from('authorized_pickups').delete().eq('child_id', childId);
        }
        if (Object.keys(dietaryPayload).length) {
          must(await serviceClient.from('child_dietary_preferences').insert({ child_id: childId, ...dietaryPayload }), 'child_dietary_preferences');
        }
        if (Object.keys(diaperPayload).length) {
          must(await serviceClient.from('child_diaper_care').insert({ child_id: childId, ...diaperPayload }), 'child_diaper_care');
        }
        const allergyText = parseAllergyText(allergyPayload.allergen_name);
        if (allergyText) {
          must(await serviceClient.from('child_allergies').insert({
            child_id: childId,
            nursery_id: nurseryId,
            allergen_name: allergyText,
            severity: (allergyPayload.severity as string | undefined) ?? 'moderate',
            reaction_type: (allergyPayload.reaction_type as string | undefined) ?? null,
            treatment_protocol: (allergyPayload.treatment_protocol as string | undefined) ?? null,
          }), 'child_allergies');
        }
        for (const p of [pickup1Payload, pickup2Payload]) {
          if (!p.name) continue;
          must(await serviceClient.from('authorized_pickups').insert({
            child_id: childId,
            name: p.name,
            phone: p.phone ?? p.mobile_phone ?? null,
            relation: p.relation ?? null,
            authorization_level: p.authorization_level ?? 'anytime',
            can_pickup: true,
            active: true,
          }), 'authorized_pickups');
        }

        // Parents
        const parentRefs: Array<{ payload: Record<string, unknown>; relationship: 'mother' | 'father' }> = [];
        if (motherPayload.email) parentRefs.push({ payload: motherPayload, relationship: 'mother' });
        if (fatherPayload.email) parentRefs.push({ payload: fatherPayload, relationship: 'father' });

        for (const ref of parentRefs) {
          const email = String(ref.payload.email).trim();
          if (!email) continue;
          const authId = await resolveParent(email, {
            name_ar: ref.payload.name_ar as string | undefined,
            name_en: ref.payload.name_en as string | undefined,
            phone: ref.payload.phone as string | undefined,
          }, nurseryId);

          // Update extra metadata on the public.users row (only fields that
          // exist on public.users — workplace lives on parent_children).
          must(await serviceClient
            .from('users')
            .update({
              phone: ref.payload.phone ?? null,
              occupation: ref.payload.occupation ?? null,
            })
            .eq('id', authId)
            .eq('nursery_id', nurseryId), 'users update');

          must(await serviceClient.from('parent_children').upsert({
            parent_id: authId,
            child_id: childId,
            relationship: ref.relationship,
            is_primary: ref.relationship === 'mother',
            workplace: (ref.payload.workplace as string | undefined) ?? null,
            work_address: (ref.payload.work_address as string | undefined) ?? null,
            national_id: (ref.payload.national_id as string | undefined) ?? null,
          }, { onConflict: 'parent_id,child_id' }), 'parent_children');
        }
      } catch (subErr) {
        // Compensating rollback. Two cases:
        //  (a) We just created this child in this run (`isExisting === false`).
        //      Drop it and its dependents so the row can be retried cleanly.
        //  (b) The child already existed before this run (`isExisting === true`).
        //      We MUST NOT delete the pre-existing child or its parent links —
        //      that would be data loss on retry. Re-throw and let the row
        //      surface as failed; sister tables that we cleared at the top of
        //      the try block stay cleared, which matches the heal contract.
        if (!isExisting) {
          await serviceClient.from('parent_children').delete().eq('child_id', childId);
          await serviceClient.from('authorized_pickups').delete().eq('child_id', childId);
          await serviceClient.from('child_allergies').delete().eq('child_id', childId);
          await serviceClient.from('child_diaper_care').delete().eq('child_id', childId);
          await serviceClient.from('child_dietary_preferences').delete().eq('child_id', childId);
          await serviceClient.from('children').delete().eq('id', childId);
        }
        throw subErr;
      }

      successCount++;
    } catch (error) {
      errors.push({
        row: i + 1,
        message: error instanceof Error ? error.message : 'Unknown row processing error',
      });
    }

    if (i % 5 === 0) {
      await serviceClient
        .from('import_jobs')
        .update({
          processed_rows: i + 1,
          successful_rows: successCount,
          failed_rows: errors.length,
        })
        .eq('id', importJobId);
    }
  }

  await serviceClient
    .from('import_jobs')
    .update({
      status: 'completed',
      processed_rows: fileData.length,
      successful_rows: successCount,
      failed_rows: errors.length,
      error_log: errors,
      completed_at: new Date().toISOString(),
    })
    .eq('id', importJobId);

  return jsonResponse({ success: true, processed: fileData.length, successful: successCount, failed: errors.length });
});

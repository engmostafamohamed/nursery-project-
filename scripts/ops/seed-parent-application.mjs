import { existsSync, readFileSync } from 'node:fs';

function loadEnv() {
  for (const path of ['.env', '.env.local']) {
    if (!existsSync(path)) continue;
    for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx < 1) continue;
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

function readProjectRef() {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF;
  if (existsSync('supabase/.temp/project-ref')) {
    return readFileSync('supabase/.temp/project-ref', 'utf8').trim();
  }
  const url = process.env.VITE_SUPABASE_URL ?? '';
  const match = url.match(/^https:\/\/([^.]+)\.supabase\.co/);
  return match?.[1] ?? 'qepxjcyntvyvudacsgag';
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Management API HTTP ${res.status}: ${text.slice(0, 1000)}`);
  }
  return text ? JSON.parse(text) : [];
}

function sqlString(value) {
  return value == null ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`;
}

function phoneFromStamp(stamp, suffix) {
  return `010${stamp.slice(-6)}${suffix}`;
}

loadEnv();

const accessToken = requiredEnv('SUPABASE_ACCESS_TOKEN');
const projectRef = readProjectRef();
const nurseryArg = process.argv[2]?.trim();

const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const username = `parentcycle${stamp.slice(-8)}`;
const authEmail = `${username}@parents.xo.local`;
const password = 'ParentCycle2026!';
const childName = `Registration Cycle Child ${stamp}`;
const motherName = `Registration Cycle Parent ${stamp}`;

const nurseryRows = await query(
  nurseryArg
    ? `select id, coalesce(name_en, name_ar, id::text) as name from public.nurseries where id = ${sqlString(nurseryArg)}::uuid limit 1`
    : `
      select n.id, coalesce(n.name_en, n.name_ar, n.id::text) as name
      from public.nurseries n
      join public.users u on u.nursery_id = n.id
      where lower(u.email) = 'demo-branch-admin@xonursery.com'
      order by u.created_at desc
      limit 1
    `,
);

const nursery = nurseryRows[0];
if (!nursery) {
  throw new Error(nurseryArg ? `Nursery not found: ${nurseryArg}` : 'No nursery found');
}

const motherPhone = phoneFromStamp(stamp, '04');
const resultRows = await query(`
  create temporary table parent_application_seed_result (
    parent_id uuid,
    child_id uuid,
    application_id uuid,
    application_status text,
    child_status text,
    parent_link_count integer
  ) on commit drop;

  do $$
  declare
    v_parent_id uuid;
    v_child_id uuid;
    v_application_id uuid;
    v_parent_link_count integer;
  begin
    insert into auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      aud,
      role,
      raw_app_meta_data,
      raw_user_meta_data,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    )
    values (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000',
      ${sqlString(authEmail)},
      crypt(${sqlString(password)}, gen_salt('bf')),
      now(),
      now(),
      now(),
      'authenticated',
      'authenticated',
      '{"provider":"email"}'::jsonb,
      jsonb_build_object(
        'role', 'parent',
        'name_en', ${sqlString(motherName)},
        'name_ar', ${sqlString(motherName)},
        'username', ${sqlString(username)},
        'language_pref', 'en'
      ),
      '',
      '',
      '',
      ''
    )
    returning id into v_parent_id;

    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    )
    values (
      gen_random_uuid(),
      v_parent_id,
      jsonb_build_object(
        'sub', v_parent_id::text,
        'email', ${sqlString(authEmail)},
        'email_verified', true,
        'provider', 'email'
      ),
      'email',
      v_parent_id::text,
      now(),
      now(),
      now()
    );

    insert into public.users (id, nursery_id, role, name_ar, name_en, email, phone, status, language_pref)
    values (
      v_parent_id,
      ${sqlString(nursery.id)}::uuid,
      'parent'::public.user_role,
      ${sqlString(motherName)},
      ${sqlString(motherName)},
      ${sqlString(`cycle.parent.${stamp}@example.test`)},
      ${sqlString(motherPhone)},
      'active',
      'en'
    )
    on conflict (id) do update
    set nursery_id = excluded.nursery_id,
        role = excluded.role,
        name_ar = excluded.name_ar,
        name_en = excluded.name_en,
        email = excluded.email,
        phone = excluded.phone,
        status = excluded.status,
        language_pref = excluded.language_pref;

    update public.users
    set username = ${sqlString(username)},
        onboarding_completed = true,
        occupation = 'Product Manager'
    where id = v_parent_id;

    insert into public.children (
      nursery_id,
      full_name_ar,
      full_name_en,
      first_name,
      middle_name,
      last_name,
      nickname,
      dob,
      gender,
      nationality,
      enrollment_department,
      school_preference,
      school_admissions_plan,
      academic_year,
      has_siblings,
      sibling_ages,
      daily_care_preferences,
      emergency_contacts,
      home_address,
      enrollment_date,
      status,
      enrollment_extended_json
    )
    values (
      ${sqlString(nursery.id)}::uuid,
      ${sqlString(childName)},
      ${sqlString(childName)},
      'Registration',
      'Cycle',
      ${sqlString(`Child ${stamp}`)},
      ${sqlString(`Cycle ${stamp.slice(-4)}`)},
      '2022-04-15',
      'female',
      'Egyptian',
      'english',
      'british',
      'fall_intake',
      '2026-2027',
      false,
      null,
      jsonb_build_object(
        'arrival_time', '08:30',
        'takes_breakfast_at_home', true,
        'eats_nursery_meals', true,
        'accepts_extra_meals', true,
        'accepts_extra_snacks', true,
        'accepts_mineral_water', true,
        'sends_vitamins', false,
        'has_medical_condition', false,
        'child_behavior_health_notes', 'Seeded test application for admin registration-cycle review.',
        'diaper_supply_method', 'stock',
        'daily_diaper_count', 4,
        'toilet_training_status', 'in_progress',
        'nap_time_preference', 'Yes',
        'max_nap_time', '1.5'
      ),
      jsonb_build_array(
        jsonb_build_object('name', ${sqlString(`Emergency Contact A ${stamp.slice(-4)}`)}, 'relationship', 'Aunt', 'phone', ${sqlString(phoneFromStamp(stamp, '01'))}),
        jsonb_build_object('name', ${sqlString(`Emergency Contact B ${stamp.slice(-4)}`)}, 'relationship', 'Uncle', 'phone', ${sqlString(phoneFromStamp(stamp, '02'))})
      ),
      'Seeded test address, Cairo',
      current_date,
      'pending',
      jsonb_build_object(
        'family',
        jsonb_build_object('marital_status', 'married', 'address', 'Seeded test address, Cairo', 'referral_source', 'website'),
        'consents',
        jsonb_build_object('health_policy', true, 'financial_agreement', true, 'policies', true, 'info_accuracy', true),
        'parents',
        jsonb_build_object(
          'father',
          jsonb_build_object('full_name', ${sqlString(`Registration Cycle Father ${stamp}`)}, 'job', 'Engineer', 'mobile', ${sqlString(phoneFromStamp(stamp, '03'))}, 'email', ${sqlString(`cycle.father.${stamp}@example.test`)}),
          'mother',
          jsonb_build_object('full_name', ${sqlString(motherName)}, 'job', 'Product Manager', 'mobile', ${sqlString(motherPhone)}, 'email', ${sqlString(`cycle.parent.${stamp}@example.test`)})
        )
      )
    )
    returning id into v_child_id;

    insert into public.parent_children (parent_id, child_id, relationship, parent_type, is_primary, is_emergency_contact, marital_status)
    values (v_parent_id, v_child_id, 'mother', 'mother', true, true, 'married');

    insert into public.authorized_pickups (child_id, name, phone, relation, authorization_level, active)
    values
      (v_child_id, ${sqlString(`Pickup One ${stamp.slice(-4)}`)}, ${sqlString(phoneFromStamp(stamp, '05'))}, 'Mother', 'anytime', true),
      (v_child_id, ${sqlString(`Pickup Two ${stamp.slice(-4)}`)}, ${sqlString(phoneFromStamp(stamp, '06'))}, 'Father', 'anytime', true);

    insert into public.applications (
      nursery_id,
      parent_id,
      child_id,
      status,
      submitted_at,
      parent_info_json,
      child_info_json,
      terms_accepted
    )
    values (
      ${sqlString(nursery.id)}::uuid,
      v_parent_id,
      v_child_id,
      'submitted',
      now(),
      jsonb_build_object(
        'father', jsonb_build_object('full_name', ${sqlString(`Registration Cycle Father ${stamp}`)}, 'job', 'Engineer', 'mobile', ${sqlString(phoneFromStamp(stamp, '03'))}, 'email', ${sqlString(`cycle.father.${stamp}@example.test`)}),
        'mother', jsonb_build_object('full_name', ${sqlString(motherName)}, 'job', 'Product Manager', 'mobile', ${sqlString(motherPhone)}, 'email', ${sqlString(`cycle.parent.${stamp}@example.test`)}),
        'family', jsonb_build_object('marital_status', 'married', 'address', 'Seeded test address, Cairo', 'referral_source', 'website'),
        'pickups', jsonb_build_array(
          jsonb_build_object('name', ${sqlString(`Pickup One ${stamp.slice(-4)}`)}, 'phone', ${sqlString(phoneFromStamp(stamp, '05'))}, 'relation', 'Mother', 'authorization', 'anytime'),
          jsonb_build_object('name', ${sqlString(`Pickup Two ${stamp.slice(-4)}`)}, 'phone', ${sqlString(phoneFromStamp(stamp, '06'))}, 'relation', 'Father', 'authorization', 'anytime')
        )
      ),
      jsonb_build_object(
        'full_name_ar', ${sqlString(childName)},
        'full_name_en', ${sqlString(childName)},
        'first_name', 'Registration',
        'middle_name', 'Cycle',
        'last_name', ${sqlString(`Child ${stamp}`)},
        'nickname', ${sqlString(`Cycle ${stamp.slice(-4)}`)},
        'dob', '2022-04-15',
        'gender', 'female',
        'nationality', 'Egyptian',
        'department', 'english',
        'school_preference', 'british',
        'school_admissions_plan', 'fall_intake',
        'academic_year', '2026-2027',
        'has_siblings', false,
        'home_address', 'Seeded test address, Cairo'
      ),
      true
    )
    returning id into v_application_id;

    select count(*)::integer into v_parent_link_count
    from public.parent_children
    where parent_id = v_parent_id
      and child_id = v_child_id;

    insert into parent_application_seed_result
    select
      v_parent_id,
      v_child_id,
      v_application_id,
      a.status,
      c.status,
      v_parent_link_count
    from public.applications a
    join public.children c on c.id = a.child_id
    where a.id = v_application_id;
  end $$;

  select * from parent_application_seed_result;
`);

const result = resultRows[0];
if (!result) throw new Error('Seed query returned no result row');

console.log('Seeded parent registration application');
console.log(`Nursery: ${nursery.name} (${nursery.id})`);
console.log(`Parent username: ${username}`);
console.log(`Parent password: ${password}`);
console.log(`Parent auth email: ${authEmail}`);
console.log(`Parent contact email: cycle.parent.${stamp}@example.test`);
console.log(`Child: ${childName}`);
console.log(`Parent ID: ${result.parent_id}`);
console.log(`Child ID: ${result.child_id}`);
console.log(`Application ID: ${result.application_id}`);
console.log(`Application status: ${result.application_status}`);
console.log(`Child status: ${result.child_status}`);
console.log(`Parent-child links: ${result.parent_link_count}`);
console.log('Admin path: /admin/admissions/applications');

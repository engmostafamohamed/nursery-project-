import { existsSync, readFileSync } from 'node:fs';

function loadEnv() {
  if (!existsSync('.env')) return;
  for (const raw of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

function readProjectRef() {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF;
  if (existsSync('supabase/.temp/project-ref')) {
    return readFileSync('supabase/.temp/project-ref', 'utf8').trim();
  }
  return 'qepxjcyntvyvudacsgag';
}

loadEnv();

const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = readProjectRef();

if (!token) {
  throw new Error('Missing SUPABASE_ACCESS_TOKEN in .env');
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
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

const rows = await query(`
  create temporary table cycle_smoke_result (
    application_id uuid,
    invoice_number text,
    invoice_id uuid,
    invoice_status text,
    invoice_amount numeric,
    paid_amount numeric,
    payment_count integer,
    payment_attempt_status text,
    application_status text,
    child_id uuid,
    child_status text,
    parent_link_count integer,
    active_package_count integer,
    visible_in_active_admissions boolean,
    parent_id uuid,
    admin_id uuid,
    nursery_id uuid,
    package_id uuid,
    ok boolean
  ) on commit drop;

  do $$
  declare
    v_parent_id uuid;
    v_admin_id uuid;
    v_nursery_id uuid;
    v_package_id uuid;
    v_package_price numeric;
    v_application_id uuid;
    v_invoice_id uuid;
    v_attempt_id uuid;
    v_child_id uuid;
    v_child_status text;
    v_parent_link_count integer := 0;
    v_active_package_count integer := 0;
    v_visible_in_active_admissions boolean := true;
    v_payment_count integer := 0;
    v_paid_amount numeric := 0;
    v_invoice_status text;
    v_invoice_number text;
    v_attempt_status text;
    v_application_status text;
    v_stamp text := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  begin
    select u.id, u.nursery_id
      into v_parent_id, v_nursery_id
    from public.users u
    where u.role = 'parent'::public.user_role
      and u.nursery_id is not null
      and exists (
        select 1
        from public.packages p
        where p.nursery_id = u.nursery_id
          and p.active = true
          and p.price > 0
      )
      and exists (
        select 1
        from public.users a
        where (a.role = 'branch_admin'::public.user_role and a.nursery_id = u.nursery_id)
           or a.role = 'xo_super_admin'::public.user_role
      )
    order by u.created_at desc
    limit 1;

    if v_parent_id is null then
      raise exception 'No parent with nursery, active paid package, and admin user found';
    end if;

    select p.id, p.price
      into v_package_id, v_package_price
    from public.packages p
    where p.nursery_id = v_nursery_id
      and p.active = true
      and p.price > 0
    order by p.price asc, p.created_at desc
    limit 1;

    select a.id
      into v_admin_id
    from public.users a
    where (a.role = 'branch_admin'::public.user_role and a.nursery_id = v_nursery_id)
       or a.role = 'xo_super_admin'::public.user_role
    order by case when a.role = 'branch_admin'::public.user_role then 0 else 1 end, a.created_at desc
    limit 1;

    insert into public.applications (
      nursery_id,
      parent_id,
      status,
      submitted_at,
      parent_info_json,
      child_info_json,
      terms_accepted
    )
    values (
      v_nursery_id,
      v_parent_id,
      'submitted',
      now(),
      jsonb_build_object('full_name', 'Cycle Smoke Parent', 'email', 'cycle-smoke@example.test'),
      jsonb_build_object(
        'full_name_en', 'Cycle Smoke Child ' || v_stamp,
        'full_name_ar', 'Cycle Smoke Child ' || v_stamp,
        'dob', '2021-01-15',
        'gender', 'male'
      ),
      true
    )
    returning id into v_application_id;

    perform set_config('request.jwt.claim.sub', v_parent_id::text, true);
    v_invoice_id := public.select_application_payment_package(v_application_id, v_package_id);

    insert into public.payment_attempts (
      invoice_id,
      parent_id,
      nursery_id,
      amount,
      payment_method,
      status,
      notes
    )
    values (
      v_invoice_id,
      v_parent_id,
      v_nursery_id,
      v_package_price,
      'manual',
      'pending_confirmation',
      'cycle smoke test'
    )
    returning id into v_attempt_id;

    perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
    perform public.confirm_invoice_payment_attempt(v_attempt_id);

    select i.generated_invoice_number, i.status, i.amount
      into v_invoice_number, v_invoice_status, v_package_price
    from public.invoices i
    where i.id = v_invoice_id;

    select coalesce(sum(p.amount), 0), count(*)::integer
      into v_paid_amount, v_payment_count
    from public.payments p
    where p.invoice_id = v_invoice_id
      and p.status = 'completed';

    select pa.status
      into v_attempt_status
    from public.payment_attempts pa
    where pa.id = v_attempt_id;

    select a.status, a.child_id
      into v_application_status, v_child_id
    from public.applications a
    where a.id = v_application_id;

    select c.status
      into v_child_status
    from public.children c
    where c.id = v_child_id;

    select count(*)::integer
      into v_parent_link_count
    from public.parent_children pc
    where pc.parent_id = v_parent_id
      and pc.child_id = v_child_id;

    select count(*)::integer
      into v_active_package_count
    from public.child_packages cp
    where cp.child_id = v_child_id
      and cp.package_id = v_package_id
      and cp.status = 'active';

    v_visible_in_active_admissions := v_application_status in ('submitted', 'under_review', 'documents_pending');

    insert into cycle_smoke_result
    values (
      v_application_id,
      v_invoice_number,
      v_invoice_id,
      v_invoice_status,
      v_package_price,
      v_paid_amount,
      v_payment_count,
      v_attempt_status,
      v_application_status,
      v_child_id,
      v_child_status,
      v_parent_link_count,
      v_active_package_count,
      v_visible_in_active_admissions,
      v_parent_id,
      v_admin_id,
      v_nursery_id,
      v_package_id,
      v_invoice_status = 'paid'
        and v_paid_amount >= v_package_price
        and v_payment_count = 1
        and v_attempt_status = 'confirmed'
        and v_application_status = 'approved'
        and v_child_id is not null
        and v_child_status = 'active'
        and v_parent_link_count = 1
        and v_active_package_count = 1
        and not v_visible_in_active_admissions
    );
  end $$;

  select * from cycle_smoke_result;
`);

if (!rows.length) {
  throw new Error('Smoke test returned no rows');
}

const result = rows[0];
for (const [key, value] of Object.entries(result)) {
  console.log(`${key}: ${value ?? '-'}`);
}

if (!result.ok) {
  process.exitCode = 1;
}

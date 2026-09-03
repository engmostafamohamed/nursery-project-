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
const invoiceNumber = process.argv[2] ?? '';

if (!token) {
  throw new Error('Missing SUPABASE_ACCESS_TOKEN in .env');
}

if (!invoiceNumber) {
  throw new Error('Usage: node scripts/ops/repair-paid-application-invoice.mjs <invoice-number>');
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

const safeInvoiceNumber = invoiceNumber.replaceAll("'", "''");
const rows = await query(`
  create temporary table repair_paid_application_result (
    invoice_number text,
    invoice_id uuid,
    invoice_status text,
    invoice_amount numeric,
    paid_amount numeric,
    application_id uuid,
    before_application_status text,
    after_application_status text,
    child_id uuid,
    child_status text,
    parent_link_count integer,
    active_package_count integer,
    repaired boolean
  ) on commit drop;

  do $$
  declare
    v_invoice_id uuid;
    v_nursery_id uuid;
    v_invoice_status text;
    v_invoice_amount numeric;
    v_parent_id uuid;
    v_application_id uuid;
    v_before_status text;
    v_after_status text;
    v_paid_amount numeric := 0;
    v_admin_id uuid;
    v_child_id uuid;
    v_child_status text;
    v_parent_link_count integer := 0;
    v_active_package_count integer := 0;
  begin
    select i.id, i.nursery_id, i.status, i.amount, i.parent_id, nullif(i.line_items_json->>'application_id', '')::uuid
      into v_invoice_id, v_nursery_id, v_invoice_status, v_invoice_amount, v_parent_id, v_application_id
    from public.invoices i
    where i.generated_invoice_number = '${safeInvoiceNumber}'
    limit 1;

    if v_invoice_id is null then
      raise exception 'Invoice % not found', '${safeInvoiceNumber}';
    end if;

    if v_application_id is null then
      raise exception 'Invoice % is not linked to an application', '${safeInvoiceNumber}';
    end if;

    select coalesce(sum(p.amount), 0)
      into v_paid_amount
    from public.payments p
    where p.invoice_id = v_invoice_id
      and p.status = 'completed';

    select a.status
      into v_before_status
    from public.applications a
    where a.id = v_application_id;

    select a.id
      into v_admin_id
    from public.users a
    where (a.role = 'branch_admin'::public.user_role and a.nursery_id = v_nursery_id)
       or a.role = 'xo_super_admin'::public.user_role
    order by case when a.role = 'branch_admin'::public.user_role then 0 else 1 end, a.created_at desc
    limit 1;

    if v_admin_id is null then
      raise exception 'No admin user found for invoice nursery';
    end if;

    if v_before_status in ('submitted', 'under_review', 'documents_pending') and v_paid_amount > 0 then
      perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
      perform public.approve_application_enrollment(v_application_id, v_nursery_id, true);
    end if;

    select a.status, a.child_id
      into v_after_status, v_child_id
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
      and cp.status = 'active';

    insert into repair_paid_application_result
    values (
      '${safeInvoiceNumber}',
      v_invoice_id,
      v_invoice_status,
      v_invoice_amount,
      v_paid_amount,
      v_application_id,
      v_before_status,
      v_after_status,
      v_child_id,
      v_child_status,
      v_parent_link_count,
      v_active_package_count,
      v_before_status <> 'approved' and v_after_status = 'approved'
    );
  end $$;

  select * from repair_paid_application_result;
`);

if (!rows.length) {
  throw new Error('Repair returned no rows');
}

for (const [key, value] of Object.entries(rows[0])) {
  console.log(`${key}: ${value ?? '-'}`);
}

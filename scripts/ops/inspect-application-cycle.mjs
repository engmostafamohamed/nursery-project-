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

loadEnv();

const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = existsSync('supabase/.temp/project-ref')
  ? readFileSync('supabase/.temp/project-ref', 'utf8').trim()
  : 'qepxjcyntvyvudacsgag';
const invoiceNumber = process.argv[2] ?? '';

if (!token) {
  throw new Error('Missing SUPABASE_ACCESS_TOKEN in .env');
}
if (!invoiceNumber) {
  throw new Error('Usage: node scripts/ops/inspect-application-cycle.mjs <invoice-number>');
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
  with invoice_row as (
    select
      i.id,
      i.nursery_id,
      i.parent_id,
      i.generated_invoice_number,
      i.status,
      i.amount::numeric as amount,
      i.payment_method,
      i.paid_at,
      i.line_items_json,
      i.line_items_json->>'application_id' as application_id,
      i.line_items_json->>'package_id' as package_id
    from public.invoices i
    where i.generated_invoice_number = '${safeInvoiceNumber}'
    limit 1
  ),
  payment_totals as (
    select invoice_id, coalesce(sum(amount), 0)::numeric as paid_amount, count(*) as payment_count
    from public.payments
    where status = 'completed'
    group by invoice_id
  ),
  latest_attempt as (
    select distinct on (pa.invoice_id)
      pa.invoice_id,
      pa.status as attempt_status,
      pa.amount::numeric as attempt_amount,
      pa.payment_method as attempt_method,
      pa.created_at as attempt_created_at,
      pa.confirmed_at as attempt_confirmed_at
    from public.payment_attempts pa
    join invoice_row ir on ir.id = pa.invoice_id
    order by pa.invoice_id, pa.created_at desc
  ),
  app_row as (
    select
      a.id,
      a.status,
      a.parent_id,
      a.child_id,
      a.reviewed_at
    from public.applications a
    join invoice_row ir on ir.application_id = a.id::text
  ),
  child_row as (
    select c.id, c.status, c.full_name_en, c.full_name_ar
    from public.children c
    join app_row a on a.child_id = c.id
  ),
  parent_link as (
    select pc.child_id, count(*) as parent_link_count
    from public.parent_children pc
    join app_row a on a.child_id = pc.child_id
    group by pc.child_id
  )
  select
    ir.generated_invoice_number as invoice_number,
    ir.id as invoice_id,
    ir.status as invoice_status,
    ir.amount,
    coalesce(pt.paid_amount, 0) as paid_amount,
    greatest(0, ir.amount - coalesce(pt.paid_amount, 0)) as balance_due,
    coalesce(pt.payment_count, 0) as payment_count,
    ir.payment_method,
    ir.paid_at,
    ir.application_id,
    ir.package_id,
    la.attempt_status,
    la.attempt_amount,
    la.attempt_method,
    la.attempt_created_at,
    la.attempt_confirmed_at,
    a.status as application_status,
    a.parent_id as application_parent_id,
    a.child_id as application_child_id,
    a.reviewed_at as application_reviewed_at,
    c.status as child_status,
    coalesce(c.full_name_en, c.full_name_ar) as child_name,
    coalesce(pl.parent_link_count, 0) as parent_link_count
  from invoice_row ir
  left join payment_totals pt on pt.invoice_id = ir.id
  left join latest_attempt la on la.invoice_id = ir.id
  left join app_row a on true
  left join child_row c on true
  left join parent_link pl on pl.child_id = c.id
`);

if (!rows.length) {
  console.log(`Invoice ${invoiceNumber} not found`);
  process.exit(1);
}

for (const [key, value] of Object.entries(rows[0])) {
  console.log(`${key}: ${value ?? '-'}`);
}

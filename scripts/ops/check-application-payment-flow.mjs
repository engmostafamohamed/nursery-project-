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

const checks = await query(`
  select 'approve_function' as check_name,
         exists(
           select 1
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname = 'approve_application_enrollment'
         ) as ok
  union all
  select 'package_function',
         exists(
           select 1
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname = 'select_application_payment_package'
         )
  union all
  select 'package_policy',
         exists(
           select 1
           from pg_policies
           where schemaname = 'public'
             and tablename = 'packages'
             and policyname = 'packages_parent_select'
         )
  union all
  select 'invoice_index',
         exists(
           select 1
           from pg_indexes
           where schemaname = 'public'
             and indexname = 'idx_invoices_application_payment'
         )
  union all
  select 'migration_20260830120000',
         exists(select 1 from supabase_migrations.schema_migrations where version = '20260830120000')
  union all
  select 'migration_20260831090000',
         exists(select 1 from supabase_migrations.schema_migrations where version = '20260831090000')
  union all
  select 'migration_20260901090000',
         exists(select 1 from supabase_migrations.schema_migrations where version = '20260901090000')
`);

let failed = false;
for (const check of checks) {
  console.log(`${check.check_name}: ${check.ok ? 'ok' : 'missing'}`);
  failed ||= !check.ok;
}

if (failed) {
  process.exit(1);
}

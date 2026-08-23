import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const requiredTables = [
  'children',
  'users',
  'media',
  'daily_reports',
  'attendance_records',
  'tenant_export_jobs',
  'tenant_export_artifacts',
];

async function assertTableReadable(table) {
  const { error } = await admin.from(table).select('id', { count: 'exact', head: true }).limit(1);
  if (error) throw new Error(`Table check failed for ${table}: ${error.message}`);
}

async function checkBucketPrivacy() {
  const { data, error } = await admin.storage.listBuckets();
  if (error) throw new Error(`Could not list buckets: ${error.message}`);

  const avatarBucket = data.find((b) => b.id === 'child-avatars');
  if (!avatarBucket) throw new Error('Missing child-avatars bucket');
  if (avatarBucket.public) throw new Error('child-avatars bucket is still public');

  const exportBucket = data.find((b) => b.id === 'tenant-exports');
  if (!exportBucket) throw new Error('Missing tenant-exports bucket');
}

async function checkRlsDenialOptional() {
  const tokenA = process.env.TEST_TENANT_A_JWT;
  const tokenB = process.env.TEST_TENANT_B_JWT;
  if (!tokenA || !tokenB) {
    console.log('Skipping cross-tenant denial check (set TEST_TENANT_A_JWT and TEST_TENANT_B_JWT).');
    return;
  }

  const clientA = createClient(url, process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${tokenA}` } },
  });
  const clientB = createClient(url, process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${tokenB}` } },
  });

  const [a, b] = await Promise.all([
    clientA.from('children').select('id,nursery_id').limit(20),
    clientB.from('children').select('id,nursery_id').limit(20),
  ]);
  if (a.error) throw new Error(`Tenant A query failed: ${a.error.message}`);
  if (b.error) throw new Error(`Tenant B query failed: ${b.error.message}`);

  const aNurseries = new Set((a.data ?? []).map((r) => r.nursery_id));
  const bNurseries = new Set((b.data ?? []).map((r) => r.nursery_id));
  const overlap = [...aNurseries].some((id) => bNurseries.has(id));
  if (overlap) {
    throw new Error('Cross-tenant overlap detected in sampled children rows.');
  }
}

async function main() {
  for (const table of requiredTables) {
    await assertTableReadable(table);
  }
  await checkBucketPrivacy();
  await checkRlsDenialOptional();
  console.log('Integrity checks passed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

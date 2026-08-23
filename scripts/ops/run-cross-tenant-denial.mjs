/**
 * Strict cross-tenant RLS denial test.
 * Requires two distinct nurseries in the database.
 *
 * Env (from .env or shell):
 * - VITE_SUPABASE_URL
 * - VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY
 * - SUPABASE_SERVICE_ROLE_KEY
 * - RLS_CROSS_TENANT_TEST_PASSWORD (required) — strong password for ephemeral test users only
 */
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const testPassword = process.env.RLS_CROSS_TENANT_TEST_PASSWORD;

const EMAIL_A = 'rls_cross_tenant_a@xo-platform.local';
const EMAIL_B = 'rls_cross_tenant_b@xo-platform.local';

if (!url || !anonKey || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL, anon key, or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
if (!testPassword || testPassword.length < 12) {
  console.error('Set RLS_CROSS_TENANT_TEST_PASSWORD (min 12 chars) in your environment.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function ensureParentUser(email, nurseryId) {
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: testPassword,
    email_confirm: true,
    user_metadata: { role: 'parent' },
  });

  let userId = created?.user?.id;

  if (createErr) {
    const msg = createErr.message ?? '';
    if (!msg.toLowerCase().includes('already') && !msg.toLowerCase().includes('registered')) {
      throw new Error(`auth.admin.createUser failed: ${createErr.message}`);
    }
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listErr) throw new Error(listErr.message);
    const found = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!found) throw new Error(`Could not find existing auth user for ${email}`);
    userId = found.id;
    const { error: pwdErr } = await admin.auth.admin.updateUserById(userId, { password: testPassword });
    if (pwdErr) throw new Error(`Could not reset password for ${email}: ${pwdErr.message}`);
  }

  const { error: upsertErr } = await admin.from('users').upsert(
    {
      id: userId,
      nursery_id: nurseryId,
      role: 'parent',
      name_ar: 'RLS اختبار',
      name_en: 'RLS Test',
      email,
      phone: '+200000000000',
      status: 'active',
      language_pref: 'ar',
    },
    { onConflict: 'id' },
  );
  if (upsertErr) throw new Error(`users upsert failed: ${upsertErr.message}`);

  return userId;
}

async function signInJwt(email) {
  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({
    email,
    password: testPassword,
  });
  if (error || !data.session?.access_token) {
    throw new Error(error?.message ?? 'No session');
  }
  return data.session.access_token;
}

async function ensureTwoNurseries() {
  const { data: existing, error: nErr } = await admin.from('nurseries').select('id').order('created_at').limit(2);
  if (nErr) throw new Error(nErr.message);
  if (existing && existing.length >= 2) {
    return [existing[0].id, existing[1].id];
  }
  const { data: inserted, error: insErr } = await admin
    .from('nurseries')
    .insert({
      name_ar: 'RLS اختبار فرع ب',
      name_en: 'RLS Test Nursery B',
    })
    .select('id')
    .single();
  if (insErr) throw new Error(`Could not create second nursery for RLS test: ${insErr.message}`);
  const firstId = existing?.[0]?.id;
  if (!firstId) throw new Error('No nurseries in database.');
  return [firstId, inserted.id];
}

async function main() {
  const [nurseryA, nurseryB] = await ensureTwoNurseries();

  await ensureParentUser(EMAIL_A, nurseryA);
  await ensureParentUser(EMAIL_B, nurseryB);

  const tokenA = await signInJwt(EMAIL_A);
  const tokenB = await signInJwt(EMAIL_B);

  const clientA = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${tokenA}` } },
  });
  const clientB = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${tokenB}` } },
  });

  const [a, b, aCross, bCross] = await Promise.all([
    clientA.from('children').select('id,nursery_id').limit(50),
    clientB.from('children').select('id,nursery_id').limit(50),
    clientA.from('children').select('id').eq('nursery_id', nurseryB).limit(20),
    clientB.from('children').select('id').eq('nursery_id', nurseryA).limit(20),
  ]);

  if (a.error) throw new Error(`Tenant A children query failed: ${a.error.message}`);
  if (b.error) throw new Error(`Tenant B children query failed: ${b.error.message}`);
  if (aCross.error) throw new Error(`Tenant A cross-nursery query failed: ${aCross.error.message}`);
  if (bCross.error) throw new Error(`Tenant B cross-nursery query failed: ${bCross.error.message}`);

  const aNurseries = new Set((a.data ?? []).map((r) => r.nursery_id));
  const bNurseries = new Set((b.data ?? []).map((r) => r.nursery_id));
  const overlap = [...aNurseries].filter((id) => bNurseries.has(id));
  if (overlap.length > 0) {
    throw new Error(`Cross-tenant overlap in sampled children rows: ${overlap.join(', ')}`);
  }

  if ((aCross.data ?? []).length > 0 || (bCross.data ?? []).length > 0) {
    throw new Error(
      `Cross-nursery read leak: A saw ${(aCross.data ?? []).length} rows in B; B saw ${(bCross.data ?? []).length} rows in A.`,
    );
  }

  console.log('Cross-tenant denial checks passed.');
  console.log(`  Nursery A: ${nurseryA}`);
  console.log(`  Nursery B: ${nurseryB}`);
  console.log(`  Sample overlap: none`);
  console.log(`  Direct cross-nursery selects: empty`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

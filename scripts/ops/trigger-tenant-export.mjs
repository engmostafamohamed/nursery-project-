/**
 * Sign in as a branch admin (or chain/xo admin) and POST to tenant-export Edge Function.
 *
 * Env:
 * - VITE_SUPABASE_URL
 * - VITE_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY)
 * - TENANT_EXPORT_TEST_EMAIL
 * - TENANT_EXPORT_TEST_PASSWORD
 */
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
/** Prefer legacy JWT anon key for Edge Functions; publishable keys (`sb_publishable_*`) often return 401 from `/functions/v1`. */
const anonKey =
  process.env.SUPABASE_ANON_JWT ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;
const email = process.env.TENANT_EXPORT_TEST_EMAIL;
const password = process.env.TENANT_EXPORT_TEST_PASSWORD;

if (!url || !anonKey || !email || !password) {
  console.error(
    'Missing env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, TENANT_EXPORT_TEST_EMAIL, TENANT_EXPORT_TEST_PASSWORD',
  );
  process.exit(1);
}

const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function readInvokeError(error) {
  const ctx = error?.context;
  if (ctx && typeof ctx.text === 'function') {
    const text = await ctx.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return error?.message ?? String(error);
}

async function main() {
  const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signErr) throw new Error(`Sign-in failed: ${signErr.message}`);

  const { data, error } = await supabase.functions.invoke('tenant-export', {
    method: 'POST',
    body: {},
  });

  if (error) {
    const detail = await readInvokeError(error);
    console.error('tenant-export failed:', detail);
    process.exit(1);
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    console.error(String(data.error));
    process.exit(1);
  }
  console.log(JSON.stringify(data ?? { success: true }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});

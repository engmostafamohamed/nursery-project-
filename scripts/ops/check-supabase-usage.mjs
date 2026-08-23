/**
 * Optional: fetch project disk utilization from Supabase Management API.
 * Requires a Personal Access Token (Dashboard → Account → Access Tokens), not the DB service role key.
 *
 * Env:
 * - SUPABASE_ACCESS_TOKEN (PAT)
 * - SUPABASE_PROJECT_REF (defaults to project ref parsed from VITE_SUPABASE_URL)
 */
import process from 'node:process';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const explicitRef = process.env.SUPABASE_PROJECT_REF;

function parseRefFromUrl(u) {
  if (!u) return null;
  try {
    const host = new URL(u).hostname;
    const m = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function main() {
  const projectRef = explicitRef || parseRefFromUrl(url);
  if (!projectRef) {
    console.error('Set VITE_SUPABASE_URL or SUPABASE_PROJECT_REF.');
    process.exit(1);
  }
  if (!token) {
    console.log('No SUPABASE_ACCESS_TOKEN set — cannot call Management API.');
    console.log('Open usage in the browser: https://supabase.com/dashboard/org/_/usage');
    console.log('Create a PAT: https://supabase.com/dashboard/account/tokens');
    console.log('Then run: SUPABASE_ACCESS_TOKEN=... npm run ops:usage');
    process.exit(0);
  }

  const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/config/disk/util`;
  const res = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    console.error('Request failed:', res.status, body);
    process.exit(1);
  }
  console.log(JSON.stringify(body, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});

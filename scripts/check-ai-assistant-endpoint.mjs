/**
 * Reads only VITE_SUPABASE_URL from .env (no other vars printed).
 * Usage: node scripts/check-ai-assistant-endpoint.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env');
if (!existsSync(envPath)) {
  console.error('No .env file. Copy .env.example and set VITE_SUPABASE_URL.');
  process.exit(1);
}

let base = '';
for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*VITE_SUPABASE_URL\s*=\s*(.+?)\s*$/);
  if (m) {
    base = m[1].replace(/^["']|["']$/g, '').trim();
    break;
  }
}

if (!base) {
  console.error('VITE_SUPABASE_URL not found in .env');
  process.exit(1);
}

const url = `${base.replace(/\/$/, '')}/functions/v1/ai-assistant`;

async function main() {
  let opt;
  try {
    opt = await fetch(url, { method: 'OPTIONS' });
  } catch (e) {
    console.error('OPTIONS fetch failed:', e instanceof Error ? e.message : e);
    process.exit(2);
  }
  const allowMethods = opt.headers.get('access-control-allow-methods') ?? '';
  const allowHeaders = opt.headers.get('access-control-allow-headers') ?? '';
  console.log(JSON.stringify({ step: 'OPTIONS', url, status: opt.status, allowMethods, allowHeaders }, null, 2));

  let post;
  try {
    post = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: 'anon-check-only' },
      body: JSON.stringify({ messages: [] }),
    });
  } catch (e) {
    console.error('POST fetch failed:', e instanceof Error ? e.message : e);
    process.exit(3);
  }
  const postSnippet = (await post.text()).slice(0, 120).replace(/\s+/g, ' ');
  console.log(
    JSON.stringify(
      {
        step: 'POST_empty_messages',
        status: post.status,
        bodySnippet: postSnippet,
      },
      null,
      2,
    ),
  );
}

main();

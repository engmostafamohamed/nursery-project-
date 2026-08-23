import fs from 'node:fs';
import path from 'node:path';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = 'qepxjcyntvyvudacsgag';
const DIR = 'supabase/migrations';

if (!TOKEN) {
  console.error('Missing SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runSql(query, attempt = 1) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    },
  );
  const text = await res.text();
  if (res.status === 429 && attempt < 6) {
    const wait = 1500 * attempt;
    await sleep(wait);
    return runSql(query, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return text;
}

const IDEMPOTENT_CODES = ['42710', '42P07', '42701', '42P06', '42723'];
function isIdempotentError(message) {
  return IDEMPOTENT_CODES.some((c) => message.includes(c));
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
console.log(`Applying ${files.length} migrations...`);

let applied = 0;
let skipped = 0;
const failures = [];

for (const file of files) {
  const sql = fs.readFileSync(path.join(DIR, file), 'utf8');
  if (!sql.trim()) {
    console.log(`[skip empty] ${file}`);
    skipped++;
    continue;
  }
  process.stdout.write(`[${applied + skipped + failures.length + 1}/${files.length}] ${file} ... `);
  try {
    await runSql(sql);
    console.log('ok');
    applied++;
  } catch (e) {
    if (isIdempotentError(e.message)) {
      console.log('already-exists (ok)');
      skipped++;
    } else {
      console.log('FAIL');
      console.error(`  -> ${e.message.slice(0, 500)}`);
      failures.push({ file, error: e.message });
    }
  }
  await sleep(400);
}

console.log(`\nDone. Applied: ${applied}, skipped: ${skipped}, failed: ${failures.length}`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`- ${f.file}: ${f.error.slice(0, 200)}`);
  }
  process.exit(1);
}

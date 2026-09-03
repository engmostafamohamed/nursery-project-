import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

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
const files = process.argv.slice(2);

if (!token) {
  throw new Error('Missing SUPABASE_ACCESS_TOKEN in .env');
}

if (!files.length) {
  throw new Error('Usage: node scripts/ops/apply-selected-migrations.mjs <migration.sql> [...]');
}

async function query(sql) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    if (res.ok) {
      return text ? JSON.parse(text) : [];
    }

    const retryable =
      res.status === 429 ||
      res.status === 544 ||
      text.toLowerCase().includes('timeout') ||
      text.toLowerCase().includes('connection terminated');
    if (!retryable || attempt === 5) {
      throw new Error(`Management API HTTP ${res.status}: ${text.slice(0, 1000)}`);
    }

    const waitMs = attempt * 4000;
    console.log(`Retrying SQL after ${res.status} in ${waitMs / 1000}s...`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  return [];
}

async function getMigrationColumns() {
  try {
    const rows = await query(`
      select column_name
      from information_schema.columns
      where table_schema = 'supabase_migrations'
        and table_name = 'schema_migrations'
      order by ordinal_position
    `);
    return new Set(rows.map((row) => row.column_name));
  } catch {
    return new Set();
  }
}

async function migrationRecorded(version) {
  if (!version) return false;
  const rows = await query(`
    select version
    from supabase_migrations.schema_migrations
    where version = '${version}'
    limit 1
  `);
  return rows.length > 0;
}

async function recordMigration(columns, version, name, sql) {
  if (!version || !columns.has('version') || (await migrationRecorded(version))) return;

  const escapedName = name.replaceAll("'", "''");
  if (columns.has('name') && columns.has('statements')) {
    const escapedSql = sql.replaceAll("'", "''");
    await query(`
      insert into supabase_migrations.schema_migrations(version, name, statements)
      values ('${version}', '${escapedName}', array['${escapedSql}'])
      on conflict (version) do nothing
    `);
    return;
  }

  if (columns.has('name')) {
    await query(`
      insert into supabase_migrations.schema_migrations(version, name)
      values ('${version}', '${escapedName}')
      on conflict (version) do nothing
    `);
    return;
  }

  await query(`
    insert into supabase_migrations.schema_migrations(version)
    values ('${version}')
    on conflict (version) do nothing
  `);
}

const columns = await getMigrationColumns();

for (const file of files) {
  const normalized = path.normalize(file);
  const base = path.basename(normalized);
  const match = base.match(/^(\d+)_(.+)\.sql$/);
  const version = match?.[1] ?? null;
  const name = match?.[2] ?? base.replace(/\.sql$/i, '');

  if (!existsSync(normalized)) {
    throw new Error(`Migration file not found: ${file}`);
  }

  if (version && (await migrationRecorded(version))) {
    console.log(`${base}: already recorded`);
    continue;
  }

  const sql = readFileSync(normalized, 'utf8');
  if (!sql.trim()) {
    console.log(`${base}: empty`);
    continue;
  }

  await query(sql);
  await recordMigration(columns, version, name, sql);
  console.log(`${base}: applied`);
}

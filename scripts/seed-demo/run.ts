/**
 * The demo data seed: a chain of 20 branches, 5,000 children with their families, staff by role,
 * classes, packages, attendance, daily reports, invoices and payments, events and courses.
 *
 * Runs the SQL files of supabase/seeds/demo in order against the DEV database, each in its own
 * transaction (a file that fails changes nothing). Files that work branch by branch ({{branches}})
 * run a few branches at a time, so no statement passes the database's two-minute limit.
 *
 *   npm run seed:demo-data -- --yes          everything (the reset files 01, 02 delete the current children and parents)
 *   npm run seed:demo-data -- --yes 15       up to that file, without the reset: adds what is missing
 *
 * Needs SUPABASE_DB_PASSWORD in .env and a linked project (supabase/.temp/pooler-url, project-ref).
 * Refuses any project but the dev one unless SEED_DEMO_PROJECT_REF names it: never seed production.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SEED_DIR = path.join(ROOT, 'supabase/seeds/demo');
const DEV_PROJECT_REF = 'hlhlpjecinkqqsqrjpcj';
const BRANCHES = 20;
const BATCH = Math.max(1, Number(process.env.SEED_DEMO_BATCH ?? 4));
const CLI = ['--yes', 'supabase@2.120.0'];

config({ path: path.join(ROOT, '.env') });

function fail(message: string): never {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

function target() {
  const refFile = path.join(ROOT, 'supabase/.temp/project-ref');
  const urlFile = path.join(ROOT, 'supabase/.temp/pooler-url');
  if (!existsSync(refFile) || !existsSync(urlFile)) fail('No linked project: run `npx supabase link --project-ref <ref>` first.');
  const ref = readFileSync(refFile, 'utf8').trim();
  const allowed = process.env.SEED_DEMO_PROJECT_REF?.trim() || DEV_PROJECT_REF;
  if (ref !== allowed) fail(`The linked project is ${ref}, not the dev project ${allowed}. The demo seed deletes data; it never runs elsewhere.`);
  const password = process.env.SUPABASE_DB_PASSWORD?.trim().replace(/^["']|["']$/g, '');
  if (!password) fail('SUPABASE_DB_PASSWORD is missing in .env.');
  // The password goes in PGPASSWORD, never in the URL (or the logs).
  return { ref, url: readFileSync(urlFile, 'utf8').trim(), password };
}

/** One SQL statement through the Supabase CLI; returns its rows. */
function query(sqlFile: string, db: { url: string; password: string }): unknown[] {
  const args = [...CLI, 'db', 'query', '--db-url', db.url, '-f', sqlFile];
  const options = { cwd: ROOT, env: { ...process.env, PGPASSWORD: db.password }, encoding: 'utf8' as const, maxBuffer: 64 * 1024 * 1024 };
  // Windows runs npx through its shell: one command line, each argument quoted (none holds a quote).
  const result =
    process.platform === 'win32'
      ? spawnSync(['npx', ...args].map((a) => `"${a}"`).join(' '), { ...options, shell: true })
      : spawnSync('npx', args, options);
  const out = `${result.stdout ?? ''}`;
  // A statement with rows answers JSON; a DO block answers its command tag ("DO") as text.
  const start = out.indexOf('{');
  let parsed: { _tag?: string; error?: { message?: string }; rows?: unknown[] } = {};
  if (start >= 0) {
    try {
      parsed = JSON.parse(out.slice(start, out.lastIndexOf('}') + 1));
    } catch {
      parsed = {};
    }
  }
  if (parsed._tag === 'Error') fail(parsed.error?.message ?? 'The database refused the statement.');
  if (result.status !== 0) fail(`The database refused the statement:\n${(out + (result.stderr ?? '')).slice(0, 2000)}`);
  return parsed.rows ?? [];
}

/** A whole file as one statement: a DO block that executes it, in one transaction. */
function asOneStatement(sql: string): string {
  const tag = '$seed_sql$';
  if (sql.includes(tag)) fail(`A seed file contains ${tag}.`);
  return `do $seed_run$ begin execute ${tag}${sql}${tag}; end $seed_run$;`;
}

function main() {
  const args = process.argv.slice(2);
  if (!args.includes('--yes')) {
    fail('This deletes every child and parent on the dev database and seeds new ones. Run it again with --yes.');
  }
  const only = args.filter((a) => /^\d{2}$/.test(a));
  const db = target();
  // Later files read what earlier ones plan (the staff, the classes, the families), and every file is
  // safe to run again: asking for 15 runs everything up to 15, without a reset file unless it is asked for.
  const upTo = only.length ? Math.max(...only.map(Number)) : Infinity;
  const files = readdirSync(SEED_DIR)
    .filter((f) => /^\d{2}_.+\.sql$/.test(f))
    .sort()
    .filter((f) => {
      const n = f.slice(0, 2);
      if (n === '99') return true;
      if (f.includes('_reset_')) return !only.length || only.includes(n);
      return Number(n) <= upTo;
    });
  const tmp = mkdtempSync(path.join(tmpdir(), 'xo-seed-'));
  console.log(`Seeding the dev project ${db.ref}: ${files.length} files, branches in batches of ${BATCH}.`);

  try {
    for (const file of files) {
      const sql = readFileSync(path.join(SEED_DIR, file), 'utf8');
      const batches = sql.includes('{{branches}}')
        ? Array.from({ length: Math.ceil(BRANCHES / BATCH) }, (_, i) => Array.from({ length: BATCH }, (_, j) => i * BATCH + j + 1).filter((n) => n <= BRANCHES))
        : [null];
      const started = Date.now();
      for (const batch of batches) {
        const body = batch ? sql.replaceAll('{{branches}}', `array[${batch.join(',')}]`) : sql;
        const statementFile = path.join(tmp, 'statement.sql');
        writeFileSync(statementFile, asOneStatement(body));
        query(statementFile, db);
        if (batch) process.stdout.write(`  ${file}: branches ${batch[0]}–${batch[batch.length - 1]} done\n`);
      }
      console.log(`✔ ${file} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    }

    // What the dev database holds now.
    const countsFile = path.join(tmp, 'counts.sql');
    writeFileSync(countsFile, readFileSync(path.join(SEED_DIR, 'counts.sql'), 'utf8'));
    const [counts] = query(countsFile, db) as Record<string, unknown>[];
    console.log('\nThe dev database now has:');
    for (const [key, value] of Object.entries(counts ?? {})) console.log(`  ${key.padEnd(28)} ${value}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main();

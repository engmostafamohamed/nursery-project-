import { existsSync, readFileSync } from 'node:fs';

const PROJECT_REF = 'qepxjcyntvyvudacsgag';
const MIGRATION_VERSION = '20260623103000';
const MIGRATION_NAME = 'event_urgent_schedule';

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
if (!token) {
  throw new Error('Missing SUPABASE_ACCESS_TOKEN in .env');
}

async function query(sql) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
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

async function migrationAlreadyRecorded() {
  const rows = await query(`
    select version
    from supabase_migrations.schema_migrations
    where version = '${MIGRATION_VERSION}'
    limit 1
  `);
  return rows.length > 0;
}

async function recordMigrationIfPossible() {
  const columns = await query(`
    select column_name
    from information_schema.columns
    where table_schema = 'supabase_migrations'
      and table_name = 'schema_migrations'
    order by ordinal_position
  `);
  const names = new Set(columns.map((row) => row.column_name));
  if (!names.has('version')) return false;
  if (await migrationAlreadyRecorded()) return true;

  if (names.has('name') && names.has('statements')) {
    await query(`
      insert into supabase_migrations.schema_migrations(version, name, statements)
      values ('${MIGRATION_VERSION}', '${MIGRATION_NAME}', array[
        'ALTER TABLE public.events ADD COLUMN IF NOT EXISTS is_urgent boolean NOT NULL DEFAULT false',
        'ALTER TABLE public.events ADD COLUMN IF NOT EXISTS urgent_days_of_week int[] NOT NULL DEFAULT ''''{}'''', ADD COLUMN IF NOT EXISTS urgent_hours_of_day int[] NOT NULL DEFAULT ''''{}'''', ADD COLUMN IF NOT EXISTS urgent_repeats_weekly boolean NOT NULL DEFAULT false',
        'CREATE INDEX IF NOT EXISTS idx_events_nursery_urgent ON public.events (nursery_id, is_urgent, starts_at DESC)'
      ])
      on conflict (version) do nothing
    `);
    return true;
  }

  if (names.has('name')) {
    await query(`
      insert into supabase_migrations.schema_migrations(version, name)
      values ('${MIGRATION_VERSION}', '${MIGRATION_NAME}')
      on conflict (version) do nothing
    `);
    return true;
  }

  await query(`
    insert into supabase_migrations.schema_migrations(version)
    values ('${MIGRATION_VERSION}')
    on conflict (version) do nothing
  `);
  return true;
}

async function applyMigration() {
  await query(`
    alter table public.events
    add column if not exists is_urgent boolean not null default false
  `);
  await query(`
    alter table public.events
    add column if not exists urgent_days_of_week int[] not null default '{}',
    add column if not exists urgent_hours_of_day int[] not null default '{}',
    add column if not exists urgent_repeats_weekly boolean not null default false
  `);
  await query(`
    alter table public.events
    drop constraint if exists events_urgent_days_of_week_range,
    add constraint events_urgent_days_of_week_range check (
      urgent_days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]
    )
  `);
  await query(`
    alter table public.events
    drop constraint if exists events_urgent_hours_of_day_range,
    add constraint events_urgent_hours_of_day_range check (
      urgent_hours_of_day <@ array[
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
        12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23
      ]
    )
  `);
  await query(`
    create index if not exists idx_events_nursery_urgent
    on public.events (nursery_id, is_urgent, starts_at desc)
  `);
  await recordMigrationIfPossible();
}

async function seedUrgentEvent() {
  const rows = await query(`
    with target_nursery as (
      select n.id
      from public.nurseries n
      where exists (
        select 1
        from public.children c
        join public.parent_children pc on pc.child_id = c.id
        where c.nursery_id = n.id
      )
      order by n.created_at desc nulls last
      limit 1
    ),
    upsert_event as (
      insert into public.events (
        nursery_id,
        title_ar,
        title_en,
        description_ar,
        description_en,
        starts_at,
        location,
        category,
        is_urgent,
        urgent_days_of_week,
        urgent_hours_of_day,
        urgent_repeats_weekly,
        is_paid,
        target_scope,
        permission_deadline,
        status
      )
      select
        id,
        'فعالية عاجلة تجريبية',
        'Seed urgent event',
        'تم إنشاؤها لاختبار الفعاليات العاجلة.',
        'Created to verify urgent events.',
        now() + interval '2 days',
        'Main campus',
        'activity',
        true,
        array[1, 3, 5],
        array[9, 14],
        true,
        false,
        'all',
        now() + interval '1 day',
        'active'
      from target_nursery
      where not exists (
        select 1
        from public.events
        where title_en = 'Seed urgent event'
          and is_urgent = true
      )
      returning id, nursery_id
    ),
    existing_event as (
      select id, nursery_id
      from public.events
      where title_en = 'Seed urgent event'
        and is_urgent = true
      order by created_at desc nulls last
      limit 1
    ),
    chosen_event as (
      select * from upsert_event
      union all
      select * from existing_event
      limit 1
    ),
    target_children as (
      select c.id as child_id
      from public.children c
      join chosen_event e on e.nursery_id = c.nursery_id
      order by c.created_at desc nulls last
      limit 5
    ),
    inserted_permissions as (
      insert into public.permissions (event_id, child_id, status, deadline)
      select e.id, c.child_id, 'pending', now() + interval '1 day'
      from chosen_event e
      join target_children c on true
      where not exists (
        select 1
        from public.permissions p
        where p.event_id = e.id
          and p.child_id = c.child_id
      )
      returning id
    )
    select
      e.id as event_id,
      e.nursery_id,
      (select count(*) from target_children) as targeted_children,
      (select count(*) from inserted_permissions) as inserted_permissions
    from chosen_event e
  `);

  if (!rows.length) {
    throw new Error('No nursery with parent-linked children found; could not seed urgent event.');
  }
  return rows[0];
}

async function verify(seed) {
  const column = await query(`
    select column_name, data_type, column_default, is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'events'
      and column_name in ('is_urgent', 'urgent_days_of_week', 'urgent_hours_of_day', 'urgent_repeats_weekly')
    order by column_name
  `);
  const adminRows = await query(`
    select id, title_en, is_urgent, urgent_days_of_week, urgent_hours_of_day, urgent_repeats_weekly, status, target_scope
    from public.events
    where id = '${seed.event_id}'::uuid
      and is_urgent = true
    limit 1
  `);
  const parentRows = await query(`
    select e.id, e.title_en, e.is_urgent, count(p.id)::int as permission_count
    from public.events e
    left join public.permissions p on p.event_id = e.id
    where e.id = '${seed.event_id}'::uuid
      and e.status = 'active'
      and e.cancelled_at is null
      and e.is_urgent = true
    group by e.id, e.title_en, e.is_urgent
  `);
  const migrationRecorded = await migrationAlreadyRecorded();
  return { column, adminRows, parentRows, migrationRecorded };
}

console.log('Applying urgent-event migration to remote Supabase...');
await applyMigration();
console.log('Seeding urgent event...');
const seed = await seedUrgentEvent();
console.log('Seed result:', seed);
console.log('Verifying urgent-event data path...');
const result = await verify(seed);
console.log(JSON.stringify(result, null, 2));

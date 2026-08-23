import { createClient } from '@supabase/supabase-js';
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

const url = process.env.VITE_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRole) {
  throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(url, serviceRole, {
  auth: { persistSession: false },
});

const assertNoError = (error, label) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

const { data: nursery, error: nurseryError } = await supabase
  .from('nurseries')
  .select('id, name_en')
  .eq('name_en', 'Little Stars Nursery')
  .maybeSingle();
assertNoError(nurseryError, 'Fetch seeded nursery');
if (!nursery) throw new Error('Seeded nursery not found. Run npm run seed:demo first.');

const existing = await supabase
  .from('events')
  .select('id')
  .eq('nursery_id', nursery.id)
  .eq('title_en', 'Seed urgent event')
  .maybeSingle();
assertNoError(existing.error, 'Fetch existing urgent event');

let eventId = existing.data?.id;
if (!eventId) {
  const inserted = await supabase
    .from('events')
    .insert({
      nursery_id: nursery.id,
      title_ar: 'فعالية عاجلة تجريبية',
      title_en: 'Seed urgent event',
      description_ar: 'تم إنشاؤها لاختبار الفعاليات العاجلة.',
      description_en: 'Created to verify urgent events.',
      starts_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      location: 'Main campus',
      category: 'activity',
      is_urgent: true,
      urgent_days_of_week: [1, 3, 5],
      urgent_hours_of_day: [9, 14],
      urgent_repeats_weekly: true,
      is_paid: false,
      target_scope: 'all',
      permission_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      status: 'active',
    })
    .select('id')
    .single();
  assertNoError(inserted.error, 'Insert urgent event');
  eventId = inserted.data.id;
} else {
  const updated = await supabase
    .from('events')
    .update({
      is_urgent: true,
      urgent_days_of_week: [1, 3, 5],
      urgent_hours_of_day: [9, 14],
      urgent_repeats_weekly: true,
      status: 'active',
      cancelled_at: null,
    })
    .eq('id', eventId);
  assertNoError(updated.error, 'Update existing urgent event');
}

const children = await supabase
  .from('children')
  .select('id')
  .eq('nursery_id', nursery.id)
  .limit(5);
assertNoError(children.error, 'Fetch children');
if (!children.data?.length) throw new Error('No seeded children found.');

const existingPermissions = await supabase
  .from('permissions')
  .select('child_id')
  .eq('event_id', eventId);
assertNoError(existingPermissions.error, 'Fetch existing permissions');
const existingChildIds = new Set((existingPermissions.data ?? []).map((row) => row.child_id));
const missing = children.data
  .filter((child) => !existingChildIds.has(child.id))
  .map((child) => ({
    event_id: eventId,
    child_id: child.id,
    status: 'pending',
    deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }));
if (missing.length) {
  const insertedPermissions = await supabase.from('permissions').insert(missing);
  assertNoError(insertedPermissions.error, 'Insert urgent event permissions');
}

const adminRead = await supabase
  .from('events')
  .select('id, title_ar, title_en, starts_at, ends_at, category, is_urgent, urgent_days_of_week, urgent_hours_of_day, urgent_repeats_weekly, is_paid, price, target_scope, status, cancelled_at')
  .eq('id', eventId)
  .single();
assertNoError(adminRead.error, 'Admin urgent event read');

const parentRead = await supabase
  .from('events')
  .select('id, title_ar, title_en, starts_at, location, category, is_urgent, urgent_days_of_week, urgent_hours_of_day, urgent_repeats_weekly, status, is_paid, price, permission_deadline')
  .eq('id', eventId)
  .eq('status', 'active')
  .is('cancelled_at', null)
  .single();
assertNoError(parentRead.error, 'Parent urgent event read');

const permissionCount = await supabase
  .from('permissions')
  .select('id', { count: 'exact', head: true })
  .eq('event_id', eventId);
assertNoError(permissionCount.error, 'Count urgent event permissions');

console.log(JSON.stringify({
  nursery,
  eventId,
  adminIsUrgent: adminRead.data.is_urgent,
  adminUrgentDays: adminRead.data.urgent_days_of_week,
  adminUrgentHours: adminRead.data.urgent_hours_of_day,
  adminUrgentRepeatsWeekly: adminRead.data.urgent_repeats_weekly,
  parentIsUrgent: parentRead.data.is_urgent,
  parentUrgentDays: parentRead.data.urgent_days_of_week,
  parentUrgentHours: parentRead.data.urgent_hours_of_day,
  parentUrgentRepeatsWeekly: parentRead.data.urgent_repeats_weekly,
  permissionCount: permissionCount.count,
}, null, 2));

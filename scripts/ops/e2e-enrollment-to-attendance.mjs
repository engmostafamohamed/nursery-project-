/**
 * End-to-end check of a child's whole path, on the live project with real accounts:
 *
 *   the parent applies and pays → the application reaches the nursery → the nursery reviews and
 *   confirms the payment → the child is accepted and the profile created → the child is placed in a
 *   class → drop-off and pickup with the QR / 6-digit code → statistics and notifications
 *
 * Every step calls what the app calls (tables, RPCs, Storage, Edge Functions) signed in as the person
 * who does it in the app (parent, admin, teacher), so row-level security and the server's own rules
 * are part of the test. Direct SQL is used only to set up, to move the clock for the late-pickup
 * step, to verify, and to clean up. Everything lives in a throw-away nursery that the run deletes at
 * the end, then checks that no row, account or file is left.
 *
 * Needs in .env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_ACCESS_TOKEN (Management API:
 * reads the service key for setup and cleanup, and runs the verification SQL).
 * Run: npm run ops:e2e-flow
 */
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------------------------
// Environment and helpers

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

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!SUPABASE_URL || !ANON_KEY || !ACCESS_TOKEN) {
  console.error('Missing VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY or SUPABASE_ACCESS_TOKEN in .env');
  process.exit(1);
}
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function managementApi(path, init = {}) {
  const res = await fetch(`https://api.supabase.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Management API ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/** SQL as the database owner: setup, clock moves, verification and cleanup only. */
async function sql(query) {
  return managementApi(`/v1/projects/${PROJECT_REF}/database/query`, { method: 'POST', body: JSON.stringify({ query }) });
}

async function serviceRoleKey() {
  const keys = await managementApi(`/v1/projects/${PROJECT_REF}/api-keys?reveal=true`);
  const legacy = keys.find((k) => k.name === 'service_role' && typeof k.api_key === 'string' && k.api_key.startsWith('ey'));
  const secret = keys.find((k) => k.type === 'secret' && typeof k.api_key === 'string' && !k.api_key.includes('·'));
  const key = legacy?.api_key ?? secret?.api_key;
  if (!key) throw new Error('Could not read a service key through the Management API');
  return key;
}

const RUN = `e2e${Date.now().toString(36)}`;
const PASSWORD = `E2e!${crypto.randomUUID()}`;
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

let passed = 0;
const failed = [];
const section = (title) => console.log(`\n■ ${title}`);
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
/** Unwraps a supabase-js result, or throws with its error message. */
const ok = (res, context) => {
  if (res.error) throw new Error(`${context}: ${res.error.message}`);
  return res.data;
};

async function step(name, fn) {
  try {
    const detail = await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
    if (detail !== undefined) console.log(`      ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
    return true;
  } catch (error) {
    failed.push(name);
    console.log(`  ✗ ${name}`);
    console.log(`      ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

const newClient = (key) => createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });

/** An Edge Function called as a signed-in person, like supabase.functions.invoke. */
async function callFunction(person, name, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${person.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

const count = (rows) => rows.length;
const typesOf = (rows) => {
  const tally = {};
  for (const row of rows) tally[row.type] = (tally[row.type] ?? 0) + 1;
  return Object.entries(tally).map(([type, n]) => (n > 1 ? `${type} ×${n}` : type)).sort();
};

// ---------------------------------------------------------------------------------------------
// State

const service = newClient(await serviceRoleKey());
const people = {
  admin: { role: 'branch_admin', name_en: 'E2E Admin', name_ar: 'مديرة الاختبار' },
  teacher: { role: 'teacher', name_en: 'E2E Teacher', name_ar: 'معلمة الاختبار' },
  parent: { role: 'parent', name_en: 'E2E Mother', name_ar: 'أم الاختبار' },
};
// The server's clock, so "since the run started" does not depend on this machine's clock.
const S = { startedAt: (await sql('select now()::text as now'))[0].now, children: {} };

/** Notifications a person received during this run. */
async function notificationsOf(person) {
  return ok(
    await service.from('notifications').select('type, template_key, action_link, template_params').eq('user_id', person.id).gte('created_at', S.startedAt),
    'notifications',
  );
}

/** The nursery's own calendar day now. */
async function nurseryToday() {
  const [row] = await sql(`select (now() at time zone '${S.timezone}')::date::text as day`);
  return row.day;
}

// ---------------------------------------------------------------------------------------------
// Setup

section('Setup — a throw-away nursery with an admin, a teacher and a parent');

// A time zone where it is about midday now, so the QR working-hours rules do not depend on when the
// test runs. Etc/GMT-N is UTC+N.
const offset = 12 - new Date().getUTCHours();
S.timezone = offset === 0 ? 'Etc/GMT' : `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;

const setupOk = await step('nursery created; its settings row comes from the insert trigger', async () => {
  const nursery = ok(
    await service
      .from('nurseries')
      .insert({ name_ar: `حضانة اختبار ${RUN}`, name_en: `E2E Nursery ${RUN}`, working_days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] })
      .select('id')
      .single(),
    'nursery',
  );
  S.nurseryId = nursery.id;
  const settings = ok(await service.from('nursery_settings').select('id').eq('nursery_id', S.nurseryId), 'settings');
  check(settings.length === 1, 'no settings row was created for the nursery');
  ok(
    await service
      .from('nursery_settings')
      .update({
        timezone: S.timezone,
        standard_start_time: '08:00',
        standard_end_time: '17:00',
        late_pickup_grace_minutes: 15,
        late_pickup_fee_per_hour: 50,
        late_billing_unit_minutes: 60,
        min_minutes_between_scans: 5,
        require_qr_for_attendance: false,
        payment_methods_enabled: ['instapay', 'bank_transfer'],
      })
      .eq('nursery_id', S.nurseryId),
    'settings update',
  );
  const [{ local_time }] = await sql(`select to_char(now() at time zone '${S.timezone}', 'HH24:MI:SS') as local_time`);
  return { nursery: S.nurseryId, timezone: S.timezone, localTimeNow: local_time, workingHours: '08:00–17:00', grace: '15 min', extraHourFee: 50 };
});

if (!setupOk) {
  console.error('Setup failed; nothing else can run.');
  process.exit(1);
}

await step('three accounts created through Supabase Auth and given their roles', async () => {
  let phone = 1;
  for (const [key, person] of Object.entries(people)) {
    person.email = `${RUN}-${key}@xo-platform.local`;
    const created = await service.auth.admin.createUser({ email: person.email, password: PASSWORD, email_confirm: true });
    if (created.error) throw new Error(`${key}: ${created.error.message}`);
    person.id = created.data.user.id;
    ok(
      await service.from('users').upsert(
        {
          id: person.id,
          email: person.email,
          role: person.role,
          nursery_id: S.nurseryId,
          name_ar: person.name_ar,
          name_en: person.name_en,
          phone: `+2010${String(Date.now()).slice(-7)}${phone++}`,
          status: 'active',
          language_pref: 'ar',
          onboarding_completed: true,
        },
        { onConflict: 'id' },
      ),
      `${key} profile`,
    );
  }
  const rows = ok(await service.from('users').select('role').in('id', Object.values(people).map((p) => p.id)), 'roles');
  return rows.map((r) => r.role).sort();
});

await step('each one signs in with email + password', async () => {
  for (const [key, person] of Object.entries(people)) {
    person.client = newClient(ANON_KEY);
    const signedIn = await person.client.auth.signInWithPassword({ email: person.email, password: PASSWORD });
    if (signedIn.error) throw new Error(`${key}: ${signedIn.error.message}`);
    person.token = signedIn.data.session.access_token;
  }
  return 'admin, teacher, parent signed in';
});

const { admin, teacher, parent } = people;

await step('admin creates a class and makes the teacher its lead teacher', async () => {
  const cls = ok(
    await admin.client.from('classes').insert({ nursery_id: S.nurseryId, name_ar: 'فصل الاختبار', name_en: 'E2E Class', capacity: 20 }).select('id').single(),
    'class',
  );
  S.classId = cls.id;
  ok(await admin.client.from('class_staff').insert({ class_id: S.classId, user_id: teacher.id, role: 'lead' }), 'lead teacher');
  return { class: 'E2E Class', lead: teacher.name_en };
});

await step('packages: tuition 3000/month and extra hours 10 h for 500', async () => {
  const tuition = ok(
    await admin.client
      .from('tuition_packages')
      .insert({ nursery_id: S.nurseryId, name_ar: 'يوم كامل', name_en: 'Full day', price: 3000, daily_hours: 8, active: true })
      .select('id')
      .single(),
    'tuition package',
  );
  S.tuitionPackageId = tuition.id;
  ok(
    await admin.client.from('tuition_package_billing_periods').insert({
      nursery_id: S.nurseryId,
      tuition_package_id: S.tuitionPackageId,
      billing_period: 'monthly',
      duration_months: 1,
      price: 3000,
      active: true,
    }),
    'monthly period',
  );
  const extra = ok(
    await admin.client
      .from('packages')
      .insert({
        nursery_id: S.nurseryId,
        name_ar: 'باقة 10 ساعات',
        name_en: '10-hour pack',
        coverage_type: 'hours_quota',
        included_hours: 10,
        price: 500,
        active: true,
        validity_value: 1,
        validity_unit: 'months',
      })
      .select('id')
      .single(),
    'extra-hours package',
  );
  S.extraHoursPackageId = extra.id;
  return 'created';
});

// ---------------------------------------------------------------------------------------------
// The application, payment, review and approval of one child

const CHILDREN = {
  A: {
    label: 'Child A',
    first_name: 'Adam', last_name: 'E2E', full_name_en: 'E2E Adam', full_name_ar: 'آدم الاختبار', dob: '2023-05-10', gender: 'male',
    extraHours: true, classAtApproval: true,
  },
  B: {
    label: 'Child B',
    first_name: 'Laila', last_name: 'E2E', full_name_en: 'E2E Laila', full_name_ar: 'ليلى الاختبار', dob: '2022-11-02', gender: 'female',
    extraHours: false, classAtApproval: false, payBeforeDocuments: true,
  },
};

async function uploadDocuments(child) {
  for (const type of ['birth_certificate', 'vaccination_card', 'parent_id', 'proof_of_address']) {
    const path = `${S.nurseryId}/${child.applicationId}/${type}_${Date.now()}.png`;
    ok(await parent.client.storage.from('application-documents').upload(path, PNG, { contentType: 'image/png', upsert: true }), `upload ${type}`);
    ok(await parent.client.from('application_documents').insert({ application_id: child.applicationId, document_type: type, file_url: path }), `document ${type}`);
  }
  const has = ok(await service.rpc('application_has_required_documents', { p_application_id: child.applicationId }), 'document check');
  check(has === true, 'the server says documents are missing');
}

async function invoiceOf(child) {
  return ok(
    await parent.client.from('invoices').select('id, generated_invoice_number, amount, status, line_items_json').eq('id', child.invoiceId).single(),
    'invoice (as the parent)',
  );
}

async function applyAndPay(key) {
  const spec = CHILDREN[key];
  const child = (S.children[key] = { ...spec });

  section(`${spec.label} — 1. the parent applies and pays → the application reaches the nursery`);

  await step('parent starts a draft application', async () => {
    const app = ok(
      await parent.client
        .from('applications')
        .insert({
          nursery_id: S.nurseryId,
          parent_id: parent.id,
          status: 'draft',
          parent_info_json: { full_name: parent.name_en, email: parent.email, phone: '+201000000000' },
          child_info_json: {},
          terms_accepted: false,
        })
        .select('id, status')
        .single(),
      'application',
    );
    child.applicationId = app.id;
    return { application: app.id, status: app.status };
  });

  await step('parent fills the child details and accepts the terms', async () => {
    ok(
      await parent.client
        .from('applications')
        .update({
          parent_info_json: {
            full_name: parent.name_en,
            email: parent.email,
            phone: '+201000000000',
            mother: { full_name: parent.name_en, email: parent.email, mobile: '+201000000000' },
            family: { address: 'Cairo' },
          },
          child_info_json: {
            first_name: spec.first_name,
            last_name: spec.last_name,
            full_name_en: spec.full_name_en,
            full_name_ar: spec.full_name_ar,
            dob: spec.dob,
            gender: spec.gender,
            nationality: 'Egyptian',
            home_address: 'Cairo',
            // Matches no class, so a child approved without a class stays unassigned.
            preferred_class: 'KG-9',
          },
          terms_accepted: true,
          health_medication_policy_accepted: true,
          financial_agreement_accepted: true,
          policies_procedures_accepted: true,
          information_accuracy_confirmed: true,
          consent_accepted_at: new Date().toISOString(),
        })
        .eq('id', child.applicationId),
      'save',
    );
    const app = ok(await parent.client.from('applications').select('status').eq('id', child.applicationId).single(), 'read');
    check(app.status === 'draft', `status is ${app.status}`);
    return 'saved (still a draft)';
  });

  if (!spec.payBeforeDocuments) {
    await step('parent uploads the 4 required documents (Storage + application_documents)', async () => {
      await uploadDocuments(child);
      return 'server check application_has_required_documents = true';
    });
    await step('without paying, the application stays a draft (nothing reaches the nursery)', async () => {
      const app = ok(await service.from('applications').select('status').eq('id', child.applicationId).single(), 'read');
      check(app.status === 'draft', `status is ${app.status}`);
      return app.status;
    });
  }

  await step('parent picks the tuition package (monthly) → admission invoice', async () => {
    const invoiceId = ok(
      await parent.client.rpc('select_application_payment_package', {
        p_application_id: child.applicationId,
        p_package_id: S.tuitionPackageId,
        p_billing_period: 'monthly',
      }),
      'select package',
    );
    child.invoiceId = invoiceId;
    const inv = await invoiceOf(child);
    check(Number(inv.amount) === 3000, `amount ${inv.amount}`);
    return { invoice: inv.generated_invoice_number, amount: Number(inv.amount), status: inv.status };
  });

  if (spec.extraHours) {
    await step('parent adds the extra-hours package → billed on the same invoice', async () => {
      ok(
        await parent.client.rpc('select_application_extra_hours_package', { p_application_id: child.applicationId, p_package_id: S.extraHoursPackageId }),
        'select extra hours',
      );
      const inv = await invoiceOf(child);
      check(Number(inv.amount) === 3500, `amount ${inv.amount}`);
      const lines = (inv.line_items_json?.items ?? []).map((item) => `${item.kind ?? item.type}:${Number(item.total ?? item.amount)}`);
      return { amount: Number(inv.amount), lines };
    });
  }

  await step('the parent can read the invoice (RLS)', async () => {
    const inv = await invoiceOf(child);
    child.amount = Number(inv.amount);
    return { amount: child.amount, status: inv.status };
  });

  if (spec.payBeforeDocuments) {
    await step('paying while the documents are missing is refused (the application could never be reviewed)', async () => {
      const res = await parent.client.rpc('submit_invoice_payment', {
        p_invoice_id: child.invoiceId,
        p_amount: child.amount,
        p_method: 'instapay',
        p_reference: `Reference: ${RUN}-${key}-early; sender: parent@instapay`,
        p_proof_url: null,
        p_idempotency_key: crypto.randomUUID(),
      });
      check(Boolean(res.error), `the payment was accepted: ${JSON.stringify(res.data)}`);
      check(res.error.message.includes('payment_application_incomplete'), res.error.message);
      const attempts = ok(await service.from('payment_attempts').select('id').eq('invoice_id', child.invoiceId), 'attempts');
      check(attempts.length === 0, `${attempts.length} attempts recorded`);
      return 'payment_application_incomplete — no payment recorded';
    });
    await step('parent uploads the 4 required documents (Storage + application_documents)', async () => {
      await uploadDocuments(child);
      return 'server check application_has_required_documents = true';
    });
  } else {
    await step('a partial payment is refused (an admission invoice is paid in one go)', async () => {
      const res = await parent.client.rpc('submit_invoice_payment', {
        p_invoice_id: child.invoiceId,
        p_amount: 1000,
        p_method: 'instapay',
        p_reference: `Reference: ${RUN}-${key}-partial; sender: parent@instapay`,
        p_proof_url: null,
        p_idempotency_key: crypto.randomUUID(),
      });
      check(Boolean(res.error), 'a partial payment was accepted');
      check(res.error.message.includes('payment_full_amount_required'), res.error.message);
      return 'payment_full_amount_required';
    });
  }

  const idempotencyKey = crypto.randomUUID();
  await step('parent pays the full amount by InstaPay (reference + sender)', async () => {
    const result = ok(
      await parent.client.rpc('submit_invoice_payment', {
        p_invoice_id: child.invoiceId,
        p_amount: child.amount,
        p_method: 'instapay',
        p_reference: `Reference: ${RUN}-${key}; sender: parent@instapay`,
        p_proof_url: null,
        p_idempotency_key: idempotencyKey,
      }),
      'pay',
    );
    check(result.status === 'submitted', `status ${result.status}`);
    child.attemptId = result.attempt_id;
    return { status: result.status, attempt: result.attempt_id, remaining: result.remaining };
  });

  if (key === 'A') {
    await step('the same payment sent twice (double click / retry) is recorded once', async () => {
      const again = ok(
        await parent.client.rpc('submit_invoice_payment', {
          p_invoice_id: child.invoiceId,
          p_amount: child.amount,
          p_method: 'instapay',
          p_reference: `Reference: ${RUN}-${key}; sender: parent@instapay`,
          p_proof_url: null,
          p_idempotency_key: idempotencyKey,
        }),
        'pay again',
      );
      const attempts = ok(await service.from('payment_attempts').select('id').eq('invoice_id', child.invoiceId), 'attempts');
      check(attempts.length === 1, `${attempts.length} attempts`);
      return `answer: ${again.status} — still 1 payment attempt`;
    });
  }

  await step('the payment moves the application to "submitted" (trigger) and alerts the admin', async () => {
    const app = ok(await service.from('applications').select('status, submitted_at').eq('id', child.applicationId).single(), 'read');
    check(app.status === 'submitted', `status ${app.status}`);
    const adminTypes = (await notificationsOf(admin)).filter((n) => (n.action_link ?? '').includes(child.applicationId) || n.type === 'payment_attempt_created');
    const types = [...new Set(adminTypes.map((n) => n.type))].sort();
    check(types.includes('application_submitted'), `admin got ${JSON.stringify(types)}`);
    return { application: app.status, submittedAt: app.submitted_at, adminNotifications: types };
  });

  await step('parent sees "submitted" (waiting for the nursery)', async () => {
    const app = ok(await parent.client.from('applications').select('status').eq('id', child.applicationId).single(), 'read');
    check(app.status === 'submitted', `status ${app.status}`);
    return app.status;
  });

  if (key === 'A') {
    await step('the parent can no longer edit the submitted application', async () => {
      const res = await parent.client.from('applications').update({ child_info_json: { first_name: 'Changed' } }).eq('id', child.applicationId);
      const app = ok(await service.from('applications').select('child_info_json').eq('id', child.applicationId).single(), 'read');
      check(app.child_info_json?.first_name === spec.first_name, 'the parent changed a submitted application');
      return res.error ? `refused: ${res.error.message}` : 'update had no effect';
    });
  }

  section(`${spec.label} — 2. the nursery reviews and confirms the payment`);

  if (key === 'A') {
    await step('approving before the money is confirmed is refused by the server', async () => {
      const res = await admin.client.rpc('approve_application_enrollment', {
        p_application_id: child.applicationId,
        p_nursery_id: S.nurseryId,
        p_auto_generate_first_invoice: true,
      });
      check(Boolean(res.error), 'the approval went through');
      return res.error.message;
    });
  }

  await step('admin opens the application → "under review" (what the page does on open)', async () => {
    ok(
      await admin.client
        .from('applications')
        .update({ status: 'under_review', reviewed_by: admin.id, reviewed_at: new Date().toISOString() })
        .eq('id', child.applicationId),
      'start review',
    );
    const app = ok(await parent.client.from('applications').select('status').eq('id', child.applicationId).single(), 'parent read');
    check(app.status === 'under_review', `parent sees ${app.status}`);
    return `parent now sees: ${app.status}`;
  });

  await step('admin confirms the payment arrived → invoice paid, parent and admins told', async () => {
    const attempts = ok(
      await admin.client.from('payment_attempts').select('id, status').eq('invoice_id', child.invoiceId),
      'attempts (as the admin)',
    );
    check(attempts.length === 1, `${attempts.length} attempts visible to the admin`);
    const countOf = async (person, type) => (await notificationsOf(person)).filter((n) => n.type === type).length;
    const before = { parent: await countOf(parent, 'invoice_paid'), admin: await countOf(admin, 'application_payment_confirmed') };
    ok(await admin.client.rpc('confirm_invoice_payment_attempt', { p_attempt_id: attempts[0].id }), 'confirm');
    const inv = ok(await service.from('invoices').select('status').eq('id', child.invoiceId).single(), 'invoice');
    const payments = ok(await service.from('payments').select('amount, status').eq('invoice_id', child.invoiceId).eq('status', 'completed'), 'payments');
    check(inv.status === 'paid', `invoice ${inv.status}`);
    const parentGot = (await countOf(parent, 'invoice_paid')) - before.parent;
    const adminGot = (await countOf(admin, 'application_payment_confirmed')) - before.admin;
    check(parentGot === 1 && adminGot === 1, `new notifications — parent invoice_paid: ${parentGot}; admin application_payment_confirmed: ${adminGot}`);
    child.attemptId = attempts[0].id;
    return {
      invoice: inv.status,
      completedPayments: payments.length,
      paid: payments.reduce((sum, p) => sum + Number(p.amount), 0),
      notified: ['parent: invoice_paid', 'admin: application_payment_confirmed'],
    };
  });

  if (key === 'A') {
    await step('confirming the same payment again changes nothing', async () => {
      const res = await admin.client.rpc('confirm_invoice_payment_attempt', { p_attempt_id: child.attemptId });
      const payments = ok(await service.from('payments').select('id').eq('invoice_id', child.invoiceId), 'payments');
      check(payments.length === 1, `${payments.length} payments`);
      return res.error ? `refused (${res.error.message}); still 1 payment` : 'still 1 payment';
    });
  }

  section(`${spec.label} — 3. the child is accepted and the profile is created`);

  await step(
    spec.classAtApproval ? 'admin accepts and picks the class in the same step' : 'admin accepts (Approve button, no class chosen)',
    async () => {
      const result = ok(
        await admin.client.rpc('approve_application_enrollment', {
          p_application_id: child.applicationId,
          p_nursery_id: S.nurseryId,
          p_auto_generate_first_invoice: true,
          ...(spec.classAtApproval ? { p_class_id: S.classId } : {}),
        }),
        'approve',
      );
      child.childId = result.childId ?? result.child_id;
      check(UUID.test(String(child.childId)), `no child id in ${JSON.stringify(result)}`);
      // The app emails the parent after an approval.
      const email = await callFunction(admin, 'email-dispatch', {
        trigger_type: 'application_approved',
        recipient_email: parent.email,
        language: 'ar',
        nursery_id: S.nurseryId,
        data: { reason: '' },
      });
      check(email.status === 200 && email.body?.ok, `approval email: ${email.status} ${JSON.stringify(email.body)}`);
      return { child: child.childId, class: result.classId ?? result.class_id ?? null, approvalEmail: email.body.mode };
    },
  );

  await step('child profile, parent link, extra-hours package and tuition subscription exist', async () => {
    const row = ok(
      await service
        .from('children')
        .select('full_name_en, full_name_ar, dob, gender, status, enrollment_date, created_at, class_id')
        .eq('id', child.childId)
        .single(),
      'child',
    );
    const link = ok(await service.from('parent_children').select('parent_type, relationship').eq('child_id', child.childId).eq('parent_id', parent.id), 'link');
    const extra = ok(await service.from('child_packages').select('status, hours_used').eq('child_id', child.childId), 'package');
    const sub = ok(
      await service
        .from('child_tuition_subscriptions')
        .select('billing_period, locked_price, started_at, next_invoice_date, status')
        .eq('child_id', child.childId)
        .eq('status', 'active'),
      'subscription',
    );
    const app = ok(await service.from('applications').select('status').eq('id', child.applicationId).single(), 'application');
    const today = await nurseryToday();
    check(row.status === 'active', `child ${row.status}`);
    check(row.enrollment_date === today, `enrolled ${row.enrollment_date}, the nursery's day is ${today}`);
    check(link.length === 1 && (link[0].parent_type ?? link[0].relationship) === 'mother', `parent link ${JSON.stringify(link)}`);
    check(spec.extraHours ? extra.length === 1 : extra.length === 0, `extra-hours packages: ${extra.length}`);
    check(sub.length === 1 && Number(sub[0].locked_price) === 3000, `subscription ${JSON.stringify(sub)}`);
    check(app.status === 'approved', `application ${app.status}`);
    child.enrolledOn = row.enrollment_date;
    return {
      child: `${row.full_name_en} / ${row.full_name_ar}`,
      born: row.dob,
      gender: row.gender,
      status: row.status,
      enrolled: `${row.enrollment_date} (the nursery's day: ${today})`,
      class: row.class_id ? 'E2E Class' : 'unassigned',
      // Approval records the link as the relationship (what the Parents tab shows).
      parentLink: link[0].parent_type ?? link[0].relationship,
      extraHoursPackage: extra.length ? `${extra[0].status}, ${extra[0].hours_used} h used` : 'none',
      subscription: `${sub[0].billing_period} ${Number(sub[0].locked_price)} EGP, next invoice ${sub[0].next_invoice_date}`,
      application: app.status,
    };
  });

  await step('the parent is told once, by the database (not by the admin\'s browser)', async () => {
    const approvals = (await notificationsOf(parent)).filter((n) => n.type === 'application_approved' && (n.action_link ?? '').includes(child.applicationId));
    check(approvals.length === 1, `${approvals.length} approval notifications`);
    return '1 application_approved';
  });

  if (spec.classAtApproval) {
    await step('the class\'s lead teacher is told a child joined her class', async () => {
      const notes = (await notificationsOf(teacher)).filter((n) => n.type === 'class_child_added');
      check(notes.length === 1, `${notes.length} class_child_added`);
      return notes[0].template_params;
    });
  }

  await step('parent sees "approved" and the child on their account', async () => {
    const app = ok(await parent.client.from('applications').select('status').eq('id', child.applicationId).single(), 'application');
    const kid = ok(await parent.client.from('children').select('full_name_en, status').eq('id', child.childId).single(), 'child');
    check(app.status === 'approved', `application ${app.status}`);
    return { application: app.status, child: `${kid.full_name_en} (${kid.status})` };
  });
}

await applyAndPay('A');
await applyAndPay('B');
const A = S.children.A;
const B = S.children.B;

// ---------------------------------------------------------------------------------------------
section('4. the child is placed in a class');

await step('Child A is already in the class chosen at approval', async () => {
  const row = ok(await service.from('children').select('class_id').eq('id', A.childId).single(), 'child');
  check(row.class_id === S.classId, 'Child A is not in the class');
  return 'E2E Class';
});

await step('Child B waits in the "unassigned" list', async () => {
  const rows = ok(await admin.client.from('children').select('id').eq('nursery_id', S.nurseryId).is('class_id', null), 'unassigned');
  check(rows.some((r) => r.id === B.childId), 'Child B is not unassigned');
  return `${rows.length} unassigned child(ren) in the nursery`;
});

await step('admin puts Child B in the class (class page → add child); the teacher is told', async () => {
  ok(await admin.client.from('children').update({ class_id: S.classId }).eq('id', B.childId), 'move');
  const row = ok(await service.from('children').select('class_id').eq('id', B.childId).single(), 'child');
  check(row.class_id === S.classId, 'not moved');
  const notes = (await notificationsOf(teacher)).filter((n) => n.type === 'class_child_added');
  check(notes.length === 2, `${notes.length} class_child_added in total`);
  return 'E2E Class; teacher notified (2 class_child_added)';
});

await step('the lead teacher sees both children in her class (RLS)', async () => {
  const rows = ok(await teacher.client.from('children').select('full_name_en').eq('class_id', S.classId), 'children');
  const names = rows.map((r) => r.full_name_en).sort();
  check(names.length === 2, JSON.stringify(names));
  return names;
});

// ---------------------------------------------------------------------------------------------
section('5. drop-off and pickup with the QR / 6-digit code (Child A)');

await step('parent opens the QR page → a fixed QR plus a 6-digit code', async () => {
  const res = await callFunction(parent, 'qr-token', { child_id: A.childId, nursery_id: S.nurseryId });
  check(res.status === 200, `${res.status} ${JSON.stringify(res.body)}`);
  check(/^\d{6}$/.test(String(res.body.manual_code ?? '')), 'no 6-digit code returned');
  A.qr = { id: res.body.id, token: res.body.token, code: res.body.manual_code };
  return { qrExpires: res.body.expires_at, code: '6 digits', codeExpires: res.body.manual_code_expires_at };
});

await step('reopening keeps the same QR, issues a new code, and the old code stops working', async () => {
  const res = await callFunction(parent, 'qr-token', { child_id: A.childId, nursery_id: S.nurseryId });
  check(res.status === 200, `${res.status} ${JSON.stringify(res.body)}`);
  check(res.body.token === A.qr.token, 'the QR changed');
  check(res.body.manual_code !== A.qr.code, 'the code did not change');
  const old = await callFunction(teacher, 'qr-verify', { token: A.qr.code, defer_consume: true });
  check(old.status === 404, `old code answered ${old.status}`);
  A.qr.code = res.body.manual_code;
  return 'same QR; new code; old code → 404';
});

await step('teacher types the 6-digit code at the gate → the server finds the child', async () => {
  const res = await callFunction(teacher, 'qr-verify', { token: A.qr.code, defer_consume: true });
  check(res.status === 200 && res.body.child_id === A.childId, `${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
  return { child: res.body.child_id === A.childId ? 'Child A' : res.body.child_id, today: res.body.attendance_state };
});

await step('teacher scans the QR image itself → same child', async () => {
  const res = await callFunction(teacher, 'qr-verify', { token: A.qr.token, defer_consume: true });
  check(res.status === 200 && res.body.child_id === A.childId, `${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
  return 'Child A';
});

await step('parent creates a one-time pickup QR for the grandfather (name, relation, national ID + both sides)', async () => {
  const paths = [];
  for (const side of ['front', 'back']) {
    const path = `${S.nurseryId}/qr-pickup-identities/${A.childId}/${Date.now()}-${side}.png`;
    ok(await parent.client.storage.from('application-documents').upload(path, PNG, { contentType: 'image/png', upsert: false }), `ID ${side}`);
    paths.push(`application-documents:${path}`);
  }
  const res = await callFunction(parent, 'qr-token', {
    child_id: A.childId,
    nursery_id: S.nurseryId,
    purpose: 'delegate',
    delegate_name: 'E2E Grandfather',
    pickup_person_full_name: 'E2E Grandfather',
    pickup_relationship: 'Grandfather',
    pickup_identity_type: 'national_id',
    pickup_identity_number: '29001011234567',
    pickup_identity_image_path: paths[0],
    pickup_identity_back_image_path: paths[1],
    require_id_capture: true,
    single_use: true,
    ttl_seconds: 24 * 60 * 60,
  });
  check(res.status === 200 && res.body.token, `${res.status} ${JSON.stringify(res.body)}`);
  A.pickup = { id: res.body.id, token: res.body.token };
  return { oneTime: res.body.single_use, expires: res.body.expires_at };
});

await step('the pickup QR cannot be used for a drop-off', async () => {
  const res = ok(
    await teacher.client.rpc('record_attendance_check_in', { p_child_id: A.childId, p_method: 'qr_custom', p_qr_token_id: A.pickup.id }),
    'check-in',
  );
  check(res.status === 'rejected', JSON.stringify(res));
  return res.reason;
});

await step('a QR drop-off outside working hours is refused', async () => {
  await sql(`
    update public.nursery_settings
       set standard_start_time = ((now() at time zone '${S.timezone}') + interval '2 hours')::time,
           standard_end_time = ((now() at time zone '${S.timezone}') + interval '4 hours')::time
     where nursery_id = '${S.nurseryId}'`);
  try {
    const res = ok(
      await teacher.client.rpc('record_attendance_check_in', { p_child_id: A.childId, p_method: 'qr_parent', p_qr_token_id: A.qr.id }),
      'check-in',
    );
    check(res.status === 'rejected' && res.reason === 'attendance_qr_checkin_outside_work_hours', JSON.stringify(res));
    return res.reason;
  } finally {
    await sql(`update public.nursery_settings set standard_start_time = '08:00', standard_end_time = '17:00' where nursery_id = '${S.nurseryId}'`);
  }
});

await step('teacher records the drop-off with the parent QR; the parent is told', async () => {
  const res = ok(
    await teacher.client.rpc('record_attendance_check_in', { p_child_id: A.childId, p_method: 'qr_parent', p_qr_token_id: A.qr.id }),
    'check-in',
  );
  check(res.status === 'checked_in', JSON.stringify(res));
  A.attendanceId = res.attendance_id;
  const told = (await notificationsOf(parent)).some((n) => n.type === 'attendance_checkin');
  check(told, 'no attendance_checkin notification');
  return { status: res.status, date: res.attendance_date, early: res.early_minutes, parentNotified: 'attendance_checkin' };
});

await step('scanning again the same day does not record a second drop-off', async () => {
  const res = ok(
    await teacher.client.rpc('record_attendance_check_in', { p_child_id: A.childId, p_method: 'qr_parent', p_qr_token_id: A.qr.id }),
    'check-in',
  );
  check(res.status === 'already_checked_in', JSON.stringify(res));
  return res.status;
});

await step('teacher scans the pickup QR → person, relation and ID shown; QR not spent yet', async () => {
  const res = await callFunction(teacher, 'qr-verify', { token: A.pickup.token, defer_consume: true });
  check(res.status === 200, `${res.status} ${JSON.stringify(res.body)}`);
  const tok = ok(await service.from('qr_tokens').select('consumed_at').eq('id', A.pickup.id).single(), 'token');
  check(tok.consumed_at === null, 'the QR was spent by a scan');
  return {
    person: res.body.pickup_person_full_name ?? res.body.delegate_name,
    relation: res.body.pickup_relationship,
    idType: res.body.pickup_identity_type,
    attendanceToday: res.body.attendance_state,
  };
});

const pickupPayload = () => ({
  pickup_person_name: 'E2E Grandfather',
  pickup_relationship: 'Grandfather',
  pickup_identity_type: 'national_id',
  pickup_identity_number: '29001011234567',
  require_id_capture: true,
  identity_verified: { verified_at: new Date().toISOString(), id_photo_path: null, method: 'visual' },
});

await step('a pickup a few minutes after drop-off is treated as a double scan and refused', async () => {
  const res = ok(
    await teacher.client.rpc('record_attendance_check_out', {
      p_attendance_id: A.attendanceId,
      p_method: 'qr_custom',
      p_qr_token_id: A.pickup.id,
      p_pickup: pickupPayload(),
      p_force: false,
    }),
    'check-out',
  );
  check(res.status === 'rejected' && res.reason === 'attendance_too_soon', JSON.stringify(res));
  return `${res.reason} (min ${res.min_minutes} min)`;
});

await step('[clock moved] drop-off set 3 h ago; closing time set to 70 min ago (a late pickup)', async () => {
  await sql(`update public.attendance_records set check_in = now() - interval '3 hours' where id = '${A.attendanceId}'`);
  await sql(`
    update public.nursery_settings
       set standard_end_time = ((now() at time zone '${S.timezone}') - interval '70 minutes')::time
     where nursery_id = '${S.nurseryId}'`);
  const [row] = await sql(`select standard_end_time::text as closed_at from public.nursery_settings where nursery_id = '${S.nurseryId}'`);
  return { nurseryClosedAt: row.closed_at, grace: '15 min', pickup: 'now ≈ 70 min after closing' };
});

await step('teacher confirms the grandfather and checks Child A out with the pickup QR', async () => {
  const res = ok(
    await teacher.client.rpc('record_attendance_check_out', {
      p_attendance_id: A.attendanceId,
      p_method: 'qr_custom',
      p_qr_token_id: A.pickup.id,
      p_pickup: pickupPayload(),
      p_force: false,
    }),
    'check-out',
  );
  check(res.status === 'checked_out', JSON.stringify(res));
  A.checkout = res;
  return {
    pickedUpBy: res.pickup_person_name,
    lateMinutes: res.late_minutes,
    extraHours: res.extra_hours,
    coveredByPackage: res.extra_hours_covered,
    billed: res.extra_hours_billed,
    fee: res.extra_fee,
  };
});

await step('the late time came out of the extra-hours package; the parent was told', async () => {
  check(A.checkout, 'no check-out');
  const pkg = ok(await service.from('child_packages').select('hours_used').eq('child_id', A.childId).single(), 'package');
  check(Number(A.checkout.extra_hours) > 0 && Number(A.checkout.extra_hours_covered) === Number(A.checkout.extra_hours), JSON.stringify(A.checkout));
  check(Number(pkg.hours_used) === Number(A.checkout.extra_hours), `package hours used ${pkg.hours_used}`);
  const told = (await notificationsOf(parent)).find((n) => n.type === 'attendance_checkout');
  check(told, 'no attendance_checkout notification');
  return { extraHours: A.checkout.extra_hours, packageHoursUsed: Number(pkg.hours_used), fee: A.checkout.extra_fee, parentNotified: 'attendance_checkout' };
});

await step('the one-time pickup QR is now spent and refused if scanned again', async () => {
  const tok = ok(await service.from('qr_tokens').select('consumed_at').eq('id', A.pickup.id).single(), 'token');
  check(tok.consumed_at !== null, 'the QR was not spent');
  const res = await callFunction(teacher, 'qr-verify', { token: A.pickup.token, defer_consume: true });
  check(res.status !== 200, `scan accepted: ${JSON.stringify(res.body)}`);
  return `spent at ${tok.consumed_at}; scan → ${res.status} ${res.body?.error ?? ''}`;
});

await step('guessing codes: wrong 6-digit codes are blocked after 5 tries in 10 minutes', async () => {
  // The admin has not mistyped a code yet (the teacher already has, above).
  const statuses = [];
  for (let i = 0; i < 6; i += 1) {
    let guess = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
    if (guess === A.qr.code) guess = guess === '000000' ? '000001' : '000000';
    statuses.push((await callFunction(admin, 'qr-verify', { token: guess, defer_consume: true })).status);
  }
  check(statuses.slice(0, 5).every((s) => s === 404) && statuses[5] === 429, statuses.join(','));
  return statuses.join(',');
});

// ---------------------------------------------------------------------------------------------
section('6. statistics and notifications');

await step('parent attendance history (get_attendance_days)', async () => {
  const today = await nurseryToday();
  const days = ok(
    await parent.client.rpc('get_attendance_days', { p_child_ids: [A.childId, B.childId], p_from: today, p_to: today }),
    'days',
  );
  const a = days.find((d) => d.child_id === A.childId);
  const b = days.find((d) => d.child_id === B.childId);
  check(a?.day_status === 'present', `Child A is ${a?.day_status}`);
  check(b?.day_status === 'absent', `Child B is ${b?.day_status}`);
  return {
    childA: `${a.day_status}; in ${a.check_in_method} by ${a.checked_in_by_en}, brought by ${a.dropoff_name_en}; out ${a.check_out_method} by ${a.checked_out_by_en}, picked up by ${a.pickup_person_name} (${a.pickup_relationship}); extra ${a.extra_hours} h, ${a.extra_hours_covered} h from the package`,
    childB: b.day_status,
  };
});

await step('admin attendance dashboard (get_attendance_kpis)', async () => {
  const kpis = ok(await admin.client.rpc('get_attendance_kpis', { p_nursery_id: S.nurseryId, p_month: null }), 'kpis');
  const t = kpis.today ?? {};
  check(Number(t.checked_in_total) === 1 && Number(t.checked_out) === 1 && Number(t.absent) === 1, `today: ${JSON.stringify(t)}`);
  return {
    today: { activeChildren: t.active_children, checkedIn: t.checked_in_total, checkedOut: t.checked_out, absent: t.absent, latePickups: t.late_pickups, qrScans: t.qr_scans, extraHours: t.extra_hours_today },
    month: { attendanceRate: kpis.month?.attendance_rate, latePickups: kpis.month?.late_pickups, extraHoursCovered: kpis.month?.extra_hours_covered },
  };
});

await step('the teacher sees the same day for her class', async () => {
  const today = await nurseryToday();
  const days = ok(
    await teacher.client.rpc('get_attendance_days', { p_child_ids: [A.childId, B.childId], p_from: today, p_to: today }),
    'days',
  );
  check(days.length === 2, `${days.length} rows`);
  return days.map((d) => `${d.child_id === A.childId ? 'Child A' : 'Child B'}: ${d.day_status}`);
});

await step('the admission journey has every step with its time (get_admission_timelines)', async () => {
  const rows = ok(await parent.client.rpc('get_admission_timelines', { p_child_ids: [A.childId, B.childId] }), 'timelines');
  const a = rows.find((r) => r.child_id === A.childId);
  check(a && a.submitted_at && a.payment_confirmed_at && a.approved_at && a.joined_at && a.first_check_in, JSON.stringify(a));
  return {
    submitted: a.submitted_at,
    paymentConfirmed: a.payment_confirmed_at,
    approved: `${a.approved_at} by ${a.approved_by_en}`,
    joined: a.joined_at,
    firstDay: a.first_check_in,
  };
});

await step('notifications each person received (and the parent can read hers)', async () => {
  const parentRows = await notificationsOf(parent);
  const readable = ok(await parent.client.from('notifications').select('id').eq('user_id', parent.id), 'parent read');
  const summary = {
    parent: typesOf(parentRows),
    parentCanRead: count(readable),
    admin: typesOf(await notificationsOf(admin)),
    teacher: typesOf(await notificationsOf(teacher)),
  };
  for (const type of ['application_approved', 'invoice_paid', 'attendance_checkin', 'attendance_checkout']) {
    check(parentRows.some((n) => n.type === type), `parent missing ${type}`);
  }
  return summary;
});

await step('emails the app sent are in the delivery log (demo mode until Resend is set)', async () => {
  const rows = ok(await admin.client.from('message_deliveries').select('channel, message_type, mode, status').eq('nursery_id', S.nurseryId), 'log');
  check(rows.length === 2 && rows.every((r) => r.status === 'sent'), JSON.stringify(rows));
  return rows.map((r) => `${r.channel}/${r.message_type}: ${r.mode}, ${r.status}`);
});

await step("parent's home data: children, their class, invoices, next tuition invoice", async () => {
  const kids = ok(await parent.client.from('children').select('full_name_en, status, class_id, classes(name_en)').in('id', [A.childId, B.childId]), 'children');
  const invoices = ok(await parent.client.from('invoices').select('amount, status').in('id', [A.invoiceId, B.invoiceId]), 'invoices');
  const subs = ok(await parent.client.from('child_tuition_subscriptions').select('next_invoice_date, locked_price').in('child_id', [A.childId, B.childId]), 'subscriptions');
  check(kids.length === 2 && invoices.length === 2 && subs.length === 2, 'the parent cannot see all of it');
  return {
    children: kids.map((k) => `${k.full_name_en}: ${k.status}, class ${k.classes?.name_en ?? '—'}`),
    invoices: invoices.map((i) => `${i.status} ${Number(i.amount)}`),
    subscriptions: subs.map((s) => `next ${s.next_invoice_date} · ${Number(s.locked_price)}`),
  };
});

// ---------------------------------------------------------------------------------------------
section('Cleanup — delete everything this run created');

const userIds = Object.values(people).map((p) => p.id).filter((id) => UUID.test(String(id)));
const childIds = Object.values(S.children).map((c) => c.childId).filter((id) => UUID.test(String(id)));
const idList = (ids) => ids.map((id) => `'${id}'`).join(',') || "'00000000-0000-0000-0000-000000000000'";
/** The same list inside a quoted SQL string (format(...) templates). */
const quoted = (list) => list.replace(/'/g, "''");

await step('uploaded files deleted', async () => {
  check(UUID.test(S.nurseryId), 'no nursery id');
  const objects = await sql(`select name from storage.objects where bucket_id = 'application-documents' and name like '${S.nurseryId}/%'`);
  const names = objects.map((o) => o.name);
  if (names.length) ok(await service.storage.from('application-documents').remove(names), 'remove files');
  return `${names.length} files`;
});

await step('rows deleted: the nursery\'s, then any made by the test accounts or about the test children', async () => {
  check(UUID.test(S.nurseryId), 'no nursery id');
  // Repeated passes, each delete on its own, so foreign keys settle whatever the order.
  await sql(`
    do $$
    declare r record; pass int;
    begin
      for pass in 1..6 loop
        for r in
          select c.table_name, c.column_name
            from information_schema.columns c
            join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
           where c.table_schema = 'public'
             and c.column_name in ('nursery_id', 'child_id', 'user_id', 'parent_id', 'staff_id', 'requested_by', 'reported_by',
                                   'issued_by', 'created_by', 'actor_id', 'billed_parent_id', 'initiated_by')
             and c.table_name not in ('nurseries', 'users')
        loop
          begin
            if r.column_name = 'nursery_id' then
              execute format('delete from public.%I where nursery_id = %L', r.table_name, '${S.nurseryId}');
            elsif r.column_name = 'child_id' then
              execute format('delete from public.%I where child_id in (${quoted(idList(childIds))})', r.table_name);
            else
              execute format('delete from public.%I where %I in (${quoted(idList(userIds))})', r.table_name, r.column_name);
            end if;
          exception when others then null;
          end;
        end loop;
      end loop;
    end $$;`);
  return 'done';
});

await step('nursery and app users deleted; auth accounts deleted', async () => {
  for (const id of userIds) {
    const res = await service.auth.admin.deleteUser(id);
    if (res.error && !/not found/i.test(res.error.message)) throw new Error(res.error.message);
  }
  await sql(`delete from public.users where id in (${idList(userIds)})`);
  await sql(`delete from public.nurseries where id = '${S.nurseryId}'`);
  return `${userIds.length} accounts`;
});

await step('verified: no rows, accounts or files left', async () => {
  const [left] = await sql(`
    with t as (
      select c.table_name, c.column_name
        from information_schema.columns c
        join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
       where c.table_schema = 'public'
         and c.column_name in ('nursery_id', 'child_id', 'user_id', 'parent_id', 'staff_id', 'requested_by', 'reported_by',
                               'issued_by', 'created_by', 'actor_id', 'billed_parent_id', 'initiated_by')
    )
    select
      (select count(*) from auth.users where id in (${idList(userIds)})) as auth_users,
      (select count(*) from public.users where id in (${idList(userIds)})) as app_users,
      (select count(*) from public.nurseries where id = '${S.nurseryId}') as nurseries,
      (select count(*) from storage.objects where bucket_id = 'application-documents' and name like '${S.nurseryId}/%') as files,
      (select coalesce(sum(n), 0) from (
         select (xpath('/row/n/text()', query_to_xml(format(
           case when t.column_name = 'nursery_id' then 'select count(*) as n from public.%I where nursery_id = %L'
                when t.column_name = 'child_id' then 'select count(*) as n from public.%I where child_id in (${quoted(idList(childIds))})'
                else 'select count(*) as n from public.%I where %I in (${quoted(idList(userIds))})' end,
           t.table_name,
           case when t.column_name = 'nursery_id' then '${S.nurseryId}' else t.column_name end), false, true, '')))[1]::text::int as n
           from t
       ) counts) as rows_left`);
  const total = Number(left.auth_users) + Number(left.app_users) + Number(left.nurseries) + Number(left.files) + Number(left.rows_left);
  check(total === 0, JSON.stringify(left));
  return left;
});

const total = passed + failed.length;
console.log(`\n== ${passed}/${total} steps passed${failed.length ? `; failed: ${failed.join(' | ')}` : ''}`);
process.exit(failed.length ? 1 : 0);

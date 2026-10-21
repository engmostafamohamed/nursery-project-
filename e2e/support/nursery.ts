// A throw-away nursery for the browser tests, on the live project: an admin, a teacher and a parent
// with real accounts, a class, a tuition package and an extra-hours package. Applications can be
// prepared with the same calls the app makes (as the parent), so a test can start at the screen it is
// about. cleanupTestNursery() deletes everything and checks nothing is left.
//
// Needs in .env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_ACCESS_TOKEN.
import { existsSync, readFileSync } from 'node:fs';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, type Page } from '@playwright/test';

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

export const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
export const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN ?? '';
const PROJECT_REF = SUPABASE_URL ? new URL(SUPABASE_URL).hostname.split('.')[0] : '';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
export const REQUIRED_DOCUMENTS = ['birth_certificate', 'vaccination_card', 'parent_id', 'proof_of_address'] as const;

async function managementApi(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.supabase.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Management API ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/** SQL as the database owner: setup, clock moves, verification and cleanup only. */
export async function sql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  return managementApi(`/v1/projects/${PROJECT_REF}/database/query`, { method: 'POST', body: JSON.stringify({ query }) });
}

const newClient = (key: string) => createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });

let serviceClientPromise: Promise<SupabaseClient> | null = null;
export function service(): Promise<SupabaseClient> {
  serviceClientPromise ??= (async () => {
    const keys = (await managementApi(`/v1/projects/${PROJECT_REF}/api-keys?reveal=true`)) as Array<{ name: string; type?: string; api_key?: string }>;
    const legacy = keys.find((k) => k.name === 'service_role' && k.api_key?.startsWith('ey'));
    const secret = keys.find((k) => k.type === 'secret' && k.api_key && !k.api_key.includes('·'));
    const key = legacy?.api_key ?? secret?.api_key;
    if (!key) throw new Error('Could not read a service key through the Management API');
    return newClient(key);
  })();
  return serviceClientPromise;
}

/** Unwraps a supabase-js result, or throws with its message. */
export function ok<T>(res: { data: T; error: { message: string } | null }, context: string): T {
  if (res.error) throw new Error(`${context}: ${res.error.message}`);
  return res.data;
}

export type Person = {
  key: 'admin' | 'teacher' | 'parent';
  role: 'branch_admin' | 'teacher' | 'parent';
  name_en: string;
  name_ar: string;
  email: string;
  password: string;
  id: string;
  client: SupabaseClient;
};

export type TestNursery = {
  run: string;
  id: string;
  timezone: string;
  classId: string;
  tuitionPackageId: string;
  extraHoursPackageId: string;
  admin: Person;
  teacher: Person;
  parent: Person;
  /** Children and applications made through this nursery, for cleanup. */
  childIds: string[];
};

export type ChildSpec = {
  first_name: string;
  full_name_en: string;
  full_name_ar: string;
  dob: string;
  gender: 'male' | 'female';
};

/** Creates the nursery, its three people (signed in) and what the admin sets up first. */
export async function createTestNursery(): Promise<TestNursery> {
  const svc = await service();
  const run = `ui${Date.now().toString(36)}`;
  const password = `Ui!${crypto.randomUUID()}`;

  // A time zone where it is about midday now, so working hours never get in the way. Etc/GMT-N is UTC+N.
  const offset = 12 - new Date().getUTCHours();
  const timezone = offset === 0 ? 'Etc/GMT' : `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;

  const nursery = ok(
    await svc
      .from('nurseries')
      .insert({ name_ar: `حضانة ${run}`, name_en: `UI Nursery ${run}`, working_days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] })
      .select('id')
      .single(),
    'nursery',
  );
  ok(
    await svc
      .from('nursery_settings')
      .update({
        timezone,
        standard_start_time: '08:00',
        standard_end_time: '17:00',
        payment_methods_enabled: ['instapay', 'bank_transfer'],
        instapay_account_name: 'UI Nursery',
        instapay_account_number: 'ui.nursery@instapay',
      })
      .eq('nursery_id', nursery.id),
    'settings',
  );

  const people = {} as Record<Person['key'], Person>;
  const specs: Array<Pick<Person, 'key' | 'role' | 'name_en' | 'name_ar'>> = [
    { key: 'admin', role: 'branch_admin', name_en: 'UI Admin', name_ar: 'مديرة الواجهة' },
    { key: 'teacher', role: 'teacher', name_en: 'UI Teacher', name_ar: 'معلمة الواجهة' },
    { key: 'parent', role: 'parent', name_en: 'UI Mother', name_ar: 'أم الواجهة' },
  ];
  let n = 1;
  for (const spec of specs) {
    const email = `${run}-${spec.key}@xo-platform.local`;
    const created = await svc.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error(`${spec.key}: ${created.error?.message}`);
    const id = created.data.user.id;
    ok(
      await svc.from('users').upsert(
        {
          id,
          email,
          role: spec.role,
          nursery_id: nursery.id,
          name_ar: spec.name_ar,
          name_en: spec.name_en,
          phone: `+2011${String(Date.now()).slice(-7)}${n++}`,
          status: 'active',
          language_pref: 'en',
          onboarding_completed: true,
        },
        { onConflict: 'id' },
      ),
      `${spec.key} profile`,
    );
    const client = newClient(ANON_KEY);
    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw new Error(`${spec.key} sign-in: ${signedIn.error.message}`);
    people[spec.key] = { ...spec, email, password, id, client };
  }

  const cls = ok(
    await people.admin.client.from('classes').insert({ nursery_id: nursery.id, name_ar: 'فصل الواجهة', name_en: 'UI Class', capacity: 20 }).select('id').single(),
    'class',
  );
  ok(await people.admin.client.from('class_staff').insert({ class_id: cls.id, user_id: people.teacher.id, role: 'lead' }), 'lead teacher');
  const tuition = ok(
    await people.admin.client
      .from('tuition_packages')
      .insert({ nursery_id: nursery.id, name_ar: 'يوم كامل', name_en: 'Full day', price: 3000, daily_hours: 8, active: true })
      .select('id')
      .single(),
    'tuition package',
  );
  ok(
    await people.admin.client.from('tuition_package_billing_periods').insert({
      nursery_id: nursery.id,
      tuition_package_id: tuition.id,
      billing_period: 'monthly',
      duration_months: 1,
      price: 3000,
      active: true,
    }),
    'monthly period',
  );
  const extra = ok(
    await people.admin.client
      .from('packages')
      .insert({
        nursery_id: nursery.id,
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

  return {
    run,
    id: nursery.id,
    timezone,
    classId: cls.id,
    tuitionPackageId: tuition.id,
    extraHoursPackageId: extra.id,
    admin: people.admin,
    teacher: people.teacher,
    parent: people.parent,
    childIds: [],
  };
}

/**
 * A draft application as the parent leaves it before paying: child details, terms, the 4 documents
 * and the monthly tuition package chosen (the admission invoice exists).
 */
export async function prepareApplication(n: TestNursery, child: ChildSpec) {
  const { parent } = n;
  const app = ok(
    await parent.client
      .from('applications')
      .insert({
        nursery_id: n.id,
        parent_id: parent.id,
        status: 'draft',
        parent_info_json: {
          full_name: parent.name_en,
          email: parent.email,
          phone: '+201100000000',
          mother: { full_name: parent.name_en, email: parent.email, mobile: '+201100000000' },
          family: { address: 'Cairo' },
        },
        child_info_json: {
          first_name: child.first_name,
          last_name: 'UI',
          full_name_en: child.full_name_en,
          full_name_ar: child.full_name_ar,
          dob: child.dob,
          gender: child.gender,
          nationality: 'Egyptian',
          home_address: 'Cairo',
          preferred_class: 'KG-9',
        },
        terms_accepted: true,
        health_medication_policy_accepted: true,
        financial_agreement_accepted: true,
        policies_procedures_accepted: true,
        information_accuracy_confirmed: true,
        consent_accepted_at: new Date().toISOString(),
      })
      .select('id')
      .single(),
    'application',
  );
  for (const type of REQUIRED_DOCUMENTS) {
    const path = `${n.id}/${app.id}/${type}_${Date.now()}.png`;
    ok(await parent.client.storage.from('application-documents').upload(path, PNG, { contentType: 'image/png', upsert: true }), `upload ${type}`);
    ok(await parent.client.from('application_documents').insert({ application_id: app.id, document_type: type, file_url: path }), `document ${type}`);
  }
  const invoiceId = ok(
    await parent.client.rpc('select_application_payment_package', {
      p_application_id: app.id,
      p_package_id: n.tuitionPackageId,
      p_billing_period: 'monthly',
    }),
    'select package',
  ) as string;
  return { applicationId: app.id as string, invoiceId };
}

/** The parent pays the admission invoice in full (InstaPay), as the payment screen does. */
export async function payApplication(n: TestNursery, invoiceId: string) {
  const inv = ok(await n.parent.client.from('invoices').select('amount').eq('id', invoiceId).single(), 'invoice');
  return ok(
    await n.parent.client.rpc('submit_invoice_payment', {
      p_invoice_id: invoiceId,
      p_amount: Number(inv.amount),
      p_method: 'instapay',
      p_reference: `Reference: ${n.run}; sender: parent@instapay`,
      p_proof_url: null,
      p_idempotency_key: crypto.randomUUID(),
    }),
    'pay',
  );
}

/** The admin confirms the waiting payment and accepts the child into the class (API, for setup). */
export async function confirmAndApprove(n: TestNursery, app: { applicationId: string; invoiceId: string }) {
  const attempts = ok(await n.admin.client.from('payment_attempts').select('id').eq('invoice_id', app.invoiceId), 'attempts');
  ok(await n.admin.client.rpc('confirm_invoice_payment_attempt', { p_attempt_id: attempts[0].id }), 'confirm');
  const result = ok(
    await n.admin.client.rpc('approve_application_enrollment', {
      p_application_id: app.applicationId,
      p_nursery_id: n.id,
      p_auto_generate_first_invoice: true,
      p_class_id: n.classId,
    }),
    'approve',
  ) as { childId: string };
  n.childIds.push(result.childId);
  return result.childId;
}

/** Signs in through the login form, in English, and waits for the role's home page. */
export async function signIn(page: Page, person: Person) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('xo_i18nextLng', 'en');
    } catch {
      /* private mode */
    }
  });
  await page.goto('/login');
  await page.locator('#email').fill(person.email);
  await page.locator('#password').fill(person.password);
  await page.locator('button[type="submit"]').click();
  const home = person.role === 'parent' ? /\/parent/ : person.role === 'teacher' ? /\/(teacher|admin)/ : /\/admin/;
  await expect(page).toHaveURL(home, { timeout: 30_000 });
}

/** Deletes everything this nursery holds (rows, accounts, files) and checks nothing is left. */
export async function cleanupTestNursery(n: TestNursery | undefined) {
  if (!n || !UUID.test(n.id)) return;
  const svc = await service();
  const userIds = [n.admin, n.teacher, n.parent].map((p) => p?.id).filter((id): id is string => UUID.test(String(id)));
  const [{ ids: childRows }] = await sql<{ ids: string[] | null }>(`select array_agg(id) as ids from public.children where nursery_id = '${n.id}'`);
  const childIds = [...new Set([...(childRows ?? []), ...n.childIds])].filter((id) => UUID.test(id));
  const idList = (ids: string[]) => ids.map((id) => `'${id}'`).join(',') || "'00000000-0000-0000-0000-000000000000'";
  const quoted = (list: string) => list.replace(/'/g, "''");

  const objects = await sql<{ name: string }>(`select name from storage.objects where bucket_id = 'application-documents' and name like '${n.id}/%'`);
  if (objects.length) await svc.storage.from('application-documents').remove(objects.map((o) => o.name));

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
                                   'issued_by', 'created_by', 'actor_id', 'billed_parent_id', 'initiated_by', 'sender_id', 'receiver_id')
             and c.table_name not in ('nurseries', 'users')
        loop
          begin
            if r.column_name = 'nursery_id' then
              execute format('delete from public.%I where nursery_id = %L', r.table_name, '${n.id}');
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
  for (const id of userIds) {
    const res = await svc.auth.admin.deleteUser(id);
    if (res.error && !/not found/i.test(res.error.message)) throw new Error(res.error.message);
  }
  await sql(`delete from public.users where id in (${idList(userIds)})`);
  await sql(`delete from public.nurseries where id = '${n.id}'`);

  const [left] = await sql<{ users: number; nurseries: number; files: number; children: number }>(`
    select (select count(*) from auth.users where id in (${idList(userIds)}))::int as users,
           (select count(*) from public.nurseries where id = '${n.id}')::int as nurseries,
           (select count(*) from storage.objects where bucket_id = 'application-documents' and name like '${n.id}/%')::int as files,
           (select count(*) from public.children where id in (${idList(childIds)}))::int as children`);
  if (left.users + left.nurseries + left.files + left.children > 0) throw new Error(`cleanup left ${JSON.stringify(left)}`);
}

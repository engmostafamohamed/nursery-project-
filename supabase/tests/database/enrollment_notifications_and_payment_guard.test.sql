-- Database test · Admission payment, acceptance and class notifications: a parent cannot pay for
-- an application that could not be sent for review, the database (not the admin's browser) tells
-- the parent their child was accepted, a class's teachers hear about a child joining it, and the
-- enrollment is dated on the nursery's own calendar day. Everything is rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

-- ---------------------------------------------------------------------------------------------
-- Test data (as the database owner, so RLS does not apply yet)
-- ---------------------------------------------------------------------------------------------

insert into public.nurseries (id, name_ar, name_en) values
  ('00000000-0000-4000-a000-00000000000a', 'حضانة أ', 'Nursery A');

-- A timezone whose calendar day differs from the server's UTC day right now, so a date taken
-- from the server clock fails whatever hour the test runs.
update public.nursery_settings
   set timezone = case when (now() at time zone 'UTC')::time >= '12:00' then 'Pacific/Kiritimati' else 'Etc/GMT+12' end
 where nursery_id = '00000000-0000-4000-a000-00000000000a';

-- Creating an auth user also creates its public.users row (as a parent); roles are set after.
insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000a01', 'admin.n@test.local'),
  ('00000000-0000-4000-a000-000000000a02', 'lead.n@test.local'),
  ('00000000-0000-4000-a000-000000000a03', 'backup.n@test.local'),
  ('00000000-0000-4000-a000-000000000a04', 'stars.n@test.local'),
  ('00000000-0000-4000-a000-000000000a05', 'parent.n@test.local');

update public.users u
   set role = v.role::public.user_role,
       nursery_id = '00000000-0000-4000-a000-00000000000a',
       status = 'active'
  from (values
    ('00000000-0000-4000-a000-000000000a01', 'branch_admin'),
    ('00000000-0000-4000-a000-000000000a02', 'teacher'),
    ('00000000-0000-4000-a000-000000000a03', 'teacher'),
    ('00000000-0000-4000-a000-000000000a04', 'teacher'),
    ('00000000-0000-4000-a000-000000000a05', 'parent')
  ) as v(id, role)
 where u.id = v.id::uuid;

insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-a000-000000000c01', '00000000-0000-4000-a000-00000000000a', 'الفراشات', 'Butterflies'),
  ('00000000-0000-4000-a000-000000000c02', '00000000-0000-4000-a000-00000000000a', 'النجوم', 'Stars');

-- Butterflies has a lead and a backup teacher; Stars has its own lead.
insert into public.class_staff (class_id, user_id, role) values
  ('00000000-0000-4000-a000-000000000c01', '00000000-0000-4000-a000-000000000a02', 'lead'),
  ('00000000-0000-4000-a000-000000000c01', '00000000-0000-4000-a000-000000000a03', 'substitute'),
  ('00000000-0000-4000-a000-000000000c02', '00000000-0000-4000-a000-000000000a04', 'lead');

insert into public.tuition_packages (id, nursery_id, name_ar, name_en, price) values
  ('00000000-0000-4000-a000-0000000a1001', '00000000-0000-4000-a000-00000000000a', 'الباقة الشهرية', 'Monthly', 2000);

-- Two drafts: Adam's has the terms but no documents yet; Laila's has the documents but not the terms.
insert into public.applications (id, nursery_id, parent_id, status, terms_accepted, parent_info_json, child_info_json) values
  ('00000000-0000-4000-a000-000000000d01', '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-000000000a05',
   'draft', true, '{"mother": {"full_name": "Mona"}}',
   '{"full_name_ar": "آدم", "full_name_en": "Adam", "dob": "2023-05-10", "gender": "male"}'),
  ('00000000-0000-4000-a000-000000000d02', '00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-000000000a05',
   'draft', false, '{"mother": {"full_name": "Mona"}}',
   '{"full_name_ar": "ليلى", "full_name_en": "Laila", "dob": "2022-11-02", "gender": "female"}');

insert into public.application_documents (application_id, document_type, file_url)
select '00000000-0000-4000-a000-000000000d02', doc, 'application-documents/test/' || doc || '.pdf'
  from unnest(array['birth_certificate', 'vaccination_card', 'parent_id', 'proof_of_address']) as doc;

-- Acts as a signed-in user for the statements that follow: RLS and auth.uid() apply.
create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

-- The admission invoice of an application.
create function pg_temp.app_invoice(p_application_id uuid) returns uuid
language sql as $$
  select id from public.invoices where line_items_json ->> 'application_id' = p_application_id::text
$$;

-- ---------------------------------------------------------------------------------------------
-- 1. An application is paid only once it can be sent for review
-- ---------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-a000-000000000a05');

select lives_ok(
  $$ select public.select_application_payment_package(
       '00000000-0000-4000-a000-000000000d01', '00000000-0000-4000-a000-0000000a1001', 'monthly') $$,
  'the parent picks a package for Adam'
);

select lives_ok(
  $$ select public.select_application_payment_package(
       '00000000-0000-4000-a000-000000000d02', '00000000-0000-4000-a000-0000000a1001', 'monthly') $$,
  'and for Laila'
);

select throws_ok(
  $$ select public.submit_invoice_payment(
       pg_temp.app_invoice('00000000-0000-4000-a000-000000000d01'), 2000, 'instapay', 'IPN-1', null, null) $$,
  'P0001', 'payment_application_incomplete',
  'an application without its required documents cannot be paid'
);

select throws_ok(
  $$ select public.submit_invoice_payment(
       pg_temp.app_invoice('00000000-0000-4000-a000-000000000d02'), 2000, 'instapay', 'IPN-2', null, null) $$,
  'P0001', 'payment_application_incomplete',
  'an application without the accepted terms cannot be paid'
);

reset role;
select is(
  (select count(*)::int from public.payment_attempts where parent_id = '00000000-0000-4000-a000-000000000a05'),
  0,
  'no payment was recorded'
);

insert into public.application_documents (application_id, document_type, file_url)
select '00000000-0000-4000-a000-000000000d01', doc, 'application-documents/test/' || doc || '.pdf'
  from unnest(array['birth_certificate', 'vaccination_card', 'parent_id', 'proof_of_address']) as doc;

select pg_temp.act_as('00000000-0000-4000-a000-000000000a05');
select lives_ok(
  $$ select public.submit_invoice_payment(
       pg_temp.app_invoice('00000000-0000-4000-a000-000000000d01'), 2000, 'instapay', 'IPN-3', null, null) $$,
  'with its documents uploaded, Adam''s application is paid'
);

reset role;
select is(
  (select status from public.applications where id = '00000000-0000-4000-a000-000000000d01'),
  'submitted',
  'paying sends it for review'
);

-- ---------------------------------------------------------------------------------------------
-- 2. The acceptance is announced by the database
-- ---------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-a000-000000000a01');

select lives_ok(
  $$ select public.confirm_invoice_payment_attempt(
       (select id from public.payment_attempts
         where invoice_id = pg_temp.app_invoice('00000000-0000-4000-a000-000000000d01'))) $$,
  'the admin confirms the payment'
);

select lives_ok(
  $$ select public.approve_application_enrollment(
       '00000000-0000-4000-a000-000000000d01', '00000000-0000-4000-a000-00000000000a', true,
       '00000000-0000-4000-a000-000000000c01') $$,
  'the admin accepts Adam into Butterflies'
);

reset role;
select set_config('test.child_id',
  (select child_id::text from public.applications where id = '00000000-0000-4000-a000-000000000d01'), true);

select is(
  (select count(*)::int from public.notifications
    where user_id = '00000000-0000-4000-a000-000000000a05'
      and type = 'application_approved'
      and action_link = '/parent/applications/00000000-0000-4000-a000-000000000d01'),
  1,
  'the parent is told their child was accepted'
);

select results_eq(
  $$ select user_id::text from public.notifications
      where nursery_id = '00000000-0000-4000-a000-00000000000a' and type = 'class_child_added'
      order by user_id $$,
  $$ values ('00000000-0000-4000-a000-000000000a02'), ('00000000-0000-4000-a000-000000000a03') $$,
  'Butterflies'' lead and backup teachers hear about their new child'
);

select is(
  (select template_params from public.notifications
    where type = 'class_child_added' and user_id = '00000000-0000-4000-a000-000000000a02'),
  '{"child": {"ar": "آدم", "en": "Adam"}, "class": {"ar": "الفراشات", "en": "Butterflies"}}'::jsonb,
  'the notification names the child and the class in both languages'
);

-- ---------------------------------------------------------------------------------------------
-- 3. The enrollment is dated on the nursery's day
-- ---------------------------------------------------------------------------------------------
select is(
  (select enrollment_date from public.children where id = current_setting('test.child_id')::uuid),
  (select (now() at time zone ns.timezone)::date from public.nursery_settings ns
    where ns.nursery_id = '00000000-0000-4000-a000-00000000000a'),
  'Adam is enrolled on the nursery''s own calendar day'
);

select isnt(
  (select enrollment_date from public.children where id = current_setting('test.child_id')::uuid),
  (now() at time zone 'UTC')::date,
  'not on the server''s UTC day'
);

select is(
  (select next_invoice_date from public.child_tuition_subscriptions
    where child_id = current_setting('test.child_id')::uuid and status = 'active'),
  (select ((now() at time zone ns.timezone)::date + interval '1 month')::date from public.nursery_settings ns
    where ns.nursery_id = '00000000-0000-4000-a000-00000000000a'),
  'the next tuition invoice is due one month after that day'
);

-- ---------------------------------------------------------------------------------------------
-- 4. Each event is announced once
-- ---------------------------------------------------------------------------------------------
select lives_ok(
  $$ update public.applications set status = 'approved' where id = '00000000-0000-4000-a000-000000000d01' $$,
  'saving the approved application again'
);

select is(
  (select count(*)::int from public.notifications
    where user_id = '00000000-0000-4000-a000-000000000a05' and type = 'application_approved'),
  1,
  'does not tell the parent a second time'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000a01');
select lives_ok(
  $$ update public.children set class_id = '00000000-0000-4000-a000-000000000c02'
      where id = current_setting('test.child_id')::uuid $$,
  'the admin moves Adam to Stars'
);

reset role;
select is(
  (select count(*)::int from public.notifications
    where type = 'class_child_added' and user_id = '00000000-0000-4000-a000-000000000a04'),
  1,
  'the Stars teacher hears about Adam'
);

select is(
  (select count(*)::int from public.notifications
    where type = 'class_child_added' and user_id = '00000000-0000-4000-a000-000000000a02'),
  1,
  'the Butterflies teacher is not told again'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000a01');
select lives_ok(
  $$ update public.children set full_name_en = 'Adam A.' where id = current_setting('test.child_id')::uuid $$,
  'the admin edits Adam''s name'
);

reset role;
select is(
  (select count(*)::int from public.notifications
    where nursery_id = '00000000-0000-4000-a000-00000000000a' and type = 'class_child_added'),
  3,
  'a change that is not a class move announces nothing'
);

select * from finish();
rollback;

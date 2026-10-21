-- Database test · What the server now enforces (it used to be checked only in the browser):
-- a parent's draft reaches the nursery only with a payment; after a documents request it goes back only
-- with a new upload; the admins are told once when a parent sends an application (back); and a parent
-- reports absences for today onward.
-- Everything runs in one transaction that is rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

insert into public.nurseries (id, name_ar, name_en, working_days) values
  ('00000000-0000-4000-f000-00000000000a', 'حضانة أ', 'Nursery A', '["sun","mon","tue","wed","thu","fri","sat"]');

insert into auth.users (id, email) values
  ('00000000-0000-4000-f000-000000000a01', 'rules.admin@test.local'),
  ('00000000-0000-4000-f000-000000000a06', 'rules.parent@test.local');

update public.users u
   set role = v.role::public.user_role, nursery_id = v.nursery_id::uuid, name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-f000-000000000a01', 'branch_admin', '00000000-0000-4000-f000-00000000000a', 'Admin'),
    ('00000000-0000-4000-f000-000000000a06', 'parent',       '00000000-0000-4000-f000-00000000000a', 'Mona')
  ) as v(id, role, nursery_id, name_en)
 where u.id = v.id::uuid;

-- Three draft applications with their 4 documents and an admission invoice each:
--   f1 is paid by the parent; f2 is paid by hand at the nursery; f3 is used for the documents request.
insert into public.applications (id, nursery_id, parent_id, status, terms_accepted, parent_info_json, child_info_json) values
  ('00000000-0000-4000-f000-0000000000f1', '00000000-0000-4000-f000-00000000000a', '00000000-0000-4000-f000-000000000a06', 'draft', false, '{"full_name": "Mona"}', '{}'),
  ('00000000-0000-4000-f000-0000000000f2', '00000000-0000-4000-f000-00000000000a', '00000000-0000-4000-f000-000000000a06', 'draft', true,  '{"full_name": "Mona"}', '{}'),
  ('00000000-0000-4000-f000-0000000000f3', '00000000-0000-4000-f000-00000000000a', '00000000-0000-4000-f000-000000000a06', 'draft', true,  '{"full_name": "Mona"}', '{}');

insert into public.application_documents (application_id, document_type, file_url, uploaded_at)
select a.id, d.type, 'nursery/' || a.id || '/' || d.type || '.png', now() - interval '1 hour'
from (values ('00000000-0000-4000-f000-0000000000f1'::uuid), ('00000000-0000-4000-f000-0000000000f2'::uuid), ('00000000-0000-4000-f000-0000000000f3'::uuid)) a(id)
cross join (values ('birth_certificate'), ('vaccination_card'), ('parent_id'), ('proof_of_address')) d(type);

insert into public.invoices (id, nursery_id, parent_id, amount, due_date, status, invoice_type, line_items_json) values
  ('00000000-0000-4000-f000-0000000000e1', '00000000-0000-4000-f000-00000000000a', '00000000-0000-4000-f000-000000000a06',
   3000, current_date + 7, 'pending', 'other', '{"application_id": "00000000-0000-4000-f000-0000000000f1"}'),
  ('00000000-0000-4000-f000-0000000000e2', '00000000-0000-4000-f000-00000000000a', '00000000-0000-4000-f000-000000000a06',
   3000, current_date + 7, 'pending', 'other', '{"application_id": "00000000-0000-4000-f000-0000000000f2"}');

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

-- Back to the database owner: the role and the signed-in user both (the claims outlive reset role).
create function pg_temp.as_owner() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

create function pg_temp.admin_told(p_application uuid) returns int
language sql as $$
  select count(*)::int from public.notifications
   where user_id = '00000000-0000-4000-f000-000000000a01' and type = 'application_submitted'
     and action_link = '/admin/admissions/applications/' || p_application
$$;

-- 1. Only with a payment -----------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-f000-000000000a06');

select throws_ok(
  $$ update public.applications set status = 'submitted' where id = '00000000-0000-4000-f000-0000000000f1' $$,
  'P0001', 'application_terms_required',
  'a draft without the terms accepted cannot be submitted'
);

update public.applications set terms_accepted = true where id = '00000000-0000-4000-f000-0000000000f1';
select throws_ok(
  $$ update public.applications set status = 'submitted' where id = '00000000-0000-4000-f000-0000000000f1' $$,
  'P0001', 'application_payment_required',
  'a draft with nothing paid cannot be submitted'
);

select throws_ok(
  $$ update public.applications set status = 'documents_pending' where id = '00000000-0000-4000-f000-0000000000f1' $$,
  null, 'Parents can only submit a draft',
  'a parent cannot move a draft to any other status'
);

select lives_ok(
  $$ select public.submit_invoice_payment('00000000-0000-4000-f000-0000000000e1', 3000, 'instapay',
       'Reference: R1; sender: x', null, '00000000-0000-4000-f000-0000000000c1') $$,
  'the parent pays the admission invoice'
);

reset role;
select pg_temp.as_owner();
select is(
  (select status from public.applications where id = '00000000-0000-4000-f000-0000000000f1'),
  'submitted', 'the payment submits the application'
);
select is(pg_temp.admin_told('00000000-0000-4000-f000-0000000000f1'), 1, 'and the admin is told once (not again by the status trigger)');

-- 2. Paid at the nursery, then submitted by hand ------------------------------------------------
insert into public.payments (invoice_id, amount, method, status, paid_at) values
  ('00000000-0000-4000-f000-0000000000e2', 3000, 'cash', 'completed', now());

select pg_temp.act_as('00000000-0000-4000-f000-000000000a06');
select lives_ok(
  $$ update public.applications set status = 'submitted', submitted_at = now() where id = '00000000-0000-4000-f000-0000000000f2' $$,
  'after a payment the nursery recorded, the parent can submit by hand'
);
reset role;
select pg_temp.as_owner();
select is(
  (select (count(*)::int, max(template_params -> 'reason' ->> 'i18n'))::text from public.notifications
    where user_id = '00000000-0000-4000-f000-000000000a01' and type = 'application_submitted'
      and action_link = '/admin/admissions/applications/00000000-0000-4000-f000-0000000000f2'),
  '(1,notificationTemplates.application_submitted.reasons.payment_submitted)',
  'the admin is told, by the database'
);

-- 3. A documents request: back only with a new upload -------------------------------------------
update public.applications set status = 'documents_pending', reviewed_at = now() - interval '10 minutes'
 where id = '00000000-0000-4000-f000-0000000000f3';

select pg_temp.act_as('00000000-0000-4000-f000-000000000a06');
select throws_ok(
  $$ update public.applications set status = 'submitted' where id = '00000000-0000-4000-f000-0000000000f3' $$,
  'P0001', 'requested_documents_not_updated',
  'sending it back with no new document is refused'
);
insert into public.application_documents (application_id, document_type, file_url)
values ('00000000-0000-4000-f000-0000000000f3', 'vaccination_card', 'nursery/f3/vaccination_card_new.png');
select lives_ok(
  $$ update public.applications set status = 'submitted', submitted_at = now() where id = '00000000-0000-4000-f000-0000000000f3' $$,
  'after uploading the document again, it goes back'
);
reset role;
select pg_temp.as_owner();
select is(
  (select (count(*)::int, max(template_params -> 'reason' ->> 'i18n'))::text from public.notifications
    where user_id = '00000000-0000-4000-f000-000000000a01' and type = 'application_submitted'
      and action_link = '/admin/admissions/applications/00000000-0000-4000-f000-0000000000f3'),
  '(1,notificationTemplates.application_submitted.reasons.documents_resubmitted)',
  'the admin is told the documents were updated'
);

-- 4. Absences: parents from today onward; staff any day ------------------------------------------
insert into public.children (id, nursery_id, full_name_ar, full_name_en, dob, status) values
  ('00000000-0000-4000-f000-0000000000c9', '00000000-0000-4000-f000-00000000000a', 'ليلى', 'Laila', '2023-01-01', 'active');
insert into public.parent_children (parent_id, child_id) values ('00000000-0000-4000-f000-000000000a06', '00000000-0000-4000-f000-0000000000c9');

select pg_temp.act_as('00000000-0000-4000-f000-000000000a06');
select throws_ok(
  $$ insert into public.attendance_absence_reports (child_id, absence_date, reason)
     values ('00000000-0000-4000-f000-0000000000c9', (now() at time zone 'Africa/Cairo')::date - 1, 'sick') $$,
  '22023', 'absence_date_in_past',
  'a parent cannot report a day that has passed'
);
select lives_ok(
  $$ insert into public.attendance_absence_reports (child_id, absence_date, reason)
     values ('00000000-0000-4000-f000-0000000000c9', (now() at time zone 'Africa/Cairo')::date, 'sick') $$,
  'a parent reports today'
);

select pg_temp.act_as('00000000-0000-4000-f000-000000000a01');
select lives_ok(
  $$ insert into public.attendance_absence_reports (child_id, absence_date, reason)
     values ('00000000-0000-4000-f000-0000000000c9', (now() at time zone 'Africa/Cairo')::date - 3, 'other') $$,
  'staff can record a past day'
);

select * from finish();
rollback;

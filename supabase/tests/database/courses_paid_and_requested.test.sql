-- Database test · courses: a course bill is also a family invoice (to the main parent, seen by both
-- parents, opened by the notice); paying the invoice marks the bill paid, marking the bill paid
-- records the payment, waiving it cancels the invoice. A family reads the open courses with its
-- children's state, asks to enrol a child (checked: its own child, open, not in it, not asked, a
-- place left), may withdraw; the admins hear of it and approve (the child is enrolled) or decline;
-- the family hears the answer; other families see nothing of it. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(26);

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.bill(p_month date) returns uuid language sql as $$
  insert into public.course_invoices (course_id, enrollment_id, child_id, nursery_id, billing_month, amount, currency, status, due_date)
  values ('00000000-0000-4000-9800-0000000000f1', '00000000-0000-4000-9800-0000000000e1', '00000000-0000-4000-9800-0000000000c1',
          '00000000-0000-4000-9800-00000000000a', p_month, 400, 'EGP', 'pending', p_month + 35)
  returning id
$$;
create function pg_temp.states(p_course uuid) returns text language sql as $$
  select string_agg(x ->> 'state', ',') from jsonb_array_elements(public.course_catalog_for_family()) c, jsonb_array_elements(c -> 'children') x
   where (c ->> 'id')::uuid = p_course
$$;

-- Laila (both parents' custody; her mother is the main parent) and Omar (another family); an admin.
-- Swimming takes one child (Laila is in it), Art has room, Old Music ended.
insert into public.nurseries (id, name_ar, name_en) values ('00000000-0000-4000-9800-00000000000a', 'حضانة', 'Course Nursery');
insert into public.children (id, nursery_id, full_name_ar, full_name_en, dob, status, enrollment_date, custody_status) values
  ('00000000-0000-4000-9800-0000000000c1', '00000000-0000-4000-9800-00000000000a', 'ليلى', 'Laila', '2022-01-01', 'active', '2026-01-01', 'both_parents'),
  ('00000000-0000-4000-9800-0000000000c2', '00000000-0000-4000-9800-00000000000a', 'عمر', 'Omar', '2022-01-01', 'active', '2026-01-01', 'both_parents');
insert into auth.users (id, email) values
  ('00000000-0000-4000-9800-000000000a01', 'course.admin@test.local'),
  ('00000000-0000-4000-9800-000000000a02', 'course.mother@test.local'),
  ('00000000-0000-4000-9800-000000000a03', 'course.father@test.local'),
  ('00000000-0000-4000-9800-000000000a04', 'course.other@test.local');
update public.users u set role = v.role::public.user_role, nursery_id = '00000000-0000-4000-9800-00000000000a', status = 'active'
  from (values ('00000000-0000-4000-9800-000000000a01', 'branch_admin'), ('00000000-0000-4000-9800-000000000a02', 'parent'),
               ('00000000-0000-4000-9800-000000000a03', 'parent'), ('00000000-0000-4000-9800-000000000a04', 'parent')) as v(id, role)
 where u.id = v.id::uuid;
insert into public.parent_children (parent_id, child_id, is_primary) values
  ('00000000-0000-4000-9800-000000000a03', '00000000-0000-4000-9800-0000000000c1', false),
  ('00000000-0000-4000-9800-000000000a02', '00000000-0000-4000-9800-0000000000c1', true),
  ('00000000-0000-4000-9800-000000000a04', '00000000-0000-4000-9800-0000000000c2', true);
insert into public.courses (id, nursery_id, title_ar, title_en, category, price_per_month, max_students, status, ends_on) values
  ('00000000-0000-4000-9800-0000000000f1', '00000000-0000-4000-9800-00000000000a', 'سباحة', 'Swimming', 'sport', 400, 1, 'active', null),
  ('00000000-0000-4000-9800-0000000000f2', '00000000-0000-4000-9800-00000000000a', 'رسم', 'Art', 'art', 250, null, 'active', null),
  ('00000000-0000-4000-9800-0000000000f3', '00000000-0000-4000-9800-00000000000a', 'موسيقى', 'Old Music', 'music', 300, null, 'active', current_date - 30);
insert into public.course_enrollments (id, course_id, child_id, status) values
  ('00000000-0000-4000-9800-0000000000e1', '00000000-0000-4000-9800-0000000000f1', '00000000-0000-4000-9800-0000000000c1', 'active');

-- 1. Bills
select set_config('test.b1', pg_temp.bill('2026-11-01')::text, true);
select set_config('test.i1', (select invoice_id::text from public.course_invoices where id = current_setting('test.b1')::uuid), true);
select isnt(current_setting('test.i1', true), null, 'a new course bill is also an invoice');
select is((select parent_id::text || ' ' || invoice_type || ' ' || amount::int || ' ' || status from public.invoices where id = current_setting('test.i1')::uuid),
  '00000000-0000-4000-9800-000000000a02 course 400 pending', 'billed to the main parent, as a course, for the bill''s amount');
select is((select string_agg(distinct action_link, ',') from public.notifications where type = 'course_invoice_new' and nursery_id = '00000000-0000-4000-9800-00000000000a'),
  '/parent/invoices/' || current_setting('test.i1'), 'the family''s notice opens the invoice');
select pg_temp.act_as('00000000-0000-4000-9800-000000000a03');
select ok(public.parent_can_pay_invoice(current_setting('test.i1')::uuid), 'the other parent may pay it too');
select pg_temp.act_as('00000000-0000-4000-9800-000000000a01');
select lives_ok($$ select public.admin_record_invoice_payment(current_setting('test.i1')::uuid, 400, 'cash', now(), null) $$, 'the invoice is paid');
reset role;
select is((select status from public.course_invoices where id = current_setting('test.b1')::uuid), 'paid', 'and the course bill is paid');

select set_config('test.b2', pg_temp.bill('2026-12-01')::text, true);
select pg_temp.act_as('00000000-0000-4000-9800-000000000a01');
update public.course_invoices set status = 'paid', paid_at = now() where id = current_setting('test.b2')::uuid;
reset role;
select is((select i.status || ' ' || public.invoice_paid_total(i.id)::int from public.invoices i join public.course_invoices ci on ci.invoice_id = i.id
            where ci.id = current_setting('test.b2')::uuid), 'paid 400', 'the admin marking a bill paid records the payment on its invoice');

select set_config('test.b3', pg_temp.bill('2027-01-01')::text, true);
select pg_temp.act_as('00000000-0000-4000-9800-000000000a01');
update public.course_invoices set status = 'waived' where id = current_setting('test.b3')::uuid;
reset role;
select is((select i.status from public.invoices i join public.course_invoices ci on ci.invoice_id = i.id where ci.id = current_setting('test.b3')::uuid),
  'cancelled', 'waiving it cancels its invoice');

-- 2. The catalog and the requests
select pg_temp.act_as('00000000-0000-4000-9800-000000000a03');
select is((select string_agg(c ->> 'title_en' || ' ' || (c ->> 'enrolled') || '/' || coalesce(c ->> 'max_students', '-'), ', ')
             from jsonb_array_elements(public.course_catalog_for_family()) c),
  'Art 0/-, Swimming 1/1', 'a family reads the open courses with their places');
select is(pg_temp.states('00000000-0000-4000-9800-0000000000f1') || ' / ' || pg_temp.states('00000000-0000-4000-9800-0000000000f2'),
  'enrolled / none', 'and where its child stands in each');
select set_config('test.r1', public.course_request_enrollment('00000000-0000-4000-9800-0000000000f2', '00000000-0000-4000-9800-0000000000c1', 'She loves drawing')::text, true);
select is(pg_temp.states('00000000-0000-4000-9800-0000000000f2'), 'pending', 'asking to enrol makes it pending');
select throws_ok($$ select public.course_request_enrollment('00000000-0000-4000-9800-0000000000f2', '00000000-0000-4000-9800-0000000000c1') $$,
  'P0001', 'course_already_requested', 'not twice');
select throws_ok($$ select public.course_request_enrollment('00000000-0000-4000-9800-0000000000f1', '00000000-0000-4000-9800-0000000000c1') $$,
  'P0001', 'course_already_enrolled', 'not for a course the child is in');
select throws_ok($$ select public.course_request_enrollment('00000000-0000-4000-9800-0000000000f3', '00000000-0000-4000-9800-0000000000c1') $$,
  'P0001', 'course_not_open', 'not for an ended course');
select throws_ok($$ select public.course_request_decide(current_setting('test.r1')::uuid, true) $$, '42501', 'course_forbidden', 'a parent does not answer requests');
select pg_temp.act_as('00000000-0000-4000-9800-000000000a04');
select throws_ok($$ select public.course_request_enrollment('00000000-0000-4000-9800-0000000000f2', '00000000-0000-4000-9800-0000000000c1') $$,
  '42501', 'course_forbidden', 'another family does not ask for our child');
select throws_ok($$ select public.course_request_enrollment('00000000-0000-4000-9800-0000000000f1', '00000000-0000-4000-9800-0000000000c2') $$,
  'P0001', 'course_full', 'nor for a full course');
select is((select count(*)::int from public.course_enrollment_requests), 0, 'and reads none of ours');
reset role;
select is((select count(*)::int || ' ' || min(action_link) from public.notifications where type = 'course_request_new' and user_id = '00000000-0000-4000-9800-000000000a01'),
  '1 /admin/courses/00000000-0000-4000-9800-0000000000f2?tab=requests', 'the admin hears of the request, opening the course''s requests');

select pg_temp.act_as('00000000-0000-4000-9800-000000000a01');
select lives_ok($$ select public.course_request_decide(current_setting('test.r1')::uuid, true, 'Welcome!') $$, 'the admin approves it');
reset role;
select is((select status from public.course_enrollments where course_id = '00000000-0000-4000-9800-0000000000f2' and child_id = '00000000-0000-4000-9800-0000000000c1'),
  'active', 'and the child is enrolled');
select is((select count(*)::int || ' ' || min(template_params ->> 'note') from public.notifications where type = 'course_request_approved'),
  '2 Welcome!', 'both parents hear the answer, with the note');
select pg_temp.act_as('00000000-0000-4000-9800-000000000a01');
select throws_ok($$ select public.course_request_decide(current_setting('test.r1')::uuid, false) $$, 'P0001', 'course_request_closed', 'an answered request stays answered');

-- Withdrawn
update public.courses set max_students = 2 where id = '00000000-0000-4000-9800-0000000000f1';
select pg_temp.act_as('00000000-0000-4000-9800-000000000a04');
select set_config('test.r2', public.course_request_enrollment('00000000-0000-4000-9800-0000000000f1', '00000000-0000-4000-9800-0000000000c2')::text, true);
select lives_ok($$ select public.course_request_cancel(current_setting('test.r2')::uuid) $$, 'the family withdraws a request');
select is(pg_temp.states('00000000-0000-4000-9800-0000000000f1'), 'none', 'and it is no longer pending');
reset role;
select is((select count(*)::int from public.course_enrollment_requests), 2, 'requests are kept, answered or withdrawn');

select * from finish();
rollback;

-- Database test · the family is told when the nursery sends a term report (once, when first sent;
-- a draft tells no one) and when it bills a course month (a waived bill tells no one). Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

create function pg_temp.told(p_type text) returns text language sql as $$
  select coalesce(string_agg(u.email || ' ' || n.action_link, ', ' order by u.email), '-')
    from public.notifications n join auth.users u on u.id = n.user_id
   where n.type = p_type and n.nursery_id = '00000000-0000-4000-9d00-00000000000a'
$$;

-- A child with two parents, a report template and a course.
insert into public.nurseries (id, name_ar, name_en) values ('00000000-0000-4000-9d00-00000000000a', 'حضانة', 'Notices Nursery');
insert into public.children (id, nursery_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-9d00-0000000000c1', '00000000-0000-4000-9d00-00000000000a', 'ليلى', 'Laila', '2023-01-01', 'active', '2026-01-01');
insert into auth.users (id, email) values
  ('00000000-0000-4000-9d00-000000000a01', 'a.mother@test.local'),
  ('00000000-0000-4000-9d00-000000000a02', 'b.father@test.local');
update public.users set role = 'parent', nursery_id = '00000000-0000-4000-9d00-00000000000a', status = 'active'
 where id in ('00000000-0000-4000-9d00-000000000a01', '00000000-0000-4000-9d00-000000000a02');
insert into public.parent_children (parent_id, child_id) values
  ('00000000-0000-4000-9d00-000000000a01', '00000000-0000-4000-9d00-0000000000c1'),
  ('00000000-0000-4000-9d00-000000000a02', '00000000-0000-4000-9d00-0000000000c1');
insert into public.quarterly_report_templates (id, nursery_id) values
  ('00000000-0000-4000-9d00-0000000000e1', '00000000-0000-4000-9d00-00000000000a');
insert into public.courses (id, nursery_id, title_ar, title_en, category, price_per_month, status) values
  ('00000000-0000-4000-9d00-0000000000f1', '00000000-0000-4000-9d00-00000000000a', 'سباحة', 'Swimming', 'sport', 400, 'active');
insert into public.course_enrollments (id, course_id, child_id, status) values
  ('00000000-0000-4000-9d00-0000000000f2', '00000000-0000-4000-9d00-0000000000f1', '00000000-0000-4000-9d00-0000000000c1', 'active');

-- Term report: a draft, then sent, then corrected.
insert into public.quarterly_reports (id, nursery_id, template_id, child_id, term_label, status) values
  ('00000000-0000-4000-9d00-0000000000d1', '00000000-0000-4000-9d00-00000000000a', '00000000-0000-4000-9d00-0000000000e1',
   '00000000-0000-4000-9d00-0000000000c1', 'Term 1', 'draft');
select is(pg_temp.told('quarterly_report_sent'), '-', 'a draft report tells no one');
update public.quarterly_reports set status = 'sent', sent_at = now() where id = '00000000-0000-4000-9d00-0000000000d1';
select is(pg_temp.told('quarterly_report_sent'),
  'a.mother@test.local /parent/quarterly-reports?report=00000000-0000-4000-9d00-0000000000d1, b.father@test.local /parent/quarterly-reports?report=00000000-0000-4000-9d00-0000000000d1',
  'sending it tells both parents, opening the report');
select is((select template_params from public.notifications where type = 'quarterly_report_sent' limit 1),
  '{"term": "Term 1", "child": {"ar": "ليلى", "en": "Laila"}}'::jsonb, 'naming the child and the term');
update public.quarterly_reports set comment = 'A lovely term' where id = '00000000-0000-4000-9d00-0000000000d1';
update public.quarterly_reports set status = 'sent' where id = '00000000-0000-4000-9d00-0000000000d1';
select is((select count(*)::int from public.notifications where type = 'quarterly_report_sent'), 2, 'a change to a sent report does not tell them again');
insert into public.quarterly_reports (nursery_id, template_id, child_id, term_label, status, sent_at) values
  ('00000000-0000-4000-9d00-00000000000a', '00000000-0000-4000-9d00-0000000000e1', '00000000-0000-4000-9d00-0000000000c1', 'Term 2', 'sent', now());
select is((select count(*)::int from public.notifications where type = 'quarterly_report_sent'), 4, 'a report saved and sent at once tells them too');

-- Course bills.
insert into public.course_invoices (course_id, enrollment_id, child_id, nursery_id, billing_month, amount, currency, status, due_date) values
  ('00000000-0000-4000-9d00-0000000000f1', '00000000-0000-4000-9d00-0000000000f2', '00000000-0000-4000-9d00-0000000000c1',
   '00000000-0000-4000-9d00-00000000000a', '2026-12-01', 400, 'EGP', 'pending', '2027-01-05');
select is(pg_temp.told('course_invoice_new'),
  'a.mother@test.local /parent/courses?tab=invoices, b.father@test.local /parent/courses?tab=invoices', 'a new course bill tells both parents');
select is((select template_params - 'child' - 'course' from public.notifications where type = 'course_invoice_new' limit 1),
  '{"month": "2026-12", "amount": 400, "currency": "EGP", "due_date": "2027-01-05"}'::jsonb, 'with the month, the amount and the due day');
select is((select template_params -> 'course' ->> 'en' from public.notifications where type = 'course_invoice_new' limit 1), 'Swimming', 'and the course');
insert into public.course_invoices (course_id, enrollment_id, child_id, nursery_id, billing_month, amount, currency, status) values
  ('00000000-0000-4000-9d00-0000000000f1', '00000000-0000-4000-9d00-0000000000f2', '00000000-0000-4000-9d00-0000000000c1',
   '00000000-0000-4000-9d00-00000000000a', '2027-01-01', 400, 'EGP', 'waived');
select is((select count(*)::int from public.notifications where type = 'course_invoice_new'), 2, 'a waived bill tells no one');

select * from finish();
rollback;

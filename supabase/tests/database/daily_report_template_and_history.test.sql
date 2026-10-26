-- Database test · The daily report as the family receives it: meals in quarters of the plate, the
-- day's reports prepared at opening time with the child's data, the sender kept on each sent report
-- (and named in the family's notice), the parent's reports, the teacher's history by day, class and
-- child, and who may read what.
-- Everything runs in one transaction that is rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(34);

-- Nursery A opens at midnight, so its day's reports are due to be prepared already; nursery B works
-- every day but today, so nothing is prepared there.
insert into public.nurseries (id, name_ar, name_en, working_days) values
  ('00000000-0000-4000-7000-00000000000a', 'حضانة أ', 'Nursery A', '["sun","mon","tue","wed","thu","fri","sat"]'),
  ('00000000-0000-4000-7000-00000000000b', 'حضانة ب', 'Nursery B',
   (select jsonb_agg(d) from unnest(array['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']) d
     where d <> (array['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])[extract(dow from (now() at time zone 'Africa/Cairo')::date)::integer + 1]));
update public.nursery_settings set standard_start_time = '00:00', timezone = 'Africa/Cairo'
 where nursery_id in ('00000000-0000-4000-7000-00000000000a', '00000000-0000-4000-7000-00000000000b');

insert into auth.users (id, email) values
  ('00000000-0000-4000-7000-000000000a01', 'tpl.admin@test.local'),
  ('00000000-0000-4000-7000-000000000a03', 'tpl.sara@test.local'),
  ('00000000-0000-4000-7000-000000000a04', 'tpl.nadia@test.local'),
  ('00000000-0000-4000-7000-000000000a06', 'tpl.mona@test.local'),
  ('00000000-0000-4000-7000-000000000b04', 'tpl.other@test.local');

update public.users u
   set role = v.role::public.user_role, nursery_id = v.nursery_id::uuid, name_ar = v.name_ar, name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-7000-000000000a01', 'branch_admin', '00000000-0000-4000-7000-00000000000a', 'المديرة', 'Head Admin'),
    ('00000000-0000-4000-7000-000000000a03', 'teacher',      '00000000-0000-4000-7000-00000000000a', 'سارة', 'Sara'),
    ('00000000-0000-4000-7000-000000000a04', 'teacher',      '00000000-0000-4000-7000-00000000000a', 'نادية', 'Nadia'),
    ('00000000-0000-4000-7000-000000000a06', 'parent',       '00000000-0000-4000-7000-00000000000a', 'منى', 'Mona'),
    ('00000000-0000-4000-7000-000000000b04', 'teacher',      '00000000-0000-4000-7000-00000000000b', 'أخرى', 'Other')
  ) as v(id, role, nursery_id, name_ar, name_en)
 where u.id = v.id::uuid;

insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-7000-0000000000e1', '00000000-0000-4000-7000-00000000000a', 'الفراشات', 'Butterflies'),
  ('00000000-0000-4000-7000-0000000000e2', '00000000-0000-4000-7000-00000000000a', 'النجوم', 'Stars'),
  ('00000000-0000-4000-7000-0000000000f1', '00000000-0000-4000-7000-00000000000b', 'الأقمار', 'Moons');
insert into public.class_staff (class_id, user_id, role) values
  ('00000000-0000-4000-7000-0000000000e1', '00000000-0000-4000-7000-000000000a04', 'lead'),
  ('00000000-0000-4000-7000-0000000000e2', '00000000-0000-4000-7000-000000000a03', 'lead'),
  ('00000000-0000-4000-7000-0000000000f1', '00000000-0000-4000-7000-000000000b04', 'lead');

-- Laila and Omar are in Butterflies, Adam in Stars. Not prepared: Sami (left), Huda (no class yet),
-- Yara (starts next month), Badr (nursery B, closed today).
insert into public.children (id, nursery_id, full_name_ar, full_name_en, dob, status, enrollment_date, class_id) values
  ('00000000-0000-4000-7000-0000000000c1', '00000000-0000-4000-7000-00000000000a', 'ليلى', 'Laila', '2023-01-01', 'active', '2026-01-01', '00000000-0000-4000-7000-0000000000e1'),
  ('00000000-0000-4000-7000-0000000000c2', '00000000-0000-4000-7000-00000000000a', 'عمر', 'Omar', '2023-01-01', 'active', '2026-01-01', '00000000-0000-4000-7000-0000000000e1'),
  ('00000000-0000-4000-7000-0000000000c3', '00000000-0000-4000-7000-00000000000a', 'آدم', 'Adam', '2023-01-01', 'active', '2026-01-01', '00000000-0000-4000-7000-0000000000e2'),
  ('00000000-0000-4000-7000-0000000000c4', '00000000-0000-4000-7000-00000000000a', 'سامي', 'Sami', '2023-01-01', 'inactive', '2026-01-01', '00000000-0000-4000-7000-0000000000e1'),
  ('00000000-0000-4000-7000-0000000000c5', '00000000-0000-4000-7000-00000000000a', 'هدى', 'Huda', '2023-01-01', 'active', '2026-01-01', null),
  ('00000000-0000-4000-7000-0000000000c6', '00000000-0000-4000-7000-00000000000a', 'يارا', 'Yara', '2023-01-01', 'active', (now() at time zone 'Africa/Cairo')::date + 30, '00000000-0000-4000-7000-0000000000e1'),
  ('00000000-0000-4000-7000-0000000000c7', '00000000-0000-4000-7000-00000000000b', 'بدر', 'Badr', '2023-01-01', 'active', '2026-01-01', '00000000-0000-4000-7000-0000000000f1');
insert into public.parent_children (parent_id, child_id, relationship, is_primary) values
  ('00000000-0000-4000-7000-000000000a06', '00000000-0000-4000-7000-0000000000c1', 'mother', true);

-- Laila and Adam came today; Omar stays home.
alter table public.attendance_records disable trigger attendance_qr_working_hours_guard;
insert into public.attendance_records (child_id, attendance_date, check_in, check_in_method) values
  ('00000000-0000-4000-7000-0000000000c1', (now() at time zone 'Africa/Cairo')::date, now() - interval '3 hours', 'manual'),
  ('00000000-0000-4000-7000-0000000000c3', (now() at time zone 'Africa/Cairo')::date, now() - interval '3 hours', 'manual');
alter table public.attendance_records enable trigger attendance_qr_working_hours_guard;

-- A report sent before this change (nothing kept on it), for the fallbacks: started and sent by Nadia.
insert into public.daily_reports (child_id, report_date, nursery_id, status, published_at, teacher_id, submitted_by, mood_json,
  meals_json, nap_json, toilet_json, activities_json) values
  ('00000000-0000-4000-7000-0000000000c1', '2026-09-01', '00000000-0000-4000-7000-00000000000a', 'published', '2026-09-01 14:00+00',
   '00000000-0000-4000-7000-000000000a04', '00000000-0000-4000-7000-000000000a04', '{"mood":"content"}',
   '{"breakfast":{"amount":"all"},"lunch":{"amount":"some"},"snacks":{"amount":"none"}}', '{"napped":false}', '{"change_count":1}', '{"tags":["art"]}');

create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Africa/Cairo')::date $$;

create function pg_temp.complete() returns jsonb language sql as $$
  select '{"meals":{"breakfast":{"amount":"quarter"},"lunch":{"amount":"three_quarters"},"snacks":{"amount":"half"}},
           "nap":{"napped":true,"duration_minutes":150,"quality":"good"},"mood":{"mood":"happy"},
           "toilet":{"change_count":2},"activities":{"tags":["music"]}}'::jsonb
$$;

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Meals in quarters of the plate
select is(cardinality(public.daily_report_missing(pg_temp.complete()->'meals', pg_temp.complete()->'nap', pg_temp.complete()->'mood', pg_temp.complete()->'toilet', pg_temp.complete()->'activities')),
  0, 'a quarter, half and three quarters of the plate answer the meal questions');
select is(array_to_string(public.daily_report_missing('{"breakfast":{"amount":"lots"},"lunch":{"amount":"some"},"snacks":{"amount":"all"}}', '{"napped":false}', '{"mood":"happy"}', '{"change_count":0}', '{"tags":["art"]}'), ','),
  'breakfast', 'any other word is not an answer; the old "some" still is');

-- ---------------------------------------------------------------------------------------------
-- The day's reports, prepared at opening time
select is(public.prepare_daily_reports() >= 3, true, 'at opening time the day''s reports are prepared');
select is(
  (select string_agg(format('%s %s %s %s', c.full_name_en, dr.status, dr.class_name_en, dr.child_code = c.child_id_number), '; ' order by c.full_name_en)
     from public.daily_reports dr join public.children c on c.id = dr.child_id
    where dr.report_date = pg_temp.today() and dr.prepared_at is not null
      and c.nursery_id in ('00000000-0000-4000-7000-00000000000a', '00000000-0000-4000-7000-00000000000b')),
  'Adam draft Stars t; Laila draft Butterflies t; Omar draft Butterflies t',
  'one per active child of a class, with the child''s code and class (not a child who left, has no class, starts later, or whose nursery is closed)'
);
select is(
  (select count(*)::int from public.daily_reports dr where dr.report_date = pg_temp.today() and dr.teacher_id is null and dr.last_saved_at is null
      and dr.child_id in ('00000000-0000-4000-7000-0000000000c1', '00000000-0000-4000-7000-0000000000c2', '00000000-0000-4000-7000-0000000000c3')),
  3, 'nobody has written them yet');
select is(public.prepare_daily_reports(), 0, 'running again prepares nothing twice');

select pg_temp.act_as('00000000-0000-4000-7000-000000000a04');
select is(
  (select string_agg(format('%s %s %s %s', d.full_name_en, d.attendance, d.status, coalesce(d.last_saved_at::text, 'never saved')), '; ' order by d.full_name_en)
     from public.get_my_daily_reports() d),
  'Laila partial none never saved; Omar absent none never saved; Yara not_enrolled none never saved',
  'a prepared report nobody saved is "not started", so a child who stayed home is not expected'
);

-- ---------------------------------------------------------------------------------------------
-- Writing and sending keeps the child's data and the sender
select is(
  (select format('%s/%s', r->>'answered', r->>'required') from public.save_daily_report('00000000-0000-4000-7000-0000000000c1', pg_temp.today(), pg_temp.complete()) r),
  '7/7', 'the teacher fills in the prepared report');
select is(
  (select format('%s %s', dr.teacher_id = '00000000-0000-4000-7000-000000000a04', dr.last_saved_by = '00000000-0000-4000-7000-000000000a04')
     from public.daily_reports dr where dr.child_id = '00000000-0000-4000-7000-0000000000c1' and dr.report_date = pg_temp.today()),
  't t', 'and becomes its teacher');
select is(
  (select d.status from public.get_my_daily_reports() d where d.full_name_en = 'Laila'),
  'draft', 'and it shows as started');
select is(
  (select format('sent %s', r->>'sent_count') from public.send_daily_reports(array[(select id from public.daily_reports where child_id = '00000000-0000-4000-7000-0000000000c1' and report_date = pg_temp.today())]) r),
  'sent 1', 'and sends it');

reset role;
select is(
  (select format('%s | %s | %s %s | %s | %s', dr.sender_name_en, dr.sender_name_ar, dr.sender_role, dr.sender_class_role, dr.class_name_en, dr.child_code = c.child_id_number)
     from public.daily_reports dr join public.children c on c.id = dr.child_id
    where dr.child_id = '00000000-0000-4000-7000-0000000000c1' and dr.report_date = pg_temp.today()),
  'Nadia | نادية | teacher lead | Butterflies | t',
  'the sent report keeps who sent it (name, role, place in the class) and the child''s code and class'
);
select is(
  (select format('%s %s %s', n.template_key, n.template_params->'sender'->>'en', n.template_params->'child'->>'en') from public.notifications n
    where n.user_id = '00000000-0000-4000-7000-000000000a06' and n.type = 'daily_report'),
  'daily_report_sent_by Nadia Laila',
  'the family''s notice names the sender'
);

-- Later Laila moves up to Stars, and Nadia leaves Butterflies.
update public.children set class_id = '00000000-0000-4000-7000-0000000000e2' where id = '00000000-0000-4000-7000-0000000000c1';
delete from public.class_staff where user_id = '00000000-0000-4000-7000-000000000a04';

-- ---------------------------------------------------------------------------------------------
-- The family's reports
select pg_temp.act_as('00000000-0000-4000-7000-000000000a06');
select is(
  (select string_agg(format('%s %s %s by %s (%s, %s)', r.full_name_en, r.report_date = pg_temp.today(), r.class_name_en, r.sender_name_en, r.sender_role, r.sender_class_role), '; ' order by r.report_date desc)
     from public.get_parent_daily_reports() r),
  'Laila t Butterflies by Nadia (teacher, lead); Laila f Stars by Nadia (teacher, )',
  'a parent reads their child''s sent reports with the class and sender of that day; an older report falls back to the current class and to whoever sent it'
);
select is(
  (select r.meals_json->'lunch'->>'amount' from public.get_parent_daily_reports(null, pg_temp.today(), pg_temp.today()) r),
  'three_quarters', 'by day, with the answers');
select is((select count(*)::int from public.get_parent_daily_reports('00000000-0000-4000-7000-0000000000c2')), 0,
  'never another family''s child');
select throws_ok(
  $$ select * from public.get_parent_daily_reports(null, '2026-10-02', '2026-10-01') $$,
  '22023', 'daily_report_date_invalid', 'a period must run forwards');
select throws_ok(
  $$ select * from public.daily_report_cards $$,
  '42501', null, 'the report view itself is not open to users');

-- ---------------------------------------------------------------------------------------------
-- The teacher's history
select pg_temp.act_as('00000000-0000-4000-7000-000000000a04');
select is(
  (select string_agg(format('%s %s %s', h.full_name_en, h.report_date = pg_temp.today(), h.total_count), '; ') from public.get_daily_report_history(pg_temp.today(), pg_temp.today()) h),
  'Laila t 1',
  'a teacher finds a day''s sent report, still after leaving that class (they sent it)'
);
select is((select count(*)::int from public.get_daily_report_history('2026-01-01', pg_temp.today(), null, 'LAI') h), 2, 'by name, in any case');
select is(
  (select count(*)::int from public.get_daily_report_history('2026-01-01', pg_temp.today(), null,
     (select child_id_number from public.children where id = '00000000-0000-4000-7000-0000000000c1')) h),
  2, 'by the child''s code');
select is((select count(*)::int from public.get_daily_report_history('2026-01-01', pg_temp.today(), null, '%') h), 0,
  'a % in the search is a plain character, not a wildcard');
select is(
  (select format('%s of %s', count(*), max(h.total_count)) from public.get_daily_report_history('2026-01-01', pg_temp.today(), null, null, 1, 0) h),
  '1 of 2', 'a page at a time, with the total');
select is((select count(*)::int from public.get_daily_report_history('2026-01-01', pg_temp.today(), '00000000-0000-4000-7000-0000000000e1') h), 1,
  'by class: a report stays under the class it was written in, after the child moved up');
select throws_ok(
  $$ select * from public.get_daily_report_history('2025-01-01', '2026-10-01') $$,
  '22023', 'daily_report_date_invalid', 'a period of at most a year');
select is(
  (select format('%s | %s | %s | %s', r->>'child_code' is not null, r->>'class_name_en', r->>'sender_name_en', r->>'sender_class_role')
     from public.get_daily_report('00000000-0000-4000-7000-0000000000c1', pg_temp.today()) r),
  't | Butterflies | Nadia | lead',
  'and opens it, with the child''s data and the sender'
);

-- Sara now teaches Laila but did not send that report, written in another class.
select pg_temp.act_as('00000000-0000-4000-7000-000000000a03');
select is((select count(*)::int from public.get_daily_report_history('2026-01-01', pg_temp.today()) h), 1,
  'another teacher sees only their own classes'' reports (the old one fell back to Laila''s current class, Stars)');
select is(
  (select r->>'sender_name_en' from public.get_daily_report('00000000-0000-4000-7000-0000000000c1', pg_temp.today()) r),
  'Nadia', 'Laila''s current teacher can still open her report through the class guard');

select pg_temp.act_as('00000000-0000-4000-7000-000000000b04');
select is((select count(*)::int from public.get_daily_report_history('2026-01-01', pg_temp.today()) h), 0,
  'never another nursery''s reports');
select throws_ok(
  $$ select public.get_daily_report('00000000-0000-4000-7000-0000000000c1', (now() at time zone 'Africa/Cairo')::date) $$,
  '42501', 'daily_report_forbidden', 'nor open one');

select pg_temp.act_as('00000000-0000-4000-7000-000000000a01');
select is((select count(*)::int from public.get_daily_report_history('2026-01-01', pg_temp.today()) h), 2,
  'the nursery''s admin sees all its sent reports');

select pg_temp.act_as('00000000-0000-4000-7000-000000000a06');
select throws_ok(
  $$ select * from public.get_daily_report_history('2026-01-01', '2026-10-01') $$,
  '42501', 'daily_report_forbidden', 'a parent has no teacher history');

-- ---------------------------------------------------------------------------------------------
-- The send rate does not count an untouched prepared report as a draft
select pg_temp.act_as('00000000-0000-4000-7000-000000000a01');
select is(
  (select format('drafts %s, missing %s', s->'totals'->>'drafts', (select string_agg(format('%s %s', m->>'name_en', m->>'status'), ', ') from jsonb_array_elements(s->'missing') m))
     from public.get_daily_report_stats('00000000-0000-4000-7000-00000000000a', pg_temp.today(), pg_temp.today()) s),
  'drafts 0, missing Adam none',
  'Adam came and nobody started his report: missing, not a draft'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.get_parent_daily_reports(uuid, date, date, integer)', 'execute')
  and not has_function_privilege('anon', 'public.get_daily_report_history(date, date, uuid, text, integer, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.prepare_daily_reports()', 'execute')
  and not has_table_privilege('authenticated', 'public.daily_report_cards', 'select'),
  'signed-out visitors cannot call them; preparing is internal; the view is closed'
);

select * from finish();
rollback;

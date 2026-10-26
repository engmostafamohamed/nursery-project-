-- Database test · The daily report: the seven required questions, saving through the day, sending
-- only complete reports (by any way), the family's notice, the end-of-day reminder, the teacher's day
-- and the send rate for the admin and the head of teachers.
-- Everything runs in one transaction that is rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(28);

insert into public.nurseries (id, name_ar, name_en, working_days) values
  ('00000000-0000-4000-6000-00000000000a', 'حضانة أ', 'Nursery A', '["sun","mon","tue","wed","thu","fri","sat"]'),
  ('00000000-0000-4000-6000-00000000000b', 'حضانة ب', 'Nursery B', '["sun","mon","tue","wed","thu","fri","sat"]');

-- Reports are due at 01:00, so the reminder (an hour before) is due all day.
update public.nursery_settings set end_of_day_checklist_time = '01:00', timezone = 'Africa/Cairo'
 where nursery_id = '00000000-0000-4000-6000-00000000000a';

insert into auth.users (id, email) values
  ('00000000-0000-4000-6000-000000000a01', 'dr.admin@test.local'),
  ('00000000-0000-4000-6000-000000000a02', 'dr.head@test.local'),
  ('00000000-0000-4000-6000-000000000a03', 'dr.sara@test.local'),
  ('00000000-0000-4000-6000-000000000a04', 'dr.nadia@test.local'),
  ('00000000-0000-4000-6000-000000000a06', 'dr.mona@test.local');

update public.users u
   set role = v.role::public.user_role, nursery_id = v.nursery_id::uuid, name_ar = v.name_ar, name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-6000-000000000a01', 'branch_admin', '00000000-0000-4000-6000-00000000000a', 'المديرة', 'Head Admin'),
    ('00000000-0000-4000-6000-000000000a02', 'teacher',      '00000000-0000-4000-6000-00000000000a', 'رئيسة المعلمات', 'Head Teacher'),
    ('00000000-0000-4000-6000-000000000a03', 'teacher',      '00000000-0000-4000-6000-00000000000a', 'سارة', 'Sara'),
    ('00000000-0000-4000-6000-000000000a04', 'teacher',      '00000000-0000-4000-6000-00000000000a', 'نادية', 'Nadia'),
    ('00000000-0000-4000-6000-000000000a06', 'parent',       '00000000-0000-4000-6000-00000000000a', 'منى', 'Mona')
  ) as v(id, role, nursery_id, name_ar, name_en)
 where u.id = v.id::uuid;
update public.users set role_id = (select id from public.roles where nursery_id = '00000000-0000-4000-6000-00000000000a' and key = 'head_teacher')
 where id = '00000000-0000-4000-6000-000000000a02';

insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-6000-0000000000e1', '00000000-0000-4000-6000-00000000000a', 'الفراشات', 'Butterflies'),
  ('00000000-0000-4000-6000-0000000000e2', '00000000-0000-4000-6000-00000000000a', 'النجوم', 'Stars');
insert into public.class_staff (class_id, user_id, role) values
  ('00000000-0000-4000-6000-0000000000e1', '00000000-0000-4000-6000-000000000a04', 'lead'),
  ('00000000-0000-4000-6000-0000000000e2', '00000000-0000-4000-6000-000000000a03', 'lead');

insert into public.children (id, nursery_id, full_name_ar, full_name_en, dob, status, enrollment_date, class_id) values
  ('00000000-0000-4000-6000-0000000000c1', '00000000-0000-4000-6000-00000000000a', 'ليلى', 'Laila', '2023-01-01', 'active', '2026-01-01', '00000000-0000-4000-6000-0000000000e1'),
  ('00000000-0000-4000-6000-0000000000c2', '00000000-0000-4000-6000-00000000000a', 'عمر', 'Omar', '2023-01-01', 'active', '2026-01-01', '00000000-0000-4000-6000-0000000000e1'),
  ('00000000-0000-4000-6000-0000000000c3', '00000000-0000-4000-6000-00000000000a', 'آدم', 'Adam', '2023-01-01', 'active', '2026-01-01', '00000000-0000-4000-6000-0000000000e2');
insert into public.parent_children (parent_id, child_id, relationship, is_primary) values
  ('00000000-0000-4000-6000-000000000a06', '00000000-0000-4000-6000-0000000000c1', 'mother', true);

-- Laila and Omar came today; Adam did not. On 1 and 2 September Laila and (on the 1st) Omar came.
alter table public.attendance_records disable trigger attendance_qr_working_hours_guard;
insert into public.attendance_records (child_id, attendance_date, check_in, check_in_method) values
  ('00000000-0000-4000-6000-0000000000c1', (now() at time zone 'Africa/Cairo')::date, now() - interval '3 hours', 'manual'),
  ('00000000-0000-4000-6000-0000000000c2', (now() at time zone 'Africa/Cairo')::date, now() - interval '3 hours', 'manual'),
  ('00000000-0000-4000-6000-0000000000c1', '2026-09-01', '2026-09-01 06:00+00', 'manual'),
  ('00000000-0000-4000-6000-0000000000c1', '2026-09-02', '2026-09-02 06:00+00', 'manual'),
  ('00000000-0000-4000-6000-0000000000c2', '2026-09-01', '2026-09-01 06:00+00', 'manual');
alter table public.attendance_records enable trigger attendance_qr_working_hours_guard;

create function pg_temp.complete() returns jsonb language sql as $$
  select '{"meals":{"breakfast":{"amount":"all"},"lunch":{"amount":"some"},"snacks":{"amount":"none"}},
           "nap":{"napped":true,"duration_minutes":60,"quality":"good"},"mood":{"mood":"happy"},
           "toilet":{"change_count":0},"activities":{"tags":["art"]}}'::jsonb
$$;

-- Laila's 1 September report was sent that day, her 2 September one the next day; Omar's is missing.
insert into public.daily_reports (child_id, report_date, nursery_id, status, published_at, meals_json, nap_json, mood_json, toilet_json, activities_json) values
  ('00000000-0000-4000-6000-0000000000c1', '2026-09-01', '00000000-0000-4000-6000-00000000000a', 'published', '2026-09-01 14:00+00',
   pg_temp.complete()->'meals', pg_temp.complete()->'nap', pg_temp.complete()->'mood', pg_temp.complete()->'toilet', pg_temp.complete()->'activities'),
  ('00000000-0000-4000-6000-0000000000c1', '2026-09-02', '00000000-0000-4000-6000-00000000000a', 'published', '2026-09-03 09:00+00',
   pg_temp.complete()->'meals', pg_temp.complete()->'nap', pg_temp.complete()->'mood', pg_temp.complete()->'toilet', pg_temp.complete()->'activities');

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- The questions
select is(array_to_string(public.daily_report_missing('{}', '{}', '{}', '{}', '{}'), ','),
  'breakfast,lunch,snacks,nap,mood,toilet,activities', 'an empty report misses all seven questions');
select is(cardinality(public.daily_report_missing(pg_temp.complete()->'meals', pg_temp.complete()->'nap', pg_temp.complete()->'mood', pg_temp.complete()->'toilet', pg_temp.complete()->'activities')),
  0, 'a filled report misses none (0 toilet visits is an answer)');
select is(array_to_string(public.daily_report_missing(pg_temp.complete()->'meals', '{"napped":true}', pg_temp.complete()->'mood', pg_temp.complete()->'toilet', '{"free_text":"Played with blocks"}'), ','),
  'nap', 'a nap needs how long and how well; activities can be written instead of picked');
select is(cardinality(public.daily_report_missing(pg_temp.complete()->'meals', '{"napped":false}', pg_temp.complete()->'mood', pg_temp.complete()->'toilet', pg_temp.complete()->'activities')),
  0, '"no nap" answers the nap question');

-- ---------------------------------------------------------------------------------------------
-- Through the day
select pg_temp.act_as('00000000-0000-4000-6000-000000000a04');

select is(
  (select format('%s/%s missing %s', r->>'answered', r->>'required', r->'missing')
     from public.save_daily_report('00000000-0000-4000-6000-0000000000c1', (now() at time zone 'Africa/Cairo')::date,
       '{"meals":{"breakfast":{"amount":"all"},"lunch":{"amount":"some"},"snacks":{"amount":null}},"mood":{"mood":"happy"}}') r),
  '3/7 missing ["snacks", "nap", "toilet", "activities"]',
  'saving part of the report tells how far it is'
);

select throws_ok(
  $$ select public.save_daily_report('00000000-0000-4000-6000-0000000000c3', (now() at time zone 'Africa/Cairo')::date, '{}') $$,
  '42501', 'daily_report_child_not_in_your_class',
  'a teacher writes only the reports of their own classes'
);
select throws_ok(
  $$ select public.save_daily_report('00000000-0000-4000-6000-0000000000c1', (now() at time zone 'Africa/Cairo')::date + 1, '{}') $$,
  '22023', 'daily_report_date_invalid',
  'not for a day still to come'
);
select throws_ok(
  $$ insert into public.daily_reports (child_id, report_date, nursery_id, status) values
       ('00000000-0000-4000-6000-0000000000c2', '2026-09-05', '00000000-0000-4000-6000-00000000000a', 'draft') $$,
  '42501', null,
  'a teacher no longer writes reports directly'
);
select is(
  (select format('%s %s', r->>'status', r->'mood_json'->>'mood') from public.get_daily_report('00000000-0000-4000-6000-0000000000c1', (now() at time zone 'Africa/Cairo')::date) r),
  'draft happy',
  'the editor reads back what was saved'
);
select pg_temp.act_as('00000000-0000-4000-6000-000000000a03');
select throws_ok(
  $$ select public.get_daily_report('00000000-0000-4000-6000-0000000000c1', (now() at time zone 'Africa/Cairo')::date) $$,
  '42501', 'daily_report_child_not_in_your_class',
  'another class''s teacher cannot read it there'
);
select pg_temp.act_as('00000000-0000-4000-6000-000000000a04');

select is(
  (select string_agg(format('%s %s %s %s/%s', d.full_name_en, d.attendance, d.status, d.answered, d.required), '; ' order by d.full_name_en)
     from public.get_my_daily_reports() d),
  'Laila partial draft 3/7; Omar partial none 0/7',
  'the teacher''s day: who came, how far each report is'
);
select ok(
  (select bool_and(d.due_at = ((now() at time zone 'Africa/Cairo')::date + time '01:00') at time zone 'Africa/Cairo') from public.get_my_daily_reports() d),
  'and when the reports are due'
);

-- Sending an incomplete report is refused, with what it misses.
select is(
  (select format('sent %s, incomplete %s', r->>'sent_count', r->'incomplete'->0->'missing')
     from public.send_daily_reports(array[(select id from public.daily_reports where child_id = '00000000-0000-4000-6000-0000000000c1' and status = 'draft')]) r),
  'sent 0, incomplete ["snacks", "nap", "toilet", "activities"]',
  'an incomplete report is not sent'
);

-- Finished and sent.
select is(
  (select r->>'answered' from public.save_daily_report('00000000-0000-4000-6000-0000000000c1', (now() at time zone 'Africa/Cairo')::date, pg_temp.complete()) r),
  '7',
  'every question answered'
);
select is(
  (select format('sent %s, incomplete %s', r->>'sent_count', jsonb_array_length(r->'incomplete'))
     from public.send_daily_reports(array[(select id from public.daily_reports where child_id = '00000000-0000-4000-6000-0000000000c1' and status = 'draft')]) r),
  'sent 1, incomplete 0',
  'a complete report is sent'
);
select is(
  (select format('%s %s', d.status, case when d.published_at is not null then 'at a time' end) from public.get_my_daily_reports() d where d.full_name_en = 'Laila'),
  'published at a time',
  'and shows as sent'
);
select throws_ok(
  $$ select public.save_daily_report('00000000-0000-4000-6000-0000000000c1', (now() at time zone 'Africa/Cairo')::date, '{}') $$,
  '22023', 'daily_report_already_sent',
  'a sent report no longer changes'
);

reset role;
select is(
  (select format('%s %s', n.template_key, n.template_params->'child'->>'en') from public.notifications n
    where n.user_id = '00000000-0000-4000-6000-000000000a06' and n.type = 'daily_report'),
  'daily_report_sent_by Laila',
  'the family is told (and by whom: daily_report_template_and_history.test.sql)'
);

-- However it is done, an incomplete report cannot be sent.
insert into public.daily_reports (child_id, report_date, nursery_id, status) values
  ('00000000-0000-4000-6000-0000000000c2', '2026-09-05', '00000000-0000-4000-6000-00000000000a', 'draft');
select throws_ok(
  $$ update public.daily_reports set status = 'published' where child_id = '00000000-0000-4000-6000-0000000000c2' and report_date = '2026-09-05' $$,
  '22023', 'daily_report_incomplete',
  'the table itself refuses to send an incomplete report'
);

-- ---------------------------------------------------------------------------------------------
-- The reminder: Nadia still has Omar's report to send; Sara's class had nobody today.
select is(public.run_daily_report_reminders(), 1, 'one teacher with reports still to send is reminded');
select is(
  (select format('%s %s %s', n.template_key, n.template_params->>'count', n.urgency) from public.notifications n
    where n.user_id = '00000000-0000-4000-6000-000000000a04' and n.type = 'daily_report_reminder'),
  'daily_report_reminder 1 high',
  'with how many are left'
);
select is(public.run_daily_report_reminders(), 0, 'once a day');

-- ---------------------------------------------------------------------------------------------
-- The send rate
select pg_temp.act_as('00000000-0000-4000-6000-000000000a02');
select is(
  (select format('expected %s, sent %s, on time %s, late %s, missing %s, rate %s',
                 s->'totals'->>'expected', s->'totals'->>'sent', s->'totals'->>'on_time', s->'totals'->>'late', s->'totals'->>'missing', s->'totals'->>'rate')
     from public.get_daily_report_stats('00000000-0000-4000-6000-00000000000a', '2026-09-01', '2026-09-02') s),
  'expected 3, sent 2, on time 1, late 1, missing 1, rate 66.7',
  'the head of teachers sees what was expected, sent on the day, late and missing'
);
select is(
  (select format('%s | missing %s', (select string_agg(format('%s: %s/%s %s%%', t->>'name_en', t->>'sent', t->>'expected', t->>'rate'), ', ')
                                        from jsonb_array_elements(s->'by_teacher') t),
                 (select string_agg(format('%s %s', m->>'name_en', m->>'day'), ', ') from jsonb_array_elements(s->'missing') m))
     from public.get_daily_report_stats('00000000-0000-4000-6000-00000000000a', '2026-09-01', '2026-09-02') s),
  'Nadia: 2/3 66.7%, Sara: 0/0 % | missing Omar 2026-09-01',
  'by teacher, and the missing reports themselves'
);
select is(
  (select s->'totals'->>'expected' from public.get_daily_report_stats('00000000-0000-4000-6000-00000000000a', '2026-09-01', '2026-09-02', '00000000-0000-4000-6000-0000000000e2') s),
  '0',
  'filtered by class'
);

select pg_temp.act_as('00000000-0000-4000-6000-000000000a04');
select throws_ok(
  $$ select public.get_daily_report_stats('00000000-0000-4000-6000-00000000000a', '2026-09-01', '2026-09-02') $$,
  '42501', 'class_team_forbidden',
  'a teacher without the class team permission does not see the nursery''s rate'
);

select pg_temp.act_as('00000000-0000-4000-6000-000000000a01');
select is(
  (select s->'totals'->>'rate' from public.get_daily_report_stats('00000000-0000-4000-6000-00000000000a', '2026-09-01', '2026-09-02') s),
  '66.7',
  'the admin sees it'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.save_daily_report(uuid, date, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.send_daily_reports(uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.get_daily_report(uuid, date)', 'execute')
  and not has_function_privilege('authenticated', 'public.run_daily_report_reminders()', 'execute')
  and not has_function_privilege('authenticated', 'public.daily_report_guard(uuid)', 'execute'),
  'signed-out visitors cannot call them; the reminder and the guard are internal'
);

select * from finish();
rollback;

-- Database test · teacher absences and class cover: a teacher reports their own absence (not in the
-- past, not overlapping, not for someone else), an admin records one; while the lead is away the
-- backup is on duty and told once, a class left with nobody tells the admins; the daily report
-- reminder and the late-pickup cap alert reach the teachers on duty only; cancelling hands the class
-- back; personal reminders fire at the nursery's own hour. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

insert into public.nurseries (id, name_ar, name_en, working_days) values
  ('00000000-0000-4000-9600-00000000000a', 'حضانة الغياب', 'Absence Nursery', '["sun", "mon", "tue", "wed", "thu", "fri", "sat"]');
update public.nursery_settings set timezone = 'Asia/Dubai', end_of_day_checklist_time = '01:00', standard_start_time = '00:00'
 where nursery_id = '00000000-0000-4000-9600-00000000000a';

insert into auth.users (id, email) values
  ('00000000-0000-4000-9600-000000000a01', 'abs.admin@test.local'),
  ('00000000-0000-4000-9600-000000000a02', 'abs.lead@test.local'),
  ('00000000-0000-4000-9600-000000000a03', 'abs.backup@test.local'),
  ('00000000-0000-4000-9600-000000000a04', 'abs.assistant@test.local'),
  ('00000000-0000-4000-9600-000000000a05', 'abs.parent@test.local'),
  ('00000000-0000-4000-9600-000000000a06', 'abs.lead2@test.local'),
  ('00000000-0000-4000-9600-000000000a07', 'abs.other@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = '00000000-0000-4000-9600-00000000000a', name_ar = v.name_en, name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9600-000000000a01', 'branch_admin', 'Admin'),
    ('00000000-0000-4000-9600-000000000a02', 'teacher', 'Lead Sara'),
    ('00000000-0000-4000-9600-000000000a03', 'teacher', 'Backup Nour'),
    ('00000000-0000-4000-9600-000000000a04', 'teacher', 'Assistant Hoda'),
    ('00000000-0000-4000-9600-000000000a05', 'parent', 'Mona'),
    ('00000000-0000-4000-9600-000000000a06', 'teacher', 'Lead Amr'),
    ('00000000-0000-4000-9600-000000000a07', 'teacher', 'Other Rana')
  ) as v(id, role, name_en)
 where u.id = v.id::uuid;

insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-9600-0000000000b1', '00000000-0000-4000-9600-00000000000a', 'الفراشات', 'Butterflies'),
  ('00000000-0000-4000-9600-0000000000b2', '00000000-0000-4000-9600-00000000000a', 'النحل', 'Bees');
insert into public.class_staff (class_id, user_id, role) values
  ('00000000-0000-4000-9600-0000000000b1', '00000000-0000-4000-9600-000000000a02', 'lead'),
  ('00000000-0000-4000-9600-0000000000b1', '00000000-0000-4000-9600-000000000a03', 'substitute'),
  ('00000000-0000-4000-9600-0000000000b1', '00000000-0000-4000-9600-000000000a04', 'assistant'),
  ('00000000-0000-4000-9600-0000000000b2', '00000000-0000-4000-9600-000000000a06', 'lead');
insert into public.children (id, nursery_id, class_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-9600-0000000000c1', '00000000-0000-4000-9600-00000000000a', '00000000-0000-4000-9600-0000000000b1', 'ليلى', 'Laila', '2023-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9600-0000000000c2', '00000000-0000-4000-9600-00000000000a', '00000000-0000-4000-9600-0000000000b2', 'آدم', 'Adam', '2023-01-01', 'active', '2026-01-01');
insert into public.parent_children (parent_id, child_id, is_primary) values
  ('00000000-0000-4000-9600-000000000a05', '00000000-0000-4000-9600-0000000000c1', true);
insert into public.attendance_records (child_id, attendance_date, check_in)
values ('00000000-0000-4000-9600-0000000000c1', public.nursery_today('00000000-0000-4000-9600-00000000000a'), now());

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.today() returns date language sql as $$ select public.nursery_today('00000000-0000-4000-9600-00000000000a') $$;
create function pg_temp.duty(p_class uuid) returns text language sql as $$
  select coalesce(string_agg(u.name_en || case when d.covering then '*' else '' end, ',' order by u.name_en), '-')
    from public.class_duty_teachers(p_class, pg_temp.today()) d join public.users u on u.id = d.user_id
$$;
create function pg_temp.notes(p_user uuid, p_type text) returns int language sql as $$
  select count(*)::int from public.notifications where user_id = p_user and type = p_type
$$;

-- ---------------------------------------------------------------------------------------------
select is(pg_temp.duty('00000000-0000-4000-9600-0000000000b1'), 'Assistant Hoda,Lead Sara', 'with everyone in, the lead and the assistant are on duty');

select pg_temp.act_as('00000000-0000-4000-9600-000000000a05');
select throws_ok($$ select public.report_staff_absence(null, pg_temp.today(), pg_temp.today(), 'sick') $$, '42501', 'absence_forbidden', 'a parent cannot report an absence');

select pg_temp.act_as('00000000-0000-4000-9600-000000000a07');
select throws_ok($$ select public.report_staff_absence('00000000-0000-4000-9600-000000000a02', pg_temp.today(), pg_temp.today(), 'sick') $$, '42501', 'absence_forbidden', 'a teacher cannot report another teacher absent');

select pg_temp.act_as('00000000-0000-4000-9600-000000000a02');
select throws_ok($$ select public.report_staff_absence(null, pg_temp.today() - 1, pg_temp.today(), 'sick') $$, '22023', 'absence_invalid_dates', 'a teacher cannot report a past day');
select throws_ok($$ select public.report_staff_absence(null, pg_temp.today(), pg_temp.today(), 'bored') $$, '22023', 'absence_invalid_reason', 'the reason is one of the list');
select set_config('t.absence', public.report_staff_absence(null, pg_temp.today(), pg_temp.today() + 1, 'sick', 'Flu')::text, true);
select throws_ok($$ select public.report_staff_absence(null, pg_temp.today() + 1, pg_temp.today() + 2, 'personal') $$, '23P01', 'absence_overlaps', 'two absences cannot overlap');

-- While the lead is away (checked with full rights)
reset role;
select is(pg_temp.duty('00000000-0000-4000-9600-0000000000b1'), 'Assistant Hoda,Backup Nour*', 'the backup covers while the lead is away, with the assistant');
select is(pg_temp.notes('00000000-0000-4000-9600-000000000a03', 'class_cover_today'), 1, 'the backup is told they cover the class today');
select is(pg_temp.notes('00000000-0000-4000-9600-000000000a01', 'staff_absence_reported'), 1, 'the admin is told the teacher reported an absence');
select set_config('t.again', public.notify_class_cover('00000000-0000-4000-9600-00000000000a', pg_temp.today())::text, true);
select is(pg_temp.notes('00000000-0000-4000-9600-000000000a03', 'class_cover_today'), 1, 'the backup is told only once a day');

select pg_temp.act_as('00000000-0000-4000-9600-000000000a03');
select is(
  (select string_agg(c ->> 'name_en', ',') from jsonb_array_elements(public.get_my_absences() -> 'covering') c),
  'Butterflies', 'the backup sees the class they cover today'
);
select throws_ok($$ select public.get_staff_absences('00000000-0000-4000-9600-00000000000a', pg_temp.today(), pg_temp.today()) $$, '42501', 'absence_forbidden', 'a teacher cannot read every absence');

-- Reminders reach the teachers on duty
reset role;
select set_config('t.reminders', public.run_daily_report_reminders()::text, true);
select is(
  (select string_agg(u.name_en, ',' order by u.name_en) from public.daily_report_reminders r join public.users u on u.id = r.teacher_id
    where r.nursery_id = '00000000-0000-4000-9600-00000000000a'),
  'Assistant Hoda,Backup Nour', 'the daily report reminder goes to the teachers on duty, not to the absent lead'
);
select set_config('t.cap', public.notify_child_class_duty('00000000-0000-4000-9600-0000000000c1', 'late_pickup_cap_reached', 'late_pickup_cap_reached', '{}', '/teacher/attendance')::text, true);
select is(
  (select string_agg(u.name_en, ',' order by u.name_en) from public.notifications n join public.users u on u.id = n.user_id
    where n.type = 'late_pickup_cap_reached' and n.nursery_id = '00000000-0000-4000-9600-00000000000a'),
  'Assistant Hoda,Backup Nour', 'a child alert goes to their class’s teachers on duty, not every teacher'
);

-- An admin records an absence for a class with no backup
select pg_temp.act_as('00000000-0000-4000-9600-000000000a01');
select set_config('t.amr', public.report_staff_absence('00000000-0000-4000-9600-000000000a06', pg_temp.today() - 2, pg_temp.today(), 'vacation')::text, true);
select is(
  (select format('%s:%s:%s', c -> 'lead' ->> 'away', c ->> 'covered_by_backup', c ->> 'on_duty')
     from jsonb_array_elements(public.get_staff_absences('00000000-0000-4000-9600-00000000000a', pg_temp.today() - 7, pg_temp.today() + 7) -> 'classes') c
    where c ->> 'name_en' = 'Butterflies'),
  'true:true:2', 'the admin sees who covers each class today'
);
reset role;
select is(pg_temp.notes('00000000-0000-4000-9600-000000000a06', 'staff_absence_recorded'), 1, 'the teacher is told the admin recorded their absence, which may start in the past');
select is(pg_temp.notes('00000000-0000-4000-9600-000000000a01', 'class_uncovered'), 1, 'a class left with nobody tells the admins');

-- Cancelling hands the class back
select pg_temp.act_as('00000000-0000-4000-9600-000000000a02');
select set_config('t.cancel', public.cancel_staff_absence(current_setting('t.absence')::uuid)::text, true);
select throws_ok($$ select public.cancel_staff_absence(current_setting('t.absence')::uuid) $$, 'P0001', 'absence_closed', 'a cancelled absence cannot be cancelled again');
reset role;
select is(pg_temp.duty('00000000-0000-4000-9600-0000000000b1'), 'Assistant Hoda,Lead Sara', 'once cancelled, the lead is on duty again');
select is(pg_temp.notes('00000000-0000-4000-9600-000000000a03', 'class_cover_cancelled'), 1, 'the backup is told the lead is back');

-- Personal reminders at the nursery's hour
insert into public.personal_reminders (nursery_id, user_id, audience, name, days_of_week, hours_of_day, active, repeats)
values ('00000000-0000-4000-9600-00000000000a', '00000000-0000-4000-9600-000000000a02', 'teacher', 'Water the plants',
        array[extract(dow from now() at time zone 'Asia/Dubai')::smallint],
        array[extract(hour from now() at time zone 'Asia/Dubai')::smallint], true, false);
select set_config('t.personal', public.run_personal_reminders()::text, true);
select is(
  (select count(*)::int from public.notifications where user_id = '00000000-0000-4000-9600-000000000a02' and type = 'personal_reminder' and title_en = 'Water the plants'),
  1, 'a personal reminder fires at the hour of the nursery’s time zone'
);
select is(
  (select active from public.personal_reminders where name = 'Water the plants'),
  false, 'a one-time personal reminder is switched off once it fires'
);

select * from finish();
rollback;

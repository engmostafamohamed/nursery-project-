-- Database test · the nursery's days off: the manager sets the weekdays and the holidays (a teacher
-- without the permission and a parent cannot, nobody writes the table directly), the rules check
-- them, attendance's rule follows at once (and no longer reads the old JSON), today's staff tasks
-- follow, the families and staff are told (a new week, a day off within two days at once, one far
-- off only later, one called off or ended early), the days gone by stay as they were, the official
-- holidays are added once, each nursery reads only its own, and the menu's days skip a holiday.
-- Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(38);

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.today() returns date language sql as $$ select public.nursery_today('00000000-0000-4000-9e00-00000000000a') $$;
-- The notices a person got, as "template, template" (by name: they share one time in this transaction).
create function pg_temp.told(p_user uuid) returns text language sql as $$
  select coalesce(string_agg(template_key, ', ' order by template_key), '-')
    from public.notifications where user_id = p_user and type in ('nursery_holiday', 'nursery_week')
$$;
create function pg_temp.task_today() returns text language sql as $$
  select coalesce(string_agg(status, ', '), '-') from public.staff_task_items
   where nursery_id = '00000000-0000-4000-9e00-00000000000a' and due_on = pg_temp.today()
$$;

-- Nursery A, open every day, with its admin, a teacher, a parent of an active child; nursery B with a parent.
insert into public.nurseries (id, name_ar, name_en, working_days) values
  ('00000000-0000-4000-9e00-00000000000a', 'أ', 'Days Nursery', '["sun","mon","tue","wed","thu","fri","sat"]'::jsonb),
  ('00000000-0000-4000-9e00-00000000000b', 'ب', 'Other Nursery', '["sun","mon","tue","wed","thu"]'::jsonb);
update public.nursery_settings set timezone = 'Africa/Cairo' where nursery_id in ('00000000-0000-4000-9e00-00000000000a', '00000000-0000-4000-9e00-00000000000b');
insert into auth.users (id, email) values
  ('00000000-0000-4000-9e00-000000000a01', 'days.admin@test.local'),
  ('00000000-0000-4000-9e00-000000000a02', 'days.teacher@test.local'),
  ('00000000-0000-4000-9e00-000000000a03', 'days.parent@test.local'),
  ('00000000-0000-4000-9e00-000000000b03', 'days.other.parent@test.local');
update public.users u set role = v.role::public.user_role, nursery_id = v.nursery::uuid, status = 'active', name_en = v.name_en
  from (values
    ('00000000-0000-4000-9e00-000000000a01', 'branch_admin', 'Admin', '00000000-0000-4000-9e00-00000000000a'),
    ('00000000-0000-4000-9e00-000000000a02', 'teacher', 'Teacher', '00000000-0000-4000-9e00-00000000000a'),
    ('00000000-0000-4000-9e00-000000000a03', 'parent', 'Parent', '00000000-0000-4000-9e00-00000000000a'),
    ('00000000-0000-4000-9e00-000000000b03', 'parent', 'Other Parent', '00000000-0000-4000-9e00-00000000000b')
  ) as v(id, role, name_en, nursery)
 where u.id = v.id::uuid;
insert into public.children (id, nursery_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-9e00-0000000000c1', '00000000-0000-4000-9e00-00000000000a', 'ليلى', 'Laila', '2023-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9e00-0000000000c2', '00000000-0000-4000-9e00-00000000000b', 'عمر', 'Omar', '2023-01-01', 'active', '2026-01-01');
insert into public.parent_children (parent_id, child_id, is_primary) values
  ('00000000-0000-4000-9e00-000000000a03', '00000000-0000-4000-9e00-0000000000c1', true),
  ('00000000-0000-4000-9e00-000000000b03', '00000000-0000-4000-9e00-0000000000c2', true);
-- A daily task for the teachers, with today's item made.
insert into public.staff_tasks (nursery_id, title_en, assign_to, repeats, due_time, starts_on)
values ('00000000-0000-4000-9e00-00000000000a', 'Daily check', 'teachers', 'daily', '23:59', pg_temp.today() - 1);
select public.staff_tasks_generate('00000000-0000-4000-9e00-00000000000a', pg_temp.today());

-- The weekdays, read one way
select is(public.nursery_open_weekdays('["0", "Monday", "tue", 9, "x"]'::jsonb), array[0, 1, 2]::smallint[],
  'the weekdays read as numbers, short or full names; anything else is left out');
select is(public.nursery_open_weekdays('[]'::jsonb), array[0, 1, 2, 3, 4]::smallint[], 'none stored: Sunday to Thursday');

-- Who may
select pg_temp.act_as('00000000-0000-4000-9e00-000000000a02');
select throws_ok($$ select public.nursery_holiday_save(null, '{"nursery_id": "00000000-0000-4000-9e00-00000000000a", "name_en": "Day", "starts_on": "2030-01-01"}') $$,
  '42501', 'days_off_forbidden', 'a teacher without the settings permission cannot add a holiday');
select throws_ok($$ select public.nursery_set_open_weekdays('00000000-0000-4000-9e00-00000000000a', array[0, 1]) $$,
  '42501', 'days_off_forbidden', 'nor change the week');
reset role;
select pg_temp.act_as('00000000-0000-4000-9e00-000000000a03');
select throws_ok($$ select public.nursery_holiday_save(null, '{"nursery_id": "00000000-0000-4000-9e00-00000000000a", "name_en": "Day", "starts_on": "2030-01-01"}') $$,
  '42501', 'days_off_forbidden', 'a parent cannot');
select throws_ok($$ insert into public.nursery_holidays (nursery_id, name_en, starts_on, ends_on) values ('00000000-0000-4000-9e00-00000000000a', 'X', '2030-01-01', '2030-01-01') $$,
  '42501', null, 'nobody writes the table directly');
reset role;

-- The week
select pg_temp.act_as('00000000-0000-4000-9e00-000000000a01');
select throws_ok($$ select public.nursery_set_open_weekdays('00000000-0000-4000-9e00-00000000000a', '{}') $$,
  '22023', 'days_off_week_invalid', 'the nursery opens at least one day');
select is(public.nursery_set_open_weekdays('00000000-0000-4000-9e00-00000000000a',
            array(select d from generate_series(0, 6) d where d <> extract(dow from pg_temp.today())::int)) ->> 0 is not null, true,
  'the admin closes today''s weekday');
reset role;
select is(public.attendance_is_school_day('00000000-0000-4000-9e00-00000000000a', pg_temp.today()), false, 'today is now a day off for attendance');
select is(pg_temp.task_today(), 'cancelled', 'today''s task is called off');
select is(pg_temp.told('00000000-0000-4000-9e00-000000000a03'), 'nursery_week_changed', 'the family is told the new days');
select is(pg_temp.told('00000000-0000-4000-9e00-000000000a02'), 'nursery_week_changed', 'and the teacher');
select is(pg_temp.told('00000000-0000-4000-9e00-000000000b03'), '-', 'another nursery''s family is not');
select pg_temp.act_as('00000000-0000-4000-9e00-000000000a01');
select public.nursery_set_open_weekdays('00000000-0000-4000-9e00-00000000000a', array[0, 1, 2, 3, 4, 5, 6]);
reset role;
select is(pg_temp.task_today(), 'pending', 'open every day again: today''s task is back');

-- A holiday
select pg_temp.act_as('00000000-0000-4000-9e00-000000000a01');
select throws_ok($$ select public.nursery_holiday_save(null, '{"nursery_id": "00000000-0000-4000-9e00-00000000000a", "starts_on": "2030-01-01"}') $$,
  '22023', 'days_off_name_required', 'a holiday has a name');
select throws_ok($$ select public.nursery_holiday_save(null, '{"nursery_id": "00000000-0000-4000-9e00-00000000000a", "name_en": "Eid", "starts_on": "2030-01-05", "ends_on": "2030-01-01"}') $$,
  '22023', 'days_off_dates_invalid', 'it ends on or after its first day');
select throws_ok($$ select public.nursery_holiday_save(null, '{"nursery_id": "00000000-0000-4000-9e00-00000000000a", "name_en": "Summer", "starts_on": "2030-06-01", "ends_on": "2030-09-01"}') $$,
  '22023', 'days_off_too_long', 'and lasts two months at most');
create temp table h (k text, id uuid);
grant all on h to authenticated;
insert into h select 'now', public.nursery_holiday_save(null, jsonb_build_object(
  'nursery_id', '00000000-0000-4000-9e00-00000000000a', 'name_ar', 'عطلة', 'name_en', 'Break', 'starts_on', pg_temp.today(), 'ends_on', pg_temp.today() + 1));
select throws_ok($$ select public.nursery_holiday_save(null, jsonb_build_object('nursery_id', '00000000-0000-4000-9e00-00000000000a', 'name_en', 'Again', 'starts_on', pg_temp.today(), 'ends_on', pg_temp.today() + 1)) $$,
  '23505', 'days_off_duplicate', 'the same days cannot be added twice');
insert into h select 'later', public.nursery_holiday_save(null, jsonb_build_object(
  'nursery_id', '00000000-0000-4000-9e00-00000000000a', 'name_en', 'Later', 'starts_on', pg_temp.today() + 10));
reset role;
select is(public.attendance_is_school_day('00000000-0000-4000-9e00-00000000000a', pg_temp.today()), false, 'a holiday today closes the nursery for attendance');
select is(pg_temp.task_today(), 'cancelled', 'and calls off today''s task');
select is(pg_temp.told('00000000-0000-4000-9e00-000000000a03'), 'nursery_holiday_range, nursery_week_changed, nursery_week_changed',
  'the family is told at once of a day off starting now');
select is((select notified_at is null from public.nursery_holidays where id = (select id from h where k = 'later')), true,
  'one ten days off is not announced yet');
select pg_temp.act_as('00000000-0000-4000-9e00-000000000a01');
select public.nursery_holiday_save((select id from h where k = 'later'), jsonb_build_object('name_en', 'Later', 'starts_on', pg_temp.today() + 2));
reset role;
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-4000-9e00-000000000a03' and template_key = 'nursery_holiday'), 1,
  'moved to the day after tomorrow, it is announced now');

-- Called off
select pg_temp.act_as('00000000-0000-4000-9e00-000000000a01');
select public.nursery_holiday_remove((select id from h where k = 'now'));
reset role;
select is(public.attendance_is_school_day('00000000-0000-4000-9e00-00000000000a', pg_temp.today()), true, 'removed: today is a school day again');
select is((select (deleted_at is not null and deleted_by = '00000000-0000-4000-9e00-000000000a01') from public.nursery_holidays where id = (select id from h where k = 'now')), true,
  'the holiday is kept, marked deleted');
select is(pg_temp.task_today(), 'pending', 'today''s task is back');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-4000-9e00-000000000a03' and template_key = 'nursery_holiday_cancelled'), 1,
  'and the family is told the nursery is open after all');

-- Official holidays, added once
select pg_temp.act_as('00000000-0000-4000-9e00-000000000a01');
select is(public.nursery_holidays_add_official('00000000-0000-4000-9e00-00000000000a', '[
    {"key": "labour_day-2030", "name_ar": "عيد العمال", "name_en": "Labour Day", "starts_on": "2030-05-01"},
    {"key": "eid_al_adha-1451", "name_ar": "عيد الأضحى", "name_en": "Eid al-Adha", "starts_on": "2030-04-12", "ends_on": "2030-04-15"}
  ]'::jsonb) + public.nursery_holidays_add_official('00000000-0000-4000-9e00-00000000000a', '[
    {"key": "labour_day-2030", "name_ar": "عيد العمال", "name_en": "Labour Day", "starts_on": "2030-05-01"}
  ]'::jsonb), 2, 'official holidays are added once each');

-- Who reads them
reset role;
select pg_temp.act_as('00000000-0000-4000-9e00-000000000a03');
select is((select count(*)::int from public.nursery_holidays where nursery_id = '00000000-0000-4000-9e00-00000000000a' and deleted_at is null), 3,
  'the family reads its nursery''s days off');
reset role;
select pg_temp.act_as('00000000-0000-4000-9e00-000000000b03');
select is((select count(*)::int from public.nursery_holidays where nursery_id = '00000000-0000-4000-9e00-00000000000a'), 0,
  'another nursery''s family reads none');
reset role;

-- The menu skips the holiday; the old JSON no longer counts
select pg_temp.act_as('00000000-0000-4000-9e00-000000000a01');
select is((select public.get_menu_period('00000000-0000-4000-9e00-00000000000a', '2030-05-01') -> 'open_days' @> '["2030-05-01"]'::jsonb), false,
  'the menu''s days leave out Labour Day');
reset role;
insert into public.academic_calendars (nursery_id, year, holidays_json) values ('00000000-0000-4000-9e00-00000000000a', 2030, '["2030-03-03"]');
select is(public.attendance_is_holiday('00000000-0000-4000-9e00-00000000000a', '2030-03-03'), false, 'the old calendar JSON is no longer read');

-- The days gone by
select pg_temp.act_as('00000000-0000-4000-9e00-000000000a01');
insert into h select 'past', public.nursery_holiday_save(null, jsonb_build_object(
  'nursery_id', '00000000-0000-4000-9e00-00000000000a', 'name_en', 'Water cut', 'starts_on', pg_temp.today() - 5, 'ends_on', pg_temp.today() - 4));
select is((select count(*)::int from h where k = 'past' and id is not null), 1, 'a closure that already happened can be recorded');
select throws_ok(format('select public.nursery_holiday_remove(%L)', (select id from h where k = 'past')),
  '22023', 'days_off_past', 'but an ended day off cannot be removed');
select throws_ok(format('select public.nursery_holiday_save(%L, %L)', (select id from h where k = 'past'),
    jsonb_build_object('name_en', 'Water cut', 'starts_on', pg_temp.today() - 5, 'ends_on', pg_temp.today() - 5)),
  '22023', 'days_off_past', 'nor changed');
select throws_ok(format('select public.nursery_holiday_save(%L, %L)', (select id from h where k = 'later'),
    jsonb_build_object('name_en', 'Later', 'starts_on', pg_temp.today() - 1)),
  '22023', 'days_off_past', 'a coming one cannot be moved into the past');
insert into h select 'running', public.nursery_holiday_save(null, jsonb_build_object(
  'nursery_id', '00000000-0000-4000-9e00-00000000000a', 'name_en', 'Repairs', 'starts_on', pg_temp.today() - 1, 'ends_on', pg_temp.today() + 1));
select public.nursery_holiday_save((select id from h where k = 'running'),
  jsonb_build_object('name_en', 'Repairs', 'starts_on', pg_temp.today() - 1, 'ends_on', pg_temp.today() - 1));
reset role;
select is(public.attendance_is_school_day('00000000-0000-4000-9e00-00000000000a', pg_temp.today()), true,
  'a running day off ended early: the nursery opens today');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-4000-9e00-000000000a03' and template_key = 'nursery_holiday_cancelled'), 2,
  'and the family is told it opens again');

select * from finish();
rollback;

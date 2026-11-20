-- Database test · what a teacher's own classes have been doing lately.
--
-- She sees her classes, their size and her place in each, a fortnight of attendance and of the
-- day's reports — all of it for the classes she is on the team of and for no others. A teacher on
-- no class sees nothing, and someone who is not a teacher is refused. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.stats() returns jsonb language sql as $$ select public.get_my_teaching_stats(14) $$;

insert into public.nurseries (id, name_ar, name_en) values ('00000000-0000-4000-9f17-00000000000a', 'حضانة', 'Stats Nursery');
update public.nursery_settings set timezone = 'Africa/Cairo' where nursery_id = '00000000-0000-4000-9f17-00000000000a';
insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-9f17-0000000000b1', '00000000-0000-4000-9f17-00000000000a', 'الفراشات', 'Butterflies'),
  ('00000000-0000-4000-9f17-0000000000b2', '00000000-0000-4000-9f17-00000000000a', 'النحل', 'Bees');
insert into auth.users (id, email) values
  ('00000000-0000-4000-9f17-000000000a01', 'st.sara@test.local'),
  ('00000000-0000-4000-9f17-000000000a02', 'st.spare@test.local'),
  ('00000000-0000-4000-9f17-000000000a03', 'st.admin@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = '00000000-0000-4000-9f17-00000000000a',
       name_en = v.name_en, name_ar = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9f17-000000000a01', 'teacher', 'Sara'),
    ('00000000-0000-4000-9f17-000000000a02', 'teacher', 'Spare'),
    ('00000000-0000-4000-9f17-000000000a03', 'branch_admin', 'Admin')
  ) as v(id, role, name_en)
 where u.id = v.id::uuid;
-- Sara leads Butterflies and helps in Bees; Spare is on no class.
insert into public.class_staff (class_id, user_id, role) values
  ('00000000-0000-4000-9f17-0000000000b1', '00000000-0000-4000-9f17-000000000a01', 'lead'),
  ('00000000-0000-4000-9f17-0000000000b2', '00000000-0000-4000-9f17-000000000a01', 'co_teacher');

-- Two children in her class, one in a class that is not hers at all.
insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-9f17-0000000000b3', '00000000-0000-4000-9f17-00000000000a', 'بعيد', 'Far');
insert into public.children (id, nursery_id, class_id, full_name_ar, full_name_en, dob, status) values
  ('00000000-0000-4000-9f17-0000000000c1', '00000000-0000-4000-9f17-00000000000a', '00000000-0000-4000-9f17-0000000000b1', 'أ', 'A', '2023-01-01', 'active'),
  ('00000000-0000-4000-9f17-0000000000c2', '00000000-0000-4000-9f17-00000000000a', '00000000-0000-4000-9f17-0000000000b2', 'ب', 'B', '2023-01-01', 'active'),
  ('00000000-0000-4000-9f17-0000000000c3', '00000000-0000-4000-9f17-00000000000a', '00000000-0000-4000-9f17-0000000000b3', 'ج', 'C', '2023-01-01', 'active');

insert into public.attendance_records (child_id, attendance_date, check_in, late_charge_status) values
  ('00000000-0000-4000-9f17-0000000000c1', current_date - 1, (current_date - 1 + time '08:00') at time zone 'Africa/Cairo', 'none'),
  ('00000000-0000-4000-9f17-0000000000c2', current_date - 1, (current_date - 1 + time '08:05') at time zone 'Africa/Cairo', 'none'),
  -- A child of a class that is not hers: must not count.
  ('00000000-0000-4000-9f17-0000000000c3', current_date - 1, (current_date - 1 + time '08:10') at time zone 'Africa/Cairo', 'none');
insert into public.daily_reports (child_id, nursery_id, report_date, teacher_id, status, mood) values
  ('00000000-0000-4000-9f17-0000000000c1', '00000000-0000-4000-9f17-00000000000a', current_date - 1,
   '00000000-0000-4000-9f17-000000000a01', 'draft', 'happy');

select pg_temp.act_as('00000000-0000-4000-9f17-000000000a01');

-- 1-3 · her classes, their size and her place in each.
select is(jsonb_array_length(pg_temp.stats() -> 'classes'), 2, 'she sees the two classes she is on');
select is(pg_temp.stats() -> 'classes' -> 0 ->> 'role', 'co_teacher', 'with the place she takes in each');
select is((pg_temp.stats() -> 'totals' ->> 'children')::int, 2, 'and only the children of those classes');

-- 4-6 · a fortnight of attendance, counting hers alone.
select is(jsonb_array_length(pg_temp.stats() -> 'attendance'), 1, 'the days with attendance are there');
select is((pg_temp.stats() -> 'attendance' -> 0 ->> 'here')::int, 2, 'two of her children came that day');
select is((pg_temp.stats() -> 'totals' ->> 'days_recorded')::int, 1, 'and the fortnight counts that one day');

-- 7-8 · the day's reports.
select is(jsonb_array_length(pg_temp.stats() -> 'reports'), 1, 'the days with reports are there');
select is((pg_temp.stats() -> 'reports' -> 0 ->> 'draft')::int, 1, 'a report still being written counts as a draft');

-- 9 · a teacher on no class sees nothing, and is not refused.
select pg_temp.act_as('00000000-0000-4000-9f17-000000000a02');
select is(jsonb_array_length(pg_temp.stats() -> 'classes'), 0, 'a teacher on no class sees no classes');

-- 10 · and the dashboard's own figures are not read through this.
select pg_temp.act_as('00000000-0000-4000-9f17-000000000a03');
select throws_ok($$ select public.get_my_teaching_stats(14) $$, '42501', 'teaching_stats_not_a_teacher',
                 'someone who is not a teacher is refused');

select * from finish();
rollback;

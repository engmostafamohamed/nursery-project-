-- Database test · what get_attendance_days answers for a day of every kind, and to whom.
--
-- A branch with a holiday, a weekend, children who joined at different times and days of every
-- kind (present, still in, absent, excused, before joining, in the future). Every day in the span
-- comes back exactly once per child and reads the way the nursery's own calendar says it should;
-- the names behind the ids are there; and each caller — the branch admin, a teacher of the branch,
-- a father, a teacher of another branch and the chain's admin — sees what they are allowed to and
-- no more.
--
-- It began life proving the rewrite of this function matched the one it replaced, by diffing the
-- two. That proof is spent: the old function is gone, and a test that cannot run is worth less
-- than one that pins the answers themselves. These are the same cases, asserted directly.
--
-- Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(19);

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

create function pg_temp.rows_seen(p_kids uuid[], p_from date, p_to date) returns int language sql as $$
  select count(*)::int from public.get_attendance_days(p_kids, p_from, p_to)
$$;

-- How many times a child and a day come back together more than once. A join that fans out is what
-- this function was rewritten away from, so the shape is worth pinning: one row per child per day.
create function pg_temp.repeats(p_kids uuid[], p_from date, p_to date) returns int language sql as $$
  select coalesce(sum(n - 1), 0)::int from (
    select count(*) as n from public.get_attendance_days(p_kids, p_from, p_to)
     group by child_id, day having count(*) > 1
  ) d
$$;

-- How many days in the span read as the given status, for one child.
create function pg_temp.status_count(p_kid uuid, p_from date, p_to date, p_status text) returns int language sql as $$
  select count(*)::int from public.get_attendance_days(array[p_kid]::uuid[], p_from, p_to)
   where day_status = p_status
$$;

-- Two branches of one chain, plus a nursery nobody here belongs to.
insert into public.chains (id, name) values ('00000000-0000-4000-9f12-00000000000c', 'Chain');
insert into public.nurseries (id, chain_id, name_ar, name_en, working_days) values
  ('00000000-0000-4000-9f12-00000000000a', '00000000-0000-4000-9f12-00000000000c', 'حضانة', 'Speed Nursery',
   '["sunday","monday","tuesday","wednesday","thursday"]'),
  ('00000000-0000-4000-9f12-00000000000b', '00000000-0000-4000-9f12-00000000000c', 'حضانة ٢', 'Other Branch',
   '["sunday","monday","tuesday","wednesday","thursday"]');
update public.nursery_settings set timezone = 'Africa/Cairo'
 where nursery_id in ('00000000-0000-4000-9f12-00000000000a', '00000000-0000-4000-9f12-00000000000b');

insert into auth.users (id, email) values
  ('00000000-0000-4000-9f12-000000000a01', 'spd.admin@test.local'),
  ('00000000-0000-4000-9f12-000000000a02', 'spd.teacher@test.local'),
  ('00000000-0000-4000-9f12-000000000a03', 'spd.father@test.local'),
  ('00000000-0000-4000-9f12-000000000a04', 'spd.otherteacher@test.local'),
  ('00000000-0000-4000-9f12-000000000a05', 'spd.stranger@test.local'),
  ('00000000-0000-4000-9f12-000000000a06', 'spd.chain@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = v.nursery::uuid, name_en = v.name_en,
       name_ar = v.name_ar, status = 'active',
       chain_id = case when v.role = 'chain_super_admin' then '00000000-0000-4000-9f12-00000000000c'::uuid end
  from (values
    ('00000000-0000-4000-9f12-000000000a01', 'branch_admin', '00000000-0000-4000-9f12-00000000000a', 'Admin', 'المدير'),
    ('00000000-0000-4000-9f12-000000000a02', 'teacher',      '00000000-0000-4000-9f12-00000000000a', 'Teacher', 'المعلمة'),
    ('00000000-0000-4000-9f12-000000000a03', 'parent',       '00000000-0000-4000-9f12-00000000000a', 'Father', 'الأب'),
    ('00000000-0000-4000-9f12-000000000a04', 'teacher',      '00000000-0000-4000-9f12-00000000000b', 'Other Teacher', 'معلمة أخرى'),
    ('00000000-0000-4000-9f12-000000000a05', 'parent',       '00000000-0000-4000-9f12-00000000000b', 'Stranger', 'غريب'),
    ('00000000-0000-4000-9f12-000000000a06', 'chain_super_admin', '00000000-0000-4000-9f12-00000000000a', 'Chain', 'السلسلة')
  ) as v(id, role, nursery, name_en, name_ar)
 where u.id = v.id::uuid;

-- Three children: one joined long ago, one joined only yesterday, one at the other branch.
insert into public.children (id, nursery_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-9f12-0000000000c1', '00000000-0000-4000-9f12-00000000000a', 'آدم', 'Adam', '2022-01-01', 'active', current_date - 30),
  ('00000000-0000-4000-9f12-0000000000c2', '00000000-0000-4000-9f12-00000000000a', 'مريم', 'Mariam', '2022-02-01', 'active', current_date - 1),
  ('00000000-0000-4000-9f12-0000000000c3', '00000000-0000-4000-9f12-00000000000b', 'يوسف', 'Youssef', '2022-03-01', 'active', current_date - 30);
insert into public.parent_children (parent_id, child_id, relationship) values
  ('00000000-0000-4000-9f12-000000000a03', '00000000-0000-4000-9f12-0000000000c1', 'father');

-- A holiday in the window, so the holiday branch of the status is exercised.
insert into public.nursery_holidays (nursery_id, starts_on, ends_on, name_ar, name_en)
values ('00000000-0000-4000-9f12-00000000000a', current_date - 3, current_date - 3, 'إجازة', 'Holiday');

-- Days of every kind: a full day with a late pickup, a child still in, and an excused absence
-- whose notice names who sent it.
insert into public.attendance_records
  (id, child_id, attendance_date, check_in, check_out, check_in_by, check_out_by, check_in_method, check_out_method,
   early_minutes, late_minutes, extra_hours, extra_fee, late_charge_status, needs_review, review_reason)
values
  ('00000000-0000-4000-9f12-0000000000e1', '00000000-0000-4000-9f12-0000000000c1', current_date - 5,
   (current_date - 5 + time '08:00') at time zone 'Africa/Cairo', (current_date - 5 + time '18:30') at time zone 'Africa/Cairo',
   '00000000-0000-4000-9f12-000000000a02', '00000000-0000-4000-9f12-000000000a01', 'manual', 'manual',
   0, 90, 1.5, 75, 'final', true, 'late_pickup'),
  ('00000000-0000-4000-9f12-0000000000e2', '00000000-0000-4000-9f12-0000000000c1', current_date,
   (current_date + time '08:10') at time zone 'Africa/Cairo', null,
   '00000000-0000-4000-9f12-000000000a02', null, 'manual', null,
   0, 0, 0, 0, 'none', false, null);
insert into public.attendance_absence_reports (nursery_id, child_id, absence_date, reason, note, reported_by)
values ('00000000-0000-4000-9f12-00000000000a', '00000000-0000-4000-9f12-0000000000c1', current_date - 4,
        'sick', 'temperature', '00000000-0000-4000-9f12-000000000a03');

-- 1-3 · the branch admin, over a fortnight covering the holiday, the weekend and every status.
--       Every child gets every day of the span, exactly once.
select pg_temp.act_as('00000000-0000-4000-9f12-000000000a01');
select is(pg_temp.rows_seen(array['00000000-0000-4000-9f12-0000000000c1','00000000-0000-4000-9f12-0000000000c2']::uuid[],
                            current_date - 10, current_date + 2),
          26, 'two children over thirteen days is twenty-six rows');
select is(pg_temp.repeats(array['00000000-0000-4000-9f12-0000000000c1','00000000-0000-4000-9f12-0000000000c2']::uuid[],
                          current_date - 10, current_date + 2),
          0, 'and no child gets the same day twice');
select is(
  (select count(distinct day)::int from public.get_attendance_days(array['00000000-0000-4000-9f12-0000000000c1']::uuid[],
                                                                   current_date - 10, current_date + 2)),
  13, 'every day of the span is answered for, with none skipped');

-- 4-8 · the day of each kind reads as its kind.
select is((select day_status from public.get_attendance_days(array['00000000-0000-4000-9f12-0000000000c1']::uuid[], current_date - 5, current_date - 5)),
          'present', 'a full day reads as present');
select is((select day_status from public.get_attendance_days(array['00000000-0000-4000-9f12-0000000000c1']::uuid[], current_date - 3, current_date - 3)),
          'holiday', 'a holiday reads as a holiday');
select is((select day_status from public.get_attendance_days(array['00000000-0000-4000-9f12-0000000000c1']::uuid[], current_date - 4, current_date - 4)),
          'excused', 'an excused absence reads as excused');
select is((select day_status from public.get_attendance_days(array['00000000-0000-4000-9f12-0000000000c1']::uuid[], current_date, current_date)),
          'partial', 'a child still in the nursery reads as partial');
select is((select day_status from public.get_attendance_days(array['00000000-0000-4000-9f12-0000000000c2']::uuid[], current_date - 10, current_date - 10)),
          'not_enrolled', 'a day before the child joined reads as not enrolled');

-- 9-12 · and every other day reads the way the nursery's own calendar says. Written against the
--        weekdays rather than fixed dates, so the test says the same thing whatever day it runs on.
select is(
  (select count(*)::int from public.get_attendance_days(array['00000000-0000-4000-9f12-0000000000c1']::uuid[], current_date - 10, current_date) d
    where d.day_status = 'off' and extract(dow from d.day) not in (5, 6)),
  0, 'a day off is only ever a day this nursery does not open');
select is(
  (select count(*)::int from public.get_attendance_days(array['00000000-0000-4000-9f12-0000000000c1']::uuid[], current_date - 10, current_date) d
    where extract(dow from d.day) in (5, 6) and d.day_status <> 'off'
      and d.day not in (current_date, current_date - 3, current_date - 4, current_date - 5)),
  0, 'and every weekend day nothing was recorded for reads as one');
select is(
  (select count(*)::int from public.get_attendance_days(array['00000000-0000-4000-9f12-0000000000c1']::uuid[], current_date - 10, current_date) d
    where d.day_status = 'absent'
      and (extract(dow from d.day) in (5, 6)
           or d.day in (current_date, current_date - 3, current_date - 4, current_date - 5))),
  0, 'nothing with a record, a notice, a holiday or a weekend behind it reads as a plain absence');
select cmp_ok(pg_temp.status_count('00000000-0000-4000-9f12-0000000000c1', current_date - 10, current_date, 'absent'),
              '>', 0, 'and the plain absences are there to be counted');

-- 13-15 · the names behind the ids, which come from joins.
select is((select checked_in_by_en from public.get_attendance_days(array['00000000-0000-4000-9f12-0000000000c1']::uuid[], current_date - 5, current_date - 5)),
          'Teacher', 'who checked the child in is named');
select is((select checked_out_by_ar from public.get_attendance_days(array['00000000-0000-4000-9f12-0000000000c1']::uuid[], current_date - 5, current_date - 5)),
          'المدير', 'who checked the child out is named, in Arabic');
select is((select absence_reported_by_en from public.get_attendance_days(array['00000000-0000-4000-9f12-0000000000c1']::uuid[], current_date - 4, current_date - 4)),
          'Father', 'who sent the absence notice is named');

-- 16-18 · and who may see what.
select pg_temp.act_as('00000000-0000-4000-9f12-000000000a02');
select is(pg_temp.rows_seen(array['00000000-0000-4000-9f12-0000000000c1','00000000-0000-4000-9f12-0000000000c2']::uuid[],
                            current_date - 10, current_date + 2),
          26, 'the branch''s teacher sees the branch''s children');
select pg_temp.act_as('00000000-0000-4000-9f12-000000000a03');
select is(pg_temp.rows_seen(array['00000000-0000-4000-9f12-0000000000c1','00000000-0000-4000-9f12-0000000000c2']::uuid[],
                            current_date - 10, current_date + 2),
          13, 'a father asking about two children is answered about his own');
select pg_temp.act_as('00000000-0000-4000-9f12-000000000a04');
select is(pg_temp.rows_seen(array['00000000-0000-4000-9f12-0000000000c1']::uuid[], current_date - 2, current_date),
          0, 'a teacher of another branch is answered about nobody');
select pg_temp.act_as('00000000-0000-4000-9f12-000000000a06');
select is(pg_temp.rows_seen(array['00000000-0000-4000-9f12-0000000000c1','00000000-0000-4000-9f12-0000000000c3']::uuid[],
                            current_date - 10, current_date + 2),
          26, 'the chain''s admin sees both branches');

select * from finish();
rollback;

-- Database test · the faster get_attendance_days answers exactly like the one it replaces.
--
-- A branch with a holiday, a weekend, children who joined at different times and days of every
-- kind (present, still in, absent, excused, before joining, in the future). For each caller — the
-- branch admin, a teacher of the branch, a father, a teacher of another branch and a stranger —
-- the rows the rewrite returns must match the old function's rows exactly, field for field, and
-- the access rules must still hold. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

-- Rows the rewrite returns but the old one does not, and the other way round: both must be empty.
create function pg_temp.diff(p_kids uuid[], p_from date, p_to date) returns int language sql as $$
  select (
    select count(*) from (
      (select * from public.get_attendance_days(p_kids, p_from, p_to)
       except all
       select * from public.get_attendance_days_old(p_kids, p_from, p_to))
      union all
      (select * from public.get_attendance_days_old(p_kids, p_from, p_to)
       except all
       select * from public.get_attendance_days(p_kids, p_from, p_to))
    ) d
  )::int
$$;

create function pg_temp.rows_seen(p_kids uuid[], p_from date, p_to date) returns int language sql as $$
  select count(*)::int from public.get_attendance_days(p_kids, p_from, p_to)
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

-- 1-6 · the branch admin, over a fortnight covering the holiday, the weekend and every status.
select pg_temp.act_as('00000000-0000-4000-9f12-000000000a01');
select is(pg_temp.diff(array['00000000-0000-4000-9f12-0000000000c1','00000000-0000-4000-9f12-0000000000c2']::uuid[],
                       current_date - 10, current_date + 2),
          0, 'the admin gets exactly the same rows as before');
select cmp_ok(pg_temp.rows_seen(array['00000000-0000-4000-9f12-0000000000c1','00000000-0000-4000-9f12-0000000000c2']::uuid[],
                                current_date - 10, current_date + 2),
              '>', 20, 'and there really are rows to compare');
select is((select day_status from public.get_attendance_days(array['00000000-0000-4000-9f12-0000000000c1']::uuid[], current_date - 3, current_date - 3)),
          'holiday', 'a holiday still reads as a holiday');
select is((select day_status from public.get_attendance_days(array['00000000-0000-4000-9f12-0000000000c1']::uuid[], current_date - 4, current_date - 4)),
          'excused', 'an excused absence still reads as excused');
select is((select day_status from public.get_attendance_days(array['00000000-0000-4000-9f12-0000000000c1']::uuid[], current_date, current_date)),
          'partial', 'a child still in the nursery reads as partial');
select is((select day_status from public.get_attendance_days(array['00000000-0000-4000-9f12-0000000000c2']::uuid[], current_date - 10, current_date - 10)),
          'not_enrolled', 'a day before the child joined still reads as not enrolled');

-- 7-9 · the names behind the ids, which now come from joins.
select is((select checked_in_by_en from public.get_attendance_days(array['00000000-0000-4000-9f12-0000000000c1']::uuid[], current_date - 5, current_date - 5)),
          'Teacher', 'who checked the child in is still named');
select is((select checked_out_by_ar from public.get_attendance_days(array['00000000-0000-4000-9f12-0000000000c1']::uuid[], current_date - 5, current_date - 5)),
          'المدير', 'who checked the child out is still named, in Arabic');
select is((select absence_reported_by_en from public.get_attendance_days(array['00000000-0000-4000-9f12-0000000000c1']::uuid[], current_date - 4, current_date - 4)),
          'Father', 'who sent the absence notice is still named');

-- 10-11 · the teacher of the branch, and the father, see the same as before.
select pg_temp.act_as('00000000-0000-4000-9f12-000000000a02');
select is(pg_temp.diff(array['00000000-0000-4000-9f12-0000000000c1','00000000-0000-4000-9f12-0000000000c2']::uuid[],
                       current_date - 10, current_date + 2),
          0, 'the branch teacher gets exactly the same rows as before');
select pg_temp.act_as('00000000-0000-4000-9f12-000000000a03');
select is(pg_temp.diff(array['00000000-0000-4000-9f12-0000000000c1','00000000-0000-4000-9f12-0000000000c2']::uuid[],
                       current_date - 10, current_date + 2),
          0, 'the father gets exactly the same rows as before');

-- 12 · and the father still sees only his own child, not the other family's.
select is(pg_temp.rows_seen(array['00000000-0000-4000-9f12-0000000000c2']::uuid[], current_date - 2, current_date),
          0, 'a father gets nothing for a child who is not his');

-- 13 · a teacher of another branch gets nothing for this branch's children.
select pg_temp.act_as('00000000-0000-4000-9f12-000000000a04');
select is(pg_temp.rows_seen(array['00000000-0000-4000-9f12-0000000000c1']::uuid[], current_date - 2, current_date),
          0, 'a teacher of another branch gets nothing');

-- 14 · the chain's admin sees both branches, exactly as before.
select pg_temp.act_as('00000000-0000-4000-9f12-000000000a06');
select is(pg_temp.diff(array['00000000-0000-4000-9f12-0000000000c1','00000000-0000-4000-9f12-0000000000c3']::uuid[],
                       current_date - 10, current_date + 2),
          0, 'the chain admin gets exactly the same rows as before, across branches');

select * from finish();
rollback;

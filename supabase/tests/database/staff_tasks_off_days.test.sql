-- Database test · staff tasks on a day off: a one-time or monthly task whose day is a weekend day or
-- a holiday comes on the next school day; a monthly one stays in its month (the last school day
-- before when the month ends first); daily and weekly tasks still skip a day off; the end date still
-- counts; the helpers are not for the app. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

-- The days in a range a task comes on, as "2027-01-04, 2027-02-01" (or "-").
create function pg_temp.days(p_title text, p_from date, p_to date) returns text language sql as $$
  select coalesce(string_agg(d::date::text, ', ' order by d), '-')
    from public.staff_tasks t
   cross join generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
   where t.title_en = p_title and t.nursery_id = '00000000-0000-4000-9d00-00000000000a'
     and public.staff_task_falls_on(t, d::date)
$$;

-- A nursery open Sunday to Thursday, with Sunday 3 January 2027 a holiday, and one teacher.
-- (January 2027: Friday the 1st, Saturday the 2nd, the holiday on the 3rd, Monday the 4th.
--  April 2027 ends on Friday the 30th.)
insert into public.nurseries (id, name_ar, name_en, working_days) values
  ('00000000-0000-4000-9d00-00000000000a', 'حضانة', 'Off Days Nursery', '["sun","mon","tue","wed","thu"]'::jsonb);
insert into public.academic_calendars (nursery_id, year, holidays_json)
values ('00000000-0000-4000-9d00-00000000000a', 2027, '["2027-01-03"]'::jsonb);
insert into auth.users (id, email) values ('00000000-0000-4000-9d00-000000000a01', 'offdays.teacher@test.local');
update public.users set role = 'teacher', nursery_id = '00000000-0000-4000-9d00-00000000000a', name_en = 'Teacher', status = 'active'
 where id = '00000000-0000-4000-9d00-000000000a01';

insert into public.staff_tasks (nursery_id, title_en, assign_to, repeats, on_date, days_of_week, day_of_month, ends_on, starts_on)
select '00000000-0000-4000-9d00-00000000000a', v.title, 'teachers', v.repeats, v.on_date::date, v.dow::smallint[], v.dom, v.ends_on::date, '2026-12-01'
  from (values
    ('Fire drill',     'monthly', null,         '{}',  1,    null),
    ('Month end',      'monthly', null,         '{}',  30,   null),
    ('Day four',       'monthly', null,         '{}',  4,    null),
    ('New year check', 'once',    '2027-01-01', '{}',  null, null),
    ('On a school day','once',    '2027-01-05', '{}',  null, null),
    ('Fridays',        'weekly',  null,         '{5}', null, null),
    ('Sundays',        'weekly',  null,         '{0}', null, null),
    ('Ends first',     'monthly', null,         '{}',  1,    '2027-01-03')
  ) as v(title, repeats, on_date, dow, dom, ends_on);

select is(pg_temp.days('Fire drill', '2027-01-01', '2027-02-28'), '2027-01-04, 2027-02-01',
  'a monthly task on the 1st: past the weekend and the holiday to Monday the 4th; on the 1st itself in February');
select is(pg_temp.days('Month end', '2027-02-01', '2027-04-30'), '2027-02-28, 2027-03-30, 2027-04-29',
  'a monthly task on the 30th: the last day of February, the 30th in March, and Thursday the 29th when April ends on a Friday');
select is(pg_temp.days('Day four', '2027-03-01', '2027-03-31'), '2027-03-04',
  'a monthly task on a school day stays on its day');
select is(pg_temp.days('New year check', '2026-12-25', '2027-01-31'), '2027-01-04',
  'a one-time task on a Friday comes on the next school day');
select is(pg_temp.days('On a school day', '2026-12-25', '2027-01-31'), '2027-01-05',
  'a one-time task on a school day stays on its day');
select is(pg_temp.days('Fridays', '2027-01-01', '2027-01-31'), '-',
  'a weekly task on a day off is skipped, not moved');
select is(pg_temp.days('Sundays', '2027-01-01', '2027-01-31'), '2027-01-10, 2027-01-17, 2027-01-24, 2027-01-31',
  'a weekly task skips the holiday Sunday and comes again the next week');
select is(pg_temp.days('Ends first', '2027-01-01', '2027-01-31'), '-',
  'a task that ends before the school day it would move to does not come');

select is((select count(*)::int from public.staff_tasks_generate('00000000-0000-4000-9d00-00000000000a', '2027-01-04')), 3,
  'Monday the 4th: the teacher gets the moved fire drill and new year check, and the task of the 4th');
select is((select count(*)::int from public.staff_tasks_generate('00000000-0000-4000-9d00-00000000000a', '2027-01-01')), 0,
  'the Friday itself makes nothing');

set local role authenticated;
select throws_ok($$ select public.nursery_next_school_day('00000000-0000-4000-9d00-00000000000a', '2027-01-01', '2027-01-31') $$,
  '42501', null, 'the app cannot call the helpers');
reset role;

select * from finish();
rollback;

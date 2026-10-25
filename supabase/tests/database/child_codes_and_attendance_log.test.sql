-- Database test · Child codes, the children who took extra hours, the check-in / check-out log
-- (searched by the child's name or code, a parent's name or phone, a weekday or a date), and each
-- child's day right now as the family sees it.
-- Everything runs in one transaction that is rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(19);

insert into public.nurseries (id, name_ar, name_en, working_days) values
  ('00000000-0000-4000-8000-00000000000a', 'حضانة أ', 'Nursery A', '["sun","mon","tue","wed","thu","fri","sat"]'),
  ('00000000-0000-4000-8000-00000000000b', 'حضانة ب', 'Nursery B', '["sun","mon","tue","wed","thu","fri","sat"]');

-- Closing is midnight, so a child still here today is late to be picked up right now.
update public.nursery_settings
   set late_pickup_grace_minutes = 5, standard_end_time = '00:00', late_billing_base = 'closing_time', timezone = 'Africa/Cairo'
 where nursery_id = '00000000-0000-4000-8000-00000000000a';

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000a01', 'log.admin@test.local'),
  ('00000000-0000-4000-8000-000000000a06', 'log.mona@test.local'),
  ('00000000-0000-4000-8000-000000000a07', 'log.karim@test.local'),
  ('00000000-0000-4000-8000-000000000a08', 'log.huda@test.local'),
  ('00000000-0000-4000-8000-000000000b01', 'log.admin.b@test.local');

update public.users u
   set role = v.role::public.user_role, nursery_id = v.nursery_id::uuid, name_ar = v.name_ar, name_en = v.name_en,
       phone = v.phone, status = 'active'
  from (values
    ('00000000-0000-4000-8000-000000000a01', 'branch_admin', '00000000-0000-4000-8000-00000000000a', 'المديرة', 'Head Admin', null),
    ('00000000-0000-4000-8000-000000000a06', 'parent',       '00000000-0000-4000-8000-00000000000a', 'منى', 'Mona', '01011111111'),
    ('00000000-0000-4000-8000-000000000a07', 'parent',       '00000000-0000-4000-8000-00000000000a', 'كريم', 'Karim', '01022222222'),
    ('00000000-0000-4000-8000-000000000a08', 'parent',       '00000000-0000-4000-8000-00000000000a', 'هدى', 'Huda', '01033333333'),
    ('00000000-0000-4000-8000-000000000b01', 'branch_admin', '00000000-0000-4000-8000-00000000000b', 'مديرة ب', 'Admin B', null)
  ) as v(id, role, nursery_id, name_ar, name_en, phone)
 where u.id = v.id::uuid;

insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000000a', 'الفراشات', 'Butterflies');

-- Omar joined in 2025; Sara joins in ten days. Laila is in the Butterflies.
insert into public.children (id, nursery_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000000a', 'ليلى', 'Laila', '2023-01-01', 'active', '2026-09-01'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-00000000000a', 'آدم', 'Adam', '2023-01-01', 'active', '2026-09-01'),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-00000000000a', 'عمر', 'Omar', '2023-01-01', 'active', '2025-03-01'),
  ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-00000000000a', 'سارة', 'Sara', '2023-01-01', 'active', current_date + 10);

update public.children set class_id = '00000000-0000-4000-8000-0000000000e1' where id = '00000000-0000-4000-8000-0000000000c1';

-- Mona is the mother of the first three; Karim the father of Laila and Omar; Huda Sara's mother.
insert into public.parent_children (parent_id, child_id, relationship, is_primary) values
  ('00000000-0000-4000-8000-000000000a06', '00000000-0000-4000-8000-0000000000c1', 'mother', true),
  ('00000000-0000-4000-8000-000000000a06', '00000000-0000-4000-8000-0000000000c2', 'mother', true),
  ('00000000-0000-4000-8000-000000000a06', '00000000-0000-4000-8000-0000000000c3', 'mother', true),
  ('00000000-0000-4000-8000-000000000a07', '00000000-0000-4000-8000-0000000000c1', 'father', false),
  ('00000000-0000-4000-8000-000000000a07', '00000000-0000-4000-8000-0000000000c3', 'father', false),
  ('00000000-0000-4000-8000-000000000a08', '00000000-0000-4000-8000-0000000000c4', 'mother', true);

alter table public.attendance_records disable trigger attendance_qr_working_hours_guard;
insert into public.attendance_records (child_id, attendance_date, check_in, check_out, check_in_method, check_out_method, extra_hours, extra_fee) values
  -- Sunday 6 September: Laila stays two hours extra, Adam goes home at noon.
  ('00000000-0000-4000-8000-0000000000c1', '2026-09-06', '2026-09-06 06:00+00', '2026-09-06 15:00+00', 'manual', 'manual', 2, 100),
  ('00000000-0000-4000-8000-0000000000c2', '2026-09-06', '2026-09-06 06:30+00', '2026-09-06 12:00+00', 'manual', 'manual', 0, 0),
  -- Monday 7: Omar one hour extra. Tuesday 8: Laila on time.
  ('00000000-0000-4000-8000-0000000000c3', '2026-09-07', '2026-09-07 07:00+00', '2026-09-07 14:00+00', 'manual', 'manual', 1, 50),
  ('00000000-0000-4000-8000-0000000000c1', '2026-09-08', '2026-09-08 06:00+00', '2026-09-08 12:00+00', 'manual', 'manual', 0, 0),
  -- Today: Laila came and went; Omar is still here, past closing.
  ('00000000-0000-4000-8000-0000000000c1', (now() at time zone 'Africa/Cairo')::date, now() - interval '3 hours', now() - interval '1 hour', 'manual', 'manual', 0, 0),
  ('00000000-0000-4000-8000-0000000000c3', (now() at time zone 'Africa/Cairo')::date, now() - interval '1 hour', null, 'manual', null, 0, 0);
alter table public.attendance_records enable trigger attendance_qr_working_hours_guard;

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

create function pg_temp.log_of(p_search text default null, p_weekday int default null, p_day date default null, p_limit int default 50, p_offset int default 0, p_class uuid default null)
returns text
language sql as $$
  select coalesce(string_agg(format('%s %s', l.attendance_date, l.full_name_en), ', ' order by l.attendance_date, l.full_name_en), '')
         || coalesce(format(' (%s)', max(l.total_count)), '')
    from public.get_attendance_period_log('00000000-0000-4000-8000-00000000000a', '2026-09-01', '2026-09-10',
                                          p_search => p_search, p_weekday => p_weekday, p_day => p_day, p_class_id => p_class,
                                          p_limit => p_limit, p_offset => p_offset) l
$$;

-- ---------------------------------------------------------------------------------------------
-- Child codes
select is(
  (select count(*)::int from public.children
    where id::text like '00000000-0000-4000-8000-0000000000c%' and child_id_number ~ '^CH-20[0-9]{2}-[0-9]{5,}$'),
  4,
  'every new child gets a code'
);

select ok(
  (select child_id_number like 'CH-2025-%' from public.children where id = '00000000-0000-4000-8000-0000000000c3'),
  'the code carries the year the child joined'
);

select is(
  (select count(distinct child_id_number)::int from public.children where id::text like '00000000-0000-4000-8000-0000000000c%'),
  4,
  'no two children share a code'
);

update public.children set child_id_number = 'CHANGED' where id = '00000000-0000-4000-8000-0000000000c1';
select isnt(
  (select child_id_number from public.children where id = '00000000-0000-4000-8000-0000000000c1'),
  'CHANGED',
  'a code never changes'
);

-- ---------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-000000000a01');

select is(
  (select format('%s children, %s days', k->>'extra_hours_children', k->>'extra_hours_days')
     from public.get_attendance_period_kpis('00000000-0000-4000-8000-00000000000a', '2026-09-01', '2026-09-10') k),
  '2 children, 2 days',
  'the period counts the children who took extra hours, and on how many days'
);

select is(pg_temp.log_of(),
  '2026-09-06 Adam, 2026-09-06 Laila, 2026-09-07 Omar, 2026-09-08 Laila (4)',
  'the log: every check-in of the period');

select is(pg_temp.log_of((select child_id_number from public.children where id = '00000000-0000-4000-8000-0000000000c3')),
  '2026-09-07 Omar (1)',
  'found by the child''s code');

select is(pg_temp.log_of('karim'),
  '2026-09-06 Laila, 2026-09-07 Omar, 2026-09-08 Laila (3)',
  'found by the father''s name');

select is(pg_temp.log_of('01011111111'),
  '2026-09-06 Adam, 2026-09-06 Laila, 2026-09-07 Omar, 2026-09-08 Laila (4)',
  'found by a parent''s phone');

select is(pg_temp.log_of('lai karim'),
  '2026-09-06 Laila, 2026-09-08 Laila (2)',
  'every word must match');

select is(pg_temp.log_of(p_weekday => 0) || ' / ' || pg_temp.log_of(p_day => '2026-09-07'),
  '2026-09-06 Adam, 2026-09-06 Laila (2) / 2026-09-07 Omar (1)',
  'filtered by weekday (Sunday) and by date');

select is(pg_temp.log_of(p_class => '00000000-0000-4000-8000-0000000000e1'),
  '2026-09-06 Laila, 2026-09-08 Laila (2)',
  'filtered by class');

select is(pg_temp.log_of(p_limit => 2, p_offset => 2),
  '2026-09-06 Adam, 2026-09-06 Laila (4)',
  'one page at a time (newest first), with the total');

select is(
  (select format('%s / %s / %s / %s', l.father_name_en, l.check_in, l.check_out, l.extra_hours)
     from public.get_attendance_period_log('00000000-0000-4000-8000-00000000000a', '2026-09-01', '2026-09-10', 'omar') l),
  'Karim / 2026-09-07 07:00:00+00 / 2026-09-07 14:00:00+00 / 1.00',
  'a row: the father, the exact times and the extra hours'
);

select is(
  (select format('%s %s %s', d.child_code is not null, d.father_name_en, position('01011111111' in d.parents_text) > 0)
     from public.get_attendance_day_children('00000000-0000-4000-8000-00000000000a', '2026-09-06') d
    where d.full_name_en = 'Laila'),
  't Karim t',
  'the card''s lists carry the code, the father and every parent to search on'
);

-- ---------------------------------------------------------------------------------------------
-- The family's view of today.
select pg_temp.act_as('00000000-0000-4000-8000-000000000a06');
select is(
  (select string_agg(format('%s:%s:%s', c.full_name_en, t.day_status, t.late_now), ', ' order by c.full_name_en)
     from public.get_children_today(array['00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2',
                                          '00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000c4']::uuid[]) t
     join public.children c on c.id = t.child_id),
  'Adam:absent:f, Laila:picked_up:f, Omar:in_nursery:t',
  'a parent sees their own children''s day: here (and late now), gone home, not come; not another family''s child'
);

select throws_ok(
  $$ select * from public.get_attendance_period_log('00000000-0000-4000-8000-00000000000a', '2026-09-01', '2026-09-10') $$,
  '42501', 'attendance_forbidden',
  'a parent cannot read the nursery''s log'
);

select pg_temp.act_as('00000000-0000-4000-8000-000000000a08');
select is(
  (select string_agg(format('%s:%s', c.full_name_en, t.day_status), ', ')
     from public.get_children_today(array['00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c4']::uuid[]) t
     join public.children c on c.id = t.child_id),
  'Sara:not_enrolled',
  'a child who has not joined yet; another family''s child stays hidden'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.get_attendance_period_log(uuid, date, date, text, integer, date, uuid, integer, integer)', 'execute')
  and not has_function_privilege('anon', 'public.get_children_today(uuid[])', 'execute')
  and not has_function_privilege('authenticated', 'public.child_family_names(uuid)', 'execute'),
  'signed-out visitors cannot call them, and the family helper is internal'
);

select * from finish();
rollback;

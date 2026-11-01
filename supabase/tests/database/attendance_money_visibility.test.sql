-- Database test · The dashboard's attendance figures show the late-pickup money only to the people
-- allowed to see the nursery's finances (money_visible): the branch admin and a finance manager see
-- it; a teacher and an HR manager get the same figures with the money empty (null), in every
-- function the dashboard reads. The access check itself is unchanged, and the unfiltered functions
-- are closed to the app.
-- Everything runs in one transaction that is rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

insert into public.nurseries (id, name_ar, name_en, working_days) values
  ('00000000-0000-4000-a300-00000000000a', 'حضانة أ', 'Nursery A', '["sun","mon","tue","wed","thu","fri","sat"]'),
  ('00000000-0000-4000-a300-00000000000b', 'حضانة ب', 'Nursery B', '["sun","mon","tue","wed","thu","fri","sat"]');

update public.nursery_settings set timezone = 'Africa/Cairo' where nursery_id = '00000000-0000-4000-a300-00000000000a';

insert into auth.users (id, email) values
  ('00000000-0000-4000-a300-000000000a01', 'money.admin@test.local'),
  ('00000000-0000-4000-a300-000000000a02', 'money.teacher@test.local'),
  ('00000000-0000-4000-a300-000000000a03', 'money.finance@test.local'),
  ('00000000-0000-4000-a300-000000000a04', 'money.hr@test.local'),
  ('00000000-0000-4000-a300-000000000a06', 'money.parent@test.local'),
  ('00000000-0000-4000-a300-000000000b01', 'money.admin.b@test.local');

update public.users u
   set role = v.role::public.user_role, nursery_id = v.nursery_id::uuid, name_ar = v.name_en, name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-a300-000000000a01', 'branch_admin', '00000000-0000-4000-a300-00000000000a', 'Head Admin'),
    ('00000000-0000-4000-a300-000000000a02', 'teacher',      '00000000-0000-4000-a300-00000000000a', 'Teacher'),
    ('00000000-0000-4000-a300-000000000a03', 'manager',      '00000000-0000-4000-a300-00000000000a', 'Finance Manager'),
    ('00000000-0000-4000-a300-000000000a04', 'manager',      '00000000-0000-4000-a300-00000000000a', 'HR Manager'),
    ('00000000-0000-4000-a300-000000000a06', 'parent',       '00000000-0000-4000-a300-00000000000a', 'Mona'),
    ('00000000-0000-4000-a300-000000000b01', 'branch_admin', '00000000-0000-4000-a300-00000000000b', 'Admin B')
  ) as v(id, role, nursery_id, name_en)
 where u.id = v.id::uuid;
update public.users set department = 'finance' where id = '00000000-0000-4000-a300-000000000a03';
update public.users set department = 'hr' where id = '00000000-0000-4000-a300-000000000a04';

insert into public.children (id, nursery_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-a300-0000000000c1', '00000000-0000-4000-a300-00000000000a', 'ليلى', 'Laila', '2023-01-01', 'active',
   (now() at time zone 'Africa/Cairo')::date - 60);

insert into public.parent_children (parent_id, child_id, is_primary) values
  ('00000000-0000-4000-a300-000000000a06', '00000000-0000-4000-a300-0000000000c1', true);

insert into public.invoices (id, nursery_id, parent_id, amount, due_date, status, invoice_type) values
  ('00000000-0000-4000-a300-0000000000f1', '00000000-0000-4000-a300-00000000000a', '00000000-0000-4000-a300-000000000a06',
   100, (now() at time zone 'Africa/Cairo')::date + 7, 'pending', 'extra_hours');

-- Today, picked up two hours late: 100 billed, not paid yet.
insert into public.attendance_records
  (child_id, attendance_date, check_in, check_out, check_in_method, check_out_method,
   extra_hours, extra_hours_billed, extra_fee, late_minutes, late_charge_invoice_id)
select '00000000-0000-4000-a300-0000000000c1', d, (d + time '08:00') at time zone 'Africa/Cairo', (d + time '18:00') at time zone 'Africa/Cairo',
       'manual', 'manual', 2, 2, 100, 120, '00000000-0000-4000-a300-0000000000f1'
  from (select (now() at time zone 'Africa/Cairo')::date as d) t;

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

create function pg_temp.today() returns date
language sql as $$ select (now() at time zone 'Africa/Cairo')::date $$;

-- The month's money and the top late child, as get_attendance_kpis gives them.
create function pg_temp.kpi_money() returns jsonb
language sql as $$
  select jsonb_build_object(
    'visible', k -> 'money_visible',
    'today', k -> 'today' -> 'extra_fee_today',
    'billed', k -> 'month' -> 'extra_fee_billed',
    'collected', k -> 'month' -> 'extra_fee_collected',
    'outstanding', k -> 'month' -> 'extra_fee_outstanding',
    'top_fee', k -> 'top_late' -> 0 -> 'extra_fee',
    'top_hours', k -> 'top_late' -> 0 -> 'extra_hours')
  from (select public.get_attendance_kpis('00000000-0000-4000-a300-00000000000a') as k) x
$$;

-- How many rows each list returns, and how many of them still carry money.
create function pg_temp.list_money() returns text
language sql as $$
  select format('records %s/%s, log %s/%s, children %s/%s, day %s/%s',
    (select count(*) from public.get_attendance_period_records('00000000-0000-4000-a300-00000000000a', date_trunc('month', pg_temp.today())::date, pg_temp.today())),
    (select count(*) from public.get_attendance_period_records('00000000-0000-4000-a300-00000000000a', date_trunc('month', pg_temp.today())::date, pg_temp.today())
      where extra_fee is not null or invoice_id is not null or invoice_number is not null or invoice_status is not null
         or invoice_due_date is not null or invoice_paid_at is not null),
    (select count(*) from public.get_attendance_period_log('00000000-0000-4000-a300-00000000000a', date_trunc('month', pg_temp.today())::date, pg_temp.today())),
    (select count(*) from public.get_attendance_period_log('00000000-0000-4000-a300-00000000000a', date_trunc('month', pg_temp.today())::date, pg_temp.today())
      where extra_fee is not null or invoice_status is not null),
    (select count(*) from public.get_attendance_period_children('00000000-0000-4000-a300-00000000000a', date_trunc('month', pg_temp.today())::date, pg_temp.today())),
    (select count(*) from public.get_attendance_period_children('00000000-0000-4000-a300-00000000000a', date_trunc('month', pg_temp.today())::date, pg_temp.today())
      where extra_fee is not null),
    (select count(*) from public.get_attendance_day_children('00000000-0000-4000-a300-00000000000a', pg_temp.today())),
    (select count(*) from public.get_attendance_day_children('00000000-0000-4000-a300-00000000000a', pg_temp.today())
      where extra_fee is not null or invoice_status is not null))
$$;

-- ---------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-a300-000000000a01');
select set_config('test.admin_kpis', public.get_attendance_kpis('00000000-0000-4000-a300-00000000000a')::text, true);
select set_config('test.admin_period', public.get_attendance_period_kpis('00000000-0000-4000-a300-00000000000a',
  date_trunc('month', pg_temp.today())::date, pg_temp.today())::text, true);

select is(
  pg_temp.kpi_money(),
  '{"visible": true, "today": 100, "billed": 100, "collected": 0, "outstanding": 100, "top_fee": 100, "top_hours": 2}'::jsonb,
  'the branch admin sees the late-pickup money'
);

select is(
  pg_temp.list_money(),
  'records 1/1, log 1/1, children 1/1, day 1/1',
  'and the fee and invoice of each late pickup'
);

select pg_temp.act_as('00000000-0000-4000-a300-000000000a02');

select is(
  pg_temp.kpi_money(),
  '{"visible": false, "today": null, "billed": null, "collected": null, "outstanding": null, "top_fee": null, "top_hours": 2}'::jsonb,
  'a teacher gets the attendance figures with the money empty'
);

select is(
  (public.get_attendance_kpis('00000000-0000-4000-a300-00000000000a') -> 'month')
    - array['extra_fee_billed', 'extra_fee_collected', 'extra_fee_outstanding'],
  (current_setting('test.admin_kpis')::jsonb -> 'month')
    - array['extra_fee_billed', 'extra_fee_collected', 'extra_fee_outstanding'],
  'every other figure of the month is the admin''s'
);

select is(
  (select jsonb_build_object('visible', k -> 'money_visible', 'billed', k -> 'extra_fee_billed', 'collected', k -> 'extra_fee_collected',
                             'outstanding', k -> 'extra_fee_outstanding', 'top_fee', k -> 'top_late' -> 0 -> 'extra_fee')
     from (select public.get_attendance_period_kpis('00000000-0000-4000-a300-00000000000a',
                                                     date_trunc('month', pg_temp.today())::date, pg_temp.today()) as k) x),
  '{"visible": false, "billed": null, "collected": null, "outstanding": null, "top_fee": null}'::jsonb,
  'the same for a chosen period'
);

select is(
  public.get_attendance_period_kpis('00000000-0000-4000-a300-00000000000a', date_trunc('month', pg_temp.today())::date, pg_temp.today())
    - array['extra_fee_billed', 'extra_fee_collected', 'extra_fee_outstanding', 'top_late', 'money_visible'],
  current_setting('test.admin_period')::jsonb
    - array['extra_fee_billed', 'extra_fee_collected', 'extra_fee_outstanding', 'top_late', 'money_visible'],
  'with every other figure of the period'
);

select is(
  pg_temp.list_money(),
  'records 1/0, log 1/0, children 1/0, day 1/0',
  'the lists behind the cards keep their rows and lose the fee and the invoice'
);

select is(
  (select format('%s h, %s min', r.extra_hours::integer, r.late_minutes)
     from public.get_attendance_period_records('00000000-0000-4000-a300-00000000000a', date_trunc('month', pg_temp.today())::date, pg_temp.today()) r),
  '2 h, 120 min',
  'the late hours themselves stay'
);

select pg_temp.act_as('00000000-0000-4000-a300-000000000a03');
select is(
  (pg_temp.kpi_money() ->> 'billed')::numeric,
  100::numeric,
  'a finance manager sees the money'
);

select pg_temp.act_as('00000000-0000-4000-a300-000000000a04');
select is(
  pg_temp.kpi_money() -> 'billed',
  'null'::jsonb,
  'an HR manager does not'
);

select pg_temp.act_as('00000000-0000-4000-a300-000000000b01');
select throws_ok(
  $$ select public.get_attendance_kpis('00000000-0000-4000-a300-00000000000a') $$,
  '42501', 'attendance_forbidden',
  'another nursery''s admin is still refused'
);

select throws_ok(
  $$ select * from public.get_attendance_period_records('00000000-0000-4000-a300-00000000000a', current_date - 7, current_date) $$,
  '42501', 'attendance_forbidden',
  'by the lists too'
);

reset role;
select is(
  (select string_agg(f, ', ' order by f) from unnest(array[
     'public._attendance_kpis_all(uuid, date)',
     'public._attendance_period_kpis_all(uuid, date, date)',
     'public._attendance_day_children_all(uuid, date)',
     'public._attendance_period_children_all(uuid, date, date)',
     'public._attendance_period_records_all(uuid, date, date)',
     'public._attendance_period_log_all(uuid, date, date, text, integer, date, uuid, integer, integer)']) f
    where has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute')),
  null,
  'the unfiltered functions are closed to the app'
);

select ok(
  not has_function_privilege('anon', 'public.get_attendance_kpis(uuid, date)', 'execute')
  and not has_function_privilege('anon', 'public.money_visible(uuid)', 'execute'),
  'signed-out visitors call neither'
);

select * from finish();
rollback;

-- Database test · The dashboard's attendance card for a period (get_attendance_period_kpis):
-- attendance, late pickups, the extra-hours money of the period's own days, the children with the
-- most extra hours, days still to come left out, and who may read it.
-- Everything runs in one transaction that is rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(13);

insert into public.nurseries (id, name_ar, name_en, working_days) values
  ('00000000-0000-4000-e000-00000000000a', 'حضانة أ', 'Nursery A', '["sun","mon","tue","wed","thu","fri","sat"]'),
  ('00000000-0000-4000-e000-00000000000b', 'حضانة ب', 'Nursery B', '["sun","mon","tue","wed","thu","fri","sat"]');

insert into auth.users (id, email) values
  ('00000000-0000-4000-e000-000000000a01', 'period.admin@test.local'),
  ('00000000-0000-4000-e000-000000000a06', 'period.parent@test.local'),
  ('00000000-0000-4000-e000-000000000b01', 'period.admin.b@test.local');

update public.users u
   set role = v.role::public.user_role,
       nursery_id = v.nursery_id::uuid,
       name_ar = v.name_ar,
       name_en = v.name_en,
       status = 'active'
  from (values
    ('00000000-0000-4000-e000-000000000a01', 'branch_admin', '00000000-0000-4000-e000-00000000000a', 'المديرة', 'Head Admin'),
    ('00000000-0000-4000-e000-000000000a06', 'parent',       '00000000-0000-4000-e000-00000000000a', 'منى', 'Mona Parent'),
    ('00000000-0000-4000-e000-000000000b01', 'branch_admin', '00000000-0000-4000-e000-00000000000b', 'مديرة ب', 'Admin B')
  ) as v(id, role, nursery_id, name_ar, name_en)
 where u.id = v.id::uuid;

insert into public.children (id, nursery_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-e000-0000000000c1', '00000000-0000-4000-e000-00000000000a', 'ليلى', 'Laila', '2023-01-01', 'active', '2026-09-01'),
  ('00000000-0000-4000-e000-0000000000c2', '00000000-0000-4000-e000-00000000000a', 'آدم', 'Adam', '2023-01-01', 'active', '2026-09-01');

insert into public.parent_children (parent_id, child_id) values
  ('00000000-0000-4000-e000-000000000a06', '00000000-0000-4000-e000-0000000000c1'),
  ('00000000-0000-4000-e000-000000000a06', '00000000-0000-4000-e000-0000000000c2');

-- Laila's two late days are on two invoices: one paid, one not yet.
insert into public.invoices (id, nursery_id, parent_id, amount, due_date, status, invoice_type) values
  ('00000000-0000-4000-e000-0000000000f1', '00000000-0000-4000-e000-00000000000a', '00000000-0000-4000-e000-000000000a06', 100, '2026-09-10', 'paid', 'extra_hours'),
  ('00000000-0000-4000-e000-0000000000f2', '00000000-0000-4000-e000-00000000000a', '00000000-0000-4000-e000-000000000a06', 50, '2026-09-10', 'pending', 'extra_hours');

-- Past days written directly: the working-hours guard is for live scans.
alter table public.attendance_records disable trigger attendance_qr_working_hours_guard;

insert into public.attendance_records
  (child_id, attendance_date, check_in, check_out, check_in_method, check_out_method,
   extra_hours, extra_hours_billed, extra_fee, late_minutes, late_charge_invoice_id, needs_review)
values
  -- Before the period: not counted.
  ('00000000-0000-4000-e000-0000000000c1', '2026-08-31', '2026-08-31 06:00+00', '2026-08-31 18:00+00', 'manual', 'manual',
   5, 5, 250, 300, null, false),
  -- Two hours late, billed, paid.
  ('00000000-0000-4000-e000-0000000000c1', '2026-09-02', '2026-09-02 06:00+00', '2026-09-02 15:00+00', 'qr_parent', 'qr_parent',
   2, 2, 100, 120, '00000000-0000-4000-e000-0000000000f1', false),
  -- One hour late, billed, not paid yet; entered by hand and waiting for a review.
  ('00000000-0000-4000-e000-0000000000c1', '2026-09-03', '2026-09-03 06:00+00', '2026-09-03 14:00+00', 'manual', 'manual',
   1, 1, 50, 60, '00000000-0000-4000-e000-0000000000f2', true),
  ('00000000-0000-4000-e000-0000000000c2', '2026-09-03', '2026-09-03 06:00+00', '2026-09-03 12:00+00', 'qr_parent', 'qr_parent',
   0, 0, 0, 0, null, false),
  -- After the period: not counted.
  ('00000000-0000-4000-e000-0000000000c2', '2026-09-15', '2026-09-15 06:00+00', '2026-09-15 18:00+00', 'manual', 'manual',
   4, 4, 200, 240, null, false);

alter table public.attendance_records enable trigger attendance_qr_working_hours_guard;

-- Adam is away on the 4th, with a notice from his parent.
insert into public.attendance_absence_reports (nursery_id, child_id, absence_date, reason, note, reported_by) values
  ('00000000-0000-4000-e000-00000000000a', '00000000-0000-4000-e000-0000000000c2', '2026-09-04', 'sick', null,
   '00000000-0000-4000-e000-000000000a06');

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

create function pg_temp.kpis() returns jsonb
language sql as $$
  select public.get_attendance_period_kpis('00000000-0000-4000-e000-00000000000a', '2026-09-01', '2026-09-10')
$$;

-- ---------------------------------------------------------------------------------------------
-- The nursery's admin, for 1–10 September (ten school days, two children).
select pg_temp.act_as('00000000-0000-4000-e000-000000000a01');

select is(
  (select format('%s..%s', k->>'from', k->>'to') from pg_temp.kpis() k),
  '2026-09-01..2026-09-10',
  'the period asked for'
);

select is(
  (select format('days %s, expected %s, present %s, excused %s, absent %s, rate %s',
                 k->>'school_days', k->>'expected_child_days', k->>'present_child_days',
                 k->>'excused_child_days', k->>'absent_child_days', k->>'attendance_rate')
     from pg_temp.kpis() k),
  'days 10, expected 20, present 3, excused 1, absent 16, rate 15.0',
  'attendance: only the period''s days, an absence notice counts as excused'
);

select is(
  (select format('late %s, hours %s, billed hours %s', k->>'late_pickups', k->>'extra_hours', k->>'extra_hours_billed') from pg_temp.kpis() k),
  'late 2, hours 3.00, billed hours 3.00',
  'late pickups and extra hours of the period only'
);

select is(
  (select format('billed %s, collected %s, outstanding %s', k->>'extra_fee_billed', k->>'extra_fee_collected', k->>'extra_fee_outstanding') from pg_temp.kpis() k),
  'billed 150.00, collected 100.00, outstanding 50.00',
  'the money of the period''s charges: paid invoice collected, pending invoice outstanding'
);

select is(
  (select format('review %s, qr %s, manual %s', k->>'needs_review', k->>'qr_scans', k->>'manual_entries') from pg_temp.kpis() k),
  'review 1, qr 2, manual 1',
  'days waiting for a review and how children were scanned, in the period'
);

select is(
  (select format('%s: %s days, %s h, %s', r->>'full_name_en', r->>'late_days', r->>'extra_hours', r->>'extra_fee')
     from pg_temp.kpis() k, jsonb_array_elements(k->'top_late') r),
  'Laila: 2 days, 3.00 h, 150.00',
  'the children with the most extra hours in the period'
);

select is(
  (select (k->>'to')::date from public.get_attendance_period_kpis('00000000-0000-4000-e000-00000000000a', current_date - 3, current_date + 30) k),
  (now() at time zone 'Africa/Cairo')::date,
  'days still to come are not counted: the period ends today'
);

select throws_ok(
  $$ select public.get_attendance_period_kpis('00000000-0000-4000-e000-00000000000a', '2026-09-10', '2026-09-01') $$,
  '22023', 'attendance_invalid_range',
  'a start after the end is refused'
);

select throws_ok(
  $$ select public.get_attendance_period_kpis('00000000-0000-4000-e000-00000000000a', '2025-01-01', '2026-01-02') $$,
  '22023', 'attendance_invalid_range',
  'more than 366 days is refused'
);

-- ---------------------------------------------------------------------------------------------
-- Nobody else.
select pg_temp.act_as('00000000-0000-4000-e000-000000000b01');
select throws_ok(
  $$ select pg_temp.kpis() $$,
  '42501', 'attendance_forbidden',
  'another nursery''s admin cannot read it'
);

select pg_temp.act_as('00000000-0000-4000-e000-000000000a06');
select throws_ok(
  $$ select pg_temp.kpis() $$,
  '42501', 'attendance_forbidden',
  'a parent cannot read it'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.get_attendance_period_kpis(uuid, date, date)', 'execute'),
  'signed-out visitors cannot call it'
);
select ok(
  has_function_privilege('authenticated', 'public.get_attendance_period_kpis(uuid, date, date)', 'execute'),
  'signed-in users can call it (the function checks the staff member)'
);

select * from finish();
rollback;

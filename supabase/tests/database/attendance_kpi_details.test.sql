-- Database test · The details behind the dashboard's attendance numbers: each child's day, each
-- child's period, each school day, and the late / charged / flagged days. Every list adds up to the
-- number on the card it opens from, and only the nursery's staff can read them.
-- Everything runs in one transaction that is rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

insert into public.nurseries (id, name_ar, name_en, working_days) values
  ('00000000-0000-4000-f000-00000000000a', 'حضانة أ', 'Nursery A', '["sun","mon","tue","wed","thu","fri","sat"]'),
  ('00000000-0000-4000-f000-00000000000b', 'حضانة ب', 'Nursery B', '["sun","mon","tue","wed","thu","fri","sat"]');

-- Picked up 5 minutes after closing is still on time; closing is midnight, so anyone still here
-- today is late to be picked up right now.
update public.nursery_settings
   set late_pickup_grace_minutes = 5, standard_end_time = '00:00', late_billing_base = 'closing_time', timezone = 'Africa/Cairo'
 where nursery_id = '00000000-0000-4000-f000-00000000000a';

insert into auth.users (id, email) values
  ('00000000-0000-4000-f000-000000000a01', 'details.admin@test.local'),
  ('00000000-0000-4000-f000-000000000a06', 'details.parent@test.local'),
  ('00000000-0000-4000-f000-000000000b01', 'details.admin.b@test.local');

update public.users u
   set role = v.role::public.user_role,
       nursery_id = v.nursery_id::uuid,
       name_ar = v.name_ar,
       name_en = v.name_en,
       phone = v.phone,
       status = 'active'
  from (values
    ('00000000-0000-4000-f000-000000000a01', 'branch_admin', '00000000-0000-4000-f000-00000000000a', 'المديرة', 'Head Admin', null),
    ('00000000-0000-4000-f000-000000000a06', 'parent',       '00000000-0000-4000-f000-00000000000a', 'منى', 'Mona Parent', '01012345678'),
    ('00000000-0000-4000-f000-000000000b01', 'branch_admin', '00000000-0000-4000-f000-00000000000b', 'مديرة ب', 'Admin B', null)
  ) as v(id, role, nursery_id, name_ar, name_en, phone)
 where u.id = v.id::uuid;

insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-f000-0000000000e1', '00000000-0000-4000-f000-00000000000a', 'الفراشات', 'Butterflies');

-- Sara joins on the 5th; the others on the 1st.
insert into public.children (id, nursery_id, full_name_ar, full_name_en, dob, status, enrollment_date, class_id) values
  ('00000000-0000-4000-f000-0000000000c1', '00000000-0000-4000-f000-00000000000a', 'ليلى', 'Laila', '2023-01-01', 'active', '2026-09-01', '00000000-0000-4000-f000-0000000000e1'),
  ('00000000-0000-4000-f000-0000000000c2', '00000000-0000-4000-f000-00000000000a', 'آدم', 'Adam', '2023-01-01', 'active', '2026-09-01', null),
  ('00000000-0000-4000-f000-0000000000c3', '00000000-0000-4000-f000-00000000000a', 'عمر', 'Omar', '2023-01-01', 'active', '2026-09-01', null),
  ('00000000-0000-4000-f000-0000000000c4', '00000000-0000-4000-f000-00000000000a', 'سارة', 'Sara', '2023-01-01', 'active', '2026-09-05', null);

insert into public.parent_children (parent_id, child_id, is_primary) values
  ('00000000-0000-4000-f000-000000000a06', '00000000-0000-4000-f000-0000000000c1', true),
  ('00000000-0000-4000-f000-000000000a06', '00000000-0000-4000-f000-0000000000c2', true),
  ('00000000-0000-4000-f000-000000000a06', '00000000-0000-4000-f000-0000000000c3', true),
  ('00000000-0000-4000-f000-000000000a06', '00000000-0000-4000-f000-0000000000c4', true);

insert into public.invoices (id, nursery_id, parent_id, amount, due_date, status, invoice_type, paid_at) values
  ('00000000-0000-4000-f000-0000000000f1', '00000000-0000-4000-f000-00000000000a', '00000000-0000-4000-f000-000000000a06', 100, '2026-09-10', 'paid', 'extra_hours', '2026-09-08 10:00+00'),
  ('00000000-0000-4000-f000-0000000000f2', '00000000-0000-4000-f000-00000000000a', '00000000-0000-4000-f000-000000000a06', 50, '2026-09-10', 'pending', 'extra_hours', null);

-- Past days written directly: the working-hours guard is for live scans.
alter table public.attendance_records disable trigger attendance_qr_working_hours_guard;

insert into public.attendance_records
  (child_id, attendance_date, check_in, check_out, check_in_method, check_out_method,
   extra_hours, extra_hours_billed, extra_fee, late_minutes, late_charge_invoice_id, needs_review, pickup_person_name, pickup_relationship)
values
  -- Before the period.
  ('00000000-0000-4000-f000-0000000000c1', '2026-08-31', '2026-08-31 06:00+00', '2026-08-31 18:00+00', 'manual', 'manual', 5, 5, 250, 300, null, false, null, null),
  -- Laila: two hours late, paid; one hour late, not paid yet and flagged; here on the 4th, never checked out.
  ('00000000-0000-4000-f000-0000000000c1', '2026-09-02', '2026-09-02 06:00+00', '2026-09-02 15:00+00', 'qr_parent', 'qr_custom', 2, 2, 100, 120,
   '00000000-0000-4000-f000-0000000000f1', false, 'Grandma Huda', 'Grandmother'),
  ('00000000-0000-4000-f000-0000000000c1', '2026-09-03', '2026-09-03 06:00+00', '2026-09-03 14:00+00', 'manual', 'manual', 1, 1, 50, 60,
   '00000000-0000-4000-f000-0000000000f2', true, null, null),
  ('00000000-0000-4000-f000-0000000000c1', '2026-09-04', '2026-09-04 06:00+00', null, 'manual', null, 0, 0, 0, 0, null, false, null, null),
  ('00000000-0000-4000-f000-0000000000c2', '2026-09-03', '2026-09-03 06:00+00', '2026-09-03 12:00+00', 'qr_parent', 'qr_parent', 0, 0, 0, 0, null, false, null, null),
  -- Omar: picked up ten minutes late (past the five-minute grace), nothing charged.
  ('00000000-0000-4000-f000-0000000000c3', '2026-09-06', '2026-09-06 06:00+00', '2026-09-06 13:10+00', 'manual', 'manual', 0, 0, 0, 10, null, false, null, null),
  -- After the period.
  ('00000000-0000-4000-f000-0000000000c2', '2026-09-15', '2026-09-15 06:00+00', '2026-09-15 18:00+00', 'manual', 'manual', 4, 4, 200, 240, null, false, null, null),
  -- Omar is here today, past closing.
  ('00000000-0000-4000-f000-0000000000c3', (now() at time zone 'Africa/Cairo')::date, now() - interval '1 hour', null, 'manual', null, 0, 0, 0, 0, null, false, null, null);

alter table public.attendance_records enable trigger attendance_qr_working_hours_guard;

-- Adam is away on the 4th, with a notice from his parent.
insert into public.attendance_absence_reports (nursery_id, child_id, absence_date, reason, note, reported_by) values
  ('00000000-0000-4000-f000-00000000000a', '00000000-0000-4000-f000-0000000000c2', '2026-09-04', 'sick', 'Fever',
   '00000000-0000-4000-f000-000000000a06');

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

create function pg_temp.period_kpis() returns jsonb
language sql as $$
  select public.get_attendance_period_kpis('00000000-0000-4000-f000-00000000000a', '2026-09-01', '2026-09-10')
$$;

-- ---------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-f000-000000000a01');

-- One day: each child's state.
select is(
  (select string_agg(format('%s:%s', d.full_name_en, d.day_status), ', ' order by d.full_name_en)
     from public.get_attendance_day_children('00000000-0000-4000-f000-00000000000a', '2026-09-04') d),
  'Adam:excused, Laila:in_nursery, Omar:absent',
  'one day: still here, absent with a notice, absent; a child not enrolled yet is left out'
);

select is(
  (select format('%s / %s / %s / %s / %s', d.absence_reason, d.absence_note, d.absence_reported_by_en, d.parent_name_en, d.parent_phone)
     from public.get_attendance_day_children('00000000-0000-4000-f000-00000000000a', '2026-09-04') d
    where d.full_name_en = 'Adam'),
  'sick / Fever / Mona Parent / Mona Parent / 01012345678',
  'an absence: the family''s notice, who sent it, and the parent to call'
);

select is(
  (select format('%s, class %s, in %s, out %s, by %s (%s), extra %s h, fee %s, invoice %s',
                 d.day_status, d.class_name_en, d.check_in, d.check_out, d.pickup_person_name, d.pickup_relationship,
                 d.extra_hours, d.extra_fee, d.invoice_status)
     from public.get_attendance_day_children('00000000-0000-4000-f000-00000000000a', '2026-09-02') d
    where d.full_name_en = 'Laila'),
  'picked_up, class Butterflies, in 2026-09-02 06:00:00+00, out 2026-09-02 15:00:00+00, by Grandma Huda (Grandmother), extra 2.00 h, fee 100.00, invoice paid',
  'a day attended: class, times, who picked the child up, extra hours and their invoice'
);

-- Today: the lists match today's numbers on the card.
select is(
  (select format('in %s, out %s, excused %s, absent %s, late now %s',
                 count(*) filter (where d.day_status = 'in_nursery'), count(*) filter (where d.day_status = 'picked_up'),
                 count(*) filter (where d.day_status = 'excused'), count(*) filter (where d.day_status = 'absent'),
                 count(*) filter (where d.late_now))
     from public.get_attendance_day_children('00000000-0000-4000-f000-00000000000a', (now() at time zone 'Africa/Cairo')::date) d),
  (select format('in %s, out %s, excused %s, absent %s, late now %s',
                 k->'today'->>'in_nursery', k->'today'->>'checked_out', k->'today'->>'excused', k->'today'->>'absent', k->'today'->>'late_now')
     from public.get_attendance_kpis('00000000-0000-4000-f000-00000000000a', null) k),
  'today''s lists add up to today''s numbers'
);

select is(
  (select string_agg(d.full_name_en, ', ') from public.get_attendance_day_children('00000000-0000-4000-f000-00000000000a', (now() at time zone 'Africa/Cairo')::date) d
    where d.late_now),
  'Omar',
  'late to be picked up right now: the child still here after the due time'
);

-- A period: each child.
select is(
  (select string_agg(format('%s %s/%s present, %s excused, %s absent, %s%%, %s late',
                            p.full_name_en, p.present_days, p.expected_days, p.excused_days, p.absent_days, p.attendance_rate, p.late_days),
                     '; ' order by p.full_name_en)
     from public.get_attendance_period_children('00000000-0000-4000-f000-00000000000a', '2026-09-01', '2026-09-10') p),
  'Adam 1/10 present, 1 excused, 8 absent, 10.0%, 0 late; Laila 3/10 present, 0 excused, 7 absent, 30.0%, 2 late; '
  'Omar 1/10 present, 0 excused, 9 absent, 10.0%, 1 late; Sara 0/6 present, 0 excused, 6 absent, 0.0%, 0 late',
  'each child''s days in the period, counted from the day they joined'
);

select is(
  (select format('%s %s %s %s', sum(p.expected_days), sum(p.present_days), sum(p.excused_days), sum(p.absent_days))
     from public.get_attendance_period_children('00000000-0000-4000-f000-00000000000a', '2026-09-01', '2026-09-10') p),
  (select format('%s %s %s %s', k->>'expected_child_days', k->>'present_child_days', k->>'excused_child_days', k->>'absent_child_days')
     from pg_temp.period_kpis() k),
  'the children''s rows add up to the period''s attendance numbers'
);

-- A period: each school day.
select is(
  (select format('%s expected, %s present, %s excused, %s absent, %s%%', d.expected, d.present, d.excused, d.absent, d.attendance_rate)
     from public.get_attendance_period_days('00000000-0000-4000-f000-00000000000a', '2026-09-01', '2026-09-10') d
    where d.day = '2026-09-04'),
  '3 expected, 1 present, 1 excused, 1 absent, 33.3%',
  'one school day of the period'
);

select is(
  (select format('%s days, %s %s %s %s', count(*), sum(d.expected), sum(d.present), sum(d.excused), sum(d.absent))
     from public.get_attendance_period_days('00000000-0000-4000-f000-00000000000a', '2026-09-01', '2026-09-10') d),
  (select format('%s days, %s %s %s %s', k->>'school_days', k->>'expected_child_days', k->>'present_child_days', k->>'excused_child_days', k->>'absent_child_days')
     from pg_temp.period_kpis() k),
  'the days add up to the period''s attendance numbers'
);

-- A period: the late, charged and flagged days.
select is(
  (select string_agg(format('%s %s late=%s fee=%s invoice=%s review=%s', r.attendance_date, r.full_name_en, r.is_late, r.extra_fee, coalesce(r.invoice_status, '-'), r.needs_review),
                     '; ' order by r.attendance_date)
     from public.get_attendance_period_records('00000000-0000-4000-f000-00000000000a', '2026-09-01', '2026-09-10') r),
  '2026-09-02 Laila late=t fee=100.00 invoice=paid review=f; 2026-09-03 Laila late=t fee=50.00 invoice=pending review=t; '
  '2026-09-06 Omar late=t fee=0.00 invoice=- review=f',
  'the period''s late, charged and flagged days, with the charge''s invoice'
);

select is(
  (select format('late %s, billed %s, collected %s, outstanding %s, review %s',
                 count(*) filter (where r.is_late),
                 coalesce(sum(r.extra_fee), 0),
                 coalesce(sum(r.extra_fee) filter (where r.invoice_status = 'paid'), 0),
                 coalesce(sum(r.extra_fee) filter (where r.invoice_status in ('pending', 'overdue')), 0),
                 count(*) filter (where r.needs_review))
     from public.get_attendance_period_records('00000000-0000-4000-f000-00000000000a', '2026-09-01', '2026-09-10') r),
  (select format('late %s, billed %s, collected %s, outstanding %s, review %s',
                 k->>'late_pickups', k->>'extra_fee_billed', k->>'extra_fee_collected', k->>'extra_fee_outstanding', k->>'needs_review')
     from pg_temp.period_kpis() k),
  'the records add up to late pickups, billed, collected, outstanding and need review'
);

select is(
  (select format('%s, due %s, paid %s', r.invoice_number is not null, r.invoice_due_date, r.invoice_paid_at)
     from public.get_attendance_period_records('00000000-0000-4000-f000-00000000000a', '2026-09-01', '2026-09-10') r
    where r.attendance_date = '2026-09-02'),
  't, due 2026-09-10, paid 2026-09-08 10:00:00+00',
  'a charge shows its invoice number, due date and when it was paid'
);

select throws_ok(
  $$ select * from public.get_attendance_period_children('00000000-0000-4000-f000-00000000000a', '2025-01-01', '2026-01-02') $$,
  '22023', 'attendance_invalid_range',
  'more than 366 days is refused'
);

select throws_ok(
  $$ select * from public.get_attendance_period_days('00000000-0000-4000-f000-00000000000a', '2026-09-10', '2026-09-01') $$,
  '22023', 'attendance_invalid_range',
  'a start after the end is refused'
);

-- ---------------------------------------------------------------------------------------------
-- Nobody else.
select pg_temp.act_as('00000000-0000-4000-f000-000000000b01');
select throws_ok(
  $$ select * from public.get_attendance_day_children('00000000-0000-4000-f000-00000000000a', '2026-09-04') $$,
  '42501', 'attendance_forbidden',
  'another nursery''s admin cannot read a day'
);

select pg_temp.act_as('00000000-0000-4000-f000-000000000a06');
select throws_ok(
  $$ select * from public.get_attendance_period_records('00000000-0000-4000-f000-00000000000a', '2026-09-01', '2026-09-10') $$,
  '42501', 'attendance_forbidden',
  'a parent cannot read the period''s records'
);
select throws_ok(
  $$ select * from public.get_attendance_period_children('00000000-0000-4000-f000-00000000000a', '2026-09-01', '2026-09-10') $$,
  '42501', 'attendance_forbidden',
  'nor the other children''s attendance'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.get_attendance_day_children(uuid, date)', 'execute')
  and not has_function_privilege('anon', 'public.get_attendance_period_children(uuid, date, date)', 'execute')
  and not has_function_privilege('anon', 'public.get_attendance_period_days(uuid, date, date)', 'execute')
  and not has_function_privilege('anon', 'public.get_attendance_period_records(uuid, date, date)', 'execute')
  and not has_function_privilege('authenticated', 'public.attendance_period_end(uuid, date, date)', 'execute'),
  'signed-out visitors cannot call them, and the range helper is internal'
);

select * from finish();
rollback;

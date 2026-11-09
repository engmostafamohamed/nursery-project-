-- Database test · medicine rounds and the parents' cover notice: at a dose's time the child's teachers
-- on duty are reminded, 30 minutes later they and the admins are told it is overdue, once each, only
-- for a child who is here with consent; a dose is recorded once (given, or not given with a reason) by
-- the staff who look after the child, never without consent or for a child who is not here, and the
-- parents are told; a when-needed medicine is recorded as often as given; a dose can be undone the
-- same day; the round lists today's medicines; dose times are kept sorted; and when a backup covers a
-- class its parents are told once that day. The nursery's clock is set near midday so the times hold.
-- Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

insert into public.nurseries (id, name_ar, name_en, working_days) values
  ('00000000-0000-4000-9800-00000000000a', 'حضانة الدواء', 'Medicine Nursery', '["sun", "mon", "tue", "wed", "thu", "fri", "sat"]');
-- A fixed-offset zone where it is now about noon.
update public.nursery_settings
   set timezone = (select case when o > 0 then 'Etc/GMT-' || o when o < 0 then 'Etc/GMT+' || abs(o) else 'Etc/GMT' end
                     from (select 12 - extract(hour from now() at time zone 'UTC')::int as o) x),
       notify_parents_of_cover = true
 where nursery_id = '00000000-0000-4000-9800-00000000000a';

insert into auth.users (id, email) values
  ('00000000-0000-4000-9800-000000000a01', 'med.admin@test.local'),
  ('00000000-0000-4000-9800-000000000a02', 'med.lead@test.local'),
  ('00000000-0000-4000-9800-000000000a03', 'med.backup@test.local'),
  ('00000000-0000-4000-9800-000000000a04', 'med.other@test.local'),
  ('00000000-0000-4000-9800-000000000a05', 'med.parent@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = '00000000-0000-4000-9800-00000000000a', name_ar = v.name_en, name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9800-000000000a01', 'branch_admin', 'Admin'),
    ('00000000-0000-4000-9800-000000000a02', 'teacher', 'Lead Sara'),
    ('00000000-0000-4000-9800-000000000a03', 'teacher', 'Backup Nour'),
    ('00000000-0000-4000-9800-000000000a04', 'teacher', 'Other Rana'),
    ('00000000-0000-4000-9800-000000000a05', 'parent', 'Mona')
  ) as v(id, role, name_en)
 where u.id = v.id::uuid;
insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-9800-0000000000b1', '00000000-0000-4000-9800-00000000000a', 'الفراشات', 'Butterflies'),
  ('00000000-0000-4000-9800-0000000000b2', '00000000-0000-4000-9800-00000000000a', 'النحل', 'Bees');
insert into public.class_staff (class_id, user_id, role) values
  ('00000000-0000-4000-9800-0000000000b1', '00000000-0000-4000-9800-000000000a02', 'lead'),
  ('00000000-0000-4000-9800-0000000000b1', '00000000-0000-4000-9800-000000000a03', 'substitute'),
  ('00000000-0000-4000-9800-0000000000b2', '00000000-0000-4000-9800-000000000a04', 'lead');
insert into public.children (id, nursery_id, class_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-9800-0000000000c1', '00000000-0000-4000-9800-00000000000a', '00000000-0000-4000-9800-0000000000b1', 'ليلى', 'Laila', '2023-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9800-0000000000c2', '00000000-0000-4000-9800-00000000000a', '00000000-0000-4000-9800-0000000000b1', 'آدم', 'Adam', '2023-01-01', 'active', '2026-01-01');
insert into public.parent_children (parent_id, child_id, is_primary) values
  ('00000000-0000-4000-9800-000000000a05', '00000000-0000-4000-9800-0000000000c1', true),
  ('00000000-0000-4000-9800-000000000a05', '00000000-0000-4000-9800-0000000000c2', true);
insert into public.attendance_records (child_id, attendance_date, check_in)
values ('00000000-0000-4000-9800-0000000000c1', public.nursery_today('00000000-0000-4000-9800-00000000000a'), now() - interval '3 hours');

create function pg_temp.local_now() returns time language sql as $$
  select (now() at time zone (select timezone from public.nursery_settings where nursery_id = '00000000-0000-4000-9800-00000000000a'))::time
$$;
select set_config('t.due', to_char(pg_temp.local_now() - interval '5 minutes', 'HH24:MI'), true);
select set_config('t.late', to_char(pg_temp.local_now() - interval '40 minutes', 'HH24:MI'), true);

insert into public.child_medications (id, child_id, nursery_id, name, dosage, administration_method, parent_consent_status, dose_times, expiry_date) values
  ('00000000-0000-4000-9800-0000000000d1', '00000000-0000-4000-9800-0000000000c1', '00000000-0000-4000-9800-00000000000a', 'Ventolin', '2 puffs', 'inhaler', 'granted',
   array[current_setting('t.due')::time, current_setting('t.late')::time, current_setting('t.late')::time], current_date + 90),
  ('00000000-0000-4000-9800-0000000000d2', '00000000-0000-4000-9800-0000000000c1', '00000000-0000-4000-9800-00000000000a', 'Cough syrup', '5 ml', 'oral', 'pending',
   array[current_setting('t.due')::time], null),
  ('00000000-0000-4000-9800-0000000000d3', '00000000-0000-4000-9800-0000000000c2', '00000000-0000-4000-9800-00000000000a', 'Panadol', '5 ml', 'oral', 'granted',
   array[current_setting('t.due')::time], null),
  ('00000000-0000-4000-9800-0000000000d4', '00000000-0000-4000-9800-0000000000c1', '00000000-0000-4000-9800-00000000000a', 'Rash cream', null, 'topical', 'granted',
   '{}', null),
  ('00000000-0000-4000-9800-0000000000d5', '00000000-0000-4000-9800-0000000000c1', '00000000-0000-4000-9800-00000000000a', 'Old antibiotic', '5 ml', 'oral', 'granted',
   array[current_setting('t.due')::time], null);
update public.child_medications set starts_on = current_date - 20, ends_on = current_date - 10 where id = '00000000-0000-4000-9800-0000000000d5';

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.notes(p_type text) returns text language sql security definer as $$
  select coalesce(string_agg(u.name_en, ',' order by u.name_en), '-') from public.notifications n join public.users u on u.id = n.user_id
   where n.type = p_type and n.nursery_id = '00000000-0000-4000-9800-00000000000a'
$$;

-- ---------------------------------------------------------------------------------------------
select is(
  (select array_to_string(dose_times, ',') from public.child_medications where id = '00000000-0000-4000-9800-0000000000d1'),
  current_setting('t.late') || ':00,' || current_setting('t.due') || ':00', 'dose times are kept sorted, each once'
);

-- Reminders
select set_config('t.r1', public.run_medication_reminders()::text, true);
select is(pg_temp.notes('medication_due'), 'Lead Sara', 'at a dose’s time the teacher on duty is reminded (only with consent, in its course, for a child who is here)');
select is(pg_temp.notes('medication_overdue'), 'Admin,Lead Sara', '30 minutes after it, the teacher and the admins are told it is overdue');
select set_config('t.r2', public.run_medication_reminders()::text, true);
select is(current_setting('t.r2'), '0', 'each reminder is sent once');

-- Recording doses
select pg_temp.act_as('00000000-0000-4000-9800-000000000a04');
select throws_ok(
  format($$ select public.record_medication_dose('00000000-0000-4000-9800-0000000000d1', %L, 'given') $$, current_setting('t.due')),
  '42501', 'medication_forbidden', 'a teacher of another class cannot record the dose'
);
select pg_temp.act_as('00000000-0000-4000-9800-000000000a05');
select throws_ok(
  format($$ select public.record_medication_dose('00000000-0000-4000-9800-0000000000d1', %L, 'given') $$, current_setting('t.due')),
  '42501', 'medication_forbidden', 'a parent cannot record a dose'
);

select pg_temp.act_as('00000000-0000-4000-9800-000000000a02');
select set_config('t.given', public.record_medication_dose('00000000-0000-4000-9800-0000000000d1', current_setting('t.due')::time, 'given', null, 'Calm')::text, true);
select is(pg_temp.notes('medication_given'), 'Mona', 'the parents are told the dose was given');
select throws_ok(
  format($$ select public.record_medication_dose('00000000-0000-4000-9800-0000000000d1', %L, 'given') $$, current_setting('t.due')),
  '23505', 'medication_already_recorded', 'a timed dose is recorded once a day'
);
select throws_ok(
  format($$ select public.record_medication_dose('00000000-0000-4000-9800-0000000000d2', %L, 'given') $$, current_setting('t.due')),
  'P0001', 'medication_no_consent', 'a medicine is not given without the parents’ consent'
);
select throws_ok(
  format($$ select public.record_medication_dose('00000000-0000-4000-9800-0000000000d3', %L, 'given') $$, current_setting('t.due')),
  'P0001', 'medication_child_not_here', 'nor to a child who is not here'
);
select throws_ok(
  format($$ select public.record_medication_dose('00000000-0000-4000-9800-0000000000d5', %L, 'given') $$, current_setting('t.due')),
  'P0001', 'medication_not_active', 'nor after the course ended'
);
select throws_ok(
  $$ select public.record_medication_dose('00000000-0000-4000-9800-0000000000d1', '03:17', 'given') $$,
  '22023', 'medication_invalid', 'only at one of its times'
);
select throws_ok(
  format($$ select public.record_medication_dose('00000000-0000-4000-9800-0000000000d1', %L, 'skipped', 'other') $$, current_setting('t.late')),
  '22023', 'medication_invalid', '"other" needs a note'
);
select set_config('t.skip', public.record_medication_dose('00000000-0000-4000-9800-0000000000d1', current_setting('t.late')::time, 'skipped', 'refused')::text, true);
select is(pg_temp.notes('medication_skipped'), 'Mona', 'the parents are told why a dose was not given');
select set_config('t.n1', public.record_medication_dose('00000000-0000-4000-9800-0000000000d4', null, 'given')::text, true);
select set_config('t.n2', public.record_medication_dose('00000000-0000-4000-9800-0000000000d4', null, 'given', null, 'Again after nap')::text, true);
select is((select count(*)::int from public.medication_doses where medication_id = '00000000-0000-4000-9800-0000000000d4'), 2, 'a when-needed medicine is recorded as often as it is given');

-- The round
select is(
  (select string_agg(format('%s:%s:%s', m ->> 'medicine', m ->> 'here', jsonb_array_length(m -> 'doses')), ',' order by m ->> 'medicine')
     from jsonb_array_elements(public.get_medication_round() -> 'medicines') m),
  'Panadol:false:0,Rash cream:true:2,Ventolin:true:2',
  'the teacher’s round lists the medicines that may be given today to the children they look after, with the doses recorded'
);
select is(public.get_medication_round() ->> 'scope', 'mine', 'a teacher sees their own children');
select pg_temp.act_as('00000000-0000-4000-9800-000000000a04');
select is(jsonb_array_length(public.get_medication_round() -> 'medicines'), 0, 'a teacher of another class sees none of them');
select pg_temp.act_as('00000000-0000-4000-9800-000000000a01');
select is(public.get_medication_round() ->> 'scope', 'nursery', 'the admin sees the whole nursery');

-- Undo
select pg_temp.act_as('00000000-0000-4000-9800-000000000a02');
select set_config('t.undo', public.undo_medication_dose(current_setting('t.given')::uuid)::text, true);
select is((select count(*)::int from public.medication_doses where id = current_setting('t.given')::uuid), 0, 'a dose recorded by mistake is undone');
select is(pg_temp.notes('medication_dose_undone'), 'Mona', 'and the parents are told');

-- The health profile carries the times and today's doses
select pg_temp.act_as('00000000-0000-4000-9800-000000000a01');
select is(
  (select format('%s|%s', m -> 'dose_times', jsonb_array_length(m -> 'doses_today'))
     from jsonb_array_elements(public.get_child_health_profile('00000000-0000-4000-9800-0000000000c1') -> 'medications') m
    where m ->> 'name' = 'Ventolin'),
  format('["%s", "%s"]|1', current_setting('t.late'), current_setting('t.due')), 'the health profile shows the dose times and today’s doses'
);

-- Parents told when a backup covers
select pg_temp.act_as('00000000-0000-4000-9800-000000000a02');
select set_config('t.absent', public.report_staff_absence(null, public.nursery_today('00000000-0000-4000-9800-00000000000a'), public.nursery_today('00000000-0000-4000-9800-00000000000a'), 'sick')::text, true);
select is(pg_temp.notes('class_cover_parents'), 'Mona', 'the parents of the class are told the backup looks after it today');
reset role;
select set_config('t.again', public.notify_class_cover('00000000-0000-4000-9800-00000000000a', public.nursery_today('00000000-0000-4000-9800-00000000000a'))::text, true);
select is((select count(*)::int from public.notifications where type = 'class_cover_parents' and nursery_id = '00000000-0000-4000-9800-00000000000a'), 1, 'only once a day');

select * from finish();
rollback;

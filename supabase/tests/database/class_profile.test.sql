-- Database test · a class's profile page (get_class_profile): only the branch's admins and managers
-- (and the chain's admins and XO) read it; it counts the class's active children with today's
-- attendance as the daily reports do, the day's report, their allergies most serious first; it shows
-- who of the team is on duty when the lead is away; and its waiting list, messages and cameras
-- (never a camera's stream address). Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(17);

insert into public.nurseries (id, name_ar, name_en, working_days) values
  ('00000000-0000-4000-9700-00000000000a', 'حضانة الفصل', 'Class Nursery', '["sun", "mon", "tue", "wed", "thu", "fri", "sat"]'),
  ('00000000-0000-4000-9700-00000000000b', 'حضانة أخرى', 'Other Nursery', '["sun", "mon", "tue", "wed", "thu", "fri", "sat"]');
update public.nursery_settings set timezone = 'Asia/Dubai'
 where nursery_id = '00000000-0000-4000-9700-00000000000a';

insert into auth.users (id, email) values
  ('00000000-0000-4000-9700-000000000a01', 'cp.admin@test.local'),
  ('00000000-0000-4000-9700-000000000a02', 'cp.lead@test.local'),
  ('00000000-0000-4000-9700-000000000a03', 'cp.backup@test.local'),
  ('00000000-0000-4000-9700-000000000a04', 'cp.assistant@test.local'),
  ('00000000-0000-4000-9700-000000000a05', 'cp.parent@test.local'),
  ('00000000-0000-4000-9700-000000000a06', 'cp.manager@test.local'),
  ('00000000-0000-4000-9700-000000000a07', 'cp.other.admin@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = v.nursery::uuid, name_ar = v.name_en, name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9700-000000000a01', 'branch_admin', 'Admin', '00000000-0000-4000-9700-00000000000a'),
    ('00000000-0000-4000-9700-000000000a02', 'teacher', 'Lead Sara', '00000000-0000-4000-9700-00000000000a'),
    ('00000000-0000-4000-9700-000000000a03', 'teacher', 'Backup Nour', '00000000-0000-4000-9700-00000000000a'),
    ('00000000-0000-4000-9700-000000000a04', 'teacher', 'Assistant Hoda', '00000000-0000-4000-9700-00000000000a'),
    ('00000000-0000-4000-9700-000000000a05', 'parent', 'Mona', '00000000-0000-4000-9700-00000000000a'),
    ('00000000-0000-4000-9700-000000000a06', 'manager', 'Manager Amr', '00000000-0000-4000-9700-00000000000a'),
    ('00000000-0000-4000-9700-000000000a07', 'branch_admin', 'Other Admin', '00000000-0000-4000-9700-00000000000b')
  ) as v(id, role, name_en, nursery)
 where u.id = v.id::uuid;

create function pg_temp.today() returns date language sql as $$ select public.nursery_today('00000000-0000-4000-9700-00000000000a') $$;

insert into public.classes (id, nursery_id, name_ar, name_en, grade_level, room_number, capacity) values
  ('00000000-0000-4000-9700-0000000000b1', '00000000-0000-4000-9700-00000000000a', 'الفراشات', 'Butterflies', 'Toddlers', 'A2', 20);
insert into public.class_staff (class_id, user_id, role) values
  ('00000000-0000-4000-9700-0000000000b1', '00000000-0000-4000-9700-000000000a02', 'lead'),
  ('00000000-0000-4000-9700-0000000000b1', '00000000-0000-4000-9700-000000000a03', 'substitute'),
  ('00000000-0000-4000-9700-0000000000b1', '00000000-0000-4000-9700-000000000a04', 'assistant');
-- The lead is away today, so the backup covers.
insert into public.staff_absences (nursery_id, user_id, starts_on, ends_on, reason, reported_by) values
  ('00000000-0000-4000-9700-00000000000a', '00000000-0000-4000-9700-000000000a02', pg_temp.today(), pg_temp.today() + 1, 'sick', '00000000-0000-4000-9700-000000000a01');

-- Ali is here, Bassem came and went home, Celine is away with a notice, Dina has not come, Eyad
-- starts later, and Farah left the nursery (not counted).
insert into public.children (id, nursery_id, class_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-9700-0000000000c1', '00000000-0000-4000-9700-00000000000a', '00000000-0000-4000-9700-0000000000b1', 'علي', 'Ali', '2023-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9700-0000000000c2', '00000000-0000-4000-9700-00000000000a', '00000000-0000-4000-9700-0000000000b1', 'باسم', 'Bassem', '2023-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9700-0000000000c3', '00000000-0000-4000-9700-00000000000a', '00000000-0000-4000-9700-0000000000b1', 'سيلين', 'Celine', '2023-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9700-0000000000c4', '00000000-0000-4000-9700-00000000000a', '00000000-0000-4000-9700-0000000000b1', 'دينا', 'Dina', '2023-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9700-0000000000c5', '00000000-0000-4000-9700-00000000000a', '00000000-0000-4000-9700-0000000000b1', 'إياد', 'Eyad', '2023-01-01', 'active', pg_temp.today() + 7),
  ('00000000-0000-4000-9700-0000000000c6', '00000000-0000-4000-9700-00000000000a', '00000000-0000-4000-9700-0000000000b1', 'فرح', 'Farah', '2023-01-01', 'withdrawn', '2026-01-01');
insert into public.parent_children (parent_id, child_id, is_primary) values
  ('00000000-0000-4000-9700-000000000a05', '00000000-0000-4000-9700-0000000000c1', true);
insert into public.attendance_records (child_id, attendance_date, check_in, check_out) values
  ('00000000-0000-4000-9700-0000000000c1', pg_temp.today(), now(), null),
  ('00000000-0000-4000-9700-0000000000c2', pg_temp.today(), now() - interval '5 hours', now() - interval '1 hour');
insert into public.attendance_absence_reports (nursery_id, child_id, absence_date, reason, reported_by) values
  ('00000000-0000-4000-9700-00000000000a', '00000000-0000-4000-9700-0000000000c3', pg_temp.today(), 'sick', '00000000-0000-4000-9700-000000000a05');
insert into public.daily_reports (child_id, nursery_id, class_id, report_date, status, published_at) values
  ('00000000-0000-4000-9700-0000000000c2', '00000000-0000-4000-9700-00000000000a', '00000000-0000-4000-9700-0000000000b1', pg_temp.today(), 'published', now());
insert into public.child_allergies (child_id, nursery_id, allergen_name, severity) values
  ('00000000-0000-4000-9700-0000000000c1', '00000000-0000-4000-9700-00000000000a', 'Dust', 'mild'),
  ('00000000-0000-4000-9700-0000000000c1', '00000000-0000-4000-9700-00000000000a', 'Peanut', 'severe');

insert into public.inquiries (id, nursery_id, parent_name, parent_email, parent_phone, child_name, child_dob) values
  ('00000000-0000-4000-9700-0000000000d1', '00000000-0000-4000-9700-00000000000a', 'Rania', 'rania@test.local', '+201000000000', 'Omar', '2024-02-02');
insert into public.waitlist (inquiry_id, nursery_id, class_id, position, status) values
  ('00000000-0000-4000-9700-0000000000d1', '00000000-0000-4000-9700-00000000000a', '00000000-0000-4000-9700-0000000000b1', 1, 'waiting');
insert into public.family_messages (nursery_id, sender_id, sender_name_en, sender_role, audience, class_id, body) values
  ('00000000-0000-4000-9700-00000000000a', '00000000-0000-4000-9700-000000000a04', 'Assistant Hoda', 'teacher', 'class', '00000000-0000-4000-9700-0000000000b1', 'Trip tomorrow');
insert into public.cameras (nursery_id, name_ar, name_en, stream_url_rtsp, class_id) values
  ('00000000-0000-4000-9700-00000000000a', 'كاميرا', 'Room cam', 'rtsp://secret', '00000000-0000-4000-9700-0000000000b1');

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.profile() returns jsonb language sql as $$ select current_setting('t.profile')::jsonb $$;

-- ---------------------------------------------------------------------------------------------
-- Who may read it
select pg_temp.act_as('00000000-0000-4000-9700-000000000a05');
select throws_ok($$ select public.get_class_profile('00000000-0000-4000-9700-0000000000b1') $$, '42501', 'class_forbidden', 'a parent cannot read a class profile');

select pg_temp.act_as('00000000-0000-4000-9700-000000000a02');
select throws_ok($$ select public.get_class_profile('00000000-0000-4000-9700-0000000000b1') $$, '42501', 'class_forbidden', 'a teacher cannot read it, even their own class');

select pg_temp.act_as('00000000-0000-4000-9700-000000000a07');
select throws_ok($$ select public.get_class_profile('00000000-0000-4000-9700-0000000000b1') $$, '42501', 'class_forbidden', 'another branch''s admin cannot read it');

select pg_temp.act_as('00000000-0000-4000-9700-000000000a06');
select lives_ok($$ select public.get_class_profile('00000000-0000-4000-9700-0000000000b1') $$, 'the branch''s manager can read it');

select pg_temp.act_as('00000000-0000-4000-9700-000000000a01');
select throws_ok($$ select public.get_class_profile('00000000-0000-4000-9700-0000000000ff') $$, 'P0002', 'class_not_found', 'a class that does not exist is not found');
select set_config('t.profile', public.get_class_profile('00000000-0000-4000-9700-0000000000b1')::text, true);
reset role;

-- ---------------------------------------------------------------------------------------------
-- What it holds (read as the branch admin)
select is(pg_temp.profile() #>> '{class,timezone}', 'Asia/Dubai', 'times are read in the nursery''s clock');
select is(jsonb_array_length(pg_temp.profile() -> 'children'), 5, 'only the class''s active children are listed');
select is(
  (select string_agg((c ->> 'name_en') || ':' || (c ->> 'attendance'), ',' order by c ->> 'name_en') from jsonb_array_elements(pg_temp.profile() -> 'children') c),
  'Ali:partial,Bassem:present,Celine:excused,Dina:absent,Eyad:not_enrolled',
  'each child''s day reads as in the daily reports'
);
select is(
  (select string_agg((c ->> 'name_en') || ':' || (c ->> 'report'), ',' order by c ->> 'name_en') from jsonb_array_elements(pg_temp.profile() -> 'children') c where c ->> 'report' <> 'none'),
  'Bassem:published',
  'the sent daily report shows'
);
select is(
  (select c -> 'allergies' from jsonb_array_elements(pg_temp.profile() -> 'children') c where c ->> 'name_en' = 'Ali'),
  '[{"name": "Peanut", "severity": "severe"}, {"name": "Dust", "severity": "mild"}]'::jsonb,
  'allergies come most serious first'
);
select is(
  (select c ->> 'absence_reason' from jsonb_array_elements(pg_temp.profile() -> 'children') c where c ->> 'name_en' = 'Celine'),
  'sick',
  'a parent''s reason for the absence shows'
);
select is(
  (select string_agg((m ->> 'role') || ':' || (m ->> 'on_duty') || ':' || (m ->> 'covering') || ':' || coalesce(m #>> '{absence,reason}', '-'), ',')
     from jsonb_array_elements(pg_temp.profile() -> 'team') m),
  'lead:false:false:sick,substitute:true:true:-,assistant:true:false:-',
  'the team comes lead, backup, assistants; the away lead''s backup covers'
);
select is(jsonb_array_length(pg_temp.profile() -> 'waitlist'), 1, 'the waiting family shows');
select is(pg_temp.profile() #>> '{waitlist,0,child_name}', 'Omar', 'with the waiting child''s name');
select is(pg_temp.profile() #>> '{messages,0,kind}', 'family_message', 'a teacher''s message to the class''s families shows');
select is(jsonb_array_length(pg_temp.profile() -> 'cameras'), 1, 'the class''s camera shows');
select ok(not (pg_temp.profile() -> 'cameras' -> 0 ? 'stream_url_rtsp'), 'a camera''s stream address is never sent');

select * from finish();
rollback;

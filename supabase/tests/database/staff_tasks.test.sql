-- Database test · staff tasks: the admin's tasks become each person's daily checklist. Only the
-- admins make tasks, and each is checked (title, people, class, schedule). Saving one makes today's
-- items for its people (never someone absent) and tells them. A person sees and checks off only
-- their own items, with the photo when asked; when one person is enough, the first one closes it for
-- all, and can undo it the same day. Pausing cancels today's items, resuming brings them back;
-- deleting marks the task and keeps what was done. The hourly job makes each new day's items (each
-- person hears how many), reminds an hour before the due time, and tells the admins at the end of
-- the day how many were not done. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(34);

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
-- A task as the form sends it (daily, for the given people, due at 23:59 so it is never late here).
create function pg_temp.task(p_title text, p_extra jsonb default '{}'::jsonb) returns jsonb language sql as $$
  select jsonb_build_object('nursery_id', '00000000-0000-4000-9f00-00000000000a', 'title_en', p_title, 'assign_to', 'people',
                            'assignee_ids', '[]'::jsonb, 'repeats', 'daily', 'due_time', '23:59') || p_extra
$$;
-- Today's items of a task as "person status" (by name).
create function pg_temp.items(p_task uuid) returns text language sql as $$
  select coalesce(string_agg(u.name_en || ' ' || i.status, ', ' order by u.name_en), '-')
    from public.staff_task_items i join public.users u on u.id = i.assignee_id
   where i.task_id = p_task and i.due_on = public.nursery_today('00000000-0000-4000-9f00-00000000000a')
$$;
create function pg_temp.item(p_task uuid, p_user uuid) returns uuid language sql as $$
  select id from public.staff_task_items where task_id = p_task and assignee_id = p_user
     and due_on = public.nursery_today('00000000-0000-4000-9f00-00000000000a')
$$;
create function pg_temp.told(p_user uuid, p_type text) returns text language sql as $$
  select coalesce(string_agg(coalesce(action_link, '-'), ', ' order by created_at), '-') from public.notifications where user_id = p_user and type = p_type
$$;
create function pg_temp.can_upload(p_name text) returns boolean language plpgsql as $$
begin
  insert into storage.objects (bucket_id, name) values ('staff-task-photos', p_name);
  return true;
exception when insufficient_privilege then
  return false;
end;
$$;

-- A nursery open every day, with an admin, a manager, three teachers (Hoda and Salma in class A,
-- Rana in class B and away today) and a family.
insert into public.nurseries (id, name_ar, name_en, working_days) values
  ('00000000-0000-4000-9f00-00000000000a', 'حضانة', 'Tasks Nursery', '["sun","mon","tue","wed","thu","fri","sat"]'::jsonb);
update public.nursery_settings set timezone = 'Africa/Cairo', end_of_day_checklist_time = '17:00' where nursery_id = '00000000-0000-4000-9f00-00000000000a';
insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-9f00-0000000000b1', '00000000-0000-4000-9f00-00000000000a', 'أ', 'Class A'),
  ('00000000-0000-4000-9f00-0000000000b2', '00000000-0000-4000-9f00-00000000000a', 'ب', 'Class B');
insert into auth.users (id, email) values
  ('00000000-0000-4000-9f00-000000000a01', 'tasks.admin@test.local'),
  ('00000000-0000-4000-9f00-000000000a02', 'tasks.manager@test.local'),
  ('00000000-0000-4000-9f00-000000000a03', 'tasks.hoda@test.local'),
  ('00000000-0000-4000-9f00-000000000a04', 'tasks.salma@test.local'),
  ('00000000-0000-4000-9f00-000000000a05', 'tasks.rana@test.local'),
  ('00000000-0000-4000-9f00-000000000a06', 'tasks.parent@test.local');
update public.users u
   set role = v.role::public.user_role, department = v.dept::public.user_department,
       nursery_id = '00000000-0000-4000-9f00-00000000000a', name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9f00-000000000a01', 'branch_admin', null, 'Admin'),
    ('00000000-0000-4000-9f00-000000000a02', 'manager', 'operations', 'Manager'),
    ('00000000-0000-4000-9f00-000000000a03', 'teacher', null, 'Hoda'),
    ('00000000-0000-4000-9f00-000000000a04', 'teacher', null, 'Salma'),
    ('00000000-0000-4000-9f00-000000000a05', 'teacher', null, 'Rana'),
    ('00000000-0000-4000-9f00-000000000a06', 'parent', null, 'Parent')
  ) as v(id, role, dept, name_en)
 where u.id = v.id::uuid;
insert into public.class_staff (class_id, user_id, role) values
  ('00000000-0000-4000-9f00-0000000000b1', '00000000-0000-4000-9f00-000000000a03', 'lead'),
  ('00000000-0000-4000-9f00-0000000000b1', '00000000-0000-4000-9f00-000000000a04', 'assistant'),
  ('00000000-0000-4000-9f00-0000000000b2', '00000000-0000-4000-9f00-000000000a05', 'lead');
insert into public.staff_absences (nursery_id, user_id, starts_on, ends_on, reason) values
  ('00000000-0000-4000-9f00-00000000000a', '00000000-0000-4000-9f00-000000000a05',
   public.nursery_today('00000000-0000-4000-9f00-00000000000a'), public.nursery_today('00000000-0000-4000-9f00-00000000000a'), 'sick');

-- Who makes tasks, and what is checked
select pg_temp.act_as('00000000-0000-4000-9f00-000000000a03');
select throws_ok($$ select public.staff_task_save(null, pg_temp.task('Mine', '{"assign_to":"teachers"}')) $$, '42501', 'staff_task_forbidden', 'a teacher does not make tasks');
select pg_temp.act_as('00000000-0000-4000-9f00-000000000a01');
select throws_ok($$ select public.staff_task_save(null, pg_temp.task(' ', '{"assign_to":"teachers"}')) $$, '22023', 'staff_task_title_required', 'a task has a title');
select throws_ok($$ select public.staff_task_save(null, pg_temp.task('X', '{"assignee_ids":["00000000-0000-4000-9f00-000000000a06"]}')) $$, '22023', 'staff_task_people_required', 'only staff of the nursery are given tasks');
select throws_ok($$ select public.staff_task_save(null, pg_temp.task('X', '{"assign_to":"class_team"}')) $$, '22023', 'staff_task_class_required', 'a class team needs its class');
select throws_ok($$ select public.staff_task_save(null, pg_temp.task('X', '{"assign_to":"teachers","repeats":"weekly"}')) $$, '22023', 'staff_task_schedule_invalid', 'a weekly task needs its days');
select throws_ok($$ select public.staff_task_save(null, pg_temp.task('X', jsonb_build_object('assign_to', 'teachers', 'repeats', 'once', 'on_date', current_date - 3))) $$,
  '22023', 'staff_task_schedule_invalid', 'a one-time task is not in the past');

-- Three tasks: fire exits (Hoda and the manager, each, with a photo), tidy class A (its team, one is
-- enough, today's weekday), and the sign-in sheet (every teacher, monthly on today's date).
select set_config('test.fire', public.staff_task_save(null, pg_temp.task('Fire exits', jsonb_build_object(
  'assignee_ids', jsonb_build_array('00000000-0000-4000-9f00-000000000a03', '00000000-0000-4000-9f00-000000000a02'), 'photo_required', true)))::text, true);
select set_config('test.tidy', public.staff_task_save(null, pg_temp.task('Tidy class A', jsonb_build_object(
  'assign_to', 'class_team', 'class_id', '00000000-0000-4000-9f00-0000000000b1', 'completion', 'any', 'repeats', 'weekly',
  'days_of_week', jsonb_build_array(extract(dow from public.nursery_today('00000000-0000-4000-9f00-00000000000a'))::int))))::text, true);
select set_config('test.sheet', public.staff_task_save(null, pg_temp.task('Sign-in sheet', jsonb_build_object(
  'assign_to', 'teachers', 'repeats', 'monthly', 'day_of_month', extract(day from public.nursery_today('00000000-0000-4000-9f00-00000000000a'))::int)))::text, true);
reset role;
select is(pg_temp.items(current_setting('test.fire')::uuid), 'Hoda pending, Manager pending', 'saving makes today''s items for its people');
select is(pg_temp.items(current_setting('test.tidy')::uuid), 'Hoda pending, Salma pending', 'a class''s team');
select is(pg_temp.items(current_setting('test.sheet')::uuid), 'Hoda pending, Salma pending', 'every teacher but Rana, away today');
select is(pg_temp.told('00000000-0000-4000-9f00-000000000a03', 'staff_task_new') || ' / ' || pg_temp.told('00000000-0000-4000-9f00-000000000a02', 'staff_task_new'),
  '/teacher/tasks, /teacher/tasks, /teacher/tasks / /admin/my-tasks', 'each person is told, linked to their checklist');

-- Who sees what
select pg_temp.act_as('00000000-0000-4000-9f00-000000000a04');
select is((select count(*)::int from public.staff_task_items) || ' / ' || (select string_agg(title_en, ', ' order by title_en) from public.staff_tasks),
  '2 / Sign-in sheet, Tidy class A', 'Salma sees her items and their tasks only');
select pg_temp.act_as('00000000-0000-4000-9f00-000000000a05');
select is((select count(*)::int from public.staff_task_items) + (select count(*)::int from public.staff_tasks), 0, 'Rana, away, has none');
select pg_temp.act_as('00000000-0000-4000-9f00-000000000a02');
select is((select count(*)::int from public.staff_task_items), 6, 'the manager reads the whole board');

-- Checking off
select pg_temp.act_as('00000000-0000-4000-9f00-000000000a04');
select throws_ok(format($$ select public.staff_task_complete(%L) $$, pg_temp.item(current_setting('test.sheet')::uuid, '00000000-0000-4000-9f00-000000000a03')),
  '42501', 'staff_task_forbidden', 'Salma cannot check Hoda''s item');
select throws_ok($$ update public.staff_task_items set status = 'done' $$, '42501', null, 'nobody writes the items directly');
select ok(not pg_temp.can_upload('00000000-0000-4000-9f00-00000000000a/' || pg_temp.item(current_setting('test.fire')::uuid, '00000000-0000-4000-9f00-000000000a03') || '/p.jpg'),
  'nor puts a photo on Hoda''s item');
select pg_temp.act_as('00000000-0000-4000-9f00-000000000a03');
select throws_ok(format($$ select public.staff_task_complete(%L) $$, pg_temp.item(current_setting('test.fire')::uuid, '00000000-0000-4000-9f00-000000000a03')),
  '22023', 'staff_task_photo_required', 'the fire exits need a photo');
select throws_ok(format($$ select public.staff_task_complete(%L, null, 'somewhere/else.jpg') $$, pg_temp.item(current_setting('test.fire')::uuid, '00000000-0000-4000-9f00-000000000a03')),
  '22023', 'staff_task_photo_invalid', 'from her item''s own folder');
select ok(pg_temp.can_upload('00000000-0000-4000-9f00-00000000000a/' || pg_temp.item(current_setting('test.fire')::uuid, '00000000-0000-4000-9f00-000000000a03') || '/exit.jpg'),
  'Hoda uploads her photo');
select is(public.staff_task_complete(pg_temp.item(current_setting('test.fire')::uuid, '00000000-0000-4000-9f00-000000000a03'), 'All clear',
            '00000000-0000-4000-9f00-00000000000a/' || pg_temp.item(current_setting('test.fire')::uuid, '00000000-0000-4000-9f00-000000000a03') || '/exit.jpg') ->> 'status',
  'done', 'and checks the fire exits off');
reset role;
select is(pg_temp.items(current_setting('test.fire')::uuid), 'Hoda done, Manager pending', 'each person does their own');

-- One is enough: Salma tidies class A for both, then takes it back.
select pg_temp.act_as('00000000-0000-4000-9f00-000000000a04');
select is((public.staff_task_complete(pg_temp.item(current_setting('test.tidy')::uuid, '00000000-0000-4000-9f00-000000000a04')) ->> 'covered')::int, 1, 'Salma tidies class A');
reset role;
select is((select string_agg(u.name_en || ' ' || i.status || ' by ' || d.name_en, ', ' order by u.name_en)
             from public.staff_task_items i join public.users u on u.id = i.assignee_id join public.users d on d.id = i.done_by
            where i.task_id = current_setting('test.tidy')::uuid),
  'Hoda done by Salma, Salma done by Salma', 'which closes Hoda''s too, done by Salma');
select pg_temp.act_as('00000000-0000-4000-9f00-000000000a03');
select throws_ok(format($$ select public.staff_task_reopen(%L) $$, pg_temp.item(current_setting('test.tidy')::uuid, '00000000-0000-4000-9f00-000000000a03')),
  '42501', 'staff_task_forbidden', 'Hoda cannot undo what Salma did');
select pg_temp.act_as('00000000-0000-4000-9f00-000000000a04');
select lives_ok(format($$ select public.staff_task_reopen(%L) $$, pg_temp.item(current_setting('test.tidy')::uuid, '00000000-0000-4000-9f00-000000000a04')), 'Salma undoes it');
reset role;
select is(pg_temp.items(current_setting('test.tidy')::uuid), 'Hoda pending, Salma pending', 'both are open again');

-- Pausing, resuming, deleting
select pg_temp.act_as('00000000-0000-4000-9f00-000000000a01');
select public.staff_task_set_paused(current_setting('test.sheet')::uuid, true);
select is(pg_temp.items(current_setting('test.sheet')::uuid), 'Hoda cancelled, Salma cancelled', 'paused: today''s items are cancelled');
select public.staff_task_set_paused(current_setting('test.sheet')::uuid, false);
select is(pg_temp.items(current_setting('test.sheet')::uuid), 'Hoda pending, Salma pending', 'resumed: they are back');
select public.staff_task_delete(current_setting('test.fire')::uuid);
reset role;
select is((select (deleted_at is not null)::text from public.staff_tasks where id = current_setting('test.fire')::uuid) || ' ' || pg_temp.items(current_setting('test.fire')::uuid),
  'true Hoda done, Manager cancelled', 'deleted: the task is marked, what was done stays, the rest is cancelled');

-- The hourly job: tomorrow at 7 am every teacher gets the day's items of a daily task and hears how many.
select pg_temp.act_as('00000000-0000-4000-9f00-000000000a01');
select set_config('test.daily', public.staff_task_save(null, pg_temp.task('Morning check', '{"assign_to":"teachers"}'))::text, true);
reset role;
select set_config('test.tomorrow7', (((public.nursery_today('00000000-0000-4000-9f00-00000000000a') + 1) + time '07:00') at time zone 'Africa/Cairo')::text, true);
select ok(public.run_staff_tasks(current_setting('test.tomorrow7')::timestamptz) >= 3, 'tomorrow at 7 the job makes the day''s items');
select is((select count(*)::int from public.notifications where type = 'staff_tasks_today' and nursery_id = '00000000-0000-4000-9f00-00000000000a'), 3,
  'and Hoda, Salma and Rana (back) each hear how many');
select is(public.run_staff_tasks(current_setting('test.tomorrow7')::timestamptz), 0, 'never twice');

-- An hour before an item is due, its person is reminded once; at 5 pm the admins hear what is left.
update public.staff_task_items set due_at = now() + interval '30 minutes'
 where id = pg_temp.item(current_setting('test.tidy')::uuid, '00000000-0000-4000-9f00-000000000a03');
select ok(public.run_staff_tasks(now()) >= 1 and pg_temp.told('00000000-0000-4000-9f00-000000000a03', 'staff_task_due') = '/teacher/tasks', 'Hoda is reminded before the due time');
select set_config('test.today17', ((public.nursery_today('00000000-0000-4000-9f00-00000000000a') + time '17:30') at time zone 'Africa/Cairo')::text, true);
select public.run_staff_tasks(current_setting('test.today17')::timestamptz);
select is((select (template_params ->> 'count') || ' ' || action_link from public.notifications
            where user_id = '00000000-0000-4000-9f00-000000000a01' and type = 'staff_tasks_missed'),
  '6 /admin/staff-tasks?day=' || public.nursery_today('00000000-0000-4000-9f00-00000000000a'), 'at the end of the day the admin hears 6 were not done');

select * from finish();
rollback;

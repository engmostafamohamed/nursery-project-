-- Database test · staff tasks, the next step: an absent teacher's tasks go to whoever covers her
-- class that day (and come back when the absence is cancelled), a class's team is its teachers on
-- duty; a safety task two hours late tells the admins once, other tasks wait for the end of the day;
-- each person's month (done, missed, rate) is read by the person and the admins, not by colleagues;
-- the teachers' monthly reminders become monthly tasks once; the job runs every 15 minutes. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.task(p_title text, p_extra jsonb default '{}'::jsonb) returns jsonb language sql as $$
  select jsonb_build_object('nursery_id', '00000000-0000-4000-9b00-00000000000a', 'title_en', p_title, 'assign_to', 'people',
                            'assignee_ids', '[]'::jsonb, 'repeats', 'daily', 'due_time', '23:59') || p_extra
$$;
-- Today's items of a task as "person status (covering for)".
create function pg_temp.items(p_task uuid) returns text language sql as $$
  select coalesce(string_agg(u.name_en || ' ' || i.status || coalesce(' for ' || c.name_en, ''), ', ' order by u.name_en), '-')
    from public.staff_task_items i
    join public.users u on u.id = i.assignee_id
    left join public.users c on c.id = i.covering_for
   where i.task_id = p_task and i.due_on = public.nursery_today('00000000-0000-4000-9b00-00000000000a')
$$;
create function pg_temp.today() returns date language sql as $$ select public.nursery_today('00000000-0000-4000-9b00-00000000000a') $$;

-- A nursery open every day: an admin, Hoda (lead of Birds), Rana (Birds' backup), Mona (no class).
insert into public.nurseries (id, name_ar, name_en, working_days) values
  ('00000000-0000-4000-9b00-00000000000a', 'حضانة', 'Cover Nursery', '["sun","mon","tue","wed","thu","fri","sat"]'::jsonb);
update public.nursery_settings set timezone = 'Africa/Cairo', end_of_day_checklist_time = '17:00' where nursery_id = '00000000-0000-4000-9b00-00000000000a';
insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-9b00-0000000000b1', '00000000-0000-4000-9b00-00000000000a', 'العصافير', 'Birds');
insert into auth.users (id, email) values
  ('00000000-0000-4000-9b00-000000000a01', 'cover.admin@test.local'),
  ('00000000-0000-4000-9b00-000000000a02', 'cover.hoda@test.local'),
  ('00000000-0000-4000-9b00-000000000a03', 'cover.rana@test.local'),
  ('00000000-0000-4000-9b00-000000000a04', 'cover.mona@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = '00000000-0000-4000-9b00-00000000000a', name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9b00-000000000a01', 'branch_admin', 'Admin'),
    ('00000000-0000-4000-9b00-000000000a02', 'teacher', 'Hoda'),
    ('00000000-0000-4000-9b00-000000000a03', 'teacher', 'Rana'),
    ('00000000-0000-4000-9b00-000000000a04', 'teacher', 'Mona')
  ) as v(id, role, name_en)
 where u.id = v.id::uuid;
insert into public.class_staff (class_id, user_id, role) values
  ('00000000-0000-4000-9b00-0000000000b1', '00000000-0000-4000-9b00-000000000a02', 'lead'),
  ('00000000-0000-4000-9b00-0000000000b1', '00000000-0000-4000-9b00-000000000a03', 'substitute');

-- Hoda's own task, the Birds team's task, and two of Mona's due at 6 am: a safety one and a cleaning one.
select pg_temp.act_as('00000000-0000-4000-9b00-000000000a01');
select set_config('test.own', public.staff_task_save(null, pg_temp.task('Sign the sheet', '{"assignee_ids":["00000000-0000-4000-9b00-000000000a02"]}'))::text, true);
select set_config('test.team', public.staff_task_save(null, pg_temp.task('Tidy Birds', '{"assign_to":"class_team","class_id":"00000000-0000-4000-9b00-0000000000b1"}'))::text, true);
select set_config('test.safety', public.staff_task_save(null, pg_temp.task('Fire exits', '{"assignee_ids":["00000000-0000-4000-9b00-000000000a04"],"category":"safety","due_time":"06:00"}'))::text, true);
select set_config('test.clean', public.staff_task_save(null, pg_temp.task('Wipe tables', '{"assignee_ids":["00000000-0000-4000-9b00-000000000a04"],"category":"cleaning","due_time":"06:00"}'))::text, true);
reset role;
select is(pg_temp.items(current_setting('test.own')::uuid) || ' / ' || pg_temp.items(current_setting('test.team')::uuid),
  'Hoda pending / Hoda pending', 'with Hoda at work, the backup has no task of hers or of the class');

-- Hoda is reported away today: her items go to Rana, who covers Birds.
insert into public.staff_absences (id, nursery_id, user_id, starts_on, ends_on, reason) values
  ('00000000-0000-4000-9b00-0000000000ab', '00000000-0000-4000-9b00-00000000000a', '00000000-0000-4000-9b00-000000000a02', pg_temp.today(), pg_temp.today(), 'sick');
select is(pg_temp.items(current_setting('test.own')::uuid), 'Hoda cancelled, Rana pending for Hoda', 'her own task goes to her cover, at once');
select is(pg_temp.items(current_setting('test.team')::uuid), 'Hoda cancelled, Rana pending for Hoda', 'and the class''s task to its teacher on duty');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-4000-9b00-000000000a03' and type = 'staff_task_new'), 2,
  'Rana hears of each');

-- The absence is cancelled: back to Hoda.
update public.staff_absences set cancelled_at = now() where id = '00000000-0000-4000-9b00-0000000000ab';
select is(pg_temp.items(current_setting('test.own')::uuid) || ' / ' || pg_temp.items(current_setting('test.team')::uuid),
  'Hoda pending, Rana cancelled for Hoda / Hoda pending, Rana cancelled for Hoda', 'cancelling the absence gives them back');

-- Escalation: two hours and a minute after 6 am, the safety task tells the admin; the cleaning one waits.
select set_config('test.due', (select due_at::text from public.staff_task_items where task_id = current_setting('test.safety')::uuid), true);
select lives_ok($$ select public.run_staff_tasks(current_setting('test.due')::timestamptz + interval '2 hours 1 minute') $$, 'the job runs');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-4000-9b00-000000000a01' and type = 'staff_task_late'), 1,
  'a safety task two hours late tells the admin');
select is((select urgency || ' ' || action_link || ' ' || (template_params -> 'name' ->> 'en') || ' ' || (template_params -> 'task' ->> 'en')
             from public.notifications where user_id = '00000000-0000-4000-9b00-000000000a01' and type = 'staff_task_late'),
  'high /admin/staff-tasks?day=' || pg_temp.today() || ' Mona Fire exits', 'urgently, naming the task and the person, opening the day''s board');
select is((select count(*)::int from public.staff_task_items where task_id = current_setting('test.clean')::uuid and escalated_at is not null), 0,
  'a late cleaning task is not escalated');
select lives_ok($$ select public.run_staff_tasks(current_setting('test.due')::timestamptz + interval '2 hours 20 minutes') $$, 'the job runs again');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-4000-9b00-000000000a01' and type = 'staff_task_late'), 1, 'and tells only once');

-- Hoda's months: today's sheet done, a task missed earlier this month or last.
update public.staff_task_items set status = 'done', done_by = '00000000-0000-4000-9b00-000000000a02', done_at = now()
 where task_id = current_setting('test.own')::uuid and assignee_id = '00000000-0000-4000-9b00-000000000a02';
insert into public.staff_task_items (task_id, nursery_id, due_on, due_at, assignee_id) values
  (current_setting('test.team')::uuid, '00000000-0000-4000-9b00-00000000000a', pg_temp.today() - 1, now() - interval '1 day', '00000000-0000-4000-9b00-000000000a02');
select pg_temp.act_as('00000000-0000-4000-9b00-000000000a01');
select is((select sum(done)::int || ' done, ' || sum(missed)::int || ' missed, ' || count(*)::int || ' months' from public.staff_task_month_rates('00000000-0000-4000-9b00-000000000a02', 2)),
  '1 done, 1 missed, 2 months', 'the admin reads a person''s months');
select pg_temp.act_as('00000000-0000-4000-9b00-000000000a02');
select is((select sum(done)::int from public.staff_task_month_rates('00000000-0000-4000-9b00-000000000a02', 2)), 1, 'the person reads her own');
select pg_temp.act_as('00000000-0000-4000-9b00-000000000a04');
select throws_ok($$ select * from public.staff_task_month_rates('00000000-0000-4000-9b00-000000000a02') $$, '42501', 'staff_task_forbidden', 'a colleague does not');
reset role;

-- The teachers' monthly reminders become tasks, once.
insert into public.teacher_monthly_reminder_templates (nursery_id, teacher_id, title_ar, title_en, body_ar, body_en, active) values
  ('00000000-0000-4000-9b00-00000000000a', '00000000-0000-4000-9b00-000000000a04', 'تقرير الشهر', 'Monthly report', 'سلّمي التقرير', 'Hand in the report', true);
select is(public.staff_tasks_from_teacher_reminders(), 1, 'an active reminder becomes a task');
select is((select repeats || ' ' || day_of_month || ' ' || assign_to || ' ' || array_to_string(assignee_ids, ',') || ' ' || instructions
             from public.staff_tasks where title_en = 'Monthly report'),
  'monthly 1 people 00000000-0000-4000-9b00-000000000a04 سلّمي التقرير' || E'\n\n' || 'Hand in the report', 'monthly on the 1st, for its teacher, with its text');
select is(public.staff_tasks_from_teacher_reminders(), 0, 'and is not moved twice (the reminder is marked inactive)');

select is((select string_agg(jobname || ' ' || schedule, ', ' order by jobname) from cron.job where jobname in ('staff-tasks', 'teacher-monthly-reminders')),
  'staff-tasks */15 * * * *', 'the job runs every 15 minutes; the reminders'' job is gone');

select * from finish();
rollback;

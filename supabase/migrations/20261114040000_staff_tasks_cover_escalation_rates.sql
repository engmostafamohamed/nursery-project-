-- Staff tasks, the next step:
--  1. Cover: a teacher away hands her tasks to whoever covers her class that day (the class's
--     backup, class_duty_teachers), and a class's team is its teachers on duty. The item says whom it
--     covers for (covering_for). Reporting or cancelling an absence moves today's items at once.
--  2. Escalation: a safety task still not done two hours after its time tells the nursery's admins
--     and managers right away (once per item), not only at the end of the day. The job now runs
--     every 15 minutes.
--  3. Each person's month: done (by them), missed, still open, done late, and the rate
--     (staff_task_month_rates), for the person and for the admins and HR.
--  4. The teachers' monthly reminders become monthly tasks: each active reminder (where the nursery
--     sends them) is now a task on the 1st for its teacher, and is marked inactive; their job stops.
--     Tasks cover them and more (the teacher checks it off, the admin sees it), so there is one place.

alter table public.staff_task_items
  add column if not exists covering_for uuid references public.users (id) on delete set null,
  add column if not exists escalated_at timestamptz;

create index if not exists idx_staff_task_items_month on public.staff_task_items (assignee_id, due_on) where status <> 'cancelled';

-- -----------------------------------------------------------------------------------------------
-- 1. Who does a task on a day, and whom they cover for: the chosen people (or every teacher) at
-- work; for a chosen person away, whoever covers the classes she leads that day; for a class's
-- team, its teachers on duty (with its backup when the lead is away). Active staff of the nursery.
create or replace function public.staff_task_people_on(p_task public.staff_tasks, p_day date)
returns table (user_id uuid, covering_for uuid)
language sql
stable
security definer
set search_path = public
as $$
  with staff as (
    select u.id, u.role
      from public.users u
     where u.nursery_id = p_task.nursery_id
       and coalesce(u.status, 'active') = 'active'
       and u.role in ('teacher', 'manager', 'branch_admin')
  ),
  picked as (
    select s.id as user_id, null::uuid as covering_for
      from staff s
     where p_task.assign_to = 'teachers' and s.role = 'teacher' and not public.staff_is_absent(s.id, p_day)
    union all
    select s.id, null::uuid
      from staff s
     where p_task.assign_to = 'people' and s.id = any (p_task.assignee_ids) and not public.staff_is_absent(s.id, p_day)
    union all
    select d.user_id, s.id
      from staff s
      join public.class_staff cs on cs.user_id = s.id and cs.role = 'lead'
      join public.classes cl on cl.id = cs.class_id and cl.deleted_at is null
     cross join lateral public.class_duty_teachers(cs.class_id, p_day) d
     where p_task.assign_to = 'people' and s.id = any (p_task.assignee_ids)
       and public.staff_is_absent(s.id, p_day) and d.covering
    union all
    select d.user_id,
           case when d.covering then (select cs.user_id from public.class_staff cs where cs.class_id = p_task.class_id and cs.role = 'lead' limit 1) end
      from public.class_duty_teachers(p_task.class_id, p_day) d
     where p_task.assign_to = 'class_team'
  )
  select distinct on (p.user_id) p.user_id, p.covering_for
    from picked p
    join staff s on s.id = p.user_id
   order by p.user_id, p.covering_for nulls first;
$$;

create or replace function public.staff_task_people(p_task public.staff_tasks, p_day date)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id from public.staff_task_people_on(p_task, p_day) p;
$$;

create or replace function public.staff_tasks_generate(p_nursery_id uuid, p_day date, p_task_id uuid default null)
returns table (item_id uuid, task_id uuid, assignee_id uuid)
language sql
security definer
set search_path = public
as $$
  insert into public.staff_task_items (task_id, nursery_id, due_on, due_at, assignee_id, covering_for)
  select t.id, t.nursery_id, p_day,
         (p_day + t.due_time) at time zone coalesce((select ns.timezone from public.nursery_settings ns where ns.nursery_id = t.nursery_id), 'Africa/Cairo'),
         person.user_id, person.covering_for
    from public.staff_tasks t
   cross join lateral public.staff_task_people_on(t, p_day) person
   where t.nursery_id = p_nursery_id
     and (p_task_id is null or t.id = p_task_id)
     and public.staff_task_falls_on(t, p_day)
  on conflict (task_id, due_on, assignee_id) do nothing
  returning id, task_id, assignee_id;
$$;

-- An absence reported, changed or cancelled for today moves today's items at once: the teacher's
-- are set aside and her cover gets them (and hears of each), or the other way round.
create or replace function public.staff_tasks_follow_absence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := public.nursery_today(new.nursery_id);
  v_task public.staff_tasks;
begin
  if not (v_today between least(new.starts_on, coalesce(old.starts_on, new.starts_on))
                      and greatest(new.ends_on, coalesce(old.ends_on, new.ends_on))) then
    return new;
  end if;
  for v_task in
    select * from public.staff_tasks t
     where t.nursery_id = new.nursery_id and t.deleted_at is null and public.staff_task_falls_on(t, v_today)
  loop
    perform public.staff_tasks_refresh_today(v_task);
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_staff_tasks_follow_absence on public.staff_absences;
create trigger trg_staff_tasks_follow_absence
  after insert or update of starts_on, ends_on, cancelled_at on public.staff_absences
  for each row execute function public.staff_tasks_follow_absence();

-- -----------------------------------------------------------------------------------------------
-- 2. The job, every 15 minutes: the day's items from 6 am, a safety task two hours late to the
-- admins at once, the reminder an hour before, and the end-of-day count of what was not done.
create or replace function public.run_staff_tasks(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n record;
  v_new record;
  v_late record;
  v_count integer := 0;
  v_missed integer;
begin
  for v_n in
    select n.id, coalesce(ns.timezone, 'Africa/Cairo') as tz,
           (p_now at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date as today,
           extract(hour from p_now at time zone coalesce(ns.timezone, 'Africa/Cairo'))::int as hour,
           extract(hour from coalesce(ns.end_of_day_checklist_time, ns.standard_end_time, time '17:00'))::int as end_hour
      from public.nurseries n
      left join public.nursery_settings ns on ns.nursery_id = n.id
     where exists (select 1 from public.staff_tasks t where t.nursery_id = n.id and t.deleted_at is null)
  loop
    if v_n.hour >= 6 then
      for v_new in
        select g.assignee_id, count(*)::int as n from public.staff_tasks_generate(v_n.id, v_n.today) g group by g.assignee_id
      loop
        perform public.notify_users(
          array[v_new.assignee_id], v_n.id, 'staff_tasks_today', 'staff_tasks_today',
          jsonb_build_object('count', v_new.n), public.staff_tasks_link(v_new.assignee_id), 'normal'
        );
        v_count := v_count + 1;
      end loop;
    end if;

    if v_n.hour = v_n.end_hour then
      select count(*)::int into v_missed from public.staff_task_items i
       where i.nursery_id = v_n.id and i.due_on = v_n.today and i.status = 'pending';
      if v_missed > 0 and not exists (
        select 1 from public.notifications x
         where x.nursery_id = v_n.id and x.type = 'staff_tasks_missed' and x.action_link = '/admin/staff-tasks?day=' || v_n.today
      ) then
        v_count := v_count + public.attendance_notify_staff(
          v_n.id, array['branch_admin', 'manager']::public.user_role[], 'staff_tasks_missed', 'staff_tasks_missed',
          jsonb_build_object('count', v_missed, 'date', v_n.today), '/admin/staff-tasks?day=' || v_n.today, 'normal'
        );
      end if;
    end if;
  end loop;

  -- A safety task still not done two hours after its time (today's only): the admins, once.
  for v_late in
    with late as (
      update public.staff_task_items i set escalated_at = p_now
        from public.staff_tasks t
       where t.id = i.task_id and t.category = 'safety'
         and i.status = 'pending' and i.escalated_at is null
         and i.due_at <= p_now - interval '2 hours' and i.due_at > p_now - interval '1 day'
      returning i.nursery_id, i.due_on, i.due_at, i.assignee_id, t.title_ar, t.title_en
    )
    select l.*, u.name_ar, u.name_en,
           coalesce((select ns.timezone from public.nursery_settings ns where ns.nursery_id = l.nursery_id), 'Africa/Cairo') as tz
      from late l join public.users u on u.id = l.assignee_id
  loop
    v_count := v_count + public.attendance_notify_staff(
      v_late.nursery_id, array['branch_admin', 'manager']::public.user_role[], 'staff_task_late', 'staff_task_late',
      jsonb_build_object('task', public.i18n_names(v_late.title_ar, v_late.title_en),
                         'name', public.i18n_names(v_late.name_ar, v_late.name_en),
                         'time', v_late.due_at, 'tz', v_late.tz),
      '/admin/staff-tasks?day=' || v_late.due_on, 'high'
    );
  end loop;

  with due as (
    update public.staff_task_items i set reminded_at = p_now
     where i.status = 'pending' and i.reminded_at is null and i.due_at > p_now and i.due_at <= p_now + interval '1 hour'
    returning i.*
  ),
  sent as (
    insert into public.notifications (nursery_id, user_id, type, template_key, template_params, read, channel, sent_at, action_link)
    select d.nursery_id, d.assignee_id, 'staff_task_due', 'staff_task_due',
           jsonb_build_object('task', public.i18n_names(t.title_ar, t.title_en), 'time', d.due_at,
                              'tz', coalesce((select ns.timezone from public.nursery_settings ns where ns.nursery_id = d.nursery_id), 'Africa/Cairo')),
           false, 'in_app', p_now, public.staff_tasks_link(d.assignee_id)
      from due d join public.staff_tasks t on t.id = d.task_id
    returning 1
  )
  select v_count + count(*)::int into v_count from sent;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- 3. A person's months, newest first: done by them, missed (past and not done), still open, done
-- after the time, and the rate of done over done + missed (null with nothing due yet). Items a
-- colleague closed for everyone ("one is enough") count for neither. For the person, the admins, HR.
create or replace function public.staff_task_month_rates(p_user_id uuid, p_months integer default 6)
returns table (month date, done integer, missed integer, open integer, done_late integer, rate integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_nursery uuid := (select u.nursery_id from public.users u where u.id = p_user_id);
  v_today date;
begin
  if auth.uid() is null or public.current_user_role() is null
     or not (p_user_id = auth.uid() or public.staff_task_can_manage(v_nursery) or public.storage_staff_files_admin(v_nursery)) then
    raise exception 'staff_task_forbidden' using errcode = '42501';
  end if;
  v_today := public.nursery_today(v_nursery);
  return query
    with months as (
      select generate_series(date_trunc('month', v_today) - make_interval(months => greatest(least(p_months, 24), 1) - 1),
                             date_trunc('month', v_today), interval '1 month')::date as m
    ),
    counted as (
      select m.m,
             count(*) filter (where i.status = 'done' and i.done_by = p_user_id)::int as done,
             count(*) filter (where i.status = 'pending' and i.due_on < v_today)::int as missed,
             count(*) filter (where i.status = 'pending' and i.due_on >= v_today)::int as open,
             count(*) filter (where i.status = 'done' and i.done_by = p_user_id and i.done_at > i.due_at)::int as done_late
        from months m
        left join public.staff_task_items i
          on i.assignee_id = p_user_id and i.status <> 'cancelled'
         and i.due_on >= m.m and i.due_on < (m.m + interval '1 month')::date
       group by m.m
    )
    select c.m, c.done, c.missed, c.open, c.done_late,
           case when c.done + c.missed > 0 then round(100.0 * c.done / (c.done + c.missed))::int end
      from counted c
     order by c.m desc;
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- 4. The teachers' monthly reminders as tasks (where the nursery sends them); returns how many.
create or replace function public.staff_tasks_from_teacher_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with moved as (
    select tpl.id, tpl.nursery_id, tpl.teacher_id,
           nullif(left(btrim(coalesce(tpl.title_ar, '')), 120), '') as title_ar,
           nullif(left(btrim(coalesce(tpl.title_en, '')), 120), '') as title_en,
           nullif(left(concat_ws(E'\n\n', nullif(btrim(tpl.body_ar), ''), nullif(btrim(tpl.body_en), '')), 1000), '') as instructions
      from public.teacher_monthly_reminder_templates tpl
      join public.users u on u.id = tpl.teacher_id and u.nursery_id = tpl.nursery_id
      left join public.nursery_settings ns on ns.nursery_id = tpl.nursery_id
     where tpl.active and coalesce(ns.auto_monthly_teacher_reminders_enabled, true)
       and (coalesce(btrim(tpl.title_ar), '') <> '' or coalesce(btrim(tpl.title_en), '') <> '')
  ),
  made as (
    insert into public.staff_tasks (nursery_id, title_ar, title_en, instructions, category, assign_to, assignee_ids, repeats, day_of_month, due_time, starts_on)
    select m.nursery_id, m.title_ar, m.title_en, m.instructions, 'other', 'people', array[m.teacher_id], 'monthly', 1, time '12:00',
           public.nursery_today(m.nursery_id)
      from moved m
    returning 1
  ),
  retired as (
    update public.teacher_monthly_reminder_templates tpl set active = false
     where tpl.id in (select m.id from moved m)
    returning 1
  )
  -- (retired runs with the statement, read or not)
  select count(*)::int into v_count from made;
  return v_count;
end;
$$;

select public.staff_tasks_from_teacher_reminders();

-- -----------------------------------------------------------------------------------------------
revoke execute on function public.staff_task_people_on(public.staff_tasks, date) from public, anon, authenticated;
revoke execute on function public.staff_tasks_follow_absence() from public, anon, authenticated;
revoke execute on function public.staff_tasks_from_teacher_reminders() from public, anon, authenticated;
revoke execute on function public.staff_task_month_rates(uuid, integer) from public, anon;
grant execute on function public.staff_task_month_rates(uuid, integer) to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('staff-tasks', 'teacher-monthly-reminders');
    perform cron.schedule('staff-tasks', '*/15 * * * *', 'select public.run_staff_tasks()');
  end if;
end;
$$;

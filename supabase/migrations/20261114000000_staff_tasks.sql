-- Staff tasks: the admin's tasks become each person's checklist.
--
-- The admin could only send teachers a monthly reminder (teacher_monthly_reminder_templates) and
-- never knew whether it was done; staff set reminders for themselves only. Now:
-- * A task (staff_tasks) says what to do, for whom (chosen people, every teacher, or a class's
--   team), when (once, every school day, chosen weekdays, a day of the month) and by what time.
--   Per task the admin decides the two open questions: must each person do it, or is one enough
--   ("any": the first one closes it for all); and is a photo needed as proof.
-- * Each school day from 6 am (the nursery's time), the day's items are made (staff_task_items):
--   one per person, never for someone absent that day; each person hears how many they have.
--   A task saved during the day reaches its people at once.
-- * A person checks an item off (with the photo when asked, and a note); a mistake can be undone the
--   same day. An hour before the due time, a person who has not done it is reminded once.
-- * The admins see each day's board (done by whom and when, still to do, late), and at the
--   nursery's end-of-day checklist time they hear how many were not done.
-- * Tasks and items are never removed: a task is deleted by marking it (its items stay), and an
--   item no longer due (its task deleted, paused or reassigned) is marked cancelled.

-- -----------------------------------------------------------------------------------------------
create table if not exists public.staff_tasks (
  id uuid primary key default gen_random_uuid(),
  nursery_id uuid not null references public.nurseries (id) on delete cascade,
  title_ar text,
  title_en text,
  instructions text,
  category text not null default 'other' check (category in ('classroom', 'cleaning', 'safety', 'paperwork', 'kitchen', 'other')),
  assign_to text not null check (assign_to in ('people', 'teachers', 'class_team')),
  assignee_ids uuid[] not null default '{}',
  class_id uuid references public.classes (id) on delete set null,
  completion text not null default 'each' check (completion in ('each', 'any')),
  photo_required boolean not null default false,
  repeats text not null check (repeats in ('once', 'daily', 'weekly', 'monthly')),
  on_date date,
  days_of_week smallint[] not null default '{}',
  day_of_month smallint check (day_of_month between 1 and 31),
  due_time time not null default '12:00',
  starts_on date not null default current_date,
  ends_on date,
  paused boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint staff_tasks_title check (coalesce(btrim(title_ar), '') <> '' or coalesce(btrim(title_en), '') <> ''),
  constraint staff_tasks_days check (days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])
);
create index if not exists idx_staff_tasks_nursery on public.staff_tasks (nursery_id) where deleted_at is null;

create table if not exists public.staff_task_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.staff_tasks (id) on delete cascade,
  nursery_id uuid not null references public.nurseries (id) on delete cascade,
  due_on date not null,
  due_at timestamptz not null,
  assignee_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'done', 'cancelled')),
  done_at timestamptz,
  done_by uuid references public.users (id) on delete set null,
  note text,
  photo_path text,
  reminded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (task_id, due_on, assignee_id)
);
create index if not exists idx_staff_task_items_day on public.staff_task_items (nursery_id, due_on);
create index if not exists idx_staff_task_items_assignee on public.staff_task_items (assignee_id, due_on);

drop trigger if exists trg_staff_tasks_updated_at on public.staff_tasks;
create trigger trg_staff_tasks_updated_at before update on public.staff_tasks for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------------------------
-- Who manages a nursery's tasks and reads its board: its branch admin and managers, a chain admin
-- for its nurseries, the platform admin.
create or replace function public.staff_task_can_manage(p_nursery_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_nursery_staff(p_nursery_id, false);
$$;

-- Whether a task falls on a day (its schedule, its dates, and a school day).
create or replace function public.staff_task_falls_on(p_task public.staff_tasks, p_day date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_task.deleted_at is null and not p_task.paused
     and p_day >= p_task.starts_on and (p_task.ends_on is null or p_day <= p_task.ends_on)
     and public.attendance_is_school_day(p_task.nursery_id, p_day)
     and case p_task.repeats
           when 'once' then p_day = p_task.on_date
           when 'daily' then true
           when 'weekly' then extract(dow from p_day)::smallint = any (p_task.days_of_week)
           -- day 31 (or 29, 30) means the month's last day in shorter months
           when 'monthly' then extract(day from p_day)::int = least(p_task.day_of_month, extract(day from (date_trunc('month', p_day) + interval '1 month - 1 day'))::int)
           else false
         end;
$$;

-- The people a task is for on a day: active staff of its nursery, never someone absent that day.
create or replace function public.staff_task_people(p_task public.staff_tasks, p_day date)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct u.id
    from public.users u
   where u.nursery_id = p_task.nursery_id
     and coalesce(u.status, 'active') = 'active'
     and u.role in ('teacher', 'manager', 'branch_admin')
     and case p_task.assign_to
           when 'people' then u.id = any (p_task.assignee_ids)
           when 'teachers' then u.role = 'teacher'
           when 'class_team' then u.id in (select cs.user_id from public.class_staff cs where cs.class_id = p_task.class_id)
           else false
         end
     and not exists (
       select 1 from public.staff_absences a
        where a.user_id = u.id and a.cancelled_at is null and p_day between a.starts_on and a.ends_on
     );
$$;

-- Where a person reads their checklist.
create or replace function public.staff_tasks_link(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when (select role from public.users where id = p_user_id) = 'teacher' then '/teacher/tasks' else '/admin/my-tasks' end;
$$;

-- Makes a day's items of a nursery (or of one task); returns the new ones. Never twice.
create or replace function public.staff_tasks_generate(p_nursery_id uuid, p_day date, p_task_id uuid default null)
returns table (item_id uuid, task_id uuid, assignee_id uuid)
language sql
security definer
set search_path = public
as $$
  insert into public.staff_task_items (task_id, nursery_id, due_on, due_at, assignee_id)
  select t.id, t.nursery_id, p_day,
         (p_day + t.due_time) at time zone coalesce((select ns.timezone from public.nursery_settings ns where ns.nursery_id = t.nursery_id), 'Africa/Cairo'),
         person
    from public.staff_tasks t
   cross join lateral public.staff_task_people(t, p_day) person
   where t.nursery_id = p_nursery_id
     and (p_task_id is null or t.id = p_task_id)
     and public.staff_task_falls_on(t, p_day)
  on conflict (task_id, due_on, assignee_id) do nothing
  returning id, task_id, assignee_id;
$$;

-- -----------------------------------------------------------------------------------------------
-- Saving a task (new when p_task_id is null). Today's items follow at once: the ones no longer due
-- are cancelled, the new people get theirs and are told.
create or replace function public.staff_task_save(p_task_id uuid, p_task jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.staff_tasks;
  v_nursery uuid;
  v_task public.staff_tasks;
  v_id uuid := p_task_id;
  v_assign text := p_task ->> 'assign_to';
  v_repeats text := p_task ->> 'repeats';
  v_people uuid[];
  v_days smallint[];
  v_today date;
  v_due time;
begin
  if p_task_id is not null then
    select * into v_old from public.staff_tasks where id = p_task_id and deleted_at is null for update;
    if not found then
      raise exception 'staff_task_not_found' using errcode = 'P0002';
    end if;
    v_nursery := v_old.nursery_id;
  else
    v_nursery := nullif(p_task ->> 'nursery_id', '')::uuid;
  end if;
  if not public.staff_task_can_manage(v_nursery) then
    raise exception 'staff_task_forbidden' using errcode = '42501';
  end if;

  if coalesce(btrim(p_task ->> 'title_ar'), '') = '' and coalesce(btrim(p_task ->> 'title_en'), '') = '' then
    raise exception 'staff_task_title_required' using errcode = '22023';
  end if;
  if greatest(char_length(coalesce(p_task ->> 'title_ar', '')), char_length(coalesce(p_task ->> 'title_en', ''))) > 120
     or char_length(coalesce(p_task ->> 'instructions', '')) > 1000 then
    raise exception 'staff_task_too_long' using errcode = '22023';
  end if;
  if coalesce(p_task ->> 'category', 'other') not in ('classroom', 'cleaning', 'safety', 'paperwork', 'kitchen', 'other') then
    raise exception 'staff_task_category_invalid' using errcode = '22023';
  end if;

  v_people := array(select distinct x::uuid from jsonb_array_elements_text(coalesce(p_task -> 'assignee_ids', '[]'::jsonb)) x);
  if v_assign = 'people' then
    if cardinality(v_people) = 0
       or (select count(*) from public.users u
            where u.id = any (v_people) and u.nursery_id = v_nursery and u.role in ('teacher', 'manager', 'branch_admin')) <> cardinality(v_people) then
      raise exception 'staff_task_people_required' using errcode = '22023';
    end if;
  elsif v_assign = 'class_team' then
    if not exists (select 1 from public.classes c where c.id = nullif(p_task ->> 'class_id', '')::uuid and c.nursery_id = v_nursery and c.deleted_at is null) then
      raise exception 'staff_task_class_required' using errcode = '22023';
    end if;
  elsif v_assign is distinct from 'teachers' then
    raise exception 'staff_task_people_required' using errcode = '22023';
  end if;

  v_days := array(select distinct x::smallint from jsonb_array_elements_text(coalesce(p_task -> 'days_of_week', '[]'::jsonb)) x order by 1);
  v_today := public.nursery_today(v_nursery);
  if v_repeats = 'once' then
    if nullif(p_task ->> 'on_date', '') is null or (p_task ->> 'on_date')::date < v_today then
      raise exception 'staff_task_schedule_invalid' using errcode = '22023';
    end if;
  elsif v_repeats = 'weekly' then
    if cardinality(v_days) = 0 or not (v_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]) then
      raise exception 'staff_task_schedule_invalid' using errcode = '22023';
    end if;
  elsif v_repeats = 'monthly' then
    if coalesce(nullif(p_task ->> 'day_of_month', '')::int, 0) not between 1 and 31 then
      raise exception 'staff_task_schedule_invalid' using errcode = '22023';
    end if;
  elsif v_repeats is distinct from 'daily' then
    raise exception 'staff_task_schedule_invalid' using errcode = '22023';
  end if;
  begin
    v_due := coalesce(nullif(p_task ->> 'due_time', ''), '12:00')::time;
  exception when others then
    raise exception 'staff_task_due_time_invalid' using errcode = '22023';
  end;
  if nullif(p_task ->> 'ends_on', '') is not null and (p_task ->> 'ends_on')::date < coalesce(nullif(p_task ->> 'starts_on', '')::date, v_today) then
    raise exception 'staff_task_schedule_invalid' using errcode = '22023';
  end if;

  if p_task_id is null then
    insert into public.staff_tasks (nursery_id, created_by, title_ar, title_en, assign_to, repeats)
    values (v_nursery, auth.uid(), '-', '-', v_assign, v_repeats)
    returning id into v_id;
  end if;
  update public.staff_tasks set
    title_ar = nullif(btrim(coalesce(p_task ->> 'title_ar', '')), ''),
    title_en = nullif(btrim(coalesce(p_task ->> 'title_en', '')), ''),
    instructions = nullif(btrim(coalesce(p_task ->> 'instructions', '')), ''),
    category = coalesce(p_task ->> 'category', 'other'),
    assign_to = v_assign,
    assignee_ids = case when v_assign = 'people' then v_people else '{}' end,
    class_id = case when v_assign = 'class_team' then (p_task ->> 'class_id')::uuid end,
    completion = case when p_task ->> 'completion' = 'any' then 'any' else 'each' end,
    photo_required = coalesce((p_task ->> 'photo_required')::boolean, false),
    repeats = v_repeats,
    on_date = case when v_repeats = 'once' then (p_task ->> 'on_date')::date end,
    days_of_week = case when v_repeats = 'weekly' then v_days else '{}' end,
    day_of_month = case when v_repeats = 'monthly' then (p_task ->> 'day_of_month')::smallint end,
    due_time = v_due,
    starts_on = coalesce(nullif(p_task ->> 'starts_on', '')::date, case when p_task_id is null then v_today else starts_on end),
    ends_on = nullif(p_task ->> 'ends_on', '')::date
  where id = v_id
  returning * into v_task;

  perform public.staff_tasks_refresh_today(v_task);
  return v_id;
end;
$$;

-- Today's items of a task after a change: the ones no longer due are cancelled; the new people get
-- theirs and are told.
create or replace function public.staff_tasks_refresh_today(p_task public.staff_tasks)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := public.nursery_today(p_task.nursery_id);
  v_tz text := coalesce((select ns.timezone from public.nursery_settings ns where ns.nursery_id = p_task.nursery_id), 'Africa/Cairo');
  v_new record;
begin
  update public.staff_task_items i set status = 'cancelled'
   where i.task_id = p_task.id and i.due_on >= v_today and i.status = 'pending'
     and (not public.staff_task_falls_on(p_task, i.due_on) or i.assignee_id not in (select public.staff_task_people(p_task, i.due_on)));
  -- Due again (resumed, or the person is back on it): a cancelled item of today is open again.
  update public.staff_task_items i set status = 'pending'
   where i.task_id = p_task.id and i.due_on >= v_today and i.status = 'cancelled' and i.done_at is null
     and public.staff_task_falls_on(p_task, i.due_on) and i.assignee_id in (select public.staff_task_people(p_task, i.due_on));
  update public.staff_task_items i set due_at = (i.due_on + p_task.due_time) at time zone v_tz
   where i.task_id = p_task.id and i.due_on >= v_today and i.status = 'pending';
  for v_new in select g.item_id, g.assignee_id from public.staff_tasks_generate(p_task.nursery_id, v_today, p_task.id) g loop
    perform public.notify_users(
      array[v_new.assignee_id], p_task.nursery_id, 'staff_task_new', 'staff_task_new',
      jsonb_build_object('task', public.i18n_names(p_task.title_ar, p_task.title_en),
                         'time', (v_today + p_task.due_time) at time zone v_tz, 'tz', v_tz),
      public.staff_tasks_link(v_new.assignee_id), 'normal'
    );
  end loop;
end;
$$;

-- Pausing or resuming a task.
create or replace function public.staff_task_set_paused(p_task_id uuid, p_paused boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.staff_tasks;
begin
  select * into v_task from public.staff_tasks where id = p_task_id and deleted_at is null for update;
  if not found or not public.staff_task_can_manage(v_task.nursery_id) then
    raise exception 'staff_task_forbidden' using errcode = '42501';
  end if;
  update public.staff_tasks set paused = coalesce(p_paused, false) where id = p_task_id returning * into v_task;
  perform public.staff_tasks_refresh_today(v_task);
end;
$$;

-- Deleting a task: a soft delete; its items stay, the ones still to do are cancelled.
create or replace function public.staff_task_delete(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.staff_tasks;
begin
  select * into v_task from public.staff_tasks where id = p_task_id for update;
  if not found or not public.staff_task_can_manage(v_task.nursery_id) then
    raise exception 'staff_task_forbidden' using errcode = '42501';
  end if;
  if v_task.deleted_at is not null then
    return;
  end if;
  update public.staff_tasks set deleted_at = now(), deleted_by = auth.uid() where id = p_task_id;
  update public.staff_task_items set status = 'cancelled' where task_id = p_task_id and status = 'pending';
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- Checking an item off: its person, with the photo when the task asks for one (uploaded to
-- staff-task-photos/<nursery>/<item>/), and a note. When one person is enough, the others' items of
-- the day are closed with it.
create or replace function public.staff_task_complete(p_item_id uuid, p_note text default null, p_photo_path text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.staff_task_items;
  v_task public.staff_tasks;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_photo text := nullif(btrim(coalesce(p_photo_path, '')), '');
  v_covered integer := 0;
begin
  select * into v_item from public.staff_task_items where id = p_item_id for update;
  if not found or v_item.assignee_id <> auth.uid() or public.current_user_role() is null then
    raise exception 'staff_task_forbidden' using errcode = '42501';
  end if;
  select * into v_task from public.staff_tasks where id = v_item.task_id;
  if v_item.status = 'cancelled' or v_task.deleted_at is not null then
    raise exception 'staff_task_closed' using errcode = '22023';
  end if;
  if v_item.status = 'done' then
    return jsonb_build_object('status', 'done', 'covered', 0);
  end if;
  if v_item.due_on > public.nursery_today(v_item.nursery_id) then
    raise exception 'staff_task_not_yet' using errcode = '22023';
  end if;
  if char_length(coalesce(v_note, '')) > 500 then
    raise exception 'staff_task_too_long' using errcode = '22023';
  end if;
  if v_task.photo_required and v_photo is null then
    raise exception 'staff_task_photo_required' using errcode = '22023';
  end if;
  if v_photo is not null and (
       v_photo not like v_item.nursery_id || '/' || v_item.id || '/%'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'staff-task-photos' and o.name = v_photo)) then
    raise exception 'staff_task_photo_invalid' using errcode = '22023';
  end if;

  update public.staff_task_items
     set status = 'done', done_at = now(), done_by = auth.uid(), note = v_note, photo_path = v_photo
   where id = p_item_id;
  if v_task.completion = 'any' then
    update public.staff_task_items
       set status = 'done', done_at = now(), done_by = auth.uid()
     where task_id = v_item.task_id and due_on = v_item.due_on and status = 'pending' and id <> p_item_id;
    get diagnostics v_covered = row_count;
  end if;
  return jsonb_build_object('status', 'done', 'covered', v_covered);
end;
$$;

-- Undoing a check by mistake: the one who checked it, the same day (the others' items it closed
-- open again too).
create or replace function public.staff_task_reopen(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.staff_task_items;
begin
  select * into v_item from public.staff_task_items where id = p_item_id for update;
  if not found or v_item.done_by is distinct from auth.uid() or public.current_user_role() is null then
    raise exception 'staff_task_forbidden' using errcode = '42501';
  end if;
  if v_item.status <> 'done' or v_item.due_on <> public.nursery_today(v_item.nursery_id) then
    raise exception 'staff_task_closed' using errcode = '22023';
  end if;
  update public.staff_task_items
     set status = 'pending', done_at = null, done_by = null, note = null, photo_path = null
   where task_id = v_item.task_id and due_on = v_item.due_on and status = 'done' and done_by = auth.uid()
     and (id = p_item_id or (select completion from public.staff_tasks where id = v_item.task_id) = 'any');
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- The hourly job, in each nursery's own time:
-- * from 6 am, the day's items (each person hears how many they got);
-- * an hour before an item is due, its person is reminded once;
-- * at the end-of-day checklist time, the admins hear how many were not done.
create or replace function public.run_staff_tasks(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n record;
  v_new record;
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
-- Who reads what. Nobody writes the tables directly: only the functions above.
alter table public.staff_tasks enable row level security;
alter table public.staff_task_items enable row level security;

drop policy if exists staff_tasks_read on public.staff_tasks;
create policy staff_tasks_read on public.staff_tasks
  for select to authenticated
  using (
    public.staff_task_can_manage(nursery_id)
    or exists (select 1 from public.staff_task_items i where i.task_id = staff_tasks.id and i.assignee_id = auth.uid())
  );

drop policy if exists staff_task_items_read on public.staff_task_items;
create policy staff_task_items_read on public.staff_task_items
  for select to authenticated
  using (assignee_id = auth.uid() or public.staff_task_can_manage(nursery_id));

revoke insert, update, delete on public.staff_tasks, public.staff_task_items from anon, authenticated;
revoke all on public.staff_tasks, public.staff_task_items from anon;

-- The photos: their person uploads them to their item's folder while it is still to do; the person
-- and the nursery's admins read them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('staff-task-photos', 'staff-task-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function public.staff_task_photo_access(p_name text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_task_items i
     where i.id = public.storage_path_uuid(p_name, 2)
       and i.nursery_id = public.storage_path_uuid(p_name, 1)
       and public.current_user_role() is not null
       and case p_action
             when 'write' then i.assignee_id = auth.uid() and i.status = 'pending'
             when 'read' then i.assignee_id = auth.uid() or public.staff_task_can_manage(i.nursery_id)
             else false
           end
  );
$$;

drop policy if exists "files: staff task photos read" on storage.objects;
create policy "files: staff task photos read" on storage.objects
  for select to authenticated
  using (bucket_id = 'staff-task-photos' and public.staff_task_photo_access(name, 'read'));
drop policy if exists "files: staff task photos upload" on storage.objects;
create policy "files: staff task photos upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'staff-task-photos' and public.staff_task_photo_access(name, 'write'));

revoke execute on function public.staff_task_can_manage(uuid) from public, anon;
revoke execute on function public.staff_task_falls_on(public.staff_tasks, date) from public, anon, authenticated;
revoke execute on function public.staff_task_people(public.staff_tasks, date) from public, anon, authenticated;
revoke execute on function public.staff_tasks_link(uuid) from public, anon, authenticated;
revoke execute on function public.staff_tasks_generate(uuid, date, uuid) from public, anon, authenticated;
revoke execute on function public.staff_tasks_refresh_today(public.staff_tasks) from public, anon, authenticated;
revoke execute on function public.run_staff_tasks(timestamptz) from public, anon, authenticated;
revoke execute on function public.staff_task_photo_access(text, text) from public, anon;
revoke execute on function public.staff_task_save(uuid, jsonb) from public, anon;
revoke execute on function public.staff_task_set_paused(uuid, boolean) from public, anon;
revoke execute on function public.staff_task_delete(uuid) from public, anon;
revoke execute on function public.staff_task_complete(uuid, text, text) from public, anon;
revoke execute on function public.staff_task_reopen(uuid) from public, anon;
grant execute on function public.staff_task_can_manage(uuid) to authenticated, service_role;
grant execute on function public.staff_task_photo_access(text, text) to authenticated, service_role;
grant execute on function public.staff_task_save(uuid, jsonb) to authenticated, service_role;
grant execute on function public.staff_task_set_paused(uuid, boolean) to authenticated, service_role;
grant execute on function public.staff_task_delete(uuid) to authenticated, service_role;
grant execute on function public.staff_task_complete(uuid, text, text) to authenticated, service_role;
grant execute on function public.staff_task_reopen(uuid) to authenticated, service_role;
grant execute on function public.staff_tasks_generate(uuid, date, uuid) to service_role;
grant execute on function public.run_staff_tasks(timestamptz) to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'staff-tasks';
    perform cron.schedule('staff-tasks', '0 * * * *', 'select public.run_staff_tasks()');
  end if;
end;
$$;

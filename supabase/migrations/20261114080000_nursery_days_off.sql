-- The nursery's days off, set by its manager on the settings page; the system works out the rest.
--
-- Before: the weekly days the nursery works (nurseries.working_days) could only be set by the XO team
-- or in the first setup, and holidays lived in academic_calendars.holidays_json with no screen at
-- all — on dev there was not one. Everything that asks "is the nursery open that day?" already goes
-- through attendance_is_school_day / attendance_is_holiday (attendance, absences, daily reports,
-- staff days, staff tasks, class and teacher screens, the family's screens), so the days the manager
-- sets here reach all of them; the menu, which read the weekdays itself, now asks the same rule.
--
--   1. nursery_holidays: one row per holiday (a day or a range), its name, official or the
--      nursery's own, soft-deleted. attendance_is_holiday reads it; the old JSON is moved in.
--   2. One reading of the weekdays (nursery_open_weekdays), used by attendance_is_school_day.
--   3. Saving, through functions that check who may (the settings page's people): the week, a
--      holiday, Egypt's official holidays in one go, removing a holiday. The days gone by stay as
--      they were (a day off that ended is not changed or removed, a running one keeps its start and
--      can end early); a closure that already happened can still be recorded.
--   4. What follows by itself, whoever changed the days: today's staff tasks follow at once; the
--      families and the staff are told two days before a day off (at once when it is sooner), told
--      again when it is called off, and told when the nursery's weekdays change.
--   5. The menu's days come from the same rule (get_menu_period.open_days).

-- -----------------------------------------------------------------------------------------------
-- 1. Holidays

create table if not exists public.nursery_holidays (
  id uuid primary key default gen_random_uuid(),
  nursery_id uuid not null references public.nurseries (id) on delete cascade,
  name_ar text,
  name_en text,
  starts_on date not null,
  ends_on date not null,
  source text not null default 'custom' check (source in ('custom', 'official')),
  -- e.g. 'eid_al_fitr-1448' or 'labour_day-2027': an official holiday is added once
  official_key text,
  -- when the families and staff were told (cleared when the dates change, so they are told again)
  notified_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  constraint nursery_holidays_name check (coalesce(btrim(name_ar), '') <> '' or coalesce(btrim(name_en), '') <> ''),
  constraint nursery_holidays_dates check (ends_on >= starts_on and ends_on - starts_on <= 60)
);
create index if not exists idx_nursery_holidays_days on public.nursery_holidays (nursery_id, starts_on, ends_on) where deleted_at is null;
create unique index if not exists uq_nursery_holidays_official on public.nursery_holidays (nursery_id, official_key) where deleted_at is null and official_key is not null;
create index if not exists idx_nursery_holidays_created_by on public.nursery_holidays (created_by);
create index if not exists idx_nursery_holidays_deleted_by on public.nursery_holidays (deleted_by);

alter table public.nursery_holidays enable row level security;
-- Read by the nursery's people (staff and families), its chain admin and XO; written only through the
-- functions below.
drop policy if exists nursery_holidays_read on public.nursery_holidays;
create policy nursery_holidays_read on public.nursery_holidays for select to authenticated using (
  public.is_xo_super_admin()
  or nursery_id = public.current_user_nursery_id()
  or (public.current_user_role() = 'chain_super_admin' and nursery_id in (select public.nursery_ids_for_chain_admin()))
  or exists (
    select 1 from public.children c join public.parent_children pc on pc.child_id = c.id
     where pc.parent_id = auth.uid() and c.nursery_id = nursery_holidays.nursery_id
  )
);
revoke insert, update, delete on public.nursery_holidays from anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'nursery_holidays') then
    alter publication supabase_realtime add table public.nursery_holidays;
  end if;
end $$;

-- The holidays kept in academic_calendars.holidays_json ("2026-10-06", {date}, {from, to} or
-- {start, end}, with an optional name) move here once; that JSON is no longer read.
insert into public.nursery_holidays (nursery_id, name_ar, name_en, starts_on, ends_on)
select x.nursery_id, x.name_ar, coalesce(x.name_en, case when x.name_ar is null then 'Holiday' end),
       x.from_day, least(greatest(x.to_day, x.from_day), x.from_day + 60)
  from (
    select ac.nursery_id,
           nullif(btrim(case when jsonb_typeof(h) = 'object' then h ->> 'name_ar' end), '') as name_ar,
           nullif(btrim(case when jsonb_typeof(h) = 'object' then coalesce(h ->> 'name_en', h ->> 'name') end), '') as name_en,
           left(case when jsonb_typeof(h) = 'string' then h #>> '{}' else coalesce(h ->> 'date', h ->> 'from', h ->> 'start') end, 10) as from_text,
           left(case when jsonb_typeof(h) = 'string' then h #>> '{}' else coalesce(h ->> 'date', h ->> 'to', h ->> 'end', h ->> 'from', h ->> 'start') end, 10) as to_text
      from public.academic_calendars ac
     cross join lateral jsonb_array_elements(
       case jsonb_typeof(ac.holidays_json)
         when 'array' then ac.holidays_json
         when 'object' then coalesce(ac.holidays_json -> 'holidays', ac.holidays_json -> 'dates', '[]'::jsonb)
         else '[]'::jsonb
       end) h
  ) raw
 cross join lateral (
   select raw.nursery_id, raw.name_ar, raw.name_en, raw.from_text::date as from_day, raw.to_text::date as to_day
    where raw.from_text ~ '^\d{4}-\d{2}-\d{2}$' and raw.to_text ~ '^\d{4}-\d{2}-\d{2}$'
 ) x
 where not exists (
   select 1 from public.nursery_holidays nh
    where nh.nursery_id = x.nursery_id and nh.starts_on = x.from_day and nh.deleted_at is null
 );

-- A holiday of the nursery's that day.
create or replace function public.attendance_is_holiday(p_nursery_id uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.nursery_holidays h
     where h.nursery_id = p_nursery_id and h.deleted_at is null
       and p_day between h.starts_on and h.ends_on
  );
$$;

-- -----------------------------------------------------------------------------------------------
-- 2. The weekdays, read one way ('sun', 'Sunday', '0' or 0; Sunday to Thursday when none are usable)

create or replace function public.nursery_open_weekdays(p_working_days jsonb)
returns smallint[]
language sql
immutable
set search_path = public
as $$
  select coalesce(nullif(array(
    select distinct d::smallint
      from (
        select coalesce(
                 case when lower(btrim(v)) ~ '^[0-6]$' then lower(btrim(v))::int end,
                 array_position(array['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], lower(btrim(v))) - 1,
                 array_position(array['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'], lower(btrim(v))) - 1
               ) as d
          from jsonb_array_elements_text(case when jsonb_typeof(p_working_days) = 'array' then p_working_days else '[]'::jsonb end) v
      ) days
     where d between 0 and 6
     order by 1
  ), '{}'), array[0, 1, 2, 3, 4]::smallint[]);
$$;

-- Open that day: one of its weekdays and not one of its holidays.
create or replace function public.attendance_is_school_day(p_nursery_id uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select extract(dow from p_day)::smallint = any (public.nursery_open_weekdays(n.working_days))
      from public.nurseries n where n.id = p_nursery_id
  ), false)
  and not public.attendance_is_holiday(p_nursery_id, p_day);
$$;

-- The weekdays' names in both languages, for a notice ("Sunday, Monday, …").
create or replace function public.nursery_weekday_names(p_days smallint[])
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'ar', array_to_string(array(select (array['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'])[d + 1] from unnest(p_days) d order by d), '، '),
    'en', array_to_string(array(select (array['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])[d + 1] from unnest(p_days) d order by d), ', ')
  );
$$;

-- -----------------------------------------------------------------------------------------------
-- 3. Who may set the days (the same people as the settings page: the nursery's admins, and a
--    manager or teacher whose role may update the settings)

create or replace function public.nursery_days_off_can_manage(p_nursery_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_xo_super_admin()
    or (public.current_user_role() = 'branch_admin' and p_nursery_id = public.current_user_nursery_id())
    or (public.current_user_role() = 'chain_super_admin' and p_nursery_id in (select public.nursery_ids_for_chain_admin()))
    or (public.current_user_role() in ('manager', 'teacher') and p_nursery_id = public.current_user_nursery_id()
        and public.user_can('settings', 'update')),
    false
  );
$$;

-- -----------------------------------------------------------------------------------------------
-- 4. What follows by itself

-- A notice to the nursery's families (parents of its active children) and its active staff, each
-- with the link that suits them.
create or replace function public.nursery_tell_everyone(p_nursery_id uuid, p_type text, p_template text, p_params jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_users(array(
    select distinct pc.parent_id
      from public.parent_children pc
      join public.children c on c.id = pc.child_id
      join public.users u on u.id = pc.parent_id
     where c.nursery_id = p_nursery_id and c.status = 'active' and coalesce(u.status, 'active') = 'active'
  ), p_nursery_id, p_type, p_template, p_params, '/parent', 'normal');
  perform public.notify_users(array(
    select u.id from public.users u
     where u.nursery_id = p_nursery_id and u.role = 'teacher' and coalesce(u.status, 'active') = 'active'
  ), p_nursery_id, p_type, p_template, p_params, '/teacher', 'normal');
  perform public.notify_users(array(
    select u.id from public.users u
     where u.nursery_id = p_nursery_id and u.role = 'branch_admin' and coalesce(u.status, 'active') = 'active'
  ), p_nursery_id, p_type, p_template, p_params, '/admin/settings?tab=daysOff', 'normal');
  perform public.notify_users(array(
    select u.id from public.users u
     where u.nursery_id = p_nursery_id and u.role = 'manager' and coalesce(u.status, 'active') = 'active'
  ), p_nursery_id, p_type, p_template, p_params, '/admin', 'normal');
end;
$$;

-- Tells everyone about a coming day off once (and stamps it).
create or replace function public.nursery_holiday_tell(p_holiday_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_h public.nursery_holidays;
begin
  update public.nursery_holidays set notified_at = now()
   where id = p_holiday_id and deleted_at is null and notified_at is null
  returning * into v_h;
  if not found then
    return;
  end if;
  perform public.nursery_tell_everyone(
    v_h.nursery_id, 'nursery_holiday',
    case when v_h.ends_on > v_h.starts_on then 'nursery_holiday_range' else 'nursery_holiday' end,
    jsonb_build_object('name', public.i18n_names(v_h.name_ar, v_h.name_en), 'from_date', v_h.starts_on, 'to_date', v_h.ends_on));
end;
$$;

-- How many days ahead a day off is announced.
create or replace function public.nursery_holiday_notice_days()
returns integer
language sql
immutable
set search_path = public
as $$ select 2 $$;

-- Today's staff tasks of a nursery, after its days changed: cancelled on a day off, back on a school day.
create or replace function public.staff_tasks_refresh_nursery_today(p_nursery_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.staff_tasks;
begin
  for v_task in select * from public.staff_tasks where nursery_id = p_nursery_id and deleted_at is null loop
    perform public.staff_tasks_refresh_today(v_task);
  end loop;
end;
$$;

-- A new date range is announced again.
create or replace function public.nursery_holidays_before_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if new.starts_on is distinct from old.starts_on or new.ends_on is distinct from old.ends_on then
    new.notified_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_nursery_holidays_before_update on public.nursery_holidays;
create trigger trg_nursery_holidays_before_update
  before update on public.nursery_holidays
  for each row execute function public.nursery_holidays_before_update();

-- After a holiday is added, changed or removed: today's tasks follow if today is in it (before or
-- after); days of an announced day off that are open again (it was removed, shortened or moved) are
-- announced as open; a day off within the notice days is announced now.
create or replace function public.nursery_holidays_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := public.nursery_today(new.nursery_id);
  v_reopens date;
  v_days_changed boolean := tg_op = 'INSERT'
    or new.starts_on is distinct from old.starts_on or new.ends_on is distinct from old.ends_on
    or new.deleted_at is distinct from old.deleted_at;
begin
  if not v_days_changed then
    return null;
  end if;
  if (v_today between new.starts_on and new.ends_on)
     or (tg_op = 'UPDATE' and v_today between old.starts_on and old.ends_on) then
    perform public.staff_tasks_refresh_nursery_today(new.nursery_id);
  end if;
  if tg_op = 'UPDATE' and old.deleted_at is null and old.notified_at is not null then
    -- the first coming day the families were told is off and is open now
    select min(d)::date into v_reopens
      from generate_series(greatest(old.starts_on, v_today)::timestamp, old.ends_on::timestamp, interval '1 day') d
     where new.deleted_at is not null or not (d::date between new.starts_on and new.ends_on);
    if v_reopens is not null then
      perform public.nursery_tell_everyone(new.nursery_id, 'nursery_holiday', 'nursery_holiday_cancelled',
        jsonb_build_object('name', public.i18n_names(new.name_ar, new.name_en), 'from_date', v_reopens));
    end if;
  end if;
  if new.deleted_at is null and new.notified_at is null
     and new.ends_on >= v_today and new.starts_on <= v_today + public.nursery_holiday_notice_days() then
    perform public.nursery_holiday_tell(new.id);
  end if;
  return null;
end;
$$;
drop trigger if exists trg_nursery_holidays_follow on public.nursery_holidays;
create trigger trg_nursery_holidays_follow
  after insert or update on public.nursery_holidays
  for each row execute function public.nursery_holidays_follow();

-- When the nursery's weekdays change (here, in the XO pages or the first setup): today's tasks
-- follow, and the families and staff are told the new days.
create or replace function public.nurseries_follow_weekdays()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old smallint[] := public.nursery_open_weekdays(old.working_days);
  v_new smallint[] := public.nursery_open_weekdays(new.working_days);
begin
  if v_old = v_new then
    return null;
  end if;
  perform public.staff_tasks_refresh_nursery_today(new.id);
  perform public.nursery_tell_everyone(new.id, 'nursery_week', 'nursery_week_changed',
    jsonb_build_object('days', public.nursery_weekday_names(v_new)));
  return null;
end;
$$;
drop trigger if exists trg_nurseries_follow_weekdays on public.nurseries;
create trigger trg_nurseries_follow_weekdays
  after update of working_days on public.nurseries
  for each row when (old.working_days is distinct from new.working_days)
  execute function public.nurseries_follow_weekdays();

-- The job: a day off coming within the notice days that nobody was told of yet (added long before)
-- is announced, in the nursery's daytime (8:00 to 20:00 there).
create or replace function public.run_nursery_holiday_notices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select h.id
      from public.nursery_holidays h
      left join public.nursery_settings ns on ns.nursery_id = h.nursery_id
     where h.deleted_at is null and h.notified_at is null
       and h.ends_on >= public.nursery_today(h.nursery_id)
       and h.starts_on <= public.nursery_today(h.nursery_id) + public.nursery_holiday_notice_days()
       and extract(hour from now() at time zone coalesce(ns.timezone, 'Africa/Cairo')) between 8 and 19
  loop
    perform public.nursery_holiday_tell(v_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- 3b. Saving

-- The weekdays the nursery opens (0 = Sunday … 6 = Saturday); at least one.
create or replace function public.nursery_set_open_weekdays(p_nursery_id uuid, p_open_days integer[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days smallint[] := array(select distinct d::smallint from unnest(coalesce(p_open_days, '{}')) d order by 1);
  v_stored jsonb;
begin
  if not public.nursery_days_off_can_manage(p_nursery_id) then
    raise exception 'days_off_forbidden' using errcode = '42501';
  end if;
  if cardinality(v_days) = 0 or not (v_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]) then
    raise exception 'days_off_week_invalid' using errcode = '22023';
  end if;
  v_stored := to_jsonb(array(select (array['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])[d + 1] from unnest(v_days) d order by d));
  update public.nurseries set working_days = v_stored where id = p_nursery_id;
  if not found then
    raise exception 'days_off_forbidden' using errcode = '42501';
  end if;
  return v_stored;
end;
$$;

-- Checks a holiday's fields; returns them cleaned.
create or replace function public.nursery_holiday_checked(p_holiday jsonb)
returns table (name_ar text, name_en text, starts_on date, ends_on date)
language plpgsql
immutable
set search_path = public
as $$
declare
  v_ar text := nullif(btrim(coalesce(p_holiday ->> 'name_ar', '')), '');
  v_en text := nullif(btrim(coalesce(p_holiday ->> 'name_en', '')), '');
  v_from date;
  v_to date;
begin
  if v_ar is null and v_en is null then
    raise exception 'days_off_name_required' using errcode = '22023';
  end if;
  if greatest(char_length(coalesce(v_ar, '')), char_length(coalesce(v_en, ''))) > 80 then
    raise exception 'days_off_name_too_long' using errcode = '22023';
  end if;
  begin
    v_from := (p_holiday ->> 'starts_on')::date;
    v_to := coalesce(nullif(p_holiday ->> 'ends_on', '')::date, v_from);
  exception when others then
    raise exception 'days_off_dates_invalid' using errcode = '22023';
  end;
  if v_from is null or v_to < v_from then
    raise exception 'days_off_dates_invalid' using errcode = '22023';
  end if;
  if v_to - v_from > 60 then
    raise exception 'days_off_too_long' using errcode = '22023';
  end if;
  return query select v_ar, v_en, v_from, v_to;
end;
$$;

-- Adds (p_holiday_id null; p_holiday.nursery_id says where) or changes a holiday.
create or replace function public.nursery_holiday_save(p_holiday_id uuid, p_holiday jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nursery uuid;
  v_id uuid := p_holiday_id;
  v_old public.nursery_holidays;
  v_today date;
  v record;
begin
  if p_holiday_id is null then
    v_nursery := nullif(p_holiday ->> 'nursery_id', '')::uuid;
  else
    select * into v_old from public.nursery_holidays h where h.id = p_holiday_id and h.deleted_at is null for update;
    if not found then
      raise exception 'days_off_not_found' using errcode = 'P0002';
    end if;
    v_nursery := v_old.nursery_id;
  end if;
  if v_nursery is null or not public.nursery_days_off_can_manage(v_nursery) then
    raise exception 'days_off_forbidden' using errcode = '42501';
  end if;
  select * into v from public.nursery_holiday_checked(p_holiday);
  -- The days gone by stay as they were: an ended day off is not changed; a running one keeps its
  -- start and can end early (yesterday at the soonest, to open today); a coming one stays ahead.
  if p_holiday_id is not null then
    v_today := public.nursery_today(v_nursery);
    if v_old.ends_on < v_today
       or (v_old.starts_on < v_today and (v.starts_on <> v_old.starts_on or v.ends_on < v_today - 1))
       or (v_old.starts_on >= v_today and v.starts_on < v_today) then
      raise exception 'days_off_past' using errcode = '22023';
    end if;
  end if;
  if exists (
    select 1 from public.nursery_holidays h
     where h.nursery_id = v_nursery and h.deleted_at is null and h.id is distinct from p_holiday_id
       and h.starts_on = v.starts_on and h.ends_on = v.ends_on
  ) then
    raise exception 'days_off_duplicate' using errcode = '23505';
  end if;
  if p_holiday_id is null then
    insert into public.nursery_holidays (nursery_id, name_ar, name_en, starts_on, ends_on, created_by)
    values (v_nursery, v.name_ar, v.name_en, v.starts_on, v.ends_on, auth.uid())
    returning id into v_id;
  else
    update public.nursery_holidays
       set name_ar = v.name_ar, name_en = v.name_en, starts_on = v.starts_on, ends_on = v.ends_on
     where id = p_holiday_id;
  end if;
  return v_id;
end;
$$;

-- Adds the official holidays the manager picked (each {key, name_ar, name_en, starts_on, ends_on});
-- one already there (by its key) is left as it is. Returns how many were added.
create or replace function public.nursery_holidays_add_official(p_nursery_id uuid, p_holidays jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_key text;
  v record;
  v_count integer := 0;
begin
  if not public.nursery_days_off_can_manage(p_nursery_id) then
    raise exception 'days_off_forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(p_holidays) is distinct from 'array' or jsonb_array_length(p_holidays) > 40 then
    raise exception 'days_off_dates_invalid' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_holidays) loop
    v_key := nullif(btrim(coalesce(v_item ->> 'key', '')), '');
    if v_key is null or v_key !~ '^[a-z0-9_]+-[0-9]{4}$' then
      raise exception 'days_off_dates_invalid' using errcode = '22023';
    end if;
    select * into v from public.nursery_holiday_checked(v_item);
    if not exists (select 1 from public.nursery_holidays h where h.nursery_id = p_nursery_id and h.official_key = v_key and h.deleted_at is null) then
      insert into public.nursery_holidays (nursery_id, name_ar, name_en, starts_on, ends_on, source, official_key, created_by)
      values (p_nursery_id, v.name_ar, v.name_en, v.starts_on, v.ends_on, 'official', v_key, auth.uid());
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- Removes a coming holiday (kept, marked deleted): the nursery is open those days again.
create or replace function public.nursery_holiday_remove(p_holiday_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nursery uuid;
begin
  select nursery_id into v_nursery from public.nursery_holidays where id = p_holiday_id and deleted_at is null for update;
  if not found then
    raise exception 'days_off_not_found' using errcode = 'P0002';
  end if;
  if not public.nursery_days_off_can_manage(v_nursery) then
    raise exception 'days_off_forbidden' using errcode = '42501';
  end if;
  -- Only before it starts: a running one is ended early instead, the past stays.
  if (select starts_on from public.nursery_holidays where id = p_holiday_id) < public.nursery_today(v_nursery) then
    raise exception 'days_off_past' using errcode = '22023';
  end if;
  update public.nursery_holidays set deleted_at = now(), deleted_by = auth.uid() where id = p_holiday_id;
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- 5. The menu's days, by the same rule

create or replace function public.get_menu_period(p_nursery_id uuid, p_day date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kind text := public.menu_viewer_kind(p_nursery_id);
  v_period record;
  v_menu public.menu_weeks%rowtype;
  v_visible boolean;
begin
  if v_kind is null then
    raise exception 'menu_forbidden' using errcode = '42501';
  end if;
  if p_day is null then
    raise exception 'menu_invalid_day' using errcode = '22023';
  end if;
  select * into v_period from public.menu_period_of(p_nursery_id, p_day);
  select * into v_menu from public.menu_weeks
   where nursery_id = p_nursery_id and period = v_period.period and week_start = v_period.starts_on;
  v_visible := found and (v_kind = 'staff' or v_menu.status = 'published');
  return jsonb_build_object(
    'period', v_period.period,
    'starts_on', v_period.starts_on,
    'ends_on', v_period.ends_on,
    'working_days', coalesce((select n.working_days from public.nurseries n where n.id = p_nursery_id), '[]'::jsonb),
    -- the days it is open in the period: its weekdays less its holidays (attendance's rule)
    'open_days', coalesce((
      select jsonb_agg(d::date order by d)
        from generate_series(v_period.starts_on::timestamp, v_period.ends_on::timestamp, interval '1 day') d
       where public.attendance_is_school_day(p_nursery_id, d::date)
    ), '[]'::jsonb),
    'can_edit', public.menu_can_edit(p_nursery_id),
    'menu', case when v_visible then jsonb_build_object(
      'id', v_menu.id, 'status', v_menu.status, 'notes', v_menu.notes,
      'file_path', v_menu.file_path, 'file_name', v_menu.file_name, 'file_type', v_menu.file_type, 'file_size', v_menu.file_size,
      'published_at', v_menu.published_at, 'updated_at', v_menu.updated_at
    ) end,
    'dishes', case when v_visible then coalesce((
      with conflicts as (select c from public.menu_visible_conflicts(p_nursery_id, v_period.starts_on, v_period.ends_on) c)
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'day', d.day, 'meal', d.meal, 'name', d.name, 'allergens', to_jsonb(d.allergens), 'sort_order', d.sort_order,
               'conflicts', coalesce((select jsonb_agg(k.c) from conflicts k where (k.c ->> 'dish_id')::uuid = d.id), '[]'::jsonb))
             order by d.day, array_position(array['breakfast', 'lunch', 'snacks'], d.meal), d.sort_order, d.name)
        from public.menu_dishes d where d.week_id = v_menu.id
    ), '[]'::jsonb) else '[]'::jsonb end,
    -- For staff: each food allergen with the children who have it, worst reaction first.
    'allergy_index', case when v_kind = 'staff' then coalesce((
      select jsonb_object_agg(x.allergen, x.children)
        from (
          select f.allergen,
                 jsonb_agg(jsonb_build_object(
                   'child_id', c.id, 'child_name_ar', c.full_name_ar, 'child_name_en', c.full_name_en,
                   'severity', a.severity, 'eats_nursery_meals', coalesce(dp.eats_nursery_meals, true))
                   order by array_position(array['life_threatening', 'severe', 'moderate', 'mild'], a.severity) nulls last, c.full_name_en) as children
            from public.child_allergies a
            join public.children c on c.id = a.child_id and c.status = 'active' and c.nursery_id = p_nursery_id
            left join public.child_dietary_preferences dp on dp.child_id = c.id
           cross join lateral unnest(a.food_allergens) as f(allergen)
           where public.rls_staff_can_access_child(c.id)
           group by f.allergen
        ) x
    ), '{}'::jsonb) else '{}'::jsonb end
  );
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- Grants and the job

revoke execute on function public.nursery_open_weekdays(jsonb) from public, anon;
revoke execute on function public.nursery_weekday_names(smallint[]) from public, anon, authenticated;
revoke execute on function public.nursery_tell_everyone(uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.nursery_holiday_tell(uuid) from public, anon, authenticated;
revoke execute on function public.staff_tasks_refresh_nursery_today(uuid) from public, anon, authenticated;
revoke execute on function public.nursery_holidays_before_update() from public, anon, authenticated;
revoke execute on function public.nursery_holidays_follow() from public, anon, authenticated;
revoke execute on function public.nurseries_follow_weekdays() from public, anon, authenticated;
revoke execute on function public.run_nursery_holiday_notices() from public, anon, authenticated;
revoke execute on function public.nursery_holiday_checked(jsonb) from public, anon, authenticated;
revoke execute on function public.nursery_days_off_can_manage(uuid) from public, anon;
grant execute on function public.nursery_days_off_can_manage(uuid) to authenticated;
revoke execute on function public.nursery_set_open_weekdays(uuid, integer[]) from public, anon;
revoke execute on function public.nursery_holiday_save(uuid, jsonb) from public, anon;
revoke execute on function public.nursery_holidays_add_official(uuid, jsonb) from public, anon;
revoke execute on function public.nursery_holiday_remove(uuid) from public, anon;
grant execute on function public.nursery_set_open_weekdays(uuid, integer[]) to authenticated;
grant execute on function public.nursery_holiday_save(uuid, jsonb) to authenticated;
grant execute on function public.nursery_holidays_add_official(uuid, jsonb) to authenticated;
grant execute on function public.nursery_holiday_remove(uuid) to authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'nursery-holiday-notices') then
    perform cron.unschedule('nursery-holiday-notices');
  end if;
  perform cron.schedule('nursery-holiday-notices', '20 * * * *', 'select public.run_nursery_holiday_notices()');
end $$;

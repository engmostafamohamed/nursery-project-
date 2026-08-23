-- Add a "repeats" flag to personal reminders.
--   repeats = true  (default): recurring — fires every week on the selected
--                    weekdays at the selected hours (the existing behaviour).
--   repeats = false: one-time — fires once on the next matching weekday + hour,
--                    then auto-deactivates so it never fires again.

alter table public.personal_reminders
  add column if not exists repeats boolean not null default true;

-- Runner: same as 20260615000000, but one-time reminders are deactivated once
-- they fire so they don't repeat the following week.
create or replace function public.run_personal_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted  integer := 0;
  cur_dow   smallint := extract(dow  from (now() at time zone 'Africa/Cairo'))::smallint;
  cur_hour  smallint := extract(hour from (now() at time zone 'Africa/Cairo'))::smallint;
begin
  with due as (
    select pr.*
    from public.personal_reminders pr
    where pr.active
      and cur_dow  = any (pr.days_of_week)
      and cur_hour = any (pr.hours_of_day)
      and (pr.last_fired_at is null
           or pr.last_fired_at < date_trunc('hour', now()))
  ),
  sent as (
    insert into public.notifications
      (nursery_id, user_id, type, title_ar, title_en, body_ar, body_en, read, channel, sent_at, action_link)
    select
      d.nursery_id,
      d.user_id,
      'personal_reminder',
      d.name,
      d.name,
      coalesce(nullif(d.description, ''), d.name),
      coalesce(nullif(d.description, ''), d.name),
      false, 'in_app', now(),
      case when d.audience = 'teacher' then '/teacher/reminders' else '/admin/reminders' end
    from due d
    returning 1
  )
  select count(*) into inserted from sent;

  -- Mark fired; one-time (repeats = false) reminders are deactivated so they
  -- never fire again.
  update public.personal_reminders pr
     set last_fired_at = now(),
         active = case when pr.repeats then pr.active else false end
   where pr.active
     and cur_dow  = any (pr.days_of_week)
     and cur_hour = any (pr.hours_of_day)
     and (pr.last_fired_at is null
          or pr.last_fired_at < date_trunc('hour', now()));

  return inserted;
end;
$$;

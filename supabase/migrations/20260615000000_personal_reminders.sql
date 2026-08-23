-- Personal reminders (self-service):
--   Admins and teachers create recurring reminders for THEMSELVES. Each reminder
--   carries a set of weekdays (0=Sun .. 6=Sat) and a set of hours (0..23). An
--   hourly pg_cron job inserts one in-app notification per reminder when the
--   current local weekday + hour matches and it has not already fired this hour.
--
-- Follows the same pattern as 20260516000002_automated_reminders.sql: a
-- SECURITY DEFINER runner inserts notification rows directly (no outbound HTTP).

create extension if not exists pg_cron;

-- Schedule matching uses the platform's primary timezone (Africa/Cairo) so a
-- reminder set for "09:00 on Monday" fires at local 09:00, not UTC.
-- ── table ───────────────────────────────────────────────────────────────────
create table if not exists public.personal_reminders (
  id            uuid primary key default gen_random_uuid(),
  nursery_id    uuid not null references public.nurseries(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  audience      text not null default 'admin' check (audience in ('admin', 'teacher')),
  name          text not null,
  description   text not null default '',
  days_of_week  smallint[] not null default '{}',   -- 0=Sun .. 6=Sat
  hours_of_day  smallint[] not null default '{}',   -- 0 .. 23
  active        boolean not null default true,
  last_fired_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint personal_reminders_days_not_empty check (array_length(days_of_week, 1) >= 1),
  constraint personal_reminders_hours_not_empty check (array_length(hours_of_day, 1) >= 1),
  constraint personal_reminders_days_range check (
    days_of_week <@ array[0,1,2,3,4,5,6]::smallint[]
  ),
  constraint personal_reminders_hours_range check (
    hours_of_day <@ array[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]::smallint[]
  )
);

create index if not exists idx_personal_reminders_user on public.personal_reminders (user_id);
create index if not exists idx_personal_reminders_nursery on public.personal_reminders (nursery_id);

alter table public.personal_reminders enable row level security;

-- Owner-only: a user fully manages their own reminders and sees no one else's.
drop policy if exists personal_reminders_owner_all on public.personal_reminders;
create policy personal_reminders_owner_all
  on public.personal_reminders for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists trg_personal_reminders_updated_at on public.personal_reminders;
create trigger trg_personal_reminders_updated_at
  before update on public.personal_reminders
  for each row execute function public.set_updated_at();

-- ── runner: one notification per due reminder, hourly ───────────────────────
create or replace function public.run_personal_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted  integer := 0;
  cur_dow   smallint   := extract(dow  from (now() at time zone 'Africa/Cairo'))::smallint;
  cur_hour  smallint   := extract(hour from (now() at time zone 'Africa/Cairo'))::smallint;
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

  update public.personal_reminders pr
     set last_fired_at = now()
   where pr.active
     and cur_dow  = any (pr.days_of_week)
     and cur_hour = any (pr.hours_of_day)
     and (pr.last_fired_at is null
          or pr.last_fired_at < date_trunc('hour', now()));

  return inserted;
end;
$$;

-- ── schedule (idempotent: unschedule-if-exists then schedule) ───────────────
do $$
begin
  perform cron.unschedule('personal-reminders-hourly');
exception when others then null;
end $$;

select cron.schedule('personal-reminders-hourly', '0 * * * *',
  $$select public.run_personal_reminders()$$);

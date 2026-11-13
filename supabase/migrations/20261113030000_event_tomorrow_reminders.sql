-- Events: the day before.
--
-- Nothing reminded anyone of an event the day before. Now, at 5 pm in the nursery's time zone, for
-- each open event of the next day:
-- * each family with a child going is told once: when and where, and that the child's check-in code
--   is on the event page;
-- * each teacher of a class with children going is told how many, once, with a link to the roster.
-- The job runs every hour; a nursery is reached in the hour it is 5 pm there. `p_now` is for tests.
create or replace function public.run_event_tomorrow_reminders(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer := 0;
begin
  with tomorrow as (
    select e.id, e.nursery_id, e.title_ar, e.title_en, e.starts_at, nullif(trim(e.location), '') as location,
           coalesce(ns.timezone, 'Africa/Cairo') as tz
      from public.events e
      left join public.nursery_settings ns on ns.nursery_id = e.nursery_id
     where e.status = 'active' and e.cancelled_at is null and e.deleted_at is null
       and e.starts_at > p_now
       and extract(hour from p_now at time zone coalesce(ns.timezone, 'Africa/Cairo')) = 17
       and (e.starts_at at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date
           = (p_now at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date + 1
  ),
  going as (
    select t.*, p.child_id
      from tomorrow t
      join public.permissions p on p.event_id = t.id and p.status = 'granted' and p.deleted_at is null
  ),
  families as (
    insert into public.notifications (nursery_id, user_id, type, template_key, template_params, read, channel, sent_at, action_link)
    select distinct on (pc.parent_id, g.id)
           g.nursery_id, pc.parent_id, 'event_tomorrow', 'event_tomorrow',
           jsonb_build_object(
             'event', public.i18n_names(g.title_ar, g.title_en), 'start_time', g.starts_at, 'tz', g.tz, 'location', g.location,
             'segments', case when g.location is null then '["qr"]'::jsonb else '["place", "qr"]'::jsonb end
           ),
           false, 'in_app', p_now, '/parent/events/' || g.id
      from going g
      join public.parent_children pc on pc.child_id = g.child_id
     where not exists (
       select 1 from public.notifications n
        where n.user_id = pc.parent_id and n.type = 'event_tomorrow' and n.action_link = '/parent/events/' || g.id
     )
    returning 1
  ),
  teachers as (
    insert into public.notifications (nursery_id, user_id, type, template_key, template_params, read, channel, sent_at, action_link)
    select g.nursery_id, cs.user_id, 'event_tomorrow_staff', 'event_tomorrow_staff',
           jsonb_build_object(
             'event', public.i18n_names(g.title_ar, g.title_en), 'start_time', g.starts_at, 'tz', g.tz,
             'count', count(distinct g.child_id)
           ),
           false, 'in_app', p_now, '/teacher/events?event=' || g.id
      from going g
      join public.children c on c.id = g.child_id
      join public.class_staff cs on cs.class_id = c.class_id
     where not exists (
       select 1 from public.notifications n
        where n.user_id = cs.user_id and n.type = 'event_tomorrow_staff' and n.action_link = '/teacher/events?event=' || g.id
     )
     group by g.id, g.nursery_id, g.title_ar, g.title_en, g.starts_at, g.tz, cs.user_id
    returning 1
  )
  select (select count(*) from families) + (select count(*) from teachers) into inserted;
  return inserted;
end;
$$;

revoke execute on function public.run_event_tomorrow_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.run_event_tomorrow_reminders(timestamptz) to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'event-tomorrow-reminders';
    perform cron.schedule('event-tomorrow-reminders', '0 * * * *', 'select public.run_event_tomorrow_reminders()');
  end if;
end;
$$;

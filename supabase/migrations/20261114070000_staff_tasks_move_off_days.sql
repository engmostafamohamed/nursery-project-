-- Staff tasks on a day off: a one-time or monthly task whose day is a weekend day or a holiday was
-- skipped (the month's fire drill never came when the 1st was a Friday). It moves to the next
-- school day now. A monthly task stays in its month: when no school day is left after its day, it
-- comes on the last school day before it. Daily and weekly tasks still skip a day off (they come
-- again soon).

-- The first school day of a nursery from p_from to p_until (null when there is none).
create or replace function public.nursery_next_school_day(p_nursery_id uuid, p_from date, p_until date)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select d::date
    from generate_series(p_from::timestamp, p_until::timestamp, interval '1 day') d
   where public.attendance_is_school_day(p_nursery_id, d::date)
   order by d
   limit 1;
$$;

-- The day a monthly task comes in the month of p_month: its day (29–31 mean the last day in shorter
-- months), or the next school day after it in the month, or else the last school day before it.
create or replace function public.staff_task_month_day(p_nursery_id uuid, p_day_of_month integer, p_month date)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
           public.nursery_next_school_day(p_nursery_id, m.day, m.last),
           (select d::date
              from generate_series(m.first::timestamp, (m.day - 1)::timestamp, interval '1 day') d
             where public.attendance_is_school_day(p_nursery_id, d::date)
             order by d desc
             limit 1),
           m.day)
    from (select f.first, f.last, f.first + (least(p_day_of_month, extract(day from f.last)::int) - 1) as day
            from (select date_trunc('month', p_month)::date as first,
                         (date_trunc('month', p_month) + interval '1 month - 1 day')::date as last) f) m;
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
           -- on a day off: the next school day (within a month)
           when 'once' then p_day between p_task.on_date and p_task.on_date + 31
                        and p_day = public.nursery_next_school_day(p_task.nursery_id, p_task.on_date, p_task.on_date + 31)
           when 'daily' then true
           when 'weekly' then extract(dow from p_day)::smallint = any (p_task.days_of_week)
           when 'monthly' then p_day = public.staff_task_month_day(p_task.nursery_id, p_task.day_of_month, p_day)
           else false
         end;
$$;

revoke execute on function public.nursery_next_school_day(uuid, date, date) from public, anon, authenticated;
revoke execute on function public.staff_task_month_day(uuid, integer, date) from public, anon, authenticated;

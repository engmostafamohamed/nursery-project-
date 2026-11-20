-- What the teacher's own classes have been doing lately.
--
-- Her dashboard showed today's numbers and nothing else: she could not see whether attendance was
-- holding up across her classes, whether the day's reports were going out, or how her classes
-- compare in size. Each of those would have been its own query from the browser.
--
-- get_my_teaching_stats answers all of it for the signed-in teacher in one call: a fortnight of
-- attendance and of reports across the classes she is on the team of, and the size of each class.
-- It reads only her own classes, so there is nothing to filter on the way out.

create or replace function public.get_my_teaching_stats(p_days integer default 14)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_nursery uuid;
  v_days integer := least(greatest(coalesce(p_days, 14), 1), 60);
  v_today date;
  v_from date;
  v_classes uuid[];
begin
  if v_uid is null then
    raise exception 'teaching_stats_not_authenticated' using errcode = '28000';
  end if;

  select u.nursery_id into v_nursery from public.users u where u.id = v_uid and u.role = 'teacher';
  if v_nursery is null then
    raise exception 'teaching_stats_not_a_teacher' using errcode = '42501';
  end if;

  -- The classes she is on the team of; everything below is about these and nothing else.
  select coalesce(array_agg(cs.class_id), '{}') into v_classes
    from public.class_staff cs
    join public.classes c on c.id = cs.class_id and c.deleted_at is null
   where cs.user_id = v_uid;

  v_today := public.nursery_today(v_nursery);
  v_from := v_today - (v_days - 1);

  return jsonb_build_object(
    'from', v_from,
    'to', v_today,
    -- Her classes, each with how many children it holds and the place she takes in it.
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'ar', c.name_ar, 'en', c.name_en, 'role', cs.role,
        'children', (select count(*) from public.children ch
                      where ch.class_id = c.id and ch.status = 'active')
      ) order by c.name_en)
        from public.class_staff cs
        join public.classes c on c.id = cs.class_id and c.deleted_at is null
       where cs.user_id = v_uid
    ), '[]'::jsonb),

    -- A fortnight of attendance across those classes, a point per school day.
    'attendance', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'here', d.here, 'away', d.away) order by d.day)
        from (
          select ar.attendance_date as day,
                 count(*) filter (where ar.check_in is not null) as here,
                 (select count(*) from public.children ch
                   where ch.class_id = any (v_classes) and ch.status = 'active')
                 - count(*) filter (where ar.check_in is not null) as away
            from public.attendance_records ar
            join public.children ch on ch.id = ar.child_id
           where ch.class_id = any (v_classes)
             and ar.attendance_date between v_from and v_today
           group by ar.attendance_date
        ) d
    ), '[]'::jsonb),

    -- The day's reports going out, a point per day they were written for.
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'sent', d.sent, 'draft', d.draft) order by d.day)
        from (
          select r.report_date as day,
                 count(*) filter (where r.status = 'published') as sent,
                 count(*) filter (where r.status <> 'published') as draft
            from public.daily_reports r
            join public.children ch on ch.id = r.child_id
           where ch.class_id = any (v_classes)
             and r.report_date between v_from and v_today
           group by r.report_date
        ) d
    ), '[]'::jsonb),

    -- What the fortnight came to, for the figures above the charts.
    'totals', (
      select jsonb_build_object(
        'children', (select count(*) from public.children ch where ch.class_id = any (v_classes) and ch.status = 'active'),
        'classes', coalesce(array_length(v_classes, 1), 0),
        'reports_sent', (select count(*) from public.daily_reports r
                           join public.children ch on ch.id = r.child_id
                          where ch.class_id = any (v_classes)
                            and r.report_date between v_from and v_today and r.status = 'published'),
        'days_recorded', (select count(distinct ar.attendance_date) from public.attendance_records ar
                            join public.children ch on ch.id = ar.child_id
                           where ch.class_id = any (v_classes)
                             and ar.attendance_date between v_from and v_today)
      )
    )
  );
end;
$function$;

revoke all on function public.get_my_teaching_stats(integer) from public, anon;
grant execute on function public.get_my_teaching_stats(integer) to authenticated;

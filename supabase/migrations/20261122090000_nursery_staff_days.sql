-- The nursery's own staff attendance over a span of days, in one call.
--
-- get_staff_days answers for one person, which is what their page needs. The nursery's attendance
-- screen needs everybody at once: who was here, who was late and by how much, the hours worked, the
-- days nobody closed, and the days somebody was expected and never came. Asking per person would be
-- one call per member of staff, and working out "expected" on the client means knowing each
-- person's shift — so both the days and the shifts behind them are answered here.
--
-- Who may read it: whoever may already manage the nursery's attendance (staff_attendance_can_manage
-- — XO, the chain's admin, the branch's admins and managers). A teacher reads only her own days,
-- through get_staff_days, as before.

create or replace function public.get_nursery_staff_days(p_nursery_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_days integer;
begin
  if not public.staff_attendance_can_manage(p_nursery_id) then
    raise exception 'staff_clock_forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'staff_clock_invalid' using errcode = '22023';
  end if;
  v_days := p_to - p_from;
  -- A quarter at a time: longer than that belongs to a report, not a screen.
  if v_days > 92 then
    raise exception 'staff_clock_range_too_long' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'today', public.nursery_today(p_nursery_id),
    'from', p_from,
    'to', p_to,
    'timezone', coalesce((select s.timezone from public.nursery_settings s where s.nursery_id = p_nursery_id), 'Africa/Cairo'),
    -- The days the nursery was open: a missing day only counts on one of these.
    'school_days', coalesce((
      select jsonb_agg(d::date order by d)
        from generate_series(p_from, p_to, interval '1 day') d
       where public.attendance_is_school_day(p_nursery_id, d::date)
    ), '[]'::jsonb),
    /*
     * Everybody who could have a day in the span: the nursery's staff now, and anyone whose days
     * are in it although they have since left, so last month keeps its people.
     */
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', u.id,
               'ar', u.name_ar,
               'en', u.name_en,
               'role', u.role,
               'status', coalesce(u.status, 'active'),
               'position', sp.position,
               'department', sp.department,
               -- The shift each weekday, so "expected today" and lateness read against the right one.
               'schedule', coalesce((
                 select jsonb_agg(jsonb_build_object('dow', sch.day_of_week, 'from', sch.start_time, 'to', sch.end_time)
                                  order by sch.day_of_week)
                   from public.staff_schedules sch
                  where sch.staff_id = sp.id and sch.is_working_day and sch.start_time is not null
               ), '[]'::jsonb)
             ) order by u.name_en nulls last, u.name_ar)
        from public.users u
        left join public.staff_profiles sp on sp.user_id = u.id and sp.nursery_id = p_nursery_id
       where u.nursery_id = p_nursery_id
         and u.role in ('teacher', 'manager', 'branch_admin')
         and (
           coalesce(u.status, 'active') = 'active'
           or exists (select 1 from public.staff_attendance sa
                       where sa.user_id = u.id and sa.work_date between p_from and p_to)
         )
    ), '[]'::jsonb),
    'days', coalesce((
      select jsonb_agg(public.staff_attendance_json(sa) || jsonb_build_object('user_id', sa.user_id) order by sa.work_date, sa.user_id)
        from public.staff_attendance sa
       where sa.nursery_id = p_nursery_id and sa.work_date between p_from and p_to
    ), '[]'::jsonb),
    -- The nursery's hours, for the people who have no shift of their own.
    'house', (select jsonb_build_object('from', n.opens_at, 'to', n.closes_at)
                from public.nurseries n where n.id = p_nursery_id)
  );
end;
$function$;

revoke all on function public.get_nursery_staff_days(uuid, date, date) from public, anon;
grant execute on function public.get_nursery_staff_days(uuid, date, date) to authenticated;

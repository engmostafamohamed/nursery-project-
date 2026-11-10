-- A member of staff's days (clocking in and out) between two dates, for their page: read through a
-- function by their account, so a day just recorded on the class page shows at once (the service
-- worker answers table reads from its cache first) and staff without an HR record show too (their
-- days have no staff_id). For the person themselves and whoever may record their day
-- (staff_attendance_can_manage: XO, their chain's admin, their branch's admin and managers).

create or replace function public.get_staff_days(p_user_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_nursery uuid;
begin
  select u.nursery_id into v_nursery from public.users u where u.id = p_user_id;
  if auth.uid() is null or v_nursery is null
     or (p_user_id is distinct from auth.uid() and not public.staff_attendance_can_manage(v_nursery)) then
    raise exception 'staff_clock_forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'staff_clock_invalid' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(public.staff_attendance_json(sa) order by sa.work_date)
      from public.staff_attendance sa
     where sa.user_id = p_user_id and sa.work_date between p_from and p_to
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.get_staff_days(uuid, date, date) from public, anon;
grant execute on function public.get_staff_days(uuid, date, date) to authenticated, service_role;

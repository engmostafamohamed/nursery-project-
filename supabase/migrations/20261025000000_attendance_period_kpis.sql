-- The admin dashboard's attendance card for any period: a month, a quarter, half a year, a year,
-- or dates the admin picks (at most 366 days).
--
-- get_attendance_period_kpis(nursery, from, to) counts the same things as the "this month" part of
-- get_attendance_kpis, for the days from..to:
--   * attendance: school days, the child-days expected, present, excused (absence notice) and absent,
--     and the attendance rate;
--   * late pickups and extra hours (covered by a package / billed), and the extra-hours money;
--   * scans by QR or by hand, and the days still waiting for a review;
--   * the five children with the most extra hours in the period.
-- The money is that of the period's own charges (the extra hours of its days): billed, of which
-- collected (its invoice is paid) and outstanding (its invoice is still pending or overdue), so the
-- numbers of a past quarter stay the same whenever they are looked at.
-- Days still to come are not counted: the period ends today at the latest (in the nursery's time).
-- Readable by the nursery's staff who can see attendance (attendance_require_staff).

create or replace function public.get_attendance_period_kpis(p_nursery_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ns public.nursery_settings%rowtype;
  v_to date;
  v_stats jsonb;
  v_top_late jsonb;
begin
  perform public.attendance_require_staff(p_nursery_id);
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from + 1 > 366 then
    raise exception 'attendance_invalid_range' using errcode = '22023';
  end if;
  select * into v_ns from public.nursery_settings where nursery_id = p_nursery_id;
  v_to := least(p_to, (now() at time zone coalesce(v_ns.timezone, 'Africa/Cairo'))::date);

  with kids as (
    select c.id, coalesce(c.enrollment_date, c.created_at::date) as start_day
    from public.children c
    where c.nursery_id = p_nursery_id and c.status = 'active'
  ),
  school_days as (
    select d::date as day
    from generate_series(p_from, v_to, interval '1 day') d
    where public.attendance_is_school_day(p_nursery_id, d::date)
  ),
  att as (
    select ar.* from public.attendance_records ar
    join public.children c on c.id = ar.child_id
    where c.nursery_id = p_nursery_id and ar.attendance_date between p_from and v_to
  ),
  child_days as (
    select count(*) as n from kids k join school_days s on s.day >= k.start_day
  ),
  present_days as (
    select count(*) as n from att a
    join kids k on k.id = a.child_id
    join school_days s on s.day = a.attendance_date
    where a.check_in is not null
  ),
  excused_days as (
    select count(*) as n from public.attendance_absence_reports abr
    join kids k on k.id = abr.child_id
    join school_days s on s.day = abr.absence_date and s.day >= k.start_day
    where not exists (select 1 from att a where a.child_id = abr.child_id and a.attendance_date = abr.absence_date and a.check_in is not null)
  ),
  charges as (
    select a.extra_fee, i.status as invoice_status
    from att a
    left join public.invoices i on i.id = a.late_charge_invoice_id
    where coalesce(a.extra_fee, 0) > 0
  )
  select jsonb_build_object(
    'from', p_from,
    'to', v_to,
    'school_days', (select count(*) from school_days),
    'expected_child_days', (select n from child_days),
    'present_child_days', (select n from present_days),
    'excused_child_days', (select n from excused_days),
    'absent_child_days', greatest((select n from child_days) - (select n from present_days) - (select n from excused_days), 0),
    'attendance_rate', case when (select n from child_days) > 0
      then round((select n from present_days)::numeric * 100 / (select n from child_days), 1) else 0 end,
    'late_pickups', (select count(*) from att where coalesce(extra_hours, 0) > 0 or coalesce(late_minutes, 0) > coalesce(v_ns.late_pickup_grace_minutes, 0)),
    'extra_hours', (select coalesce(sum(extra_hours), 0) from att),
    'extra_hours_covered', (select coalesce(sum(extra_hours_covered), 0) from att),
    'extra_hours_billed', (select coalesce(sum(extra_hours_billed), 0) from att),
    'extra_fee_billed', (select coalesce(sum(extra_fee), 0) from charges),
    'extra_fee_collected', (select coalesce(sum(extra_fee), 0) from charges where invoice_status = 'paid'),
    'extra_fee_outstanding', (select coalesce(sum(extra_fee), 0) from charges where invoice_status in ('pending', 'overdue')),
    'needs_review', (select count(*) from att where needs_review),
    'qr_scans', (select count(*) from att where check_in_method in ('qr_parent', 'qr_custom') or check_out_method in ('qr_parent', 'qr_custom')),
    'manual_entries', (select count(*) from att where check_in_method = 'manual' or check_out_method = 'manual')
  ) into v_stats;

  select coalesce(jsonb_agg(t order by t.extra_hours desc, t.late_days desc), '[]'::jsonb) into v_top_late
  from (
    select c.id as child_id, c.full_name_ar, c.full_name_en,
           count(*) as late_days, sum(ar.extra_hours) as extra_hours, sum(ar.extra_fee) as extra_fee
    from public.attendance_records ar
    join public.children c on c.id = ar.child_id
    where c.nursery_id = p_nursery_id
      and ar.attendance_date between p_from and v_to
      and coalesce(ar.extra_hours, 0) > 0
    group by c.id, c.full_name_ar, c.full_name_en
    order by sum(ar.extra_hours) desc
    limit 5
  ) t;

  return v_stats || jsonb_build_object('top_late', v_top_late);
end;
$$;

revoke execute on function public.get_attendance_period_kpis(uuid, date, date) from public, anon;
grant execute on function public.get_attendance_period_kpis(uuid, date, date) to authenticated, service_role;

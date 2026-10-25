-- The details behind each number of the dashboard's attendance card, for the period it shows.
-- Each list counts exactly what its number counts, so a number and its list always agree:
--
--   get_attendance_day_children(nursery, day)
--     One row per active child enrolled by that day: here now, picked up, absent with a notice
--     (excused), absent, or no school that day; the times, who brought and picked the child up,
--     the staff on each side, the extra hours and their charge, whether the child is late to be
--     picked up right now (today only), the family's notice, and the first parent to call.
--     Behind today's numbers, and behind "attendance" when the period is a single day.
--
--   get_attendance_period_children(nursery, from, to)
--     One row per active child: school days expected, days attended, absent with a notice, absent
--     without, the attendance rate, late pickups and extra hours. The rows add up to the period's
--     attendance numbers.
--
--   get_attendance_period_days(nursery, from, to)
--     One row per school day: children expected, attended, excused and absent, and the rate.
--
--   get_attendance_period_records(nursery, from, to)
--     The period's days that were late, charged or flagged for review, with the charge's invoice:
--     behind late pickups, extra hours billed, collected, outstanding and need review.
--
-- Like get_attendance_period_kpis: at most 366 days, days still to come are not counted, and only
-- the nursery's staff who can see attendance may read them (attendance_require_staff).

-- The days a period counts: from..to, ending today at the latest. Raises on a bad range.
create or replace function public.attendance_period_end(p_nursery_id uuid, p_from date, p_to date)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from + 1 > 366 then
    raise exception 'attendance_invalid_range' using errcode = '22023';
  end if;
  return least(p_to, (now() at time zone coalesce(
    (select ns.timezone from public.nursery_settings ns where ns.nursery_id = p_nursery_id), 'Africa/Cairo'))::date);
end;
$$;

revoke execute on function public.attendance_period_end(uuid, date, date) from public, anon, authenticated;

-- -----------------------------------------------------------------------------------------------
create or replace function public.get_attendance_day_children(p_nursery_id uuid, p_day date)
returns table (
  child_id uuid,
  full_name_ar text,
  full_name_en text,
  class_name_ar text,
  class_name_en text,
  parent_name_ar text,
  parent_name_en text,
  parent_phone text,
  -- in_nursery | picked_up | excused | absent | off (a weekend or holiday)
  day_status text,
  check_in timestamptz,
  check_out timestamptz,
  check_in_method text,
  check_out_method text,
  dropoff_name_ar text,
  dropoff_name_en text,
  dropoff_relationship text,
  pickup_person_name text,
  pickup_relationship text,
  checked_in_by_ar text,
  checked_in_by_en text,
  checked_out_by_ar text,
  checked_out_by_en text,
  -- When the child is due to be picked up (closing time or the end of the child's hours, plus the grace).
  pickup_due_at timestamptz,
  late_now boolean,
  late_minutes integer,
  extra_hours numeric,
  extra_hours_covered numeric,
  extra_hours_billed numeric,
  extra_fee numeric,
  invoice_status text,
  absence_reason text,
  absence_note text,
  absence_reported_by_ar text,
  absence_reported_by_en text,
  absence_reported_at timestamptz,
  needs_review boolean,
  review_reason text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_ns public.nursery_settings%rowtype;
  v_today date;
begin
  perform public.attendance_require_staff(p_nursery_id);
  if p_day is null then
    raise exception 'attendance_invalid_range' using errcode = '22023';
  end if;
  select * into v_ns from public.nursery_settings where nursery_id = p_nursery_id;
  v_today := (now() at time zone coalesce(v_ns.timezone, 'Africa/Cairo'))::date;

  return query
  with kids as (
    select c.id, c.full_name_ar, c.full_name_en, c.class_id
    from public.children c
    where c.nursery_id = p_nursery_id and c.status = 'active'
  ),
  d as (
    select * from public.get_attendance_days(array(select k.id from kids k), p_day, p_day)
  )
  select
    k.id,
    k.full_name_ar,
    k.full_name_en,
    cl.name_ar,
    cl.name_en,
    par.name_ar,
    par.name_en,
    par.phone,
    case
      when d.day_status = 'partial' then 'in_nursery'
      when d.day_status = 'present' then 'picked_up'
      -- A notice counts as excused whatever the day, as on the card.
      when d.absence_reason is not null or d.day_status = 'excused' then 'excused'
      when d.day_status = 'absent' then 'absent'
      else 'off'
    end,
    d.check_in,
    d.check_out,
    d.check_in_method,
    d.check_out_method,
    d.dropoff_name_ar,
    d.dropoff_name_en,
    d.dropoff_relationship,
    d.pickup_person_name,
    d.pickup_relationship,
    d.checked_in_by_ar,
    d.checked_in_by_en,
    d.checked_out_by_ar,
    d.checked_out_by_en,
    case when ar.check_in is not null then
      public.attendance_billing_start(ar, v_ns) + make_interval(mins => coalesce(v_ns.late_pickup_grace_minutes, 0))
    end,
    -- The card's "late pickup now": still here today after the due time.
    coalesce(
      p_day = v_today and ar.check_in is not null and ar.check_out is null
        and now() > public.attendance_billing_start(ar, v_ns) + make_interval(mins => coalesce(v_ns.late_pickup_grace_minutes, 0)),
      false
    ),
    d.late_minutes,
    d.extra_hours,
    d.extra_hours_covered,
    d.extra_hours_billed,
    d.extra_fee,
    d.invoice_status,
    d.absence_reason,
    d.absence_note,
    d.absence_reported_by_ar,
    d.absence_reported_by_en,
    d.absence_reported_at,
    d.needs_review,
    d.review_reason
  from d
  join kids k on k.id = d.child_id
  left join public.classes cl on cl.id = k.class_id
  left join public.attendance_records ar on ar.id = d.attendance_id
  left join lateral (
    select u.name_ar, u.name_en, u.phone
    from public.parent_children pc
    join public.users u on u.id = pc.parent_id
    where pc.child_id = k.id
    order by pc.is_primary desc nulls last, pc.created_at
    limit 1
  ) par on true
  where d.day_status not in ('not_enrolled', 'upcoming')
  order by k.full_name_en, k.full_name_ar;
end;
$$;

-- -----------------------------------------------------------------------------------------------
create or replace function public.get_attendance_period_children(p_nursery_id uuid, p_from date, p_to date)
returns table (
  child_id uuid,
  full_name_ar text,
  full_name_en text,
  class_name_ar text,
  class_name_en text,
  expected_days integer,
  present_days integer,
  excused_days integer,
  absent_days integer,
  attendance_rate numeric,
  late_days integer,
  extra_hours numeric,
  extra_fee numeric
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_to date;
  v_grace integer;
begin
  perform public.attendance_require_staff(p_nursery_id);
  v_to := public.attendance_period_end(p_nursery_id, p_from, p_to);
  select coalesce(ns.late_pickup_grace_minutes, 0) into v_grace from public.nursery_settings ns where ns.nursery_id = p_nursery_id;

  return query
  with kids as (
    select c.id, c.full_name_ar, c.full_name_en, c.class_id, coalesce(c.enrollment_date, c.created_at::date) as start_day
    from public.children c
    where c.nursery_id = p_nursery_id and c.status = 'active'
  ),
  school_days as (
    select g::date as day
    from generate_series(p_from, v_to, interval '1 day') g
    where public.attendance_is_school_day(p_nursery_id, g::date)
  ),
  att as (
    select ar.* from public.attendance_records ar join kids k on k.id = ar.child_id
    where ar.attendance_date between p_from and v_to
  ),
  expected as (
    select k.id, count(s.day)::integer as n from kids k left join school_days s on s.day >= k.start_day group by k.id
  ),
  present as (
    select a.child_id, count(*)::integer as n from att a join school_days s on s.day = a.attendance_date
    where a.check_in is not null group by a.child_id
  ),
  excused as (
    select abr.child_id, count(*)::integer as n
    from public.attendance_absence_reports abr
    join kids k on k.id = abr.child_id
    join school_days s on s.day = abr.absence_date and s.day >= k.start_day
    where not exists (select 1 from att a where a.child_id = abr.child_id and a.attendance_date = abr.absence_date and a.check_in is not null)
    group by abr.child_id
  ),
  late as (
    select a.child_id,
           (count(*) filter (where coalesce(a.extra_hours, 0) > 0 or coalesce(a.late_minutes, 0) > v_grace))::integer as days,
           coalesce(sum(a.extra_hours), 0) as hours,
           coalesce(sum(a.extra_fee), 0) as fee
    from att a group by a.child_id
  )
  select
    k.id,
    k.full_name_ar,
    k.full_name_en,
    cl.name_ar,
    cl.name_en,
    e.n,
    coalesce(p.n, 0),
    coalesce(x.n, 0),
    greatest(e.n - coalesce(p.n, 0) - coalesce(x.n, 0), 0),
    case when e.n > 0 then least(round(coalesce(p.n, 0)::numeric * 100 / e.n, 1), 100) else 0 end,
    coalesce(l.days, 0),
    coalesce(l.hours, 0),
    coalesce(l.fee, 0)
  from kids k
  join expected e on e.id = k.id
  left join present p on p.child_id = k.id
  left join excused x on x.child_id = k.id
  left join late l on l.child_id = k.id
  left join public.classes cl on cl.id = k.class_id
  order by k.full_name_en, k.full_name_ar;
end;
$$;

-- -----------------------------------------------------------------------------------------------
create or replace function public.get_attendance_period_days(p_nursery_id uuid, p_from date, p_to date)
returns table (
  day date,
  expected integer,
  present integer,
  excused integer,
  absent integer,
  attendance_rate numeric
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_to date;
begin
  perform public.attendance_require_staff(p_nursery_id);
  v_to := public.attendance_period_end(p_nursery_id, p_from, p_to);

  return query
  with kids as (
    select c.id, coalesce(c.enrollment_date, c.created_at::date) as start_day
    from public.children c
    where c.nursery_id = p_nursery_id and c.status = 'active'
  ),
  school_days as (
    select g::date as day
    from generate_series(p_from, v_to, interval '1 day') g
    where public.attendance_is_school_day(p_nursery_id, g::date)
  ),
  counts as (
    select s.day,
      (select count(*) from kids k where k.start_day <= s.day)::integer as expected,
      (select count(*) from public.attendance_records a join kids k on k.id = a.child_id
        where a.attendance_date = s.day and a.check_in is not null)::integer as present,
      (select count(*) from public.attendance_absence_reports abr join kids k on k.id = abr.child_id
        where abr.absence_date = s.day and k.start_day <= s.day
          and not exists (select 1 from public.attendance_records a
                          where a.child_id = abr.child_id and a.attendance_date = s.day and a.check_in is not null))::integer as excused
    from school_days s
  )
  select c.day, c.expected, c.present, c.excused,
         greatest(c.expected - c.present - c.excused, 0),
         case when c.expected > 0 then least(round(c.present::numeric * 100 / c.expected, 1), 100) else 0 end
  from counts c
  order by c.day desc;
end;
$$;

-- -----------------------------------------------------------------------------------------------
create or replace function public.get_attendance_period_records(p_nursery_id uuid, p_from date, p_to date)
returns table (
  attendance_id uuid,
  child_id uuid,
  full_name_ar text,
  full_name_en text,
  attendance_date date,
  check_in timestamptz,
  check_out timestamptz,
  check_out_method text,
  pickup_person_name text,
  pickup_relationship text,
  -- Counted in "late pickups": extra hours, or picked up later than the grace allows.
  is_late boolean,
  late_minutes integer,
  extra_hours numeric,
  extra_hours_covered numeric,
  extra_hours_billed numeric,
  extra_fee numeric,
  late_charge_waived boolean,
  invoice_id uuid,
  invoice_number text,
  invoice_status text,
  invoice_due_date date,
  invoice_paid_at timestamptz,
  needs_review boolean,
  review_reason text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_to date;
  v_grace integer;
begin
  perform public.attendance_require_staff(p_nursery_id);
  v_to := public.attendance_period_end(p_nursery_id, p_from, p_to);
  select coalesce(ns.late_pickup_grace_minutes, 0) into v_grace from public.nursery_settings ns where ns.nursery_id = p_nursery_id;

  return query
  select
    ar.id,
    c.id,
    c.full_name_ar,
    c.full_name_en,
    ar.attendance_date,
    ar.check_in,
    ar.check_out,
    ar.check_out_method,
    coalesce(ar.pickup_person_name, nullif(ar.qr_scan_log ->> 'pickup_person_name', '')),
    coalesce(ar.pickup_relationship, nullif(ar.qr_scan_log ->> 'pickup_relationship', '')),
    coalesce(ar.extra_hours, 0) > 0 or coalesce(ar.late_minutes, 0) > v_grace,
    coalesce(ar.late_minutes, 0),
    coalesce(ar.extra_hours, 0),
    coalesce(ar.extra_hours_covered, 0),
    coalesce(ar.extra_hours_billed, 0),
    coalesce(ar.extra_fee, 0),
    coalesce(ar.late_charge_waived, false),
    inv.id,
    case when inv.id is not null then public.invoice_number_label(inv) end,
    inv.status,
    inv.due_date,
    inv.paid_at,
    coalesce(ar.needs_review, false),
    ar.review_reason
  from public.attendance_records ar
  join public.children c on c.id = ar.child_id
  left join public.invoices inv on inv.id = ar.late_charge_invoice_id
  where c.nursery_id = p_nursery_id
    and ar.attendance_date between p_from and v_to
    and (coalesce(ar.extra_hours, 0) > 0 or coalesce(ar.late_minutes, 0) > v_grace
         or coalesce(ar.extra_fee, 0) > 0 or coalesce(ar.needs_review, false))
  order by ar.attendance_date desc, c.full_name_en, c.full_name_ar;
end;
$$;

revoke execute on function public.get_attendance_day_children(uuid, date) from public, anon;
revoke execute on function public.get_attendance_period_children(uuid, date, date) from public, anon;
revoke execute on function public.get_attendance_period_days(uuid, date, date) from public, anon;
revoke execute on function public.get_attendance_period_records(uuid, date, date) from public, anon;
grant execute on function public.get_attendance_day_children(uuid, date) to authenticated, service_role;
grant execute on function public.get_attendance_period_children(uuid, date, date) to authenticated, service_role;
grant execute on function public.get_attendance_period_days(uuid, date, date) to authenticated, service_role;
grant execute on function public.get_attendance_period_records(uuid, date, date) to authenticated, service_role;

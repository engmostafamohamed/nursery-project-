-- The attendance day loads quickly for a large branch.
--
-- get_attendance_days asked its helper functions once per row: who may see this child (twice),
-- whether the day is a holiday and a school day, and the name behind each of four user ids. For a
-- branch of 250 children that is ~2,750 little queries for one screen, and the page took seconds
-- to come back after every check-in.
--
-- The same answers are now worked out once: the caller's role and nursery are read a single time,
-- the nursery's holidays and open weekdays for the range are gathered into two small CTEs, and the
-- four names come from ordinary joins. The rows returned, and who is allowed to see them, do not
-- change — only how often the database is asked.

create or replace function public.get_attendance_days(p_child_ids uuid[], p_from date, p_to date)
returns table(
  child_id uuid, day date, day_status text, attendance_id uuid,
  check_in timestamptz, check_out timestamptz, check_in_method text, check_out_method text,
  checked_in_by_ar text, checked_in_by_en text, checked_out_by_ar text, checked_out_by_en text,
  pickup_person_name text, pickup_relationship text, pickup_photo_url text,
  early_minutes integer, late_minutes integer,
  extra_hours numeric, extra_hours_covered numeric, extra_hours_billed numeric, extra_fee numeric,
  late_charge_status text, late_charge_waived boolean, invoice_id uuid, invoice_status text,
  needs_review boolean, review_reason text, absence_reason text, absence_note text,
  dropoff_name_ar text, dropoff_name_en text, dropoff_relationship text,
  absence_reported_by_ar text, absence_reported_by_en text, absence_reported_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_nursery uuid;
  v_chain uuid;
begin
  if v_uid is null then
    raise exception 'attendance_not_authenticated' using errcode = '28000';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'attendance_invalid_range' using errcode = '22023';
  end if;

  -- Who is asking, read once instead of per child.
  select u.role::text, u.nursery_id, u.chain_id
    into v_role, v_nursery, v_chain
    from public.users u
   where u.id = v_uid;

  return query
  with kids as (
    -- The children of this request the caller may see: a parent sees their own, staff see the
    -- children of the nursery (or chain) they belong to. Same rule as before, asked once per child.
    select c.id, c.nursery_id,
           coalesce(c.enrollment_date, c.created_at::date) as start_day,
           (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date as today
      from public.children c
      left join public.nursery_settings ns on ns.nursery_id = c.nursery_id
      left join public.nurseries cn on cn.id = c.nursery_id
     where c.id = any (p_child_ids)
       and (
         v_role = 'xo_super_admin'
         or (v_role = 'chain_super_admin' and cn.chain_id is not null and cn.chain_id = v_chain)
         or (v_role in ('branch_admin', 'manager', 'teacher') and v_nursery = c.nursery_id)
         or exists (
           select 1 from public.parent_children pc
            where pc.child_id = c.id and pc.parent_id = v_uid
         )
       )
  ),
  -- The calendar of every nursery in play, gathered once for the whole range.
  nurseries_in_play as (
    select distinct k.nursery_id from kids k
  ),
  holidays as (
    select h.nursery_id, h.starts_on, h.ends_on
      from public.nursery_holidays h
      join nurseries_in_play n on n.nursery_id = h.nursery_id
     where h.deleted_at is null
       and h.starts_on <= p_to
       and h.ends_on >= p_from
  ),
  open_weekdays as (
    select n.id as nursery_id, public.nursery_open_weekdays(n.working_days) as dows
      from public.nurseries n
      join nurseries_in_play p on p.nursery_id = n.id
  ),
  days as (
    select k.id as kid, k.nursery_id, k.start_day, k.today, d::date as day
      from kids k
      cross join generate_series(p_from, p_to, interval '1 day') d
  ),
  -- The day rows come from a generated series, whose size the planner cannot judge, so it used to
  -- read the whole attendance history of these children and sort it. Narrowing both tables to the
  -- window first lets the (child_id, date) indexes do the work on a handful of rows.
  recs as (
    select ar.*
      from public.attendance_records ar
     where ar.child_id = any (p_child_ids)
       and ar.attendance_date between p_from and p_to
  ),
  reports as (
    select abr.*
      from public.attendance_absence_reports abr
     where abr.child_id = any (p_child_ids)
       and abr.absence_date between p_from and p_to
  )
  select
    d.kid,
    d.day,
    case
      when ar.check_in is not null and ar.check_out is not null then 'present'
      when ar.check_in is not null then 'partial'
      when d.day < d.start_day then 'not_enrolled'
      when d.day > d.today then 'upcoming'
      when exists (
        select 1 from holidays h
         where h.nursery_id = d.nursery_id and d.day between h.starts_on and h.ends_on
      ) then 'holiday'
      -- A school day is an open weekday that is not a holiday; the holiday case above already left.
      when not coalesce(
        (select extract(dow from d.day)::smallint = any (ow.dows)
           from open_weekdays ow where ow.nursery_id = d.nursery_id),
        false
      ) then 'off'
      when abr.id is not null then 'excused'
      else 'absent'
    end,
    ar.id,
    ar.check_in,
    ar.check_out,
    ar.check_in_method,
    ar.check_out_method,
    coalesce(nullif(trim(uin.name_ar), ''), nullif(trim(uin.name_en), '')),
    coalesce(nullif(trim(uin.name_en), ''), nullif(trim(uin.name_ar), '')),
    coalesce(nullif(trim(uout.name_ar), ''), nullif(trim(uout.name_en), '')),
    coalesce(nullif(trim(uout.name_en), ''), nullif(trim(uout.name_ar), '')),
    coalesce(ar.pickup_person_name, nullif(ar.qr_scan_log ->> 'pickup_person_name', '')),
    coalesce(ar.pickup_relationship, nullif(ar.qr_scan_log ->> 'pickup_relationship', '')),
    nullif(ar.qr_scan_log ->> 'pickup_photo_url', ''),
    coalesce(ar.early_minutes, 0),
    coalesce(ar.late_minutes, 0),
    coalesce(ar.extra_hours, 0),
    coalesce(ar.extra_hours_covered, 0),
    coalesce(ar.extra_hours_billed, 0),
    coalesce(ar.extra_fee, 0),
    ar.late_charge_status,
    coalesce(ar.late_charge_waived, false),
    ar.late_charge_invoice_id,
    inv.status,
    coalesce(ar.needs_review, false),
    ar.review_reason,
    abr.reason,
    abr.note,
    -- The same order check-out uses for the pickup person: the named delegate, then the parent.
    coalesce(
      nullif(trim(tin.pickup_person_full_name), ''),
      nullif(trim(tin.delegate_name), ''),
      case when ar.check_in_method = 'qr_parent'
        then coalesce(nullif(trim(uissued.name_ar), ''), nullif(trim(uissued.name_en), '')) end
    ),
    coalesce(
      nullif(trim(tin.pickup_person_full_name), ''),
      nullif(trim(tin.delegate_name), ''),
      case when ar.check_in_method = 'qr_parent'
        then coalesce(nullif(trim(uissued.name_en), ''), nullif(trim(uissued.name_ar), '')) end
    ),
    nullif(trim(tin.pickup_relationship), ''),
    coalesce(nullif(trim(urep.name_ar), ''), nullif(trim(urep.name_en), '')),
    coalesce(nullif(trim(urep.name_en), ''), nullif(trim(urep.name_ar), '')),
    abr.created_at
  from days d
  left join recs ar on ar.child_id = d.kid and ar.attendance_date = d.day
  left join reports abr on abr.child_id = d.kid and abr.absence_date = d.day
  left join public.invoices inv on inv.id = ar.late_charge_invoice_id
  left join public.qr_tokens tin on tin.id = ar.check_in_qr_token_id
  left join public.users uin on uin.id = ar.check_in_by
  left join public.users uout on uout.id = ar.check_out_by
  left join public.users urep on urep.id = abr.reported_by
  left join public.users uissued on uissued.id = tin.issued_by
  order by d.day desc, d.kid;
end;
$function$;

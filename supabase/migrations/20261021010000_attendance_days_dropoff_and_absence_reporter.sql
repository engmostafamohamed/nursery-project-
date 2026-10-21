-- A child's attendance history shows who brought the child in and who reported an absence.
--
-- get_attendance_days() already returns, per day, the check-in and check-out times, the staff on
-- each side, the method and the pickup person. It now also returns:
--   * dropoff_name_ar / dropoff_name_en / dropoff_relationship: who brought the child, from the QR
--     code scanned at check-in. A delegate's QR names the person and their relation; a parent's
--     QR names the parent who showed it. A manual check-in has no one recorded (null).
--   * absence_reported_by_ar / absence_reported_by_en / absence_reported_at: who sent the absence
--     notice for the day, and when.
-- The columns are added at the end, so callers that read the existing ones are unaffected. The
-- return type changes, so the function is dropped and created again in this one transaction.

drop function if exists public.get_attendance_days(uuid[], date, date);

create function public.get_attendance_days(p_child_ids uuid[], p_from date, p_to date)
returns table (
  child_id uuid,
  day date,
  day_status text,
  attendance_id uuid,
  check_in timestamptz,
  check_out timestamptz,
  check_in_method text,
  check_out_method text,
  checked_in_by_ar text,
  checked_in_by_en text,
  checked_out_by_ar text,
  checked_out_by_en text,
  pickup_person_name text,
  pickup_relationship text,
  pickup_photo_url text,
  early_minutes integer,
  late_minutes integer,
  extra_hours numeric,
  extra_hours_covered numeric,
  extra_hours_billed numeric,
  extra_fee numeric,
  late_charge_status text,
  late_charge_waived boolean,
  invoice_id uuid,
  invoice_status text,
  needs_review boolean,
  review_reason text,
  absence_reason text,
  absence_note text,
  dropoff_name_ar text,
  dropoff_name_en text,
  dropoff_relationship text,
  absence_reported_by_ar text,
  absence_reported_by_en text,
  absence_reported_at timestamptz
)
language plpgsql
-- Not STABLE: parent_can_access_child runs SET LOCAL, which a non-volatile caller may not do.
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'attendance_not_authenticated' using errcode = '28000';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'attendance_invalid_range' using errcode = '22023';
  end if;

  return query
  with kids as (
    select c.id, c.nursery_id, coalesce(c.enrollment_date, c.created_at::date) as start_day,
           (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date as today
    from public.children c
    left join public.nursery_settings ns on ns.nursery_id = c.nursery_id
    where c.id = any (p_child_ids)
      and (public.parent_can_access_child(c.id) or public.attendance_staff_can_access_child(c.id))
  ),
  days as (
    select k.id as kid, k.nursery_id, k.start_day, k.today, d::date as day
    from kids k
    cross join generate_series(p_from, p_to, interval '1 day') d
  )
  select
    d.kid,
    d.day,
    case
      when ar.check_in is not null and ar.check_out is not null then 'present'
      when ar.check_in is not null then 'partial'
      when d.day < d.start_day then 'not_enrolled'
      when d.day > d.today then 'upcoming'
      when public.attendance_is_holiday(d.nursery_id, d.day) then 'holiday'
      when not public.attendance_is_school_day(d.nursery_id, d.day) then 'off'
      when abr.id is not null then 'excused'
      else 'absent'
    end,
    ar.id,
    ar.check_in,
    ar.check_out,
    ar.check_in_method,
    ar.check_out_method,
    public.attendance_user_name(ar.check_in_by, 'ar'),
    public.attendance_user_name(ar.check_in_by, 'en'),
    public.attendance_user_name(ar.check_out_by, 'ar'),
    public.attendance_user_name(ar.check_out_by, 'en'),
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
      case when ar.check_in_method = 'qr_parent' then public.attendance_user_name(tin.issued_by, 'ar') end
    ),
    coalesce(
      nullif(trim(tin.pickup_person_full_name), ''),
      nullif(trim(tin.delegate_name), ''),
      case when ar.check_in_method = 'qr_parent' then public.attendance_user_name(tin.issued_by, 'en') end
    ),
    nullif(trim(tin.pickup_relationship), ''),
    public.attendance_user_name(abr.reported_by, 'ar'),
    public.attendance_user_name(abr.reported_by, 'en'),
    abr.created_at
  from days d
  left join public.attendance_records ar on ar.child_id = d.kid and ar.attendance_date = d.day
  left join public.attendance_absence_reports abr on abr.child_id = d.kid and abr.absence_date = d.day
  left join public.invoices inv on inv.id = ar.late_charge_invoice_id
  left join public.qr_tokens tin on tin.id = ar.check_in_qr_token_id
  order by d.day desc, d.kid;
end;
$$;

revoke execute on function public.get_attendance_days(uuid[], date, date) from public, anon;
grant execute on function public.get_attendance_days(uuid[], date, date) to authenticated, service_role;

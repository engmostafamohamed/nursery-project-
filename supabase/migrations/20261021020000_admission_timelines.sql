-- A child's admission journey, with the exact date and time of each step, for the nursery staff
-- (child record) and the family (their children list):
--   application started → submitted by the parent → payment confirmed → approved (and by whom)
--   → joined the nursery → first day at the nursery (first check-in).
--
-- One row per child. Readable by the same people as the child's attendance: the child's parents,
-- and the nursery's admins, managers and teachers (chain admins for their chain, XO admins).
--
-- joined_at is the moment the child's record was created when that is its enrollment day (an
-- approval creates both together), in the nursery's time or in UTC (approvals before
-- 20261021000000 dated the enrollment in UTC). A child whose enrollment date was set to another
-- day (an import, a later correction) only has that date: joined_at is null and enrollment_date says it.

create or replace function public.get_admission_timelines(p_child_ids uuid[])
returns table (
  child_id uuid,
  application_id uuid,
  application_started_at timestamptz,
  submitted_at timestamptz,
  payment_confirmed_at timestamptz,
  approved_at timestamptz,
  approved_by_ar text,
  approved_by_en text,
  enrollment_date date,
  joined_at timestamptz,
  first_check_in timestamptz
)
language plpgsql
-- Not STABLE: parent_can_access_child runs SET LOCAL, which a non-volatile caller may not do.
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'admission_timeline_not_authenticated' using errcode = '28000';
  end if;
  if p_child_ids is null or cardinality(p_child_ids) > 200 then
    raise exception 'admission_timeline_invalid_children' using errcode = '22023';
  end if;

  return query
  with kids as (
    select c.id,
           c.created_at,
           c.enrollment_date,
           coalesce(ns.timezone, 'Africa/Cairo') as tz,
           nullif(c.enrollment_extended_json ->> 'source_application_id', '')::uuid as source_application_id
    from public.children c
    left join public.nursery_settings ns on ns.nursery_id = c.nursery_id
    where c.id = any (p_child_ids)
      and (public.parent_can_access_child(c.id) or public.attendance_staff_can_access_child(c.id))
  )
  select
    k.id,
    app.id,
    app.created_at,
    app.submitted_at,
    pay.confirmed_at,
    case when app.status = 'approved' then app.reviewed_at end,
    case when app.status = 'approved' then public.attendance_user_name(app.reviewed_by, 'ar') end,
    case when app.status = 'approved' then public.attendance_user_name(app.reviewed_by, 'en') end,
    k.enrollment_date,
    case
      when k.enrollment_date is null
        or k.enrollment_date = (k.created_at at time zone k.tz)::date
        or k.enrollment_date = (k.created_at at time zone 'UTC')::date
      then k.created_at
    end,
    first_day.check_in
  from kids k
  -- The application the child was enrolled from (kept on the child at approval), else the
  -- latest approved one for the child.
  left join lateral (
    select a.id, a.status, a.created_at, a.submitted_at, a.reviewed_at, a.reviewed_by
    from public.applications a
    where a.id = k.source_application_id
       or (k.source_application_id is null and a.child_id = k.id and a.status = 'approved')
    order by a.reviewed_at desc nulls last
    limit 1
  ) app on true
  -- The first confirmed payment on the application's admission invoice.
  left join lateral (
    select min(coalesce(p.paid_at, p.created_at)) as confirmed_at
    from public.invoices i
    join public.payments p on p.invoice_id = i.id and p.status = 'completed'
    where app.id is not null
      and i.line_items_json ->> 'application_id' = app.id::text
  ) pay on true
  left join lateral (
    select min(ar.check_in) as check_in
    from public.attendance_records ar
    where ar.child_id = k.id and ar.check_in is not null
  ) first_day on true;
end;
$$;

revoke execute on function public.get_admission_timelines(uuid[]) from public, anon;
grant execute on function public.get_admission_timelines(uuid[]) to authenticated, service_role;

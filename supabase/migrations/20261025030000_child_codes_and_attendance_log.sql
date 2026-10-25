-- Every child gets a unique code, the attendance card counts the children who took extra hours, and
-- check-ins and check-outs can be looked up by day, date, the child's name or code, or a parent's name.
--
-- 1. Child codes. children.child_id_number (unique, "CH-2025-00001") was never filled. Every child
--    now has one: CH-<year they joined>-<number>, given when the child is created and never changed.
--    Existing children are numbered in the order they were added.
-- 2. The attendance card's lists (get_attendance_day_children / _period_children / _period_records)
--    also return the child's code, the father's name and every parent's name and phone (so a list
--    can be searched by any of them). Their result types change, so they are dropped and created again.
-- 3. get_attendance_period_kpis also counts the children who took extra hours, and on how many days.
-- 4. get_attendance_period_log: every check-in of the period with its times, who brought and picked
--    up the child, and the extra hours; filtered on the server by a search (child name or code, a
--    parent's name or phone), a weekday, a date and a class, one page at a time.
-- 5. get_children_today: for the family (and staff), each child's day right now: here since,
--    picked up at, absent; when the child is due to be picked up, and whether they are late now
--    (in extra hours).

-- -----------------------------------------------------------------------------------------------
-- 1. Child codes
create sequence if not exists public.child_code_seq;

create or replace function public.children_assign_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.child_id_number is not null and trim(old.child_id_number) <> '' then
    -- A code never changes once given.
    new.child_id_number := old.child_id_number;
  elsif new.child_id_number is null or trim(new.child_id_number) = '' then
    new.child_id_number := format('CH-%s-%s',
      extract(year from coalesce(new.enrollment_date, new.created_at::date, current_date))::int,
      lpad(nextval('public.child_code_seq')::text, 5, '0'));
  end if;
  return new;
end;
$$;

-- Number the children that have no code yet, in the order they were added (without touching updated_at).
alter table public.children disable trigger trg_children_updated_at;
with numbered as (
  select c.id,
         extract(year from coalesce(c.enrollment_date, c.created_at::date))::int as joined_year,
         (select count(*) from public.children x where x.child_id_number is not null and trim(x.child_id_number) <> '')
           + row_number() over (order by c.created_at, c.id) as n
  from public.children c
  where c.child_id_number is null or trim(c.child_id_number) = ''
)
update public.children c
   set child_id_number = format('CH-%s-%s', numbered.joined_year, lpad(numbered.n::text, 5, '0'))
  from numbered
 where c.id = numbered.id;
alter table public.children enable trigger trg_children_updated_at;

select setval('public.child_code_seq',
  greatest((select count(*) from public.children where child_id_number is not null), 1));

drop trigger if exists trg_children_assign_code on public.children;
create trigger trg_children_assign_code
  before insert or update of child_id_number on public.children
  for each row execute function public.children_assign_code();

comment on column public.children.child_id_number is
  'The child''s unique code (CH-<year joined>-<number>), given on creation and never changed.';

-- -----------------------------------------------------------------------------------------------
-- The child's family for a list: the father's name, and every parent's name and phone to search on.
create or replace function public.child_family_names(p_child_id uuid)
returns table (father_name_ar text, father_name_en text, parents_text text)
language sql
stable
security definer
set search_path = public
as $$
  select
    (array_agg(u.name_ar order by pc.created_at) filter (where pc.relationship = 'father' or pc.parent_type = 'father'))[1],
    (array_agg(u.name_en order by pc.created_at) filter (where pc.relationship = 'father' or pc.parent_type = 'father'))[1],
    string_agg(concat_ws(' ', u.name_ar, u.name_en, u.phone), ' ')
  from public.parent_children pc
  join public.users u on u.id = pc.parent_id
  where pc.child_id = p_child_id
$$;

revoke execute on function public.child_family_names(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------------------------
-- 2. The card's lists, with the code and the family
drop function if exists public.get_attendance_day_children(uuid, date);
create function public.get_attendance_day_children(p_nursery_id uuid, p_day date)
returns table (
  child_id uuid,
  full_name_ar text,
  full_name_en text,
  child_code text,
  class_id uuid,
  class_name_ar text,
  class_name_en text,
  parent_name_ar text,
  parent_name_en text,
  parent_phone text,
  father_name_ar text,
  father_name_en text,
  parents_text text,
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
    select c.id, c.full_name_ar, c.full_name_en, c.child_id_number, c.class_id
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
    k.child_id_number,
    k.class_id,
    cl.name_ar,
    cl.name_en,
    par.name_ar,
    par.name_en,
    par.phone,
    fam.father_name_ar,
    fam.father_name_en,
    fam.parents_text,
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
    -- The card's "in extra hours now": still here today after the due time.
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
  left join lateral public.child_family_names(k.id) fam on true
  where d.day_status not in ('not_enrolled', 'upcoming')
  order by k.full_name_en, k.full_name_ar;
end;
$$;

drop function if exists public.get_attendance_period_children(uuid, date, date);
create function public.get_attendance_period_children(p_nursery_id uuid, p_from date, p_to date)
returns table (
  child_id uuid,
  full_name_ar text,
  full_name_en text,
  child_code text,
  class_id uuid,
  class_name_ar text,
  class_name_en text,
  father_name_ar text,
  father_name_en text,
  parents_text text,
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
    select c.id, c.full_name_ar, c.full_name_en, c.child_id_number, c.class_id, coalesce(c.enrollment_date, c.created_at::date) as start_day
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
    k.child_id_number,
    k.class_id,
    cl.name_ar,
    cl.name_en,
    fam.father_name_ar,
    fam.father_name_en,
    fam.parents_text,
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
  left join lateral public.child_family_names(k.id) fam on true
  order by k.full_name_en, k.full_name_ar;
end;
$$;

drop function if exists public.get_attendance_period_records(uuid, date, date);
create function public.get_attendance_period_records(p_nursery_id uuid, p_from date, p_to date)
returns table (
  attendance_id uuid,
  child_id uuid,
  full_name_ar text,
  full_name_en text,
  child_code text,
  class_id uuid,
  class_name_ar text,
  class_name_en text,
  father_name_ar text,
  father_name_en text,
  parents_text text,
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
    c.child_id_number,
    c.class_id,
    cl.name_ar,
    cl.name_en,
    fam.father_name_ar,
    fam.father_name_en,
    fam.parents_text,
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
  left join public.classes cl on cl.id = c.class_id
  left join public.invoices inv on inv.id = ar.late_charge_invoice_id
  left join lateral public.child_family_names(c.id) fam on true
  where c.nursery_id = p_nursery_id
    and ar.attendance_date between p_from and v_to
    and (coalesce(ar.extra_hours, 0) > 0 or coalesce(ar.late_minutes, 0) > v_grace
         or coalesce(ar.extra_fee, 0) > 0 or coalesce(ar.needs_review, false))
  order by ar.attendance_date desc, c.full_name_en, c.full_name_ar;
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- 3. The period's numbers, with the children who took extra hours
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
    'extra_hours_children', (select count(distinct child_id) from att where coalesce(extra_hours, 0) > 0),
    'extra_hours_days', (select count(*) from att where coalesce(extra_hours, 0) > 0),
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

-- -----------------------------------------------------------------------------------------------
-- 4. Every check-in of a period, searched and paged on the server
drop function if exists public.get_attendance_period_log(uuid, date, date, text, integer, date, integer, integer);
create or replace function public.get_attendance_period_log(
  p_nursery_id uuid,
  p_from date,
  p_to date,
  p_search text default null,
  -- 0 = Sunday … 6 = Saturday
  p_weekday integer default null,
  p_day date default null,
  p_class_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  attendance_id uuid,
  child_id uuid,
  full_name_ar text,
  full_name_en text,
  child_code text,
  class_id uuid,
  class_name_ar text,
  class_name_en text,
  father_name_ar text,
  father_name_en text,
  attendance_date date,
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
  late_minutes integer,
  extra_hours numeric,
  extra_hours_covered numeric,
  extra_fee numeric,
  invoice_status text,
  needs_review boolean,
  -- All the rows that match, for the pages.
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_to date;
  v_words text[];
begin
  perform public.attendance_require_staff(p_nursery_id);
  v_to := public.attendance_period_end(p_nursery_id, p_from, p_to);
  if p_weekday is not null and (p_weekday < 0 or p_weekday > 6) then
    raise exception 'attendance_invalid_weekday' using errcode = '22023';
  end if;
  v_words := array(
    select w from regexp_split_to_table(lower(trim(coalesce(p_search, ''))), '\s+') w where w <> ''
  );

  return query
  with matched as (
    select ar.*, c.full_name_ar as c_ar, c.full_name_en as c_en, c.child_id_number as c_code, c.class_id as c_class,
           fam.father_name_ar as f_ar, fam.father_name_en as f_en
    from public.attendance_records ar
    join public.children c on c.id = ar.child_id
    left join lateral public.child_family_names(c.id) fam on true
    where c.nursery_id = p_nursery_id
      and ar.attendance_date between p_from and v_to
      and ar.check_in is not null
      and (p_weekday is null or extract(dow from ar.attendance_date)::int = p_weekday)
      and (p_day is null or ar.attendance_date = p_day)
      and (p_class_id is null or c.class_id = p_class_id)
      and (
        cardinality(v_words) = 0
        or (
          select bool_and(strpos(lower(concat_ws(' ', c.full_name_ar, c.full_name_en, c.child_id_number, fam.parents_text)), w) > 0)
          from unnest(v_words) w
        )
      )
  )
  select
    r.id,
    r.child_id,
    r.c_ar,
    r.c_en,
    r.c_code,
    r.c_class,
    cl.name_ar,
    cl.name_en,
    r.f_ar,
    r.f_en,
    r.attendance_date,
    r.check_in,
    r.check_out,
    r.check_in_method,
    r.check_out_method,
    coalesce(
      nullif(trim(tin.pickup_person_full_name), ''),
      nullif(trim(tin.delegate_name), ''),
      case when r.check_in_method = 'qr_parent' then public.attendance_user_name(tin.issued_by, 'ar') end
    ),
    coalesce(
      nullif(trim(tin.pickup_person_full_name), ''),
      nullif(trim(tin.delegate_name), ''),
      case when r.check_in_method = 'qr_parent' then public.attendance_user_name(tin.issued_by, 'en') end
    ),
    nullif(trim(tin.pickup_relationship), ''),
    coalesce(r.pickup_person_name, nullif(r.qr_scan_log ->> 'pickup_person_name', '')),
    coalesce(r.pickup_relationship, nullif(r.qr_scan_log ->> 'pickup_relationship', '')),
    public.attendance_user_name(r.check_in_by, 'ar'),
    public.attendance_user_name(r.check_in_by, 'en'),
    public.attendance_user_name(r.check_out_by, 'ar'),
    public.attendance_user_name(r.check_out_by, 'en'),
    coalesce(r.late_minutes, 0),
    coalesce(r.extra_hours, 0),
    coalesce(r.extra_hours_covered, 0),
    coalesce(r.extra_fee, 0),
    inv.status,
    coalesce(r.needs_review, false),
    count(*) over ()
  from matched r
  left join public.classes cl on cl.id = r.c_class
  left join public.qr_tokens tin on tin.id = r.check_in_qr_token_id
  left join public.invoices inv on inv.id = r.late_charge_invoice_id
  order by r.attendance_date desc, r.check_in desc, r.c_en
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- 5. Each child's day right now, for the family
create or replace function public.get_children_today(p_child_ids uuid[])
returns table (
  child_id uuid,
  day date,
  -- in_nursery | picked_up | excused | absent | off (a weekend or holiday) | not_enrolled
  day_status text,
  check_in timestamptz,
  check_out timestamptz,
  pickup_due_at timestamptz,
  late_now boolean,
  extra_hours numeric,
  extra_fee numeric
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
  if p_child_ids is null or cardinality(p_child_ids) > 50 then
    raise exception 'attendance_invalid_children' using errcode = '22023';
  end if;

  return query
  select
    c.id,
    k.today,
    case
      when ar.check_in is not null and ar.check_out is null then 'in_nursery'
      when ar.check_in is not null then 'picked_up'
      when coalesce(c.enrollment_date, c.created_at::date) > k.today then 'not_enrolled'
      when exists (select 1 from public.attendance_absence_reports abr where abr.child_id = c.id and abr.absence_date = k.today) then 'excused'
      when not public.attendance_is_school_day(c.nursery_id, k.today) then 'off'
      else 'absent'
    end,
    ar.check_in,
    ar.check_out,
    case when ar.check_in is not null then
      public.attendance_billing_start(ar, ns) + make_interval(mins => coalesce(ns.late_pickup_grace_minutes, 0))
    end,
    coalesce(
      ar.check_in is not null and ar.check_out is null
        and now() > public.attendance_billing_start(ar, ns) + make_interval(mins => coalesce(ns.late_pickup_grace_minutes, 0)),
      false
    ),
    coalesce(ar.extra_hours, 0),
    coalesce(ar.extra_fee, 0)
  from public.children c
  left join public.nursery_settings ns on ns.nursery_id = c.nursery_id
  cross join lateral (select (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date as today) k
  left join public.attendance_records ar on ar.child_id = c.id and ar.attendance_date = k.today
  where c.id = any (p_child_ids)
    and (public.parent_can_access_child(c.id) or public.attendance_staff_can_access_child(c.id))
  order by c.full_name_en;
end;
$$;

revoke execute on function public.get_attendance_day_children(uuid, date) from public, anon;
revoke execute on function public.get_attendance_period_children(uuid, date, date) from public, anon;
revoke execute on function public.get_attendance_period_records(uuid, date, date) from public, anon;
revoke execute on function public.get_attendance_period_log(uuid, date, date, text, integer, date, uuid, integer, integer) from public, anon;
revoke execute on function public.get_children_today(uuid[]) from public, anon;
grant execute on function public.get_attendance_day_children(uuid, date) to authenticated, service_role;
grant execute on function public.get_attendance_period_children(uuid, date, date) to authenticated, service_role;
grant execute on function public.get_attendance_period_records(uuid, date, date) to authenticated, service_role;
grant execute on function public.get_attendance_period_log(uuid, date, date, text, integer, date, uuid, integer, integer) to authenticated, service_role;
grant execute on function public.get_children_today(uuid[]) to authenticated, service_role;

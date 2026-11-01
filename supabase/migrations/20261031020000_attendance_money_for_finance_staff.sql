-- The dashboard's attendance figures show money only to the people allowed to see the nursery's
-- finances (launch blocker SET-01).
--
-- Teachers and managers allowed the attendance dashboard read the late-pickup fees with it: billed,
-- collected and outstanding, the fee of each late child, and the invoices behind them. Who sees the
-- money is now decided by the database, with the same rule as the financial overview:
--
--   money_visible(nursery)   xo; the chain's admin for its nurseries; the branch admin of the nursery;
--                            a manager/teacher of the nursery allowed dashboard_finance:view.
--
-- Each attendance function the dashboard reads keeps its name, arguments and columns, and now
-- passes through a filter that empties the money for anyone else (null, not zero):
--   get_attendance_kpis          today.extra_fee_today; month.extra_fee_billed/_collected/_outstanding;
--                                top_late[].extra_fee; adds money_visible (true/false)
--   get_attendance_period_kpis   extra_fee_billed/_collected/_outstanding; top_late[].extra_fee;
--                                adds money_visible
--   get_attendance_day_children, get_attendance_period_children, get_attendance_period_records,
--   get_attendance_period_log    extra_fee and the invoice columns
-- The figures themselves are computed by the original functions, renamed _attendance_…_all and
-- closed to the app: a later change to the figures goes into those, the public names only filter.

create or replace function public.money_visible(p_nursery_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_nursery uuid;
  v_chain uuid;
begin
  if auth.uid() is null then
    return false;
  end if;
  if public.is_xo_super_admin() then
    return true;
  end if;
  select u.role, u.nursery_id, u.chain_id into v_role, v_nursery, v_chain from public.users u where u.id = auth.uid();
  if v_role = 'chain_super_admin' then
    return v_chain is not null and exists (select 1 from public.nurseries n where n.id = p_nursery_id and n.chain_id = v_chain);
  elsif v_role = 'branch_admin' then
    return v_nursery is not distinct from p_nursery_id;
  elsif v_role in ('manager', 'teacher') then
    return v_nursery is not distinct from p_nursery_id and public.user_can('dashboard_finance', 'view');
  end if;
  return false;
end;
$$;

revoke execute on function public.money_visible(uuid) from public, anon;
grant execute on function public.money_visible(uuid) to authenticated, service_role;

-- top_late rows without their fee, in the same order.
create or replace function public._attendance_top_late_without_fee(p_rows jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select coalesce(jsonb_agg(t.row || jsonb_build_object('extra_fee', null) order by t.n), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) with ordinality as t(row, n)
$$;

revoke execute on function public._attendance_top_late_without_fee(jsonb) from public, anon, authenticated;

-- get_attendance_kpis
alter function public.get_attendance_kpis(uuid, date) rename to _attendance_kpis_all;
revoke execute on function public._attendance_kpis_all(uuid, date) from public, anon, authenticated;

create function public.get_attendance_kpis(p_nursery_id uuid, p_month date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Runs the access check first: only then is the money question asked.
  v_all jsonb := public._attendance_kpis_all(p_nursery_id, p_month);
begin
  if public.money_visible(p_nursery_id) then
    return v_all || jsonb_build_object('money_visible', true);
  end if;
  return v_all || jsonb_build_object(
    'today', coalesce(v_all -> 'today', '{}'::jsonb) || jsonb_build_object('extra_fee_today', null),
    'month', coalesce(v_all -> 'month', '{}'::jsonb)
      || jsonb_build_object('extra_fee_billed', null, 'extra_fee_collected', null, 'extra_fee_outstanding', null),
    'top_late', public._attendance_top_late_without_fee(v_all -> 'top_late'),
    'money_visible', false
  );
end;
$$;

revoke execute on function public.get_attendance_kpis(uuid, date) from public, anon;
grant execute on function public.get_attendance_kpis(uuid, date) to authenticated, service_role;

-- get_attendance_period_kpis
alter function public.get_attendance_period_kpis(uuid, date, date) rename to _attendance_period_kpis_all;
revoke execute on function public._attendance_period_kpis_all(uuid, date, date) from public, anon, authenticated;

create function public.get_attendance_period_kpis(p_nursery_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_all jsonb := public._attendance_period_kpis_all(p_nursery_id, p_from, p_to);
begin
  if public.money_visible(p_nursery_id) then
    return v_all || jsonb_build_object('money_visible', true);
  end if;
  return v_all || jsonb_build_object(
    'extra_fee_billed', null,
    'extra_fee_collected', null,
    'extra_fee_outstanding', null,
    'top_late', public._attendance_top_late_without_fee(v_all -> 'top_late'),
    'money_visible', false
  );
end;
$$;

revoke execute on function public.get_attendance_period_kpis(uuid, date, date) from public, anon;
grant execute on function public.get_attendance_period_kpis(uuid, date, date) to authenticated, service_role;

-- get_attendance_day_children: extra_fee, invoice_status hidden.
alter function public.get_attendance_day_children(uuid, date) rename to _attendance_day_children_all;
revoke execute on function public._attendance_day_children_all(uuid, date) from public, anon, authenticated;

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
  day_status text,
  check_in timestamp with time zone,
  check_out timestamp with time zone,
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
  pickup_due_at timestamp with time zone,
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
  absence_reported_at timestamp with time zone,
  needs_review boolean,
  review_reason text
)
language sql
security definer
set search_path = public
as $$
  select
    r.child_id,
    r.full_name_ar,
    r.full_name_en,
    r.child_code,
    r.class_id,
    r.class_name_ar,
    r.class_name_en,
    r.parent_name_ar,
    r.parent_name_en,
    r.parent_phone,
    r.father_name_ar,
    r.father_name_en,
    r.parents_text,
    r.day_status,
    r.check_in,
    r.check_out,
    r.check_in_method,
    r.check_out_method,
    r.dropoff_name_ar,
    r.dropoff_name_en,
    r.dropoff_relationship,
    r.pickup_person_name,
    r.pickup_relationship,
    r.checked_in_by_ar,
    r.checked_in_by_en,
    r.checked_out_by_ar,
    r.checked_out_by_en,
    r.pickup_due_at,
    r.late_now,
    r.late_minutes,
    r.extra_hours,
    r.extra_hours_covered,
    r.extra_hours_billed,
    case when m.visible then r.extra_fee end,
    case when m.visible then r.invoice_status end,
    r.absence_reason,
    r.absence_note,
    r.absence_reported_by_ar,
    r.absence_reported_by_en,
    r.absence_reported_at,
    r.needs_review,
    r.review_reason
  from public._attendance_day_children_all(p_nursery_id, p_day) r
  cross join (select public.money_visible(p_nursery_id) as visible) m
$$;

revoke execute on function public.get_attendance_day_children(uuid, date) from public, anon;
grant execute on function public.get_attendance_day_children(uuid, date) to authenticated, service_role;

-- get_attendance_period_children: extra_fee hidden.
alter function public.get_attendance_period_children(uuid, date, date) rename to _attendance_period_children_all;
revoke execute on function public._attendance_period_children_all(uuid, date, date) from public, anon, authenticated;

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
language sql
security definer
set search_path = public
as $$
  select
    r.child_id,
    r.full_name_ar,
    r.full_name_en,
    r.child_code,
    r.class_id,
    r.class_name_ar,
    r.class_name_en,
    r.father_name_ar,
    r.father_name_en,
    r.parents_text,
    r.expected_days,
    r.present_days,
    r.excused_days,
    r.absent_days,
    r.attendance_rate,
    r.late_days,
    r.extra_hours,
    case when m.visible then r.extra_fee end
  from public._attendance_period_children_all(p_nursery_id, p_from, p_to) r
  cross join (select public.money_visible(p_nursery_id) as visible) m
$$;

revoke execute on function public.get_attendance_period_children(uuid, date, date) from public, anon;
grant execute on function public.get_attendance_period_children(uuid, date, date) to authenticated, service_role;

-- get_attendance_period_log: extra_fee, invoice_status hidden.
alter function public.get_attendance_period_log(uuid, date, date, text, integer, date, uuid, integer, integer) rename to _attendance_period_log_all;
revoke execute on function public._attendance_period_log_all(uuid, date, date, text, integer, date, uuid, integer, integer) from public, anon, authenticated;

create function public.get_attendance_period_log(p_nursery_id uuid, p_from date, p_to date, p_search text default NULL::text, p_weekday integer default NULL::integer, p_day date default NULL::date, p_class_id uuid default NULL::uuid, p_limit integer default 50, p_offset integer default 0)
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
  check_in timestamp with time zone,
  check_out timestamp with time zone,
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
  total_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    r.attendance_id,
    r.child_id,
    r.full_name_ar,
    r.full_name_en,
    r.child_code,
    r.class_id,
    r.class_name_ar,
    r.class_name_en,
    r.father_name_ar,
    r.father_name_en,
    r.attendance_date,
    r.check_in,
    r.check_out,
    r.check_in_method,
    r.check_out_method,
    r.dropoff_name_ar,
    r.dropoff_name_en,
    r.dropoff_relationship,
    r.pickup_person_name,
    r.pickup_relationship,
    r.checked_in_by_ar,
    r.checked_in_by_en,
    r.checked_out_by_ar,
    r.checked_out_by_en,
    r.late_minutes,
    r.extra_hours,
    r.extra_hours_covered,
    case when m.visible then r.extra_fee end,
    case when m.visible then r.invoice_status end,
    r.needs_review,
    r.total_count
  from public._attendance_period_log_all(p_nursery_id, p_from, p_to, p_search, p_weekday, p_day, p_class_id, p_limit, p_offset) r
  cross join (select public.money_visible(p_nursery_id) as visible) m
$$;

revoke execute on function public.get_attendance_period_log(uuid, date, date, text, integer, date, uuid, integer, integer) from public, anon;
grant execute on function public.get_attendance_period_log(uuid, date, date, text, integer, date, uuid, integer, integer) to authenticated, service_role;

-- get_attendance_period_records: extra_fee, invoice_id, invoice_number, invoice_status, invoice_due_date, invoice_paid_at hidden.
alter function public.get_attendance_period_records(uuid, date, date) rename to _attendance_period_records_all;
revoke execute on function public._attendance_period_records_all(uuid, date, date) from public, anon, authenticated;

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
  check_in timestamp with time zone,
  check_out timestamp with time zone,
  check_out_method text,
  pickup_person_name text,
  pickup_relationship text,
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
  invoice_paid_at timestamp with time zone,
  needs_review boolean,
  review_reason text
)
language sql
security definer
set search_path = public
as $$
  select
    r.attendance_id,
    r.child_id,
    r.full_name_ar,
    r.full_name_en,
    r.child_code,
    r.class_id,
    r.class_name_ar,
    r.class_name_en,
    r.father_name_ar,
    r.father_name_en,
    r.parents_text,
    r.attendance_date,
    r.check_in,
    r.check_out,
    r.check_out_method,
    r.pickup_person_name,
    r.pickup_relationship,
    r.is_late,
    r.late_minutes,
    r.extra_hours,
    r.extra_hours_covered,
    r.extra_hours_billed,
    case when m.visible then r.extra_fee end,
    r.late_charge_waived,
    case when m.visible then r.invoice_id end,
    case when m.visible then r.invoice_number end,
    case when m.visible then r.invoice_status end,
    case when m.visible then r.invoice_due_date end,
    case when m.visible then r.invoice_paid_at end,
    r.needs_review,
    r.review_reason
  from public._attendance_period_records_all(p_nursery_id, p_from, p_to) r
  cross join (select public.money_visible(p_nursery_id) as visible) m
$$;

revoke execute on function public.get_attendance_period_records(uuid, date, date) from public, anon;
grant execute on function public.get_attendance_period_records(uuid, date, date) to authenticated, service_role;

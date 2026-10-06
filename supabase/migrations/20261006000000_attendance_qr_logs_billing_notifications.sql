-- Attendance by QR, end to end: who scanned, per-scan audit log, configurable extra-hours
-- billing, parent notifications from the server, absence reporting, and one consistent
-- source for attendance statistics.
--
-- What this fixes / adds (see the attendance flow review of 2026-10-06):
--   * Staff had NO select policy on attendance_records (dropped by an emergency migration and
--     never restored), so teachers/admins could not read attendance. Restored as SELECT-only:
--     every write now goes through the audited SECURITY DEFINER functions below.
--   * Internal billing/cron functions were executable by anon/authenticated (Supabase grants
--     EXECUTE on new functions by default; revoking from PUBLIC alone does not remove that).
--   * check-in/check-out are atomic server functions that record the scanning staff member,
--     the method (parent QR / custom QR / manual) and the QR used, write an audit event, and
--     notify parents — instead of client-side inserts that were lost if the device dropped.
--   * A custom (one-time) QR is consumed when the pickup is confirmed, not when it is scanned.
--   * Extra-hours billing reads its policy from nursery_settings (rounding unit, grace handling,
--     sweep cap, optional early-arrival billing, daily or monthly invoice) and can be corrected
--     or waived by an admin, releasing package hours and reducing the invoice.
--   * Pickup reminders before closing time, a nightly "missing checkout" review flag, parent
--     absence reports, and get_attendance_days / get_attendance_kpis for every dashboard.

begin;

-- =============================================================================
-- 1. Settings
-- =============================================================================

alter table public.nursery_settings
  add column if not exists require_qr_for_attendance boolean not null default false,
  add column if not exists late_billing_unit_minutes integer not null default 60,
  add column if not exists late_billing_from text not null default 'end_time',
  add column if not exists late_sweep_cap_hours integer not null default 3,
  add column if not exists early_arrival_billing_enabled boolean not null default false,
  add column if not exists late_invoice_mode text not null default 'daily',
  add column if not exists pickup_reminder_minutes_before integer not null default 15,
  add column if not exists min_minutes_between_scans integer not null default 5;

do $$
begin
  alter table public.nursery_settings
    add constraint nursery_settings_late_billing_unit_ck check (late_billing_unit_minutes in (15, 30, 60)),
    add constraint nursery_settings_late_billing_from_ck check (late_billing_from in ('end_time', 'grace_end')),
    add constraint nursery_settings_late_sweep_cap_ck check (late_sweep_cap_hours between 1 and 12),
    add constraint nursery_settings_late_invoice_mode_ck check (late_invoice_mode in ('daily', 'monthly')),
    add constraint nursery_settings_pickup_reminder_ck check (pickup_reminder_minutes_before between 0 and 180),
    add constraint nursery_settings_min_scan_gap_ck check (min_minutes_between_scans between 0 and 120);
exception when duplicate_object then null;
end $$;

-- =============================================================================
-- 2. attendance_records: who / how / billing breakdown / review
-- =============================================================================

alter table public.attendance_records
  add column if not exists check_in_by uuid references public.users (id) on delete set null,
  add column if not exists check_out_by uuid references public.users (id) on delete set null,
  add column if not exists check_in_method text,
  add column if not exists check_out_method text,
  add column if not exists check_in_qr_token_id uuid references public.qr_tokens (id) on delete set null,
  add column if not exists check_out_qr_token_id uuid references public.qr_tokens (id) on delete set null,
  add column if not exists pickup_person_name text,
  add column if not exists pickup_relationship text,
  add column if not exists early_minutes integer not null default 0,
  add column if not exists late_minutes integer not null default 0,
  add column if not exists extra_hours_covered numeric(10, 2) not null default 0,
  add column if not exists extra_hours_billed numeric(10, 2) not null default 0,
  add column if not exists late_fee_rate numeric(10, 2),
  add column if not exists late_charge_waived boolean not null default false,
  add column if not exists pickup_reminder_sent_at timestamptz,
  add column if not exists needs_review boolean not null default false,
  add column if not exists review_reason text;

do $$
begin
  alter table public.attendance_records
    add constraint attendance_records_check_in_method_ck
      check (check_in_method is null or check_in_method in ('qr_parent', 'qr_custom', 'manual')),
    add constraint attendance_records_check_out_method_ck
      check (check_out_method is null or check_out_method in ('qr_parent', 'qr_custom', 'manual'));
exception when duplicate_object then null;
end $$;

alter table public.attendance_records drop constraint if exists attendance_records_late_charge_source_check;
alter table public.attendance_records
  add constraint attendance_records_late_charge_source_check
  check (late_charge_source is null or late_charge_source in ('sweep', 'checkout', 'correction'));

create index if not exists idx_attendance_records_check_in_by on public.attendance_records (check_in_by);
create index if not exists idx_attendance_records_check_out_by on public.attendance_records (check_out_by);
create index if not exists idx_attendance_records_needs_review on public.attendance_records (attendance_date) where needs_review;

-- Backfill what older rows only carried inside qr_scan_log.
update public.attendance_records ar
   set pickup_person_name = coalesce(ar.pickup_person_name, nullif(ar.qr_scan_log ->> 'pickup_person_name', '')),
       pickup_relationship = coalesce(ar.pickup_relationship, nullif(ar.qr_scan_log ->> 'pickup_relationship', '')),
       check_out_by = coalesce(
         ar.check_out_by,
         (select u.id from public.users u
           where (ar.qr_scan_log -> 'identity_verified' ->> 'verified_by') ~* '^[0-9a-f-]{36}$'
             and u.id = (ar.qr_scan_log -> 'identity_verified' ->> 'verified_by')::uuid)
       ),
       extra_fee = coalesce(
         ar.extra_fee,
         case when (ar.qr_scan_log ->> 'extra_fee') ~ '^[0-9]+(\.[0-9]+)?$' then (ar.qr_scan_log ->> 'extra_fee')::numeric end
       )
 where ar.qr_scan_log is not null;

-- Split older charged hours into package-covered vs billed, using the fee actually charged.
update public.attendance_records ar
   set late_fee_rate = coalesce(ar.late_fee_rate, ns.late_pickup_fee_per_hour),
       extra_hours_billed = case
         when coalesce(ns.late_pickup_fee_per_hour, 0) > 0
           then least(ar.extra_hours, round(coalesce(ar.extra_fee, 0) / ns.late_pickup_fee_per_hour, 2))
         else 0 end,
       extra_hours_covered = ar.extra_hours - case
         when coalesce(ns.late_pickup_fee_per_hour, 0) > 0
           then least(ar.extra_hours, round(coalesce(ar.extra_fee, 0) / ns.late_pickup_fee_per_hour, 2))
         else 0 end
  from public.children c
  join public.nursery_settings ns on ns.nursery_id = c.nursery_id
 where c.id = ar.child_id
   and coalesce(ar.extra_hours, 0) > 0
   and ar.extra_hours_billed = 0
   and ar.extra_hours_covered = 0;

-- Staff of the child's nursery (or its chain / XO). Not rls_staff_can_access_child: that one is
-- STABLE yet runs SET LOCAL, so it raises "SET is not allowed in a non-volatile function" on
-- every call. Teachers see the whole nursery here because any of them may scan any child at the gate.
create or replace function public.attendance_staff_can_access_child(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    join public.children c on c.id = p_child_id
    left join public.nurseries cn on cn.id = c.nursery_id
    where u.id = auth.uid()
      and (
        u.role = 'xo_super_admin'
        or (u.role = 'chain_super_admin' and cn.chain_id is not null and cn.chain_id = u.chain_id)
        or (u.role in ('branch_admin', 'manager', 'teacher') and u.nursery_id = c.nursery_id)
      )
  )
$$;

-- Staff read attendance for the children they may see; writes only via the functions below.
drop policy if exists attendance_staff_all on public.attendance_records;
drop policy if exists attendance_staff_select on public.attendance_records;
create policy attendance_staff_select
  on public.attendance_records
  for select to authenticated
  using (public.attendance_staff_can_access_child(child_id));

-- =============================================================================
-- 3. Audit log of every attendance event
-- =============================================================================

create table if not exists public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  nursery_id uuid not null references public.nurseries (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  attendance_id uuid references public.attendance_records (id) on delete set null,
  event_type text not null check (event_type in (
    'check_in', 'check_out', 'check_in_undone', 'scan_rejected', 'late_charge',
    'charge_reduced', 'charge_waived', 'correction', 'review_flagged', 'review_resolved',
    'absence_reported'
  )),
  occurred_at timestamptz not null default now(),
  actor_id uuid references public.users (id) on delete set null,
  method text,
  qr_token_id uuid references public.qr_tokens (id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_attendance_events_nursery_time on public.attendance_events (nursery_id, occurred_at desc);
create index if not exists idx_attendance_events_child_time on public.attendance_events (child_id, occurred_at desc);
create index if not exists idx_attendance_events_attendance on public.attendance_events (attendance_id);

alter table public.attendance_events enable row level security;

drop policy if exists attendance_events_staff_select on public.attendance_events;
create policy attendance_events_staff_select
  on public.attendance_events
  for select to authenticated
  using (public.attendance_staff_can_access_child(child_id));

drop policy if exists attendance_events_parent_select on public.attendance_events;
create policy attendance_events_parent_select
  on public.attendance_events
  for select to authenticated
  using (public.parent_can_access_child(child_id));

-- =============================================================================
-- 4. Parent absence reports (excused absences)
-- =============================================================================

create table if not exists public.attendance_absence_reports (
  id uuid primary key default gen_random_uuid(),
  nursery_id uuid not null references public.nurseries (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  absence_date date not null,
  reason text not null check (reason in ('sick', 'travel', 'family', 'other')),
  note text check (note is null or char_length(note) <= 500),
  reported_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint attendance_absence_reports_child_day_uniq unique (child_id, absence_date)
);

create index if not exists idx_attendance_absence_reports_nursery_date
  on public.attendance_absence_reports (nursery_id, absence_date);

alter table public.attendance_absence_reports enable row level security;

drop policy if exists absence_reports_select on public.attendance_absence_reports;
create policy absence_reports_select
  on public.attendance_absence_reports
  for select to authenticated
  using (public.parent_can_access_child(child_id) or public.attendance_staff_can_access_child(child_id));

drop policy if exists absence_reports_insert on public.attendance_absence_reports;
create policy absence_reports_insert
  on public.attendance_absence_reports
  for insert to authenticated
  with check (public.parent_can_access_child(child_id) or public.attendance_staff_can_access_child(child_id));

drop policy if exists absence_reports_delete on public.attendance_absence_reports;
create policy absence_reports_delete
  on public.attendance_absence_reports
  for delete to authenticated
  using (
    (public.parent_can_access_child(child_id) and reported_by = auth.uid() and absence_date >= current_date)
    or public.attendance_staff_can_access_child(child_id)
  );

-- =============================================================================
-- 5. Small helpers (internal)
-- =============================================================================

create or replace function public.attendance_fmt_time(p_ts timestamptz, p_tz text, p_lang text)
returns text
language sql
stable
as $$
  select to_char(p_ts at time zone coalesce(p_tz, 'Africa/Cairo'), 'FMHH12:MI') || ' ' ||
    case when extract(hour from p_ts at time zone coalesce(p_tz, 'Africa/Cairo')) < 12
      then case when p_lang = 'ar' then 'ص' else 'AM' end
      else case when p_lang = 'ar' then 'م' else 'PM' end
    end
$$;

create or replace function public.attendance_fmt_clock(p_time time, p_lang text)
returns text
language sql
immutable
as $$
  select to_char(p_time, 'FMHH12:MI') || ' ' ||
    case when extract(hour from p_time) < 12
      then case when p_lang = 'ar' then 'ص' else 'AM' end
      else case when p_lang = 'ar' then 'م' else 'PM' end
    end
$$;

create or replace function public.attendance_fmt_money(p_amount numeric, p_currency text, p_lang text)
returns text
language sql
immutable
as $$
  select to_char(coalesce(p_amount, 0), 'FM999999990.00') || ' ' ||
    case when p_lang = 'ar' and coalesce(p_currency, 'EGP') = 'EGP' then 'جنيه' else coalesce(p_currency, 'EGP') end
$$;

create or replace function public.attendance_fmt_hours(p_hours numeric)
returns text
language sql
immutable
as $$
  select rtrim(rtrim(to_char(coalesce(p_hours, 0), 'FM999990.00'), '0'), '.')
$$;

create or replace function public.attendance_child_name(p_child public.children, p_lang text)
returns text
language sql
immutable
as $$
  select case when p_lang = 'ar'
    then coalesce(nullif(trim(p_child.full_name_ar), ''), p_child.full_name_en)
    else coalesce(nullif(trim(p_child.full_name_en), ''), p_child.full_name_ar)
  end
$$;

create or replace function public.attendance_user_name(p_user_id uuid, p_lang text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when p_lang = 'ar'
    then coalesce(nullif(trim(u.name_ar), ''), nullif(trim(u.name_en), ''))
    else coalesce(nullif(trim(u.name_en), ''), nullif(trim(u.name_ar), ''))
  end
  from public.users u where u.id = p_user_id
$$;

-- Is p_day an attendance day for the nursery: one of its working days and not a holiday.
-- nurseries.working_days holds weekday numbers (0 = Sunday, as text or numbers) or names
-- ('sun' / 'sunday'); with none configured, Sunday–Thursday.
create or replace function public.attendance_is_holiday(p_nursery_id uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.academic_calendars ac
    cross join lateral jsonb_array_elements(
      case jsonb_typeof(ac.holidays_json)
        when 'array' then ac.holidays_json
        when 'object' then coalesce(ac.holidays_json -> 'holidays', ac.holidays_json -> 'dates', '[]'::jsonb)
        else '[]'::jsonb
      end
    ) h
    where ac.nursery_id = p_nursery_id
      and ac.year = extract(year from p_day)::integer
      and (
        (jsonb_typeof(h) = 'string' and left(h #>> '{}', 10) = p_day::text)
        or (
          jsonb_typeof(h) = 'object'
          and (
            left(h ->> 'date', 10) = p_day::text
            or (
              left(coalesce(h ->> 'from', h ->> 'start'), 10) <= p_day::text
              and left(coalesce(h ->> 'to', h ->> 'end', h ->> 'from', h ->> 'start'), 10) >= p_day::text
            )
          )
        )
      )
  )
$$;

create or replace function public.attendance_is_school_day(p_nursery_id uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when jsonb_typeof(n.working_days) = 'array' and jsonb_array_length(n.working_days) > 0 then
        exists (
          select 1 from jsonb_array_elements_text(n.working_days) w(v)
          where lower(trim(w.v)) in (
            extract(dow from p_day)::integer::text,
            (array['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])[extract(dow from p_day)::integer + 1],
            (array['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'])[extract(dow from p_day)::integer + 1]
          )
        )
      else extract(dow from p_day)::integer in (0, 1, 2, 3, 4)
    end
    from public.nurseries n where n.id = p_nursery_id
  ), false)
  and not public.attendance_is_holiday(p_nursery_id, p_day)
$$;

create or replace function public.attendance_log_event(
  p_attendance_id uuid,
  p_child_id uuid,
  p_event_type text,
  p_method text default null,
  p_qr_token_id uuid default null,
  p_details jsonb default '{}'::jsonb,
  p_actor_id uuid default auth.uid()
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.attendance_events (nursery_id, child_id, attendance_id, event_type, actor_id, method, qr_token_id, details)
  select c.nursery_id, c.id, p_attendance_id, p_event_type, p_actor_id, p_method, p_qr_token_id, coalesce(p_details, '{}'::jsonb)
  from public.children c where c.id = p_child_id
$$;

create or replace function public.attendance_notify_parents(
  p_child_id uuid,
  p_type text,
  p_title_ar text,
  p_title_en text,
  p_body_ar text,
  p_body_en text,
  p_action_link text default '/parent/attendance',
  p_urgency text default 'normal',
  p_image_url text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.notifications (
    nursery_id, user_id, type, title_ar, title_en, body_ar, body_en, read, channel, sent_at, action_link, urgency, image_url
  )
  select c.nursery_id, pc.parent_id, p_type, p_title_ar, p_title_en, p_body_ar, p_body_en, false, 'in_app', now(),
         p_action_link, p_urgency, p_image_url
  from public.parent_children pc
  join public.children c on c.id = pc.child_id
  where pc.child_id = p_child_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.attendance_notify_staff(
  p_nursery_id uuid,
  p_roles public.user_role[],
  p_type text,
  p_title_ar text,
  p_title_en text,
  p_body_ar text,
  p_body_en text,
  p_action_link text default '/admin/attendance',
  p_urgency text default 'normal'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.notifications (
    nursery_id, user_id, type, title_ar, title_en, body_ar, body_en, read, channel, sent_at, action_link, urgency
  )
  select p_nursery_id, u.id, p_type, p_title_ar, p_title_en, p_body_ar, p_body_en, false, 'in_app', now(),
         p_action_link, p_urgency
  from public.users u
  where u.nursery_id = p_nursery_id and u.role = any (p_roles);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Caller's role when they are staff of p_nursery_id; raises otherwise.
create or replace function public.attendance_require_staff(p_nursery_id uuid, p_admin_only boolean default false)
returns public.user_role
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_nursery uuid;
begin
  if auth.uid() is null then
    raise exception 'attendance_not_authenticated' using errcode = '28000';
  end if;

  select u.role, u.nursery_id into v_role, v_nursery from public.users u where u.id = auth.uid();

  if v_role = 'xo_super_admin' then
    return v_role;
  end if;
  if v_role = 'chain_super_admin' and exists (
    select 1 from public.nurseries n
    join public.users u on u.id = auth.uid()
    where n.id = p_nursery_id and n.chain_id is not null and n.chain_id = u.chain_id
  ) then
    return v_role;
  end if;
  if v_nursery is not distinct from p_nursery_id
     and (v_role in ('branch_admin', 'manager') or (v_role = 'teacher' and not p_admin_only)) then
    return v_role;
  end if;

  if p_admin_only and v_role = 'teacher' then
    raise exception 'attendance_admin_only' using errcode = '42501';
  end if;
  raise exception 'attendance_forbidden' using errcode = '42501';
end;
$$;

-- Validates a scanned QR for this child and purpose; locks and returns it.
create or replace function public.attendance_check_qr(p_qr_token_id uuid, p_child_id uuid, p_purpose text)
returns public.qr_tokens
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tok public.qr_tokens%rowtype;
begin
  if p_qr_token_id is null then
    raise exception 'attendance_qr_invalid' using errcode = 'P0001';
  end if;
  select * into v_tok from public.qr_tokens where id = p_qr_token_id for update;
  if not found then
    raise exception 'attendance_qr_invalid' using errcode = 'P0001';
  end if;
  if v_tok.child_id <> p_child_id then
    raise exception 'attendance_qr_wrong_child' using errcode = 'P0001';
  end if;
  if v_tok.expires_at <= now() then
    raise exception 'attendance_qr_expired' using errcode = 'P0001';
  end if;
  if coalesce(v_tok.purpose, 'parent') <> p_purpose then
    raise exception 'attendance_qr_wrong_type' using errcode = 'P0001';
  end if;
  if v_tok.single_use and v_tok.consumed_at is not null then
    raise exception 'attendance_qr_used' using errcode = 'P0001';
  end if;
  return v_tok;
end;
$$;

-- =============================================================================
-- 6. Extra-hours math (one place)
-- =============================================================================

-- Late minutes past closing and the billable extra hours for an attendance day as of
-- p_as_of, applying the nursery's grace, rounding unit and (optional) early-arrival billing.
create or replace function public.attendance_compute_extra_time(
  p_att public.attendance_records,
  p_ns public.nursery_settings,
  p_as_of timestamptz
)
returns table (late_minutes integer, is_late boolean, target_hours numeric)
language plpgsql
stable
set search_path = public
as $$
declare
  v_tz text := coalesce(p_ns.timezone, 'Africa/Cairo');
  v_grace integer := greatest(coalesce(p_ns.late_pickup_grace_minutes, 0), 0);
  v_unit integer := case when p_ns.late_billing_unit_minutes in (15, 30, 60) then p_ns.late_billing_unit_minutes else 60 end;
  v_from_grace boolean := coalesce(p_ns.late_billing_from, 'end_time') = 'grace_end';
  v_late integer := 0;
  v_billable integer := 0;
  v_early integer := 0;
begin
  if p_ns.standard_end_time is not null and p_as_of is not null then
    v_late := greatest(0, floor(extract(epoch from (
      p_as_of - ((p_att.attendance_date::text || ' ' || p_ns.standard_end_time::text)::timestamp at time zone v_tz)
    )) / 60)::integer);
  end if;

  if v_late > v_grace then
    v_billable := case when v_from_grace then v_late - v_grace else v_late end;
  end if;

  if coalesce(p_ns.early_arrival_billing_enabled, false) and coalesce(p_att.early_minutes, 0) > v_grace then
    v_early := case when v_from_grace then p_att.early_minutes - v_grace else p_att.early_minutes end;
  end if;

  late_minutes := v_late;
  is_late := v_late > v_grace;
  target_hours := case
    when v_billable + v_early > 0 then ceil((v_billable + v_early)::numeric / v_unit) * v_unit / 60.0
    else 0
  end;
  return next;
end;
$$;

-- Adds (or with negative values, removes) a per-day line on an extra-hours invoice, merging
-- with an existing line for the same day and rate so repeated sweeps do not pile up lines.
create or replace function public.attendance_merge_late_item(
  p_items jsonb,
  p_date date,
  p_hours numeric,
  p_rate numeric,
  p_fee numeric
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_item jsonb;
  v_merged boolean := false;
begin
  for v_item in
    select value from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end)
  loop
    if not v_merged
       and v_item ->> 'attendance_date' = p_date::text
       and (v_item ->> 'unitPrice') ~ '^-?[0-9]+(\.[0-9]+)?$'
       and (v_item ->> 'unitPrice')::numeric = p_rate then
      v_item := v_item || jsonb_build_object(
        'quantity', round(coalesce((v_item ->> 'quantity')::numeric, 0) + p_hours, 2),
        'total', round(coalesce((v_item ->> 'total')::numeric, 0) + p_fee, 2)
      );
      v_merged := true;
      continue when (v_item ->> 'quantity')::numeric = 0 and (v_item ->> 'total')::numeric = 0;
    end if;
    v_out := v_out || jsonb_build_array(v_item);
  end loop;

  if not v_merged and (p_hours <> 0 or p_fee <> 0) then
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'description', 'Late pickup extra hours ' || to_char(p_date, 'DD/MM/YYYY'),
      'description_ar', 'ساعات إضافية لتأخر الاستلام ' || to_char(p_date, 'DD/MM/YYYY'),
      'attendance_date', p_date,
      'quantity', round(p_hours, 2),
      'unitPrice', p_rate,
      'unit_price', p_rate,
      'total', round(p_fee, 2)
    ));
  end if;
  return v_out;
end;
$$;

-- Puts an extra-hours charge on the right invoice: the day's open invoice (daily mode) or the
-- child's open invoice for the month (monthly mode); otherwise a new one. Amounts only ever
-- add up, so a charge split across a paid and a new invoice is never billed twice.
create or replace function public.attendance_add_late_fee_to_invoice(
  p_att public.attendance_records,
  p_child public.children,
  p_ns public.nursery_settings,
  p_hours numeric,
  p_rate numeric,
  p_fee numeric,
  p_source text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text := coalesce(p_ns.late_invoice_mode, 'daily');
  v_month text := to_char(p_att.attendance_date, 'YYYY-MM');
  v_parent uuid;
  v_invoice public.invoices%rowtype;
  v_invoice_id uuid;
begin
  select pc.parent_id into v_parent
  from public.parent_children pc
  where pc.child_id = p_child.id
  order by pc.created_at
  limit 1;
  if v_parent is null then
    return p_att.late_charge_invoice_id;
  end if;

  if v_mode = 'monthly' then
    select * into v_invoice
    from public.invoices i
    where i.nursery_id = p_child.nursery_id
      and i.parent_id = v_parent
      and i.invoice_type = 'extra_hours'
      and i.status = 'pending'
      and i.line_items_json ->> 'child_id' = p_child.id::text
      and i.line_items_json ->> 'billing_month' = v_month
    order by i.created_at desc
    limit 1
    for update;
  elsif p_att.late_charge_invoice_id is not null then
    select * into v_invoice
    from public.invoices i
    where i.id = p_att.late_charge_invoice_id and i.status = 'pending'
    for update;
  end if;

  if v_invoice.id is not null then
    update public.invoices
       set amount = amount + p_fee,
           line_items_json = jsonb_set(
             case when jsonb_typeof(line_items_json) = 'object' then line_items_json else '{}'::jsonb end,
             '{items}',
             public.attendance_merge_late_item(line_items_json -> 'items', p_att.attendance_date, p_hours, p_rate, p_fee)
           ),
           updated_at = now()
     where id = v_invoice.id;
    return v_invoice.id;
  end if;

  insert into public.invoices (nursery_id, parent_id, amount, due_date, status, invoice_type, line_items_json)
  values (
    p_child.nursery_id,
    v_parent,
    p_fee,
    case
      when v_mode = 'monthly'
        then greatest((date_trunc('month', p_att.attendance_date) + interval '1 month')::date, current_date)
             + coalesce(p_ns.invoice_due_days, 7)
      else current_date + coalesce(p_ns.invoice_due_days, 7)
    end,
    'pending',
    'extra_hours',
    jsonb_build_object(
      'child_id', p_child.id,
      'attendance_date', case when v_mode = 'daily' then p_att.attendance_date end,
      'billing_month', case when v_mode = 'monthly' then v_month end,
      'late_charge_source', p_source,
      'items', public.attendance_merge_late_item('[]'::jsonb, p_att.attendance_date, p_hours, p_rate, p_fee)
    )
  )
  returning id into v_invoice_id;
  return v_invoice_id;
end;
$$;

-- =============================================================================
-- 7. Late charge: apply (increase) — shared by sweep, checkout and corrections
-- =============================================================================

-- Idempotent: extra_hours/extra_fee on the attendance row are the cumulative amounts already
-- applied for that day; each call only consumes package hours / bills the delta.
create or replace function public.apply_attendance_late_charge(
  p_attendance_id uuid,
  p_as_of timestamptz,
  p_source text,
  p_finalize boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att public.attendance_records%rowtype;
  v_child public.children%rowtype;
  v_ns public.nursery_settings%rowtype;
  v_calc record;
  v_target numeric;
  v_previous numeric;
  v_delta numeric := 0;
  v_covered numeric := 0;
  v_chargeable numeric := 0;
  v_rate numeric;
  v_fee numeric := 0;
  v_invoice_id uuid;
  v_cap integer;
  v_newly_capped boolean := false;
  v_total_hours numeric;
  v_total_fee numeric;
  v_total_covered numeric;
begin
  if p_source not in ('sweep', 'checkout', 'correction') then
    raise exception 'Invalid late-charge source' using errcode = '22023';
  end if;

  select * into v_att from public.attendance_records where id = p_attendance_id for update;
  if not found then
    raise exception 'attendance_not_found' using errcode = 'P0002';
  end if;

  if v_att.late_charge_waived then
    if p_finalize then
      update public.attendance_records set late_charge_status = 'final' where id = p_attendance_id;
    end if;
    return jsonb_build_object('skipped', true, 'reason', 'waived', 'extra_hours', 0, 'extra_fee', 0);
  end if;
  if v_att.late_charge_status = 'final' and not p_finalize then
    return jsonb_build_object('skipped', true, 'reason', 'already_final');
  end if;
  if p_source = 'sweep' and v_att.check_out is not null then
    return jsonb_build_object('skipped', true, 'reason', 'already_checked_out');
  end if;

  select * into v_child from public.children where id = v_att.child_id;
  if not found then
    return jsonb_build_object('skipped', true, 'reason', 'child_not_found');
  end if;
  select * into v_ns from public.nursery_settings where nursery_id = v_child.nursery_id;

  select * into v_calc from public.attendance_compute_extra_time(v_att, v_ns, p_as_of);
  v_target := v_calc.target_hours;
  v_rate := coalesce(v_ns.late_pickup_fee_per_hour, 0);

  -- The unattended sweep stops at the cap and alerts staff; a confirmed checkout bills in full.
  if p_source = 'sweep' then
    v_cap := coalesce(v_ns.late_sweep_cap_hours, 3);
    if v_target > v_cap then
      v_target := v_cap;
      v_newly_capped := not v_att.late_charge_capped;
    end if;
  end if;

  v_previous := coalesce(v_att.extra_hours, 0);
  v_delta := greatest(v_target - v_previous, 0);

  if v_delta > 0 then
    v_covered := coalesce(public.package_apply_extra_hours(v_att.child_id, v_delta, true), 0);
    v_chargeable := greatest(v_delta - v_covered, 0);
    v_fee := round(v_chargeable * v_rate, 2);
  end if;

  v_invoice_id := v_att.late_charge_invoice_id;
  if v_fee > 0 then
    v_invoice_id := public.attendance_add_late_fee_to_invoice(v_att, v_child, v_ns, v_chargeable, v_rate, v_fee, p_source);
  end if;

  v_total_hours := v_previous + v_delta;
  v_total_fee := coalesce(v_att.extra_fee, 0) + v_fee;
  v_total_covered := coalesce(v_att.extra_hours_covered, 0) + v_covered;

  update public.attendance_records
     set extra_hours = v_total_hours,
         extra_fee = v_total_fee,
         extra_hours_covered = v_total_covered,
         extra_hours_billed = coalesce(extra_hours_billed, 0) + v_chargeable,
         late_fee_rate = case when v_delta > 0 or late_fee_rate is null then v_rate else late_fee_rate end,
         late_minutes = v_calc.late_minutes,
         late_charge_status = case when p_finalize then 'final' else 'provisional' end,
         late_charge_source = p_source,
         late_charge_applied_at = now(),
         late_charge_invoice_id = coalesce(v_invoice_id, late_charge_invoice_id),
         late_charge_capped = late_charge_capped or v_newly_capped
   where id = p_attendance_id;

  if v_delta > 0 then
    perform public.attendance_log_event(
      p_attendance_id, v_att.child_id, 'late_charge', null, null,
      jsonb_build_object(
        'source', p_source, 'late_minutes', v_calc.late_minutes, 'added_hours', v_delta,
        'covered_hours', v_covered, 'billed_hours', v_chargeable, 'rate', v_rate, 'fee', v_fee,
        'total_hours', v_total_hours, 'total_fee', v_total_fee, 'invoice_id', v_invoice_id
      ),
      null
    );
  end if;

  -- While the child is still here, tell the parents each time more extra time is charged.
  -- (A real checkout reports the final amount in its own pickup notification.)
  if p_source = 'sweep' and v_delta > 0 then
    perform public.attendance_notify_parents(
      v_child.id,
      'extra_hours_accruing',
      'بدأ احتساب ساعات إضافية',
      'Extra hours being charged',
      'لم يتم استلام ' || public.attendance_child_name(v_child, 'ar') || ' بعد. الساعات الإضافية حتى الآن: '
        || public.attendance_fmt_hours(v_total_hours)
        || case when v_total_covered > 0 then ' (منها ' || public.attendance_fmt_hours(v_total_covered) || ' من الباقة)' else '' end
        || ' · المبلغ: ' || public.attendance_fmt_money(v_total_fee, v_ns.currency, 'ar'),
      public.attendance_child_name(v_child, 'en') || ' has not been picked up yet. Extra hours so far: '
        || public.attendance_fmt_hours(v_total_hours)
        || case when v_total_covered > 0 then ' (' || public.attendance_fmt_hours(v_total_covered) || ' from package)' else '' end
        || ' · Amount: ' || public.attendance_fmt_money(v_total_fee, v_ns.currency, 'en'),
      '/parent/attendance',
      'high'
    );
  end if;

  if v_newly_capped then
    perform public.attendance_notify_staff(
      v_child.nursery_id,
      array['branch_admin', 'manager', 'teacher']::public.user_role[],
      'late_pickup_cap_reached',
      'تنبيه: تأخر استلام الطفل',
      'Alert: child not yet picked up',
      public.attendance_child_name(v_child, 'ar') || ' لم يتم استلامه بعد وتجاوز الحد الأقصى للرسوم التلقائية. يرجى المتابعة فورًا.',
      public.attendance_child_name(v_child, 'en') || ' has not been picked up and has reached the automatic billing cap. Please follow up immediately.',
      '/admin/attendance',
      'high'
    );
    perform public.attendance_notify_parents(
      v_child.id,
      'late_pickup_cap_reached',
      'تنبيه: لم يتم استلام طفلك',
      'Alert: your child has not been picked up',
      public.attendance_child_name(v_child, 'ar') || ' ما زال في الحضانة بعد انتهاء الدوام بأكثر من '
        || v_cap || ' ساعات. يرجى التواصل مع الحضانة فورًا.',
      public.attendance_child_name(v_child, 'en') || ' is still at the nursery more than '
        || v_cap || ' hours after closing. Please contact the nursery now.',
      '/parent/attendance',
      'high'
    );
  end if;

  return jsonb_build_object(
    'late_pickup', v_calc.is_late,
    'late_minutes', v_calc.late_minutes,
    'extra_hours', v_total_hours,
    'extra_hours_covered', v_total_covered,
    'extra_hours_billed', coalesce(v_att.extra_hours_billed, 0) + v_chargeable,
    'extra_fee', v_total_fee,
    'fee_rate', v_rate,
    'invoice_id', v_invoice_id,
    'added_hours', v_delta,
    'added_fee', v_fee,
    'capped', v_att.late_charge_capped or v_newly_capped
  );
end;
$$;

-- =============================================================================
-- 8. Late charge: reduce (corrections / waivers)
-- =============================================================================

-- Lowers the day's charged hours to p_target_hours: refunds billed hours first (pending invoice
-- reduced, or flagged for a manual refund when already paid), then returns package hours.
create or replace function public.attendance_reduce_late_charge(p_attendance_id uuid, p_target_hours numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att public.attendance_records%rowtype;
  v_child public.children%rowtype;
  v_ns public.nursery_settings%rowtype;
  v_decrease numeric;
  v_release_billed numeric;
  v_release_covered numeric;
  v_rate numeric;
  v_refund numeric;
  v_invoice public.invoices%rowtype;
  v_manual_refund boolean := false;
begin
  select * into v_att from public.attendance_records where id = p_attendance_id for update;
  if not found then
    raise exception 'attendance_not_found' using errcode = 'P0002';
  end if;
  select * into v_child from public.children where id = v_att.child_id;
  select * into v_ns from public.nursery_settings where nursery_id = v_child.nursery_id;

  v_decrease := greatest(coalesce(v_att.extra_hours, 0) - greatest(coalesce(p_target_hours, 0), 0), 0);
  if v_decrease = 0 then
    return jsonb_build_object('reduced_hours', 0, 'refund', 0, 'manual_refund', false);
  end if;

  v_release_billed := least(v_decrease, coalesce(v_att.extra_hours_billed, 0));
  v_release_covered := least(v_decrease - v_release_billed, coalesce(v_att.extra_hours_covered, 0));
  v_rate := coalesce(v_att.late_fee_rate, v_ns.late_pickup_fee_per_hour, 0);
  v_refund := least(round(v_release_billed * v_rate, 2), coalesce(v_att.extra_fee, 0));

  if v_release_covered > 0 then
    update public.child_packages
       set hours_used = greatest(hours_used - v_release_covered, 0)
     where id = (
       select cp.id from public.child_packages cp
       where cp.child_id = v_att.child_id and cp.status = 'active'
       order by cp.created_at desc
       limit 1
     );
  end if;

  if v_refund > 0 then
    if v_att.late_charge_invoice_id is not null then
      select * into v_invoice from public.invoices where id = v_att.late_charge_invoice_id for update;
    end if;
    if v_invoice.id is not null and v_invoice.status in ('pending', 'overdue') and v_invoice.amount >= v_refund then
      update public.invoices
         set amount = amount - v_refund,
             status = case when amount - v_refund <= 0 then 'cancelled' else status end,
             line_items_json = jsonb_set(
               case when jsonb_typeof(line_items_json) = 'object' then line_items_json else '{}'::jsonb end,
               '{items}',
               public.attendance_merge_late_item(line_items_json -> 'items', v_att.attendance_date, -v_release_billed, v_rate, -v_refund)
             ),
             updated_at = now()
       where id = v_invoice.id;
    else
      v_manual_refund := true;
    end if;
  end if;

  update public.attendance_records
     set extra_hours = coalesce(extra_hours, 0) - v_decrease,
         extra_hours_billed = greatest(coalesce(extra_hours_billed, 0) - v_release_billed, 0),
         extra_hours_covered = greatest(coalesce(extra_hours_covered, 0) - v_release_covered, 0),
         extra_fee = greatest(coalesce(extra_fee, 0) - v_refund, 0),
         needs_review = needs_review or v_manual_refund,
         review_reason = case when v_manual_refund then 'refund_due' else review_reason end
   where id = p_attendance_id;

  perform public.attendance_log_event(
    p_attendance_id, v_att.child_id, 'charge_reduced', null, null,
    jsonb_build_object(
      'reduced_hours', v_decrease, 'refund', v_refund, 'released_package_hours', v_release_covered,
      'manual_refund', v_manual_refund, 'invoice_id', v_att.late_charge_invoice_id
    )
  );

  if v_manual_refund then
    perform public.attendance_notify_staff(
      v_child.nursery_id,
      array['branch_admin', 'manager']::public.user_role[],
      'attendance_refund_due',
      'استرداد مطلوب لرسوم ساعات إضافية',
      'Extra-hours refund needed',
      'تم تخفيض رسوم الساعات الإضافية لـ ' || public.attendance_child_name(v_child, 'ar') || ' بقيمة '
        || public.attendance_fmt_money(v_refund, v_ns.currency, 'ar') || ' بعد سداد الفاتورة. يرجى رد المبلغ لولي الأمر.',
      'The extra-hours charge for ' || public.attendance_child_name(v_child, 'en') || ' was reduced by '
        || public.attendance_fmt_money(v_refund, v_ns.currency, 'en') || ' after the invoice was paid. Please refund the parent.',
      '/admin/attendance/logs',
      'high'
    );
  end if;

  return jsonb_build_object(
    'reduced_hours', v_decrease,
    'refund', v_refund,
    'released_package_hours', v_release_covered,
    'manual_refund', v_manual_refund
  );
end;
$$;

-- =============================================================================
-- 9. Check-in
-- =============================================================================

create or replace function public.record_attendance_check_in(
  p_child_id uuid,
  p_method text default 'manual',
  p_qr_token_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_child public.children%rowtype;
  v_ns public.nursery_settings%rowtype;
  v_role public.user_role;
  v_tz text;
  v_today date;
  v_att public.attendance_records%rowtype;
  v_early integer := 0;
  v_staff_ar text;
  v_staff_en text;
begin
  select * into v_child from public.children where id = p_child_id;
  if not found then
    raise exception 'attendance_child_not_found' using errcode = 'P0002';
  end if;
  v_role := public.attendance_require_staff(v_child.nursery_id);
  if v_child.status <> 'active' then
    raise exception 'attendance_child_not_active' using errcode = 'P0001';
  end if;
  if p_method not in ('qr_parent', 'qr_custom', 'manual') then
    raise exception 'attendance_invalid_method' using errcode = '22023';
  end if;

  select * into v_ns from public.nursery_settings where nursery_id = v_child.nursery_id;
  v_tz := coalesce(v_ns.timezone, 'Africa/Cairo');
  v_today := (now() at time zone v_tz)::date;

  if p_method = 'manual' and coalesce(v_ns.require_qr_for_attendance, false) and v_role = 'teacher' then
    raise exception 'attendance_qr_required' using errcode = 'P0001';
  end if;

  -- Rejected scans are returned (not raised) so the audit event survives the call.
  -- A custom QR names a person allowed to PICK UP; it is not a drop-off pass.
  if p_method = 'qr_custom' then
    perform public.attendance_log_event(null, p_child_id, 'scan_rejected', p_method, p_qr_token_id,
      jsonb_build_object('reason', 'attendance_custom_qr_pickup_only', 'action', 'check_in'));
    return jsonb_build_object('status', 'rejected', 'reason', 'attendance_custom_qr_pickup_only');
  end if;
  if p_method = 'qr_parent' then
    begin
      perform public.attendance_check_qr(p_qr_token_id, p_child_id, 'parent');
    exception when sqlstate 'P0001' then
      perform public.attendance_log_event(null, p_child_id, 'scan_rejected', p_method, p_qr_token_id,
        jsonb_build_object('reason', sqlerrm, 'action', 'check_in'));
      return jsonb_build_object('status', 'rejected', 'reason', sqlerrm);
    end;
  end if;

  select * into v_att
  from public.attendance_records
  where child_id = p_child_id and attendance_date = v_today
  for update;

  if found and v_att.check_out is not null then
    perform public.attendance_log_event(v_att.id, p_child_id, 'scan_rejected', p_method, p_qr_token_id,
      jsonb_build_object('reason', 'attendance_already_checked_out', 'action', 'check_in'));
    return jsonb_build_object(
      'status', 'already_checked_out',
      'attendance_id', v_att.id,
      'check_in', v_att.check_in,
      'check_out', v_att.check_out
    );
  end if;
  if found and v_att.check_in is not null then
    return jsonb_build_object(
      'status', 'already_checked_in',
      'attendance_id', v_att.id,
      'check_in', v_att.check_in,
      'checked_in_by', public.attendance_user_name(v_att.check_in_by, 'en')
    );
  end if;

  if v_ns.standard_start_time is not null then
    v_early := greatest(0, floor(extract(epoch from (
      ((v_today::text || ' ' || v_ns.standard_start_time::text)::timestamp at time zone v_tz) - now()
    )) / 60)::integer);
  end if;

  insert into public.attendance_records (
    child_id, attendance_date, check_in, check_out, check_in_by, check_in_method, check_in_qr_token_id, early_minutes
  )
  values (p_child_id, v_today, now(), null, v_uid, p_method, p_qr_token_id, v_early)
  on conflict (child_id, attendance_date) do update
     set check_in = excluded.check_in,
         check_in_by = excluded.check_in_by,
         check_in_method = excluded.check_in_method,
         check_in_qr_token_id = excluded.check_in_qr_token_id,
         early_minutes = excluded.early_minutes
  returning * into v_att;

  perform public.attendance_log_event(
    v_att.id, p_child_id, 'check_in', p_method, p_qr_token_id,
    jsonb_build_object('early_minutes', v_early)
  );

  v_staff_ar := public.attendance_user_name(v_uid, 'ar');
  v_staff_en := public.attendance_user_name(v_uid, 'en');
  perform public.attendance_notify_parents(
    p_child_id,
    'attendance_checkin',
    'تم تسجيل حضور الطفل',
    'Child checked in',
    'تم تسجيل حضور ' || public.attendance_child_name(v_child, 'ar') || ' الساعة '
      || public.attendance_fmt_time(v_att.check_in, v_tz, 'ar')
      || coalesce(' بواسطة ' || v_staff_ar, ''),
    public.attendance_child_name(v_child, 'en') || ' checked in at '
      || public.attendance_fmt_time(v_att.check_in, v_tz, 'en')
      || coalesce(' by ' || v_staff_en, '')
  );

  return jsonb_build_object(
    'status', 'checked_in',
    'attendance_id', v_att.id,
    'attendance_date', v_att.attendance_date,
    'check_in', v_att.check_in,
    'early_minutes', v_early
  );
end;
$$;

-- =============================================================================
-- 10. Check-out (pickup)
-- =============================================================================

-- p_pickup carries what the scanner verified: pickup_person_name, pickup_relationship,
-- pickup_photo_url, identity fields and identity_verified {id_photo_path, method}. It is merged
-- into qr_scan_log; billing values are always the server's.
create or replace function public.record_attendance_check_out(
  p_attendance_id uuid,
  p_method text default 'manual',
  p_qr_token_id uuid default null,
  p_pickup jsonb default '{}'::jsonb,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_att public.attendance_records%rowtype;
  v_child public.children%rowtype;
  v_ns public.nursery_settings%rowtype;
  v_role public.user_role;
  v_tz text;
  v_tok public.qr_tokens%rowtype;
  v_pickup jsonb := case when jsonb_typeof(p_pickup) = 'object' then p_pickup else '{}'::jsonb end;
  v_person text;
  v_relationship text;
  v_charge jsonb;
  v_now timestamptz := now();
  v_staff_ar text;
  v_staff_en text;
  v_hours numeric;
  v_covered numeric;
  v_fee numeric;
  v_extra_ar text := '';
  v_extra_en text := '';
begin
  if octet_length(v_pickup::text) > 8000 then
    raise exception 'attendance_pickup_payload_too_large' using errcode = '22023';
  end if;

  select * into v_att from public.attendance_records where id = p_attendance_id for update;
  if not found then
    raise exception 'attendance_not_found' using errcode = 'P0002';
  end if;
  select * into v_child from public.children where id = v_att.child_id;
  v_role := public.attendance_require_staff(v_child.nursery_id);
  select * into v_ns from public.nursery_settings where nursery_id = v_child.nursery_id;
  v_tz := coalesce(v_ns.timezone, 'Africa/Cairo');

  if p_method not in ('qr_parent', 'qr_custom', 'manual') then
    raise exception 'attendance_invalid_method' using errcode = '22023';
  end if;
  if v_att.check_in is null then
    raise exception 'attendance_not_checked_in' using errcode = 'P0001';
  end if;
  if v_att.check_out is not null then
    raise exception 'attendance_already_checked_out' using errcode = 'P0001';
  end if;
  if p_method = 'manual' and coalesce(v_ns.require_qr_for_attendance, false) and v_role = 'teacher' then
    raise exception 'attendance_qr_required' using errcode = 'P0001';
  end if;
  -- Rejected scans are returned (not raised) so the audit event survives the call.
  -- A second scan right after drop-off is almost always an accidental double scan.
  if not p_force and v_now - v_att.check_in < make_interval(mins => coalesce(v_ns.min_minutes_between_scans, 5)) then
    perform public.attendance_log_event(v_att.id, v_att.child_id, 'scan_rejected', p_method, p_qr_token_id,
      jsonb_build_object('reason', 'attendance_too_soon', 'action', 'check_out'));
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'attendance_too_soon',
      'attendance_id', v_att.id,
      'check_in', v_att.check_in,
      'min_minutes', coalesce(v_ns.min_minutes_between_scans, 5)
    );
  end if;

  if p_method in ('qr_parent', 'qr_custom') then
    begin
      v_tok := public.attendance_check_qr(
        p_qr_token_id, v_att.child_id, case when p_method = 'qr_custom' then 'delegate' else 'parent' end
      );
    exception when sqlstate 'P0001' then
      perform public.attendance_log_event(v_att.id, v_att.child_id, 'scan_rejected', p_method, p_qr_token_id,
        jsonb_build_object('reason', sqlerrm, 'action', 'check_out'));
      return jsonb_build_object('status', 'rejected', 'reason', sqlerrm, 'attendance_id', v_att.id);
    end;
    -- One-time QRs are spent only now that staff confirmed the person.
    if v_tok.single_use then
      update public.qr_tokens set consumed_at = v_now where id = v_tok.id;
    end if;
  end if;

  v_person := coalesce(
    nullif(trim(v_pickup ->> 'pickup_person_name'), ''),
    nullif(trim(v_tok.pickup_person_full_name), ''),
    nullif(trim(v_tok.delegate_name), ''),
    case when p_method = 'qr_parent' then public.attendance_user_name(v_tok.issued_by, 'en') end
  );
  v_relationship := coalesce(nullif(trim(v_pickup ->> 'pickup_relationship'), ''), nullif(trim(v_tok.pickup_relationship), ''));

  update public.attendance_records
     set check_out = v_now,
         check_out_by = v_uid,
         check_out_method = p_method,
         check_out_qr_token_id = case when p_method = 'manual' then null else p_qr_token_id end,
         pickup_person_name = v_person,
         pickup_relationship = v_relationship,
         qr_scan_log = coalesce(qr_scan_log, '{}'::jsonb)
           || (v_pickup - 'late_pickup' - 'extra_hours' - 'extra_fee' - 'fee_per_hour')
           || jsonb_build_object('checked_out_at', v_now, 'pickup_purpose',
                case p_method when 'qr_custom' then 'delegate' when 'qr_parent' then 'parent' else 'manual' end)
   where id = p_attendance_id;

  v_charge := public.apply_attendance_late_charge(p_attendance_id, v_now, 'checkout', true);

  update public.attendance_records
     set qr_scan_log = qr_scan_log || jsonb_build_object(
       'late_pickup', coalesce((v_charge ->> 'late_pickup')::boolean, false),
       'extra_hours', coalesce((v_charge ->> 'extra_hours')::numeric, 0),
       'extra_fee', coalesce((v_charge ->> 'extra_fee')::numeric, 0),
       'end_time', v_ns.standard_end_time,
       'grace_minutes', v_ns.late_pickup_grace_minutes,
       'fee_per_hour', v_ns.late_pickup_fee_per_hour
     )
   where id = p_attendance_id;

  perform public.attendance_log_event(
    p_attendance_id, v_att.child_id, 'check_out', p_method, p_qr_token_id,
    jsonb_build_object(
      'pickup_person_name', v_person, 'pickup_relationship', v_relationship,
      'identity_verified', v_pickup -> 'identity_verified', 'charge', v_charge
    )
  );

  v_hours := coalesce((v_charge ->> 'extra_hours')::numeric, 0);
  v_covered := coalesce((v_charge ->> 'extra_hours_covered')::numeric, 0);
  v_fee := coalesce((v_charge ->> 'extra_fee')::numeric, 0);
  if v_hours > 0 then
    v_extra_ar := ' · الساعات الإضافية: ' || public.attendance_fmt_hours(v_hours)
      || case when v_covered > 0 then ' (منها ' || public.attendance_fmt_hours(v_covered) || ' من الباقة)' else '' end
      || case when v_fee > 0 then ' · المبلغ المستحق: ' || public.attendance_fmt_money(v_fee, v_ns.currency, 'ar') else '' end;
    v_extra_en := ' · Extra hours: ' || public.attendance_fmt_hours(v_hours)
      || case when v_covered > 0 then ' (' || public.attendance_fmt_hours(v_covered) || ' from package)' else '' end
      || case when v_fee > 0 then ' · Amount due: ' || public.attendance_fmt_money(v_fee, v_ns.currency, 'en') else '' end;
  end if;

  v_staff_ar := public.attendance_user_name(v_uid, 'ar');
  v_staff_en := public.attendance_user_name(v_uid, 'en');
  perform public.attendance_notify_parents(
    v_att.child_id,
    'attendance_checkout',
    'تم استلام الطفل',
    'Child picked up',
    'تم استلام ' || public.attendance_child_name(v_child, 'ar') || ' الساعة '
      || public.attendance_fmt_time(v_now, v_tz, 'ar')
      || coalesce(' بواسطة ' || v_person, '')
      || coalesce(' · سجّل الانصراف: ' || v_staff_ar, '')
      || v_extra_ar,
    public.attendance_child_name(v_child, 'en') || ' was picked up at '
      || public.attendance_fmt_time(v_now, v_tz, 'en')
      || coalesce(' by ' || v_person, '')
      || coalesce(' · Checked out by ' || v_staff_en, '')
      || v_extra_en,
    case when v_fee > 0 then '/parent/invoices' else '/parent/attendance' end,
    case when v_fee > 0 then 'high' else 'normal' end,
    nullif(v_pickup ->> 'pickup_photo_url', '')
  );

  return jsonb_build_object(
    'status', 'checked_out',
    'attendance_id', p_attendance_id,
    'check_out', v_now,
    'pickup_person_name', v_person
  ) || coalesce(v_charge, '{}'::jsonb);
end;
$$;

-- Kept for older clients: same behaviour as a manual checkout.
create or replace function public.record_attendance_checkout_billing(
  p_attendance_id uuid,
  p_checkout_at timestamptz
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.record_attendance_check_out(p_attendance_id, 'manual', null, '{}'::jsonb, true)
$$;

-- =============================================================================
-- 11. Undo an accidental check-in (short window)
-- =============================================================================

create or replace function public.undo_attendance_check_in(p_attendance_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att public.attendance_records%rowtype;
  v_child public.children%rowtype;
  v_role public.user_role;
begin
  select * into v_att from public.attendance_records where id = p_attendance_id for update;
  if not found then
    raise exception 'attendance_not_found' using errcode = 'P0002';
  end if;
  select * into v_child from public.children where id = v_att.child_id;
  v_role := public.attendance_require_staff(v_child.nursery_id);

  if v_att.check_out is not null or coalesce(v_att.extra_hours, 0) > 0 then
    raise exception 'attendance_undo_not_allowed' using errcode = 'P0001';
  end if;
  if v_role = 'teacher' and (v_att.check_in_by is distinct from auth.uid() or now() - v_att.check_in > interval '15 minutes') then
    raise exception 'attendance_undo_window_passed' using errcode = 'P0001';
  end if;

  perform public.attendance_log_event(
    p_attendance_id, v_att.child_id, 'check_in_undone', v_att.check_in_method, v_att.check_in_qr_token_id,
    jsonb_build_object('check_in', v_att.check_in)
  );
  delete from public.attendance_records where id = p_attendance_id;

  perform public.attendance_notify_parents(
    v_att.child_id,
    'attendance_checkin_cancelled',
    'تم إلغاء تسجيل الحضور',
    'Check-in cancelled',
    'تم إلغاء تسجيل حضور ' || public.attendance_child_name(v_child, 'ar') || ' لأنه سُجّل بالخطأ.',
    'The check-in for ' || public.attendance_child_name(v_child, 'en') || ' was cancelled because it was recorded by mistake.'
  );

  return jsonb_build_object('status', 'undone', 'attendance_id', p_attendance_id);
end;
$$;

-- =============================================================================
-- 12. Admin: correct times, waive a charge, resolve a review
-- =============================================================================

create or replace function public.admin_correct_attendance(
  p_attendance_id uuid,
  p_check_in timestamptz,
  p_check_out timestamptz,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att public.attendance_records%rowtype;
  v_child public.children%rowtype;
  v_ns public.nursery_settings%rowtype;
  v_tz text;
  v_before jsonb;
  v_as_of timestamptz;
  v_calc record;
  v_result jsonb := '{}'::jsonb;
  v_early integer := 0;
begin
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'attendance_reason_required' using errcode = '22023';
  end if;
  select * into v_att from public.attendance_records where id = p_attendance_id for update;
  if not found then
    raise exception 'attendance_not_found' using errcode = 'P0002';
  end if;
  select * into v_child from public.children where id = v_att.child_id;
  perform public.attendance_require_staff(v_child.nursery_id, true);
  select * into v_ns from public.nursery_settings where nursery_id = v_child.nursery_id;
  v_tz := coalesce(v_ns.timezone, 'Africa/Cairo');

  if p_check_in is null
     or (p_check_in at time zone v_tz)::date <> v_att.attendance_date
     or (p_check_out is not null and p_check_out <= p_check_in)
     or p_check_in > now()
     or (p_check_out is not null and p_check_out > now()) then
    raise exception 'attendance_invalid_times' using errcode = '22023';
  end if;

  v_before := jsonb_build_object(
    'check_in', v_att.check_in, 'check_out', v_att.check_out,
    'extra_hours', v_att.extra_hours, 'extra_fee', v_att.extra_fee
  );

  if v_ns.standard_start_time is not null then
    v_early := greatest(0, floor(extract(epoch from (
      ((v_att.attendance_date::text || ' ' || v_ns.standard_start_time::text)::timestamp at time zone v_tz) - p_check_in
    )) / 60)::integer);
  end if;

  update public.attendance_records
     set check_in = p_check_in,
         check_out = p_check_out,
         check_out_by = case when p_check_out is not null then coalesce(check_out_by, auth.uid()) else null end,
         check_out_method = case when p_check_out is not null then coalesce(check_out_method, 'manual') else null end,
         early_minutes = v_early,
         late_charge_status = case when p_check_out is null and late_charge_status = 'final' then 'provisional' else late_charge_status end,
         needs_review = case when review_reason = 'missing_checkout' and p_check_out is not null then false else needs_review end,
         review_reason = case when review_reason = 'missing_checkout' and p_check_out is not null then null else review_reason end
   where id = p_attendance_id
   returning * into v_att;

  -- Re-bill as of the corrected checkout (or "now" for a child still here today).
  v_as_of := coalesce(p_check_out, case when v_att.attendance_date = (now() at time zone v_tz)::date then now() end);
  if v_as_of is not null and not v_att.late_charge_waived then
    select * into v_calc from public.attendance_compute_extra_time(v_att, v_ns, v_as_of);
    if v_calc.target_hours > coalesce(v_att.extra_hours, 0) then
      v_result := public.apply_attendance_late_charge(p_attendance_id, v_as_of, 'correction', p_check_out is not null);
    elsif v_calc.target_hours < coalesce(v_att.extra_hours, 0) then
      v_result := public.attendance_reduce_late_charge(p_attendance_id, v_calc.target_hours);
    end if;
    update public.attendance_records
       set late_minutes = v_calc.late_minutes,
           late_charge_status = case when p_check_out is not null then 'final' else late_charge_status end
     where id = p_attendance_id;
  end if;

  select * into v_att from public.attendance_records where id = p_attendance_id;

  perform public.attendance_log_event(
    p_attendance_id, v_att.child_id, 'correction', 'manual', null,
    jsonb_build_object(
      'reason', trim(p_reason), 'before', v_before,
      'after', jsonb_build_object('check_in', v_att.check_in, 'check_out', v_att.check_out,
                                  'extra_hours', v_att.extra_hours, 'extra_fee', v_att.extra_fee),
      'charge', v_result
    )
  );

  perform public.attendance_notify_parents(
    v_att.child_id,
    'attendance_corrected',
    'تم تعديل سجل الحضور',
    'Attendance record updated',
    'تم تعديل سجل حضور ' || public.attendance_child_name(v_child, 'ar') || ' ليوم ' || to_char(v_att.attendance_date, 'DD/MM/YYYY')
      || ': الحضور ' || public.attendance_fmt_time(v_att.check_in, v_tz, 'ar')
      || coalesce(' · الانصراف ' || public.attendance_fmt_time(v_att.check_out, v_tz, 'ar'), '')
      || ' · الساعات الإضافية: ' || public.attendance_fmt_hours(v_att.extra_hours)
      || ' · المبلغ: ' || public.attendance_fmt_money(v_att.extra_fee, v_ns.currency, 'ar'),
    'The attendance record of ' || public.attendance_child_name(v_child, 'en') || ' for ' || to_char(v_att.attendance_date, 'DD/MM/YYYY')
      || ' was updated: in ' || public.attendance_fmt_time(v_att.check_in, v_tz, 'en')
      || coalesce(' · out ' || public.attendance_fmt_time(v_att.check_out, v_tz, 'en'), '')
      || ' · extra hours: ' || public.attendance_fmt_hours(v_att.extra_hours)
      || ' · amount: ' || public.attendance_fmt_money(v_att.extra_fee, v_ns.currency, 'en')
  );

  return jsonb_build_object(
    'status', 'corrected',
    'attendance_id', p_attendance_id,
    'extra_hours', v_att.extra_hours,
    'extra_fee', v_att.extra_fee,
    'needs_review', v_att.needs_review
  ) || jsonb_build_object('charge', v_result);
end;
$$;

create or replace function public.admin_waive_late_charge(p_attendance_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att public.attendance_records%rowtype;
  v_child public.children%rowtype;
  v_result jsonb;
begin
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'attendance_reason_required' using errcode = '22023';
  end if;
  select * into v_att from public.attendance_records where id = p_attendance_id for update;
  if not found then
    raise exception 'attendance_not_found' using errcode = 'P0002';
  end if;
  select * into v_child from public.children where id = v_att.child_id;
  perform public.attendance_require_staff(v_child.nursery_id, true);

  v_result := public.attendance_reduce_late_charge(p_attendance_id, 0);
  update public.attendance_records
     set late_charge_waived = true,
         late_charge_status = case when check_out is not null then 'final' else late_charge_status end
   where id = p_attendance_id;

  perform public.attendance_log_event(
    p_attendance_id, v_att.child_id, 'charge_waived', null, null,
    jsonb_build_object('reason', trim(p_reason), 'charge', v_result)
  );
  perform public.attendance_notify_parents(
    v_att.child_id,
    'extra_hours_waived',
    'إعفاء من رسوم الساعات الإضافية',
    'Extra-hours charge waived',
    'تم إعفاء ' || public.attendance_child_name(v_child, 'ar') || ' من رسوم الساعات الإضافية ليوم '
      || to_char(v_att.attendance_date, 'DD/MM/YYYY') || '.',
    'The extra-hours charge for ' || public.attendance_child_name(v_child, 'en') || ' on '
      || to_char(v_att.attendance_date, 'DD/MM/YYYY') || ' was waived.'
  );
  return jsonb_build_object('status', 'waived', 'attendance_id', p_attendance_id) || v_result;
end;
$$;

create or replace function public.admin_resolve_attendance_review(p_attendance_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att public.attendance_records%rowtype;
  v_child public.children%rowtype;
begin
  select * into v_att from public.attendance_records where id = p_attendance_id for update;
  if not found then
    raise exception 'attendance_not_found' using errcode = 'P0002';
  end if;
  select * into v_child from public.children where id = v_att.child_id;
  perform public.attendance_require_staff(v_child.nursery_id, true);

  update public.attendance_records set needs_review = false, review_reason = null where id = p_attendance_id;
  perform public.attendance_log_event(
    p_attendance_id, v_att.child_id, 'review_resolved', null, null,
    jsonb_build_object('previous_reason', v_att.review_reason, 'note', nullif(trim(coalesce(p_note, '')), ''))
  );
  return jsonb_build_object('status', 'resolved', 'attendance_id', p_attendance_id);
end;
$$;

-- =============================================================================
-- 13. Scheduled jobs: late sweep, pickup reminders, missing-checkout review
-- =============================================================================

create or replace function public.run_late_pickup_sweep()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_processed integer := 0;
  v_row record;
begin
  for v_row in
    select ar.id
    from public.attendance_records ar
    join public.children c on c.id = ar.child_id
    join public.nursery_settings ns on ns.nursery_id = c.nursery_id
    where ar.check_out is null
      and ar.check_in is not null
      and ar.late_charge_status <> 'final'
      and not ar.late_charge_waived
      and coalesce(ns.auto_late_pickup_billing_enabled, true)
      and ns.standard_end_time is not null
      and ar.attendance_date = (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date
      and (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::time
          > (ns.standard_end_time + make_interval(mins => coalesce(ns.late_pickup_grace_minutes, 0)))
    for update of ar skip locked
  loop
    perform public.apply_attendance_late_charge(v_row.id, now(), 'sweep', false);
    v_processed := v_processed + 1;
  end loop;
  return v_processed;
end;
$$;

-- Reminds parents shortly before closing that the child is still here and when extra hours start.
create or replace function public.run_pickup_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sent integer := 0;
  v_row record;
  v_starts time;
begin
  for v_row in
    select ar.id, c as child, ns.standard_end_time, ns.late_pickup_grace_minutes, ns.late_pickup_fee_per_hour,
           ns.currency, coalesce(ns.timezone, 'Africa/Cairo') as tz
    from public.attendance_records ar
    join public.children c on c.id = ar.child_id
    join public.nursery_settings ns on ns.nursery_id = c.nursery_id
    where ar.check_in is not null
      and ar.check_out is null
      and ar.pickup_reminder_sent_at is null
      and coalesce(ns.pickup_reminder_minutes_before, 0) > 0
      and ns.standard_end_time is not null
      and ar.attendance_date = (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date
      and (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::time
          between ns.standard_end_time - make_interval(mins => ns.pickup_reminder_minutes_before) and ns.standard_end_time
    for update of ar skip locked
  loop
    v_starts := v_row.standard_end_time + make_interval(mins => coalesce(v_row.late_pickup_grace_minutes, 0));
    perform public.attendance_notify_parents(
      (v_row.child).id,
      'pickup_reminder',
      'تذكير بموعد الاستلام',
      'Pickup reminder',
      'موعد استلام ' || public.attendance_child_name(v_row.child, 'ar') || ' الساعة '
        || public.attendance_fmt_clock(v_row.standard_end_time, 'ar')
        || '. بعد ' || public.attendance_fmt_clock(v_starts, 'ar') || ' تُحتسب ساعات إضافية بسعر '
        || public.attendance_fmt_money(v_row.late_pickup_fee_per_hour, v_row.currency, 'ar') || ' للساعة.',
      'Pickup time for ' || public.attendance_child_name(v_row.child, 'en') || ' is '
        || public.attendance_fmt_clock(v_row.standard_end_time, 'en')
        || '. After ' || public.attendance_fmt_clock(v_starts, 'en') || ' extra hours are charged at '
        || public.attendance_fmt_money(v_row.late_pickup_fee_per_hour, v_row.currency, 'en') || ' per hour.',
      '/parent/attendance',
      'high'
    );
    update public.attendance_records set pickup_reminder_sent_at = now() where id = v_row.id;
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;

-- Flags past days left without a checkout so an admin records the real pickup time.
create or replace function public.run_attendance_daily_close()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flagged integer := 0;
  v_nursery record;
begin
  with flagged as (
    update public.attendance_records ar
       set needs_review = true,
           review_reason = 'missing_checkout'
      from public.children c
      left join public.nursery_settings ns on ns.nursery_id = c.nursery_id
     where c.id = ar.child_id
       and ar.check_in is not null
       and ar.check_out is null
       and not ar.needs_review
       and ar.attendance_date < (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date
       -- Only the last week: older gaps predate this check and would only flood admins.
       and ar.attendance_date >= (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date - 7
    returning ar.id, ar.child_id, c.nursery_id
  ),
  logged as (
    insert into public.attendance_events (nursery_id, child_id, attendance_id, event_type, details)
    select f.nursery_id, f.child_id, f.id, 'review_flagged', jsonb_build_object('reason', 'missing_checkout')
    from flagged f
    returning nursery_id
  )
  select count(*) into v_flagged from logged;
  if v_flagged = 0 then
    return 0;
  end if;

  for v_nursery in
    select ae.nursery_id, count(*) as n
    from public.attendance_events ae
    where ae.event_type = 'review_flagged'
      and ae.created_at > now() - interval '5 minutes'
      and ae.details ->> 'reason' = 'missing_checkout'
    group by ae.nursery_id
  loop
    perform public.attendance_notify_staff(
      v_nursery.nursery_id,
      array['branch_admin', 'manager']::public.user_role[],
      'attendance_needs_review',
      'سجلات حضور تحتاج مراجعة',
      'Attendance records need review',
      'يوجد ' || v_nursery.n || ' سجل حضور بدون تسجيل انصراف. يرجى تسجيل وقت الاستلام الفعلي.',
      v_nursery.n || ' attendance record(s) have no checkout. Please record the actual pickup time.',
      '/admin/attendance/logs',
      'high'
    );
  end loop;
  return v_flagged;
end;
$$;

-- =============================================================================
-- 14. Absence reports: fill nursery/reporter, log, alert staff
-- =============================================================================

create or replace function public.attendance_absence_reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select c.nursery_id into new.nursery_id from public.children c where c.id = new.child_id;
  new.reported_by := coalesce(auth.uid(), new.reported_by);
  return new;
end;
$$;

create or replace function public.attendance_absence_reports_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child public.children%rowtype;
  v_reason_ar text;
begin
  select * into v_child from public.children where id = new.child_id;
  v_reason_ar := case new.reason when 'sick' then 'مرض' when 'travel' then 'سفر' when 'family' then 'ظرف عائلي' else 'أخرى' end;
  perform public.attendance_log_event(null, new.child_id, 'absence_reported', null, null,
    jsonb_build_object('absence_date', new.absence_date, 'reason', new.reason, 'note', new.note), new.reported_by);
  perform public.attendance_notify_staff(
    new.nursery_id,
    array['branch_admin', 'manager']::public.user_role[],
    'absence_reported',
    'إبلاغ بغياب',
    'Absence reported',
    'تم الإبلاغ عن غياب ' || public.attendance_child_name(v_child, 'ar') || ' يوم '
      || to_char(new.absence_date, 'DD/MM/YYYY') || ' (' || v_reason_ar || ').',
    'Absence reported for ' || public.attendance_child_name(v_child, 'en') || ' on '
      || to_char(new.absence_date, 'DD/MM/YYYY') || ' (' || new.reason || ').',
    '/admin/attendance'
  );
  return new;
end;
$$;

drop trigger if exists trg_absence_reports_before_insert on public.attendance_absence_reports;
create trigger trg_absence_reports_before_insert
before insert on public.attendance_absence_reports
for each row execute function public.attendance_absence_reports_before_insert();

drop trigger if exists trg_absence_reports_after_insert on public.attendance_absence_reports;
create trigger trg_absence_reports_after_insert
after insert on public.attendance_absence_reports
for each row execute function public.attendance_absence_reports_after_insert();

-- =============================================================================
-- 15. Reporting: per-day attendance and nursery KPIs (one source for every dashboard)
-- =============================================================================

-- One row per (child, day) for children the caller may see. day_status:
--   present | partial (checked in, not out) | absent | excused | off (not a working day)
--   | holiday | upcoming (future) | not_enrolled (before the child's start date)
create or replace function public.get_attendance_days(p_child_ids uuid[], p_from date, p_to date)
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
  absence_note text
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
    abr.note
  from days d
  left join public.attendance_records ar on ar.child_id = d.kid and ar.attendance_date = d.day
  left join public.attendance_absence_reports abr on abr.child_id = d.kid and abr.absence_date = d.day
  left join public.invoices inv on inv.id = ar.late_charge_invoice_id
  order by d.day desc, d.kid;
end;
$$;

-- Nursery-wide numbers for today and for the month of p_month.
create or replace function public.get_attendance_kpis(p_nursery_id uuid, p_month date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ns public.nursery_settings%rowtype;
  v_tz text;
  v_today date;
  v_now_local time;
  v_month_start date;
  v_month_end date;
  v_today_json jsonb;
  v_month_json jsonb;
  v_top_late jsonb;
  v_is_school_day boolean;
begin
  perform public.attendance_require_staff(p_nursery_id);
  select * into v_ns from public.nursery_settings where nursery_id = p_nursery_id;
  v_tz := coalesce(v_ns.timezone, 'Africa/Cairo');
  v_today := (now() at time zone v_tz)::date;
  v_now_local := (now() at time zone v_tz)::time;
  v_month_start := date_trunc('month', coalesce(p_month, v_today))::date;
  v_month_end := least((v_month_start + interval '1 month - 1 day')::date, v_today);
  v_is_school_day := public.attendance_is_school_day(p_nursery_id, v_today);

  with kids as (
    select c.id, coalesce(c.enrollment_date, c.created_at::date) as start_day
    from public.children c
    where c.nursery_id = p_nursery_id and c.status = 'active'
  ),
  att as (
    select ar.* from public.attendance_records ar join kids k on k.id = ar.child_id
    where ar.attendance_date = v_today
  ),
  excused as (
    select abr.child_id from public.attendance_absence_reports abr join kids k on k.id = abr.child_id
    where abr.absence_date = v_today
      and not exists (select 1 from att where att.child_id = abr.child_id and att.check_in is not null)
  )
  select jsonb_build_object(
    'date', v_today,
    'is_school_day', v_is_school_day,
    'active_children', (select count(*) from kids where start_day <= v_today),
    'in_nursery', (select count(*) from att where check_in is not null and check_out is null),
    'checked_out', (select count(*) from att where check_out is not null),
    'checked_in_total', (select count(*) from att where check_in is not null),
    'excused', (select count(*) from excused),
    'absent', case when v_is_school_day then greatest(
      (select count(*) from kids where start_day <= v_today)
      - (select count(*) from att where check_in is not null)
      - (select count(*) from excused), 0) else 0 end,
    'late_now', case when v_ns.standard_end_time is not null
        and v_now_local > v_ns.standard_end_time + make_interval(mins => coalesce(v_ns.late_pickup_grace_minutes, 0))
      then (select count(*) from att where check_in is not null and check_out is null) else 0 end,
    'extra_hours_today', (select coalesce(sum(extra_hours), 0) from att),
    'extra_fee_today', (select coalesce(sum(extra_fee), 0) from att),
    'end_time', v_ns.standard_end_time,
    'grace_minutes', v_ns.late_pickup_grace_minutes
  ) into v_today_json;

  with kids as (
    select c.id, coalesce(c.enrollment_date, c.created_at::date) as start_day
    from public.children c
    where c.nursery_id = p_nursery_id and c.status = 'active'
  ),
  school_days as (
    select d::date as day
    from generate_series(v_month_start, v_month_end, interval '1 day') d
    where public.attendance_is_school_day(p_nursery_id, d::date)
  ),
  att as (
    select ar.* from public.attendance_records ar
    join public.children c on c.id = ar.child_id
    where c.nursery_id = p_nursery_id and ar.attendance_date between v_month_start and v_month_end
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
  extra_invoices as (
    select i.* from public.invoices i where i.nursery_id = p_nursery_id and i.invoice_type = 'extra_hours'
  )
  select jsonb_build_object(
    'month_start', v_month_start,
    'month_end', v_month_end,
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
    'extra_fee_billed', (select coalesce(sum(extra_fee), 0) from att),
    'extra_fee_collected', (select coalesce(sum(amount), 0) from extra_invoices
      where status = 'paid' and paid_at >= v_month_start and paid_at < v_month_start + interval '1 month'),
    'extra_fee_outstanding', (select coalesce(sum(amount), 0) from extra_invoices where status in ('pending', 'overdue')),
    'needs_review', (select count(*) from public.attendance_records ar join public.children c on c.id = ar.child_id
      where c.nursery_id = p_nursery_id and ar.needs_review),
    'qr_scans', (select count(*) from att where check_in_method in ('qr_parent', 'qr_custom') or check_out_method in ('qr_parent', 'qr_custom')),
    'manual_entries', (select count(*) from att where check_in_method = 'manual' or check_out_method = 'manual')
  ) into v_month_json;

  select coalesce(jsonb_agg(t order by t.extra_hours desc, t.late_days desc), '[]'::jsonb) into v_top_late
  from (
    select c.id as child_id, c.full_name_ar, c.full_name_en,
           count(*) as late_days, sum(ar.extra_hours) as extra_hours, sum(ar.extra_fee) as extra_fee
    from public.attendance_records ar
    join public.children c on c.id = ar.child_id
    where c.nursery_id = p_nursery_id
      and ar.attendance_date between v_month_start and v_month_end
      and coalesce(ar.extra_hours, 0) > 0
    group by c.id, c.full_name_ar, c.full_name_en
    order by sum(ar.extra_hours) desc
    limit 5
  ) t;

  return jsonb_build_object('today', v_today_json, 'month', v_month_json, 'top_late', v_top_late);
end;
$$;

-- =============================================================================
-- 16. Permissions: internal helpers are not callable from the API
-- =============================================================================

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.attendance_fmt_time(timestamptz, text, text)',
    'public.attendance_fmt_clock(time, text)',
    'public.attendance_fmt_money(numeric, text, text)',
    'public.attendance_fmt_hours(numeric)',
    'public.attendance_child_name(public.children, text)',
    'public.attendance_user_name(uuid, text)',
    'public.attendance_is_holiday(uuid, date)',
    'public.attendance_is_school_day(uuid, date)',
    'public.attendance_log_event(uuid, uuid, text, text, uuid, jsonb, uuid)',
    'public.attendance_notify_parents(uuid, text, text, text, text, text, text, text, text)',
    'public.attendance_notify_staff(uuid, public.user_role[], text, text, text, text, text, text, text)',
    'public.attendance_require_staff(uuid, boolean)',
    'public.attendance_check_qr(uuid, uuid, text)',
    'public.attendance_compute_extra_time(public.attendance_records, public.nursery_settings, timestamptz)',
    'public.attendance_merge_late_item(jsonb, date, numeric, numeric, numeric)',
    'public.attendance_add_late_fee_to_invoice(public.attendance_records, public.children, public.nursery_settings, numeric, numeric, numeric, text)',
    'public.apply_attendance_late_charge(uuid, timestamptz, text, boolean)',
    'public.attendance_reduce_late_charge(uuid, numeric)',
    'public.compute_late_pickup(time, integer, numeric, date, timestamptz, text)',
    'public.package_apply_extra_hours(uuid, numeric, boolean)',
    'public.run_late_pickup_sweep()',
    'public.run_pickup_reminders()',
    'public.run_attendance_daily_close()',
    'public.run_payment_reminders()',
    'public.run_permission_deadline_reminders()',
    'public.run_monthly_teacher_reminders()',
    'public.run_personal_reminders()',
    'public.run_tuition_subscription_billing()',
    'public.attendance_absence_reports_before_insert()',
    'public.attendance_absence_reports_after_insert()'
  ]
  loop
    if to_regprocedure(v_fn) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', v_fn);
    end if;
  end loop;

  foreach v_fn in array array[
    'public.record_attendance_check_in(uuid, text, uuid)',
    'public.record_attendance_check_out(uuid, text, uuid, jsonb, boolean)',
    'public.record_attendance_checkout_billing(uuid, timestamptz)',
    'public.undo_attendance_check_in(uuid)',
    'public.admin_correct_attendance(uuid, timestamptz, timestamptz, text)',
    'public.admin_waive_late_charge(uuid, text)',
    'public.admin_resolve_attendance_review(uuid, text)',
    'public.get_attendance_days(uuid[], date, date)',
    'public.get_attendance_kpis(uuid, date)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end $$;

-- =============================================================================
-- 17. Realtime + schedules
-- =============================================================================

do $$
declare
  v_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if (select puballtables from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach v_table in array array['attendance_records', 'attendance_events', 'attendance_absence_reports'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end $$;

do $$
begin
  perform cron.unschedule('attendance-pickup-reminders');
exception when others then null;
end $$;
select cron.schedule('attendance-pickup-reminders', '*/5 * * * *', $$select public.run_pickup_reminders()$$);

do $$
begin
  perform cron.unschedule('attendance-daily-close');
exception when others then null;
end $$;
select cron.schedule('attendance-daily-close', '15 * * * *', $$select public.run_attendance_daily_close()$$);

commit;

-- Medicine rounds, and telling parents when a backup teacher covers their child's class.
--
-- 1. A child's medicine gets the times of day it is given (dose_times; none = only when needed) and
--    the days of the course (starts_on, ends_on; none = ongoing). It is given only with the parents'
--    consent, before its expiry date and within its course.
-- 2. medication_doses: each dose given or not given (with the reason), by whom and when. A timed
--    dose is recorded once a day; a when-needed dose as often as it is given. The parents are told at
--    once ("given at 12:05", or why it was not given); a dose recorded by mistake can be undone the
--    same day, and the parents are told.
-- 3. Reminders, every 5 minutes: at a dose's time (from 10 minutes before) the child's teachers on
--    duty (the backup when the lead is away) are reminded; 30 minutes after it, if still not recorded,
--    they and the admins are told it is overdue. Only for a child who is here (checked in, not gone)
--    and was here by the dose time; once per dose and kind.
-- 4. get_medication_round(nursery): today's doses for the children a teacher looks after today, or
--    the whole nursery for its admins and managers.
-- 5. When a backup teacher covers a class, the parents of its children are told once that day
--    ("Today Nour looks after the Butterflies"), unless the nursery turns it off.

-- -----------------------------------------------------------------------------------------------
-- 1. Dose times and course
alter table public.child_medications
  add column if not exists dose_times time[] not null default '{}',
  add column if not exists starts_on date,
  add column if not exists ends_on date;
alter table public.child_medications drop constraint if exists child_medications_dose_times_ck;
alter table public.child_medications add constraint child_medications_dose_times_ck check (cardinality(dose_times) <= 6);
alter table public.child_medications drop constraint if exists child_medications_course_ck;
alter table public.child_medications add constraint child_medications_course_ck check (ends_on is null or starts_on is null or ends_on >= starts_on);

-- Keeps the times sorted and each once, whoever writes them.
create or replace function public.child_medications_tidy_times()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.dose_times := coalesce(array(select distinct t from unnest(new.dose_times) t where t is not null order by t), '{}');
  return new;
end;
$$;
drop trigger if exists trg_child_medications_tidy_times on public.child_medications;
create trigger trg_child_medications_tidy_times
  before insert or update of dose_times on public.child_medications
  for each row execute function public.child_medications_tidy_times();

-- Whether a medicine may be given on a day.
create or replace function public.medication_active_on(m public.child_medications, p_day date)
returns boolean
language sql
immutable
as $$
  select m.parent_consent_status = 'granted'
     and (m.expiry_date is null or m.expiry_date >= p_day)
     and (m.starts_on is null or m.starts_on <= p_day)
     and (m.ends_on is null or m.ends_on >= p_day)
$$;

-- -----------------------------------------------------------------------------------------------
-- 2. Doses
create table if not exists public.medication_doses (
  id uuid primary key default gen_random_uuid(),
  nursery_id uuid not null references public.nurseries (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  medication_id uuid not null references public.child_medications (id) on delete cascade,
  day date not null,
  scheduled_time time,
  status text not null check (status in ('given', 'skipped')),
  skip_reason text check (skip_reason in ('absent', 'refused', 'parent_gave', 'not_needed', 'other')),
  note text check (note is null or char_length(note) <= 200),
  recorded_by uuid references public.users (id) on delete set null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint medication_doses_reason check ((status = 'skipped') = (skip_reason is not null))
);
create unique index if not exists medication_doses_once on public.medication_doses (medication_id, day, scheduled_time) where scheduled_time is not null;
create index if not exists idx_medication_doses_child_day on public.medication_doses (child_id, day);
create index if not exists idx_medication_doses_nursery_day on public.medication_doses (nursery_id, day);
alter table public.medication_doses enable row level security;
drop policy if exists medication_doses_read on public.medication_doses;
create policy medication_doses_read on public.medication_doses for select to authenticated
  using (public.rls_staff_can_access_child(child_id) or public.parent_can_access_child(child_id));

create table if not exists public.medication_reminders (
  medication_id uuid not null references public.child_medications (id) on delete cascade,
  day date not null,
  scheduled_time time not null,
  kind text not null check (kind in ('due', 'overdue')),
  sent_at timestamptz not null default now(),
  primary key (medication_id, day, scheduled_time, kind)
);
alter table public.medication_reminders enable row level security;

-- Whether the caller may record a dose for the child: the staff who look after them (and the
-- nursery's admins and managers), never a parent.
create or replace function public.medication_can_record(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('teacher', 'manager', 'branch_admin', 'chain_super_admin', 'xo_super_admin')
     and public.rls_staff_can_access_child(p_child_id)
$$;
revoke execute on function public.medication_can_record(uuid) from public, anon, authenticated;

-- Records a dose: given, or not given with a reason. A timed dose once a day.
create or replace function public.record_medication_dose(
  p_medication_id uuid, p_scheduled_time time, p_status text, p_skip_reason text default null, p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.child_medications%rowtype;
  v_child public.children%rowtype;
  v_today date;
  v_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_tz text;
begin
  select * into m from public.child_medications where id = p_medication_id;
  if m.id is null or not public.medication_can_record(m.child_id) then
    raise exception 'medication_forbidden' using errcode = '42501';
  end if;
  select * into v_child from public.children where id = m.child_id;
  v_today := public.nursery_today(m.nursery_id);
  v_tz := coalesce((select timezone from public.nursery_settings where nursery_id = m.nursery_id), 'Africa/Cairo');
  if coalesce(p_status, '') not in ('given', 'skipped')
     or (p_status = 'skipped' and coalesce(p_skip_reason, '') not in ('absent', 'refused', 'parent_gave', 'not_needed', 'other'))
     or (p_status = 'skipped' and p_skip_reason = 'other' and v_note is null) then
    raise exception 'medication_invalid' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 200 then
    raise exception 'medication_invalid' using errcode = '22023';
  end if;
  if p_scheduled_time is not null and not (p_scheduled_time = any (m.dose_times)) then
    raise exception 'medication_invalid' using errcode = '22023';
  end if;
  if p_status = 'given' then
    if m.parent_consent_status <> 'granted' then
      raise exception 'medication_no_consent' using errcode = 'P0001';
    end if;
    if not public.medication_active_on(m, v_today) then
      raise exception 'medication_not_active' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.attendance_records ar where ar.child_id = m.child_id and ar.attendance_date = v_today and ar.check_in is not null and ar.check_out is null) then
      raise exception 'medication_child_not_here' using errcode = 'P0001';
    end if;
  end if;
  if p_scheduled_time is not null and exists (
    select 1 from public.medication_doses d where d.medication_id = m.id and d.day = v_today and d.scheduled_time = p_scheduled_time
  ) then
    raise exception 'medication_already_recorded' using errcode = '23505';
  end if;

  insert into public.medication_doses (nursery_id, child_id, medication_id, day, scheduled_time, status, skip_reason, note, recorded_by)
  values (m.nursery_id, m.child_id, m.id, v_today, p_scheduled_time, p_status, case when p_status = 'skipped' then p_skip_reason end, v_note, auth.uid())
  returning id into v_id;

  perform public.notify_users(
    array(select pc.parent_id from public.parent_children pc where pc.child_id = m.child_id),
    m.nursery_id,
    case when p_status = 'given' then 'medication_given' else 'medication_skipped' end,
    case when p_status = 'given' then 'medication_given' else 'medication_skipped' end,
    jsonb_build_object(
      'child', public.i18n_names(v_child.full_name_ar, v_child.full_name_en), 'medicine', m.name,
      'dosage', coalesce(nullif(btrim(m.dosage), ''), m.name), 'time', clock_timestamp(), 'tz', v_tz,
      'reason', jsonb_build_object('i18n', 'medicineRound.reasons.' || coalesce(p_skip_reason, 'other'))
    ),
    '/parent/children/' || m.child_id || '/health', case when p_status = 'given' then 'normal' else 'high' end, null
  );
  return v_id;
end;
$$;
revoke execute on function public.record_medication_dose(uuid, time, text, text, text) from public, anon;
grant execute on function public.record_medication_dose(uuid, time, text, text, text) to authenticated, service_role;

-- Undoes a dose recorded by mistake, the same day; the parents are told.
create or replace function public.undo_medication_dose(p_dose_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.medication_doses%rowtype;
  v_child public.children%rowtype;
  v_name text;
begin
  select * into d from public.medication_doses where id = p_dose_id for update;
  if d.id is null or not public.medication_can_record(d.child_id) then
    raise exception 'medication_forbidden' using errcode = '42501';
  end if;
  if d.day <> public.nursery_today(d.nursery_id) then
    raise exception 'medication_undo_closed' using errcode = 'P0001';
  end if;
  delete from public.medication_doses where id = d.id;
  select * into v_child from public.children where id = d.child_id;
  select name into v_name from public.child_medications where id = d.medication_id;
  perform public.notify_users(
    array(select pc.parent_id from public.parent_children pc where pc.child_id = d.child_id),
    d.nursery_id, 'medication_dose_undone', 'medication_dose_undone',
    jsonb_build_object('child', public.i18n_names(v_child.full_name_ar, v_child.full_name_en), 'medicine', v_name),
    '/parent/children/' || d.child_id || '/health', 'normal', null
  );
end;
$$;
revoke execute on function public.undo_medication_dose(uuid) from public, anon;
grant execute on function public.undo_medication_dose(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------------------------
-- 3. Reminders
create or replace function public.run_medication_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_sent integer := 0;
  v_params jsonb;
begin
  for r in
    select m.id as medication_id, m.child_id, m.nursery_id, m.name, m.dosage, t.dose_time, n.today, n.now_time, n.tz,
           c.full_name_ar, c.full_name_en
      from (
        select ns.nursery_id, coalesce(ns.timezone, 'Africa/Cairo') as tz,
               (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date as today,
               (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::time as now_time
          from public.nursery_settings ns
      ) n
      join public.child_medications m on m.nursery_id = n.nursery_id and cardinality(m.dose_times) > 0
      join public.children c on c.id = m.child_id and c.status = 'active'
      cross join lateral unnest(m.dose_times) as t(dose_time)
      join public.attendance_records ar on ar.child_id = m.child_id and ar.attendance_date = n.today
                                        and ar.check_in is not null and ar.check_out is null
     where public.medication_active_on(m, n.today)
       and n.now_time >= t.dose_time - interval '10 minutes'
       and n.now_time <= t.dose_time + interval '4 hours'
       -- Here by the dose time (a child who came later may have had it at home).
       and (ar.check_in at time zone n.tz)::time <= t.dose_time + interval '30 minutes'
       and not exists (select 1 from public.medication_doses d where d.medication_id = m.id and d.day = n.today and d.scheduled_time = t.dose_time)
  loop
    v_params := jsonb_build_object(
      'child', public.i18n_names(r.full_name_ar, r.full_name_en), 'medicine', r.name, 'dosage', coalesce(nullif(btrim(r.dosage), ''), r.name),
      'time', (r.today + r.dose_time) at time zone r.tz, 'tz', r.tz
    );
    if r.now_time >= r.dose_time + interval '30 minutes' then
      insert into public.medication_reminders (medication_id, day, scheduled_time, kind) values (r.medication_id, r.today, r.dose_time, 'overdue')
      on conflict do nothing;
      if found then
        perform public.notify_child_class_duty(r.child_id, 'medication_overdue', 'medication_overdue', v_params, '/teacher/medicines', 'high');
        perform public.notify_users(
          array(select u.id from public.users u where u.nursery_id = r.nursery_id and u.role in ('branch_admin', 'manager') and coalesce(u.status, 'active') = 'active'),
          r.nursery_id, 'medication_overdue', 'medication_overdue', v_params, '/admin/health/medicines', 'high', null
        );
        v_sent := v_sent + 1;
      end if;
    else
      insert into public.medication_reminders (medication_id, day, scheduled_time, kind) values (r.medication_id, r.today, r.dose_time, 'due')
      on conflict do nothing;
      if found then
        perform public.notify_child_class_duty(r.child_id, 'medication_due', 'medication_due', v_params, '/teacher/medicines', 'high');
        v_sent := v_sent + 1;
      end if;
    end if;
  end loop;
  return v_sent;
end;
$$;
revoke execute on function public.run_medication_reminders() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'medication-reminders';
    perform cron.schedule('medication-reminders', '*/5 * * * *', 'select public.run_medication_reminders()');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- 4. Today's round
create or replace function public.get_medication_round(p_nursery_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_nursery uuid;
  v_today date;
  v_now time;
  v_tz text;
  v_all boolean;
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user.id is null or v_user.role = 'parent' then
    raise exception 'medication_forbidden' using errcode = '42501';
  end if;
  v_nursery := coalesce(p_nursery_id, v_user.nursery_id);
  v_all := public.is_xo_super_admin()
    or (v_user.role in ('branch_admin', 'manager') and v_nursery = v_user.nursery_id)
    or (v_user.role = 'chain_super_admin' and v_nursery in (select public.nursery_ids_for_chain_admin()));
  if not v_all and not (v_user.role = 'teacher' and v_nursery = v_user.nursery_id) then
    raise exception 'medication_forbidden' using errcode = '42501';
  end if;
  v_tz := coalesce((select timezone from public.nursery_settings where nursery_id = v_nursery), 'Africa/Cairo');
  v_today := public.nursery_today(v_nursery);
  v_now := (now() at time zone v_tz)::time;

  return jsonb_build_object(
    'today', v_today,
    'now', to_char(v_now, 'HH24:MI'),
    'tz', v_tz,
    'scope', case when v_all then 'nursery' else 'mine' end,
    'medicines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'medication_id', m.id, 'child_id', c.id, 'name_ar', c.full_name_ar, 'name_en', c.full_name_en,
               'class_ar', cl.name_ar, 'class_en', cl.name_en,
               'here', exists (select 1 from public.attendance_records ar where ar.child_id = c.id and ar.attendance_date = v_today and ar.check_in is not null and ar.check_out is null),
               'medicine', m.name, 'dosage', m.dosage, 'method', m.administration_method, 'instructions', m.administration_times,
               'storage', m.storage_requirements, 'consent', m.parent_consent_status,
               'dose_times', (select coalesce(jsonb_agg(to_char(t, 'HH24:MI') order by t), '[]'::jsonb) from unnest(m.dose_times) t),
               'doses', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', d.id, 'scheduled_time', to_char(d.scheduled_time, 'HH24:MI'), 'status', d.status, 'skip_reason', d.skip_reason,
                          'note', d.note, 'recorded_at', d.recorded_at, 'by_ar', u.name_ar, 'by_en', u.name_en)
                        order by d.recorded_at)
                   from public.medication_doses d
                   left join public.users u on u.id = d.recorded_by
                  where d.medication_id = m.id and d.day = v_today
               ), '[]'::jsonb))
             order by c.full_name_en, m.name)
        from public.child_medications m
        join public.children c on c.id = m.child_id and c.status = 'active' and c.nursery_id = v_nursery
        left join public.classes cl on cl.id = c.class_id
       where public.medication_active_on(m, v_today)
         and (v_all or exists (select 1 from public.class_duty_teachers(c.class_id, v_today) dt where dt.user_id = v_user.id))
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.get_medication_round(uuid) from public, anon;
grant execute on function public.get_medication_round(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------------------------
-- 5. Parents told when a backup covers their child's class
alter table public.nursery_settings add column if not exists notify_parents_of_cover boolean not null default true;

alter table public.class_cover_notices drop constraint if exists class_cover_notices_kind_check;
alter table public.class_cover_notices add constraint class_cover_notices_kind_check check (kind in ('cover', 'uncovered', 'parents'));

create or replace function public.notify_class_cover(p_nursery_id uuid, p_day date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_sent integer := 0;
  v_tz text := coalesce((select timezone from public.nursery_settings where nursery_id = p_nursery_id), 'Africa/Cairo');
  v_tell_parents boolean := coalesce((select notify_parents_of_cover from public.nursery_settings where nursery_id = p_nursery_id), true);
  v_cover_names jsonb;
begin
  for r in
    select cl.id, cl.name_ar, cl.name_en,
           (select d.user_id from public.class_duty_teachers(cl.id, p_day) d where d.covering limit 1) as cover_id,
           (select count(*) from public.class_duty_teachers(cl.id, p_day) d) as on_duty,
           (select public.i18n_names(u.name_ar, u.name_en)
              from public.class_staff cs join public.users u on u.id = cs.user_id
             where cs.class_id = cl.id and cs.role = 'lead' limit 1) as lead_names
      from public.classes cl
     where cl.nursery_id = p_nursery_id
       and cl.deleted_at is null
       and exists (select 1 from public.class_staff cs where cs.class_id = cl.id and public.staff_is_absent(cs.user_id, p_day))
  loop
    if r.cover_id is not null then
      insert into public.class_cover_notices (class_id, day, kind, user_id) values (r.id, p_day, 'cover', r.cover_id)
      on conflict do nothing;
      if found then
        perform public.notify_users(
          array[r.cover_id], p_nursery_id, 'class_cover_today', 'class_cover_today',
          jsonb_build_object('class', public.i18n_names(r.name_ar, r.name_en), 'teacher', coalesce(r.lead_names, '{}'::jsonb), 'date', p_day, 'tz', v_tz),
          '/teacher/classes', 'high', null
        );
        v_sent := v_sent + 1;
      end if;
      if v_tell_parents then
        insert into public.class_cover_notices (class_id, day, kind, user_id) values (r.id, p_day, 'parents', r.cover_id)
        on conflict do nothing;
        if found then
          select public.i18n_names(u.name_ar, u.name_en) into v_cover_names from public.users u where u.id = r.cover_id;
          perform public.notify_users(
            array(select distinct pc.parent_id from public.parent_children pc join public.children c on c.id = pc.child_id
                   where c.class_id = r.id and c.status = 'active'),
            p_nursery_id, 'class_cover_parents', 'class_cover_parents',
            jsonb_build_object('class', public.i18n_names(r.name_ar, r.name_en), 'teacher', v_cover_names, 'date', p_day, 'tz', v_tz),
            '/parent', 'normal', null
          );
        end if;
      end if;
    elsif r.on_duty = 0 and exists (select 1 from public.children c where c.class_id = r.id and c.status = 'active') then
      insert into public.class_cover_notices (class_id, day, kind) values (r.id, p_day, 'uncovered')
      on conflict do nothing;
      if found then
        perform public.notify_users(
          array(select u.id from public.users u where u.nursery_id = p_nursery_id and u.role in ('branch_admin', 'manager') and coalesce(u.status, 'active') = 'active'),
          p_nursery_id, 'class_uncovered', 'class_uncovered',
          jsonb_build_object('class', public.i18n_names(r.name_ar, r.name_en), 'date', p_day, 'tz', v_tz),
          '/admin/staff/absences', 'high', null
        );
        v_sent := v_sent + 1;
      end if;
    end if;
  end loop;
  return v_sent;
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- The health profile: each medicine with its times, its course and today's doses (the rest is unchanged
-- from 20261109000000_child_health_profile.sql).
create or replace function public.get_child_health_profile(p_child_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_access text := public.child_health_access(p_child_id);
  c public.children%rowtype;
  r public.child_health_records%rowtype;
  v_care jsonb;
  v_today date;
begin
  if v_access is null then
    raise exception 'health_forbidden' using errcode = '42501';
  end if;
  select * into c from public.children where id = p_child_id;
  select * into r from public.child_health_records where child_id = p_child_id;
  v_care := case when jsonb_typeof(c.daily_care_preferences) = 'object' then c.daily_care_preferences else '{}'::jsonb end;
  v_today := public.nursery_today(c.nursery_id);

  return jsonb_build_object(
    'viewer', case when v_access = 'parent' then 'parent' else 'staff' end,
    'can_edit', v_access = 'edit',
    'today', v_today,
    'tz', coalesce((select timezone from public.nursery_settings where nursery_id = c.nursery_id), 'Africa/Cairo'),
    'child', jsonb_build_object(
      'id', c.id,
      'nursery_id', c.nursery_id,
      'name_ar', c.full_name_ar,
      'name_en', c.full_name_en,
      'avatar_url', c.avatar_url,
      'dob', c.dob,
      'gender', c.gender,
      'status', c.status,
      'class_name_ar', (select cl.name_ar from public.classes cl where cl.id = c.class_id),
      'class_name_en', (select cl.name_en from public.classes cl where cl.id = c.class_id),
      'blood_type', coalesce(c.blood_type, nullif(btrim(r.blood_type), ''))
    ),
    'record', jsonb_build_object(
      'pediatrician_name', r.pediatrician_name,
      'pediatrician_phone', r.pediatrician_phone,
      'pediatrician_clinic', r.pediatrician_clinic,
      'emergency_contact_name', r.emergency_contact_name,
      'emergency_contact_phone', r.emergency_contact_phone,
      'insurance_provider', r.insurance_provider,
      'insurance_policy_number', r.insurance_policy_number,
      'insurance_notes', r.insurance_notes,
      'updated_at', r.updated_at
    ),
    'parents', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name_ar', u.name_ar, 'name_en', u.name_en, 'phone', u.phone,
               'relationship', coalesce(nullif(pc.relationship, ''), pc.parent_type),
               'is_primary', coalesce(pc.is_primary, false),
               'is_emergency_contact', coalesce(pc.is_emergency_contact, false))
             order by pc.is_primary desc nulls last, u.name_en)
        from public.parent_children pc
        join public.users u on u.id = pc.parent_id
       where pc.child_id = p_child_id
    ), '[]'::jsonb),
    'emergency_contacts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', coalesce(e ->> 'name', e ->> 'full_name'),
               'phone', coalesce(e ->> 'phone', e ->> 'mobile'),
               'relationship', coalesce(e ->> 'relationship', e ->> 'relation')))
        from jsonb_array_elements(case when jsonb_typeof(c.emergency_contacts) = 'array' then c.emergency_contacts else '[]'::jsonb end) e
       where jsonb_typeof(e) = 'object'
    ), '[]'::jsonb),
    'medical_pickups', coalesce((
      select jsonb_agg(jsonb_build_object('name', p.name, 'phone', coalesce(p.mobile_phone, p.phone), 'relation', p.relation) order by p.name)
        from public.authorized_pickups p
       where p.child_id = p_child_id
         and p.active
         and p.can_authorize_medical
         and (p.valid_until is null or p.valid_until >= v_today)
    ), '[]'::jsonb),
    'enrollment', jsonb_build_object(
      'has_allergy', v_care -> 'has_allergy',
      'allergy_types', v_care -> 'allergy_types',
      'food_allergies', coalesce(nullif(btrim(v_care ->> 'food_allergies'), ''),
                                 (select nullif(btrim(d.food_allergies_details), '') from public.child_dietary_preferences d where d.child_id = p_child_id limit 1)),
      'allergy_other_details', v_care ->> 'allergy_other_details',
      'has_medical_condition', v_care -> 'has_medical_condition',
      'medical_condition_details', v_care ->> 'medical_condition_details',
      'health_notes', v_care ->> 'child_behavior_health_notes',
      'medication_consents', v_care -> 'emergency_medications'
    ),
    'allergies', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'allergen_name', a.allergen_name, 'reaction_type', a.reaction_type, 'severity', a.severity,
               'treatment_protocol', a.treatment_protocol, 'last_reaction_date', a.last_reaction_date,
               'food_allergens', to_jsonb(a.food_allergens))
             order by array_position(array['life_threatening', 'severe', 'moderate', 'mild'], a.severity::text), a.allergen_name)
        from public.child_allergies a
       where a.child_id = p_child_id
    ), '[]'::jsonb),
    'conditions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'condition_name', x.condition_name, 'diagnosis_date', x.diagnosis_date, 'severity', x.severity,
               'treatment_protocol', x.treatment_protocol, 'trigger_factors', x.trigger_factors,
               'emergency_response_plan', x.emergency_response_plan)
             order by x.condition_name)
        from public.child_chronic_conditions x
       where x.child_id = p_child_id
    ), '[]'::jsonb),
    'medications', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'name', m.name, 'dosage', m.dosage, 'administration_times', m.administration_times,
               'administration_method', m.administration_method, 'storage_requirements', m.storage_requirements,
               'expiry_date', m.expiry_date, 'parent_consent_status', m.parent_consent_status,
               'dose_times', (select coalesce(jsonb_agg(to_char(t, 'HH24:MI') order by t), '[]'::jsonb) from unnest(m.dose_times) t),
               'starts_on', m.starts_on, 'ends_on', m.ends_on,
               'doses_today', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', d.id, 'scheduled_time', to_char(d.scheduled_time, 'HH24:MI'), 'status', d.status, 'skip_reason', d.skip_reason,
                          'note', d.note, 'recorded_at', d.recorded_at, 'by_ar', du.name_ar, 'by_en', du.name_en)
                        order by d.recorded_at)
                   from public.medication_doses d
                   left join public.users du on du.id = d.recorded_by
                  where d.medication_id = m.id and d.day = v_today
               ), '[]'::jsonb))
             order by m.name)
        from public.child_medications m
       where m.child_id = p_child_id
    ), '[]'::jsonb),
    'vaccinations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id, 'vaccine_name', v.vaccine_name, 'dose_number', v.dose_number,
               'date_administered', v.date_administered, 'next_due_date', v.next_due_date,
               'administered_by', v.administered_by, 'batch_number', v.batch_number)
             order by v.date_administered desc nulls last, v.vaccine_name, v.dose_number)
        from public.child_vaccinations v
       where v.child_id = p_child_id
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'label_ar', d.label_ar, 'label_en', d.label_en, 'storage_path', d.storage_path, 'created_at', d.created_at)
             order by d.created_at desc)
        from public.child_health_documents d
       where d.child_id = p_child_id
    ), '[]'::jsonb)
  );
end;
$$;
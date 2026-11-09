-- Teacher absences and who looks after a class on a day.
--
-- 1. staff_absences: a teacher reports a day or more away (with a reason), or an admin records it.
--    Reported through report_staff_absence / cancel_staff_absence only; the teacher and the
--    nursery's admins and managers read them.
-- 2. class_duty_teachers(class, day): the class's lead and assistants who are not away; when the
--    lead is away (or there is none), its backup teacher if they are not away. Every reminder about a
--    class goes to these people, so a backup gets them only on the days they cover.
-- 3. Cover notices: when a lead is away, the backup is told once that day that they cover the class
--    ("class_cover_today"); a class left with nobody tells the admins ("class_uncovered"). Sent
--    when the absence is reported for today, and each morning from opening time - 90 minutes.
-- 4. The daily report reminder goes to the class's teachers on duty (it went to the lead and the
--    assistants even when they were away, and never to the backup).
-- 5. The late-pickup cap alert goes to the child's teachers on duty and the admins (it went to every
--    teacher of the nursery, with an admin link).
-- 6. Personal reminders fire at the hour of the nursery's time zone (it was always Cairo's).

-- -----------------------------------------------------------------------------------------------
-- 1. Absences
create table if not exists public.staff_absences (
  id uuid primary key default gen_random_uuid(),
  nursery_id uuid not null references public.nurseries (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text not null check (reason in ('sick', 'personal', 'vacation', 'training', 'other')),
  note text check (note is null or char_length(note) <= 300),
  reported_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.users (id) on delete set null,
  constraint staff_absences_dates check (ends_on >= starts_on and ends_on - starts_on <= 60)
);

create index if not exists idx_staff_absences_user on public.staff_absences (user_id, starts_on) where cancelled_at is null;
create index if not exists idx_staff_absences_nursery on public.staff_absences (nursery_id, starts_on);

alter table public.staff_absences enable row level security;
drop policy if exists staff_absences_read on public.staff_absences;
create policy staff_absences_read on public.staff_absences for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_xo_super_admin()
    or (public.current_user_role() in ('branch_admin', 'manager') and nursery_id = public.current_user_nursery_id())
    or (public.current_user_role() = 'chain_super_admin' and nursery_id in (select public.nursery_ids_for_chain_admin()))
  );

-- Whether a person is away on a day.
create or replace function public.staff_is_absent(p_user_id uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_absences a
     where a.user_id = p_user_id and a.cancelled_at is null and p_day between a.starts_on and a.ends_on
  )
$$;

-- -----------------------------------------------------------------------------------------------
-- 2. Who looks after a class on a day
create or replace function public.class_duty_teachers(p_class_id uuid, p_day date)
returns table (user_id uuid, role public.class_staff_role, covering boolean)
language sql
stable
security definer
set search_path = public
as $$
  with team as (
    select cs.user_id, cs.role, public.staff_is_absent(cs.user_id, p_day) as away
      from public.class_staff cs
      join public.users u on u.id = cs.user_id and coalesce(u.status, 'active') = 'active'
     where cs.class_id = p_class_id
  )
  select t.user_id, t.role, false from team t where t.role in ('lead', 'assistant') and not t.away
  union all
  select t.user_id, t.role, true from team t
   where t.role = 'substitute' and not t.away
     and not exists (select 1 from team l where l.role = 'lead' and not l.away)
$$;

revoke execute on function public.staff_is_absent(uuid, date) from public, anon, authenticated;
revoke execute on function public.class_duty_teachers(uuid, date) from public, anon, authenticated;

-- Tells a child's teachers on duty today (no one when the class has none).
create or replace function public.notify_child_class_duty(
  p_child_id uuid, p_type text, p_template_key text, p_params jsonb, p_action_link text, p_urgency text default 'normal'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child public.children%rowtype;
begin
  select * into v_child from public.children where id = p_child_id;
  if v_child.class_id is null then
    return 0;
  end if;
  return public.notify_users(
    array(select d.user_id from public.class_duty_teachers(v_child.class_id, public.nursery_today(v_child.nursery_id)) d),
    v_child.nursery_id, p_type, p_template_key, p_params, p_action_link, p_urgency, null
  );
end;
$$;

revoke execute on function public.notify_child_class_duty(uuid, text, text, jsonb, text, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------------------------
-- 3. Cover notices
create table if not exists public.class_cover_notices (
  class_id uuid not null references public.classes (id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('cover', 'uncovered')),
  user_id uuid references public.users (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (class_id, day, kind)
);
alter table public.class_cover_notices enable row level security;

-- For each class of the nursery with someone away on p_day: tells its backup they cover it, or the
-- admins that nobody does. Once per class, day and kind.
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

revoke execute on function public.notify_class_cover(uuid, date) from public, anon, authenticated;

-- Every 15 minutes: from 90 minutes before opening on a school day, the day's cover notices.
create or replace function public.run_class_cover_notices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_sent integer := 0;
begin
  for r in
    select ns.nursery_id, (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date as today
      from public.nursery_settings ns
     where (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::time
           >= coalesce(ns.standard_start_time, time '08:00') - interval '90 minutes'
  loop
    continue when not public.attendance_is_school_day(r.nursery_id, r.today);
    v_sent := v_sent + public.notify_class_cover(r.nursery_id, r.today);
  end loop;
  return v_sent;
end;
$$;

revoke execute on function public.run_class_cover_notices() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'class-cover-notices';
    perform cron.schedule('class-cover-notices', '*/15 * * * *', 'select public.run_class_cover_notices()');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- Reporting and cancelling an absence

-- The caller's right over a person's absences: 'self', 'admin', or null.
create or replace function public.staff_absence_right(p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_target public.users%rowtype;
  v_role public.user_role := public.current_user_role();
begin
  select * into v_target from public.users where id = p_user_id;
  if v_target.id is null or v_target.role = 'parent' or v_target.nursery_id is null then
    return null;
  end if;
  if p_user_id = auth.uid() then
    return 'self';
  end if;
  if public.is_xo_super_admin()
     or (v_role in ('branch_admin', 'manager') and v_target.nursery_id = public.current_user_nursery_id())
     or (v_role = 'chain_super_admin' and v_target.nursery_id in (select public.nursery_ids_for_chain_admin())) then
    return 'admin';
  end if;
  return null;
end;
$$;

revoke execute on function public.staff_absence_right(uuid) from public, anon, authenticated;

create or replace function public.report_staff_absence(
  p_user_id uuid, p_starts_on date, p_ends_on date, p_reason text, p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target uuid := coalesce(p_user_id, auth.uid());
  v_right text := public.staff_absence_right(v_target);
  v_user public.users%rowtype;
  v_today date;
  v_earliest date;
  v_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_params jsonb;
begin
  if v_right is null then
    raise exception 'absence_forbidden' using errcode = '42501';
  end if;
  select * into v_user from public.users where id = v_target;
  v_today := public.nursery_today(v_user.nursery_id);
  -- A teacher reports from today on; an admin may record up to 30 days back.
  v_earliest := v_today - (case when v_right = 'admin' then 30 else 0 end);
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on or p_ends_on - p_starts_on > 60
     or p_starts_on > v_today + 180
     or p_starts_on < v_earliest then
    raise exception 'absence_invalid_dates' using errcode = '22023';
  end if;
  if coalesce(p_reason, '') not in ('sick', 'personal', 'vacation', 'training', 'other') then
    raise exception 'absence_invalid_reason' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 300 then
    raise exception 'absence_note_too_long' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.staff_absences a
     where a.user_id = v_target and a.cancelled_at is null
       and a.starts_on <= p_ends_on and a.ends_on >= p_starts_on
  ) then
    raise exception 'absence_overlaps' using errcode = '23P01';
  end if;

  insert into public.staff_absences (nursery_id, user_id, starts_on, ends_on, reason, note, reported_by)
  values (v_user.nursery_id, v_target, p_starts_on, p_ends_on, p_reason, v_note, auth.uid())
  returning id into v_id;

  v_params := jsonb_build_object(
    'name', public.i18n_names(v_user.name_ar, v_user.name_en),
    'from_date', p_starts_on, 'to_date', p_ends_on,
    'reason', jsonb_build_object('i18n', 'staffAbsence.reasons.' || p_reason)
  );
  if v_right = 'self' then
    perform public.notify_users(
      array(select u.id from public.users u
             where u.nursery_id = v_user.nursery_id and u.role in ('branch_admin', 'manager')
               and coalesce(u.status, 'active') = 'active' and u.id <> v_target),
      v_user.nursery_id, 'staff_absence_reported', 'staff_absence_reported', v_params, '/admin/staff/absences', 'normal', null
    );
  else
    perform public.notify_users(array[v_target], v_user.nursery_id, 'staff_absence_recorded', 'staff_absence_recorded', v_params, '/teacher/absences', 'normal', null);
  end if;

  if v_today between p_starts_on and p_ends_on then
    perform public.notify_class_cover(v_user.nursery_id, v_today);
  end if;
  return v_id;
end;
$$;

revoke execute on function public.report_staff_absence(uuid, date, date, text, text) from public, anon;
grant execute on function public.report_staff_absence(uuid, date, date, text, text) to authenticated, service_role;

-- Cancels an absence that has not ended; a backup told to cover today is told the lead is back.
create or replace function public.cancel_staff_absence(p_absence_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_absence public.staff_absences%rowtype;
  v_today date;
  r record;
begin
  select * into v_absence from public.staff_absences where id = p_absence_id for update;
  if v_absence.id is null or public.staff_absence_right(v_absence.user_id) is null then
    raise exception 'absence_forbidden' using errcode = '42501';
  end if;
  v_today := public.nursery_today(v_absence.nursery_id);
  if v_absence.cancelled_at is not null or v_absence.ends_on < v_today then
    raise exception 'absence_closed' using errcode = 'P0001';
  end if;
  update public.staff_absences set cancelled_at = now(), cancelled_by = auth.uid() where id = v_absence.id;

  if v_today between v_absence.starts_on and v_absence.ends_on then
    for r in
      select n.class_id, n.user_id, cl.name_ar, cl.name_en
        from public.class_cover_notices n
        join public.class_staff cs on cs.class_id = n.class_id and cs.user_id = v_absence.user_id and cs.role = 'lead'
        join public.classes cl on cl.id = n.class_id
       where n.day = v_today and n.kind = 'cover' and n.user_id is not null
    loop
      perform public.notify_users(
        array[r.user_id], v_absence.nursery_id, 'class_cover_cancelled', 'class_cover_cancelled',
        jsonb_build_object('class', public.i18n_names(r.name_ar, r.name_en)), '/teacher/classes', 'normal', null
      );
      delete from public.class_cover_notices where class_id = r.class_id and day = v_today and kind = 'cover';
    end loop;
  end if;
end;
$$;

revoke execute on function public.cancel_staff_absence(uuid) from public, anon;
grant execute on function public.cancel_staff_absence(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------------------------
-- Reading

-- The caller's absences (the coming ones and the last 90 days) and the classes they cover today.
create or replace function public.get_my_absences()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_today date;
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user.id is null or v_user.role = 'parent' or v_user.nursery_id is null then
    raise exception 'absence_forbidden' using errcode = '42501';
  end if;
  v_today := public.nursery_today(v_user.nursery_id);
  return jsonb_build_object(
    'today', v_today,
    'absences', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'starts_on', a.starts_on, 'ends_on', a.ends_on, 'reason', a.reason, 'note', a.note,
               'cancelled', a.cancelled_at is not null, 'by_self', a.reported_by = a.user_id,
               'by_ar', r.name_ar, 'by_en', r.name_en, 'created_at', a.created_at)
             order by a.starts_on desc)
        from public.staff_absences a
        left join public.users r on r.id = a.reported_by
       where a.user_id = v_user.id and a.ends_on >= v_today - 90
    ), '[]'::jsonb),
    'covering', coalesce((
      select jsonb_agg(jsonb_build_object(
               'class_id', cl.id, 'name_ar', cl.name_ar, 'name_en', cl.name_en,
               'lead_ar', lu.name_ar, 'lead_en', lu.name_en) order by cl.name_en)
        from public.class_staff cs
        join public.classes cl on cl.id = cs.class_id and cl.deleted_at is null
        left join public.class_staff l on l.class_id = cl.id and l.role = 'lead'
        left join public.users lu on lu.id = l.user_id
       where cs.user_id = v_user.id and cs.role = 'substitute'
         and exists (select 1 from public.class_duty_teachers(cl.id, v_today) d where d.user_id = v_user.id and d.covering)
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_my_absences() from public, anon;
grant execute on function public.get_my_absences() to authenticated, service_role;

-- The nursery's absences over a period, its staff (for recording one), and each class's cover today.
create or replace function public.get_staff_absences(p_nursery_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := public.nursery_today(p_nursery_id);
  v_role public.user_role := public.current_user_role();
begin
  if not (
    public.is_xo_super_admin()
    or (v_role in ('branch_admin', 'manager') and p_nursery_id = public.current_user_nursery_id())
    or (v_role = 'chain_super_admin' and p_nursery_id in (select public.nursery_ids_for_chain_admin()))
  ) then
    raise exception 'absence_forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'absence_invalid_dates' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'today', v_today,
    'absences', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'user_id', a.user_id, 'name_ar', u.name_ar, 'name_en', u.name_en, 'role', u.role,
               'starts_on', a.starts_on, 'ends_on', a.ends_on, 'reason', a.reason, 'note', a.note,
               'cancelled', a.cancelled_at is not null, 'by_self', a.reported_by = a.user_id,
               'by_ar', r.name_ar, 'by_en', r.name_en, 'created_at', a.created_at)
             order by a.starts_on desc, u.name_en)
        from public.staff_absences a
        join public.users u on u.id = a.user_id
        left join public.users r on r.id = a.reported_by
       where a.nursery_id = p_nursery_id and a.starts_on <= p_to and a.ends_on >= p_from
    ), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'name_ar', u.name_ar, 'name_en', u.name_en, 'role', u.role) order by u.name_en)
        from public.users u
       where u.nursery_id = p_nursery_id and u.role in ('teacher', 'manager', 'branch_admin')
         and coalesce(u.status, 'active') = 'active'
    ), '[]'::jsonb),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'class_id', cl.id, 'name_ar', cl.name_ar, 'name_en', cl.name_en,
               'children', (select count(*) from public.children c where c.class_id = cl.id and c.status = 'active'),
               'lead', (select jsonb_build_object('id', u.id, 'name_ar', u.name_ar, 'name_en', u.name_en, 'away', public.staff_is_absent(u.id, v_today))
                          from public.class_staff cs join public.users u on u.id = cs.user_id
                         where cs.class_id = cl.id and cs.role = 'lead' limit 1),
               'backup', (select jsonb_build_object('id', u.id, 'name_ar', u.name_ar, 'name_en', u.name_en, 'away', public.staff_is_absent(u.id, v_today))
                            from public.class_staff cs join public.users u on u.id = cs.user_id
                           where cs.class_id = cl.id and cs.role = 'substitute' limit 1),
               'on_duty', (select count(*) from public.class_duty_teachers(cl.id, v_today)),
               'covered_by_backup', exists (select 1 from public.class_duty_teachers(cl.id, v_today) d where d.covering))
             order by cl.name_en)
        from public.classes cl
       where cl.nursery_id = p_nursery_id and cl.deleted_at is null
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_staff_absences(uuid, date, date) from public, anon;
grant execute on function public.get_staff_absences(uuid, date, date) to authenticated, service_role;

-- -----------------------------------------------------------------------------------------------
-- 4. The daily report reminder goes to the class's teachers on duty
create or replace function public.run_daily_report_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sent integer := 0;
  r record;
begin
  for r in
    with days as (
      select ns.nursery_id, coalesce(ns.timezone, 'Africa/Cairo') as tz,
             (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date as today,
             coalesce(ns.end_of_day_checklist_time, ns.standard_end_time, time '17:00') as due_time
      from public.nursery_settings ns
    ),
    open_days as (
      select d.* from days d
      where (now() at time zone d.tz)::time >= d.due_time - interval '60 minutes'
        and public.attendance_is_school_day(d.nursery_id, d.today)
    ),
    pending as (
      select duty.user_id as teacher_id, d.nursery_id, d.today, d.tz, d.due_time, count(distinct c.id)::integer as pending
      from open_days d
      join public.classes cl on cl.nursery_id = d.nursery_id and cl.deleted_at is null
      cross join lateral public.class_duty_teachers(cl.id, d.today) duty
      join public.children c on c.class_id = cl.id and c.status = 'active'
      join public.attendance_records ar on ar.child_id = c.id and ar.attendance_date = d.today and ar.check_in is not null
      where not exists (
        select 1 from public.daily_reports dr where dr.child_id = c.id and dr.report_date = d.today and dr.status = 'published'
      )
      group by duty.user_id, d.nursery_id, d.today, d.tz, d.due_time
    )
    select p.* from pending p
    where not exists (select 1 from public.daily_report_reminders x where x.teacher_id = p.teacher_id and x.day = p.today)
  loop
    insert into public.daily_report_reminders (teacher_id, day, nursery_id, pending)
    values (r.teacher_id, r.today, r.nursery_id, r.pending)
    on conflict do nothing;
    if found then
      insert into public.notifications (nursery_id, user_id, type, channel, template_key, template_params, action_link, urgency)
      values (
        r.nursery_id, r.teacher_id, 'daily_report_reminder', 'in_app', 'daily_report_reminder',
        jsonb_build_object('count', r.pending, 'due_time', (r.today + r.due_time) at time zone r.tz, 'tz', r.tz),
        '/teacher/daily-reports', 'high'
      );
      v_sent := v_sent + 1;
    end if;
  end loop;
  return v_sent;
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- 6. Personal reminders at the nursery's own hour
create or replace function public.run_personal_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer := 0;
begin
  with due as (
    select pr.*
      from public.personal_reminders pr
      left join public.nursery_settings ns on ns.nursery_id = pr.nursery_id
     where pr.active
       and extract(dow from now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::smallint = any (pr.days_of_week)
       and extract(hour from now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::smallint = any (pr.hours_of_day)
       and (pr.last_fired_at is null or pr.last_fired_at < date_trunc('hour', now()))
  ),
  sent as (
    insert into public.notifications
      (nursery_id, user_id, type, title_ar, title_en, body_ar, body_en, read, channel, sent_at, action_link)
    select d.nursery_id, d.user_id, 'personal_reminder', d.name, d.name,
           coalesce(nullif(d.description, ''), d.name), coalesce(nullif(d.description, ''), d.name),
           false, 'in_app', now(),
           case when d.audience = 'teacher' then '/teacher/reminders' else '/admin/reminders' end
      from due d
    returning 1
  ),
  -- Fired; a one-time reminder (repeats = false) is switched off so it never fires again.
  marked as (
    update public.personal_reminders pr
       set last_fired_at = now(), active = case when pr.repeats then pr.active else false end
      from due d
     where pr.id = d.id
    returning 1
  )
  select count(*) into inserted from sent;
  return inserted;
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- 5. The late-pickup cap alert: the admins and the child's teachers on duty (the rest of the body is
-- unchanged from the live definition).
create or replace function public.apply_attendance_late_charge(p_attendance_id uuid, p_as_of timestamp with time zone, p_source text, p_finalize boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_child_names jsonb;
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

  -- Nothing late yet: leave the row untouched (the sweep checks open days every 15 minutes).
  if v_target = 0 and coalesce(v_att.extra_hours, 0) = 0 and not p_finalize then
    return jsonb_build_object('skipped', true, 'reason', 'not_late', 'late_minutes', v_calc.late_minutes);
  end if;

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

  v_child_names := public.i18n_names(v_child.full_name_ar, v_child.full_name_en);

  -- While the child is still here, tell the parents each time more extra time is charged.
  -- (A real checkout reports the final amount in its own pickup notification.)
  if p_source = 'sweep' and v_delta > 0 then
    perform public.attendance_notify_parents(
      v_child.id,
      'extra_hours_accruing',
      'extra_hours_accruing',
      jsonb_build_object(
        'child', v_child_names,
        'hours', v_total_hours,
        'covered', v_total_covered,
        'fee', v_total_fee,
        'currency', coalesce(v_ns.currency, 'EGP'),
        'segments', case when v_total_covered > 0 then '["covered", "fee"]'::jsonb else '["fee"]'::jsonb end
      ),
      '/parent/attendance',
      'high'
    );
  end if;

  if v_newly_capped then
    perform public.attendance_notify_staff(
      v_child.nursery_id,
      array['branch_admin', 'manager']::public.user_role[],
      'late_pickup_cap_reached',
      'late_pickup_cap_reached',
      jsonb_build_object('child', v_child_names, 'cap', v_cap),
      '/admin/attendance',
      'high'
    );
    -- The child's own teachers on duty, not every teacher of the nursery.
    perform public.notify_child_class_duty(
      v_child.id, 'late_pickup_cap_reached', 'late_pickup_cap_reached',
      jsonb_build_object('child', v_child_names, 'cap', v_cap), '/teacher/attendance', 'high'
    );
    perform public.attendance_notify_parents(
      v_child.id,
      'late_pickup_cap_reached',
      'late_pickup_cap_reached_parent',
      jsonb_build_object('child', v_child_names, 'cap', v_cap),
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
$function$;

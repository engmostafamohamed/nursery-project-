-- The daily report, filled in during the day and sent at its end.
--
-- 1. Seven required questions: breakfast, lunch, snack, nap (no nap, or how long and how well),
--    mood, toilet (how many times, 0 included) and activities. daily_report_missing() lists the ones
--    not answered yet; a report is sent to the family only with none missing, whatever the way it
--    is sent (a trigger checks it too).
-- 2. The teacher saves as they go (save_daily_report, each change) and sends at the end of the day
--    (send_daily_reports, one or many at once; the incomplete ones are refused with what they miss).
--    A teacher works only on the children of their own classes; a sent report no longer changes.
--    The family is told (daily_report_sent). All of a teacher's writes go through these functions.
-- 3. get_my_daily_reports: the teacher's day, child by child: came or not, how far the report is,
--    when it was last saved, sent or not, and when reports are due.
-- 4. A reminder: from an hour before the nursery's end-of-day time, each teacher with children who
--    came and have no sent report is told once a day (run_daily_report_reminders, every 15 minutes).
-- 5. get_daily_report_stats: for the admin and the head of teachers, over any period and by class or
--    teacher: reports expected (one per child who came), sent, sent on the day, late, missing, the
--    send rate, by teacher, class, day and child, and the missing reports themselves.

alter table public.daily_reports
  add column if not exists submitted_by uuid references public.users(id) on delete set null,
  add column if not exists last_saved_at timestamptz,
  add column if not exists last_saved_by uuid references public.users(id) on delete set null;

-- -----------------------------------------------------------------------------------------------
-- 1. The required questions
create or replace function public.daily_report_missing(p_meals jsonb, p_nap jsonb, p_mood jsonb, p_toilet jsonb, p_activities jsonb)
returns text[]
language sql
immutable
as $$
  select array_remove(array[
    case when coalesce(p_meals -> 'breakfast' ->> 'amount', '') in ('none', 'some', 'all') then null else 'breakfast' end,
    case when coalesce(p_meals -> 'lunch' ->> 'amount', '') in ('none', 'some', 'all') then null else 'lunch' end,
    case when coalesce(p_meals -> 'snacks' ->> 'amount', '') in ('none', 'some', 'all') then null else 'snacks' end,
    case
      when p_nap -> 'napped' = 'false'::jsonb then null
      when p_nap -> 'napped' = 'true'::jsonb
        and (case when jsonb_typeof(p_nap -> 'duration_minutes') = 'number' then (p_nap ->> 'duration_minutes')::numeric > 0 else false end)
        and coalesce(p_nap ->> 'quality', '') in ('good', 'ok', 'restless') then null
      else 'nap'
    end,
    case when coalesce(p_mood ->> 'mood', '') in ('happy', 'content', 'fussy', 'cranky') then null else 'mood' end,
    case when (case when jsonb_typeof(p_toilet -> 'change_count') = 'number' then (p_toilet ->> 'change_count')::numeric >= 0 else false end)
      then null else 'toilet' end,
    case when (case when jsonb_typeof(p_activities -> 'tags') = 'array' then jsonb_array_length(p_activities -> 'tags') > 0 else false end)
           or btrim(coalesce(p_activities ->> 'free_text', '')) <> ''
      then null else 'activities' end
  ], null)
$$;

-- However a report is sent, it must be complete.
create or replace function public.daily_reports_check_complete()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published')
     and cardinality(public.daily_report_missing(new.meals_json, new.nap_json, new.mood_json, new.toilet_json, new.activities_json)) > 0 then
    raise exception 'daily_report_incomplete' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_daily_reports_check_complete on public.daily_reports;
create trigger trg_daily_reports_check_complete
  before insert or update of status on public.daily_reports
  for each row execute function public.daily_reports_check_complete();

-- Teachers write through the functions below (their class, complete before sending). The nursery's
-- admins keep their own policies (reports_branch_all, reports_chain_all).
drop policy if exists teachers_can_insert_reports_for_their_nursery on public.daily_reports;
drop policy if exists teachers_can_update_reports_for_their_nursery on public.daily_reports;

-- -----------------------------------------------------------------------------------------------
-- 2. Saving and sending

-- Who may write a child's report: their class's teachers, the nursery's admin (and managers with
-- the daily reports permission), chain and XO admins. Returns the child.
create or replace function public.daily_report_guard(p_child_id uuid)
returns public.children
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_me public.users%rowtype;
  v_child public.children%rowtype;
begin
  if v_uid is null then
    raise exception 'daily_report_not_authenticated' using errcode = '28000';
  end if;
  select * into v_child from public.children where id = p_child_id;
  if not found then
    raise exception 'daily_report_child_not_found' using errcode = '22023';
  end if;
  select * into v_me from public.users where id = v_uid;
  if v_me.role = 'xo_super_admin' then
    return v_child;
  end if;
  if v_me.role = 'chain_super_admin'
     and exists (select 1 from public.nurseries n where n.id = v_child.nursery_id and n.chain_id is not null and n.chain_id = v_me.chain_id) then
    return v_child;
  end if;
  if v_me.nursery_id is distinct from v_child.nursery_id then
    raise exception 'daily_report_forbidden' using errcode = '42501';
  end if;
  if v_me.role = 'branch_admin' then
    return v_child;
  end if;
  if v_me.role = 'teacher' then
    if exists (select 1 from public.class_staff cs where cs.user_id = v_uid and cs.class_id = v_child.class_id) then
      return v_child;
    end if;
    raise exception 'daily_report_child_not_in_your_class' using errcode = '42501';
  end if;
  if v_me.role = 'manager' and public.user_can('daily_reports', 'update') then
    return v_child;
  end if;
  raise exception 'daily_report_forbidden' using errcode = '42501';
end;
$$;

revoke execute on function public.daily_report_guard(uuid) from public, anon, authenticated;

-- The nursery's today, and when the day's reports are due (its end-of-day time, else closing, else 17:00).
create or replace function public.daily_report_due(p_nursery_id uuid, p_day date)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select (p_day + coalesce(ns.end_of_day_checklist_time, ns.standard_end_time, time '17:00')) at time zone coalesce(ns.timezone, 'Africa/Cairo')
  from (select 1) one
  left join public.nursery_settings ns on ns.nursery_id = p_nursery_id
$$;

create or replace function public.save_daily_report(p_child_id uuid, p_report_date date, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child public.children%rowtype;
  v_today date;
  v_row public.daily_reports%rowtype;
  v_missing text[];
begin
  v_child := public.daily_report_guard(p_child_id);
  select (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date into v_today
  from public.nursery_settings ns where ns.nursery_id = v_child.nursery_id;
  v_today := coalesce(v_today, (now() at time zone 'Africa/Cairo')::date);
  -- Today, or one of the last seven days (a report finished the next morning).
  if p_report_date is null or p_report_date > v_today or p_report_date < v_today - 7 then
    raise exception 'daily_report_date_invalid' using errcode = '22023';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'daily_report_answers_invalid' using errcode = '22023';
  end if;

  select * into v_row from public.daily_reports where child_id = p_child_id and report_date = p_report_date for update;
  if found and v_row.status = 'published' then
    raise exception 'daily_report_already_sent' using errcode = '22023';
  end if;

  insert into public.daily_reports (
    child_id, report_date, nursery_id, teacher_id, status,
    meals_json, nap_json, mood_json, toilet_json, activities_json, feeding_json, special_notes,
    last_saved_at, last_saved_by
  )
  values (
    p_child_id, p_report_date, v_child.nursery_id, auth.uid(), 'draft',
    coalesce(p_answers -> 'meals', '{}'::jsonb), coalesce(p_answers -> 'nap', '{}'::jsonb), coalesce(p_answers -> 'mood', '{}'::jsonb),
    coalesce(p_answers -> 'toilet', '{}'::jsonb), coalesce(p_answers -> 'activities', '{}'::jsonb), coalesce(p_answers -> 'feeding', '{}'::jsonb),
    nullif(btrim(coalesce(p_answers ->> 'special_notes', '')), ''),
    now(), auth.uid()
  )
  on conflict (child_id, report_date) do update set
    meals_json = excluded.meals_json,
    nap_json = excluded.nap_json,
    mood_json = excluded.mood_json,
    toilet_json = excluded.toilet_json,
    activities_json = excluded.activities_json,
    feeding_json = excluded.feeding_json,
    special_notes = excluded.special_notes,
    nursery_id = excluded.nursery_id,
    last_saved_at = now(),
    last_saved_by = auth.uid()
  returning * into v_row;

  v_missing := public.daily_report_missing(v_row.meals_json, v_row.nap_json, v_row.mood_json, v_row.toilet_json, v_row.activities_json);
  return jsonb_build_object(
    'id', v_row.id, 'status', v_row.status, 'answered', 7 - cardinality(v_missing), 'required', 7,
    'missing', to_jsonb(v_missing), 'last_saved_at', v_row.last_saved_at
  );
end;
$$;

-- Sends the chosen reports to the families. A report that is not complete stays a draft and is
-- returned with what it misses; one already sent is skipped.
create or replace function public.send_daily_reports(p_report_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_row public.daily_reports%rowtype;
  v_child public.children%rowtype;
  v_missing text[];
  v_sent uuid[] := '{}';
  v_incomplete jsonb := '[]'::jsonb;
  v_already integer := 0;
begin
  if auth.uid() is null then
    raise exception 'daily_report_not_authenticated' using errcode = '28000';
  end if;
  if p_report_ids is null or cardinality(p_report_ids) = 0 or cardinality(p_report_ids) > 300 then
    raise exception 'daily_report_none_selected' using errcode = '22023';
  end if;

  foreach v_id in array array(select distinct x from unnest(p_report_ids) x where x is not null) loop
    select * into v_row from public.daily_reports where id = v_id for update;
    if not found then
      continue;
    end if;
    v_child := public.daily_report_guard(v_row.child_id);
    if v_row.status = 'published' then
      v_already := v_already + 1;
      continue;
    end if;
    v_missing := public.daily_report_missing(v_row.meals_json, v_row.nap_json, v_row.mood_json, v_row.toilet_json, v_row.activities_json);
    if cardinality(v_missing) > 0 then
      v_incomplete := v_incomplete || jsonb_build_array(jsonb_build_object('id', v_id, 'child_id', v_row.child_id, 'missing', to_jsonb(v_missing)));
      continue;
    end if;

    update public.daily_reports
       set status = 'published', published_at = now(), submitted_by = auth.uid()
     where id = v_id;
    v_sent := v_sent || v_id;

    insert into public.notifications (nursery_id, user_id, type, channel, template_key, template_params, action_link)
    select
      v_row.nursery_id, pc.parent_id, 'daily_report', 'in_app', 'daily_report_sent',
      jsonb_build_object(
        'child', jsonb_build_object('ar', coalesce(nullif(v_child.full_name_ar, ''), v_child.full_name_en), 'en', coalesce(nullif(v_child.full_name_en, ''), v_child.full_name_ar)),
        'date', v_row.report_date
      ),
      '/parent/daily-reports?child=' || v_row.child_id || '&date=' || v_row.report_date
    from public.parent_children pc
    join public.users u on u.id = pc.parent_id and u.role = 'parent'
    where pc.child_id = v_row.child_id;
  end loop;

  return jsonb_build_object('sent', to_jsonb(v_sent), 'sent_count', cardinality(v_sent), 'incomplete', v_incomplete, 'already_sent', v_already);
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- 3. The teacher's day, child by child
create or replace function public.get_my_daily_reports(p_day date default null)
returns table (
  child_id uuid,
  full_name_ar text,
  full_name_en text,
  child_code text,
  avatar_url text,
  dob date,
  class_id uuid,
  class_name_ar text,
  class_name_en text,
  day date,
  -- present | partial (still here) | absent | excused | off | not_enrolled
  attendance text,
  check_in timestamptz,
  check_out timestamptz,
  report_id uuid,
  -- none | draft | published
  status text,
  answered integer,
  required integer,
  missing text[],
  last_saved_at timestamptz,
  published_at timestamptz,
  due_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_nursery uuid;
  v_today date;
  v_day date;
begin
  if auth.uid() is null then
    raise exception 'daily_report_not_authenticated' using errcode = '28000';
  end if;
  select u.nursery_id into v_nursery from public.users u where u.id = auth.uid();
  select (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date into v_today from public.nursery_settings ns where ns.nursery_id = v_nursery;
  v_today := coalesce(v_today, (now() at time zone 'Africa/Cairo')::date);
  v_day := coalesce(p_day, v_today);
  if v_day > v_today or v_day < v_today - 30 then
    raise exception 'daily_report_date_invalid' using errcode = '22023';
  end if;

  return query
  select
    c.id,
    c.full_name_ar,
    c.full_name_en,
    c.child_id_number,
    c.avatar_url,
    c.dob,
    cl.id,
    cl.name_ar,
    cl.name_en,
    v_day,
    case
      when ar.check_in is not null and ar.check_out is not null then 'present'
      when ar.check_in is not null then 'partial'
      when coalesce(c.enrollment_date, c.created_at::date) > v_day then 'not_enrolled'
      when exists (select 1 from public.attendance_absence_reports abr where abr.child_id = c.id and abr.absence_date = v_day) then 'excused'
      when not public.attendance_is_school_day(c.nursery_id, v_day) then 'off'
      else 'absent'
    end,
    ar.check_in,
    ar.check_out,
    dr.id,
    coalesce(dr.status, 'none'),
    case when dr.id is null then 0 else 7 - cardinality(public.daily_report_missing(dr.meals_json, dr.nap_json, dr.mood_json, dr.toilet_json, dr.activities_json)) end,
    7,
    case when dr.id is null then array['breakfast', 'lunch', 'snacks', 'nap', 'mood', 'toilet', 'activities']
         else public.daily_report_missing(dr.meals_json, dr.nap_json, dr.mood_json, dr.toilet_json, dr.activities_json) end,
    coalesce(dr.last_saved_at, dr.updated_at),
    dr.published_at,
    public.daily_report_due(c.nursery_id, v_day)
  from (select distinct cs.class_id from public.class_staff cs where cs.user_id = auth.uid()) mine
  join public.classes cl on cl.id = mine.class_id and cl.deleted_at is null
  join public.children c on c.class_id = cl.id and c.status = 'active'
  left join public.attendance_records ar on ar.child_id = c.id and ar.attendance_date = v_day
  left join public.daily_reports dr on dr.child_id = c.id and dr.report_date = v_day
  order by cl.name_en, c.full_name_en, c.full_name_ar;
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- 4. The end-of-day reminder
create table if not exists public.daily_report_reminders (
  teacher_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  nursery_id uuid not null references public.nurseries(id) on delete cascade,
  pending integer not null,
  sent_at timestamptz not null default now(),
  primary key (teacher_id, day)
);
alter table public.daily_report_reminders enable row level security;

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
      select cs.user_id as teacher_id, d.nursery_id, d.today, d.tz, d.due_time, count(distinct c.id)::integer as pending
      from open_days d
      join public.classes cl on cl.nursery_id = d.nursery_id and cl.deleted_at is null
      join public.class_staff cs on cs.class_id = cl.id and cs.role in ('lead', 'assistant')
      join public.children c on c.class_id = cl.id and c.status = 'active'
      join public.attendance_records ar on ar.child_id = c.id and ar.attendance_date = d.today and ar.check_in is not null
      where not exists (
        select 1 from public.daily_reports dr where dr.child_id = c.id and dr.report_date = d.today and dr.status = 'published'
      )
      group by cs.user_id, d.nursery_id, d.today, d.tz, d.due_time
    )
    select p.* from pending p
    join public.users u on u.id = p.teacher_id and coalesce(u.status, 'active') = 'active'
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

revoke execute on function public.run_daily_report_reminders() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('daily-report-reminders');
exception when others then null;
end $$;
select cron.schedule('daily-report-reminders', '*/15 * * * *', $$select public.run_daily_report_reminders()$$);

-- -----------------------------------------------------------------------------------------------
-- 5. The send rate, for the admin and the head of teachers
create or replace function public.get_daily_report_stats(
  p_nursery_id uuid,
  p_from date,
  p_to date,
  p_class_id uuid default null,
  p_teacher_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_to date;
  v_tz text;
  v_result jsonb;
begin
  perform public.class_team_guard(p_nursery_id, 'view');
  v_to := public.attendance_period_end(p_nursery_id, p_from, p_to);
  select coalesce(ns.timezone, 'Africa/Cairo') into v_tz from public.nursery_settings ns where ns.nursery_id = p_nursery_id;
  v_tz := coalesce(v_tz, 'Africa/Cairo');

  with classes_in as (
    select cl.id, cl.name_ar, cl.name_en,
           (select cs.user_id from public.class_staff cs where cs.class_id = cl.id and cs.role = 'lead' limit 1) as lead_id
    from public.classes cl
    where cl.nursery_id = p_nursery_id and cl.deleted_at is null
      and (p_class_id is null or cl.id = p_class_id)
      and (p_teacher_id is null or exists (select 1 from public.class_staff cs where cs.class_id = cl.id and cs.user_id = p_teacher_id))
  ),
  -- One report is expected per child who came, per day.
  expected as (
    select ar.child_id, ar.attendance_date as day, c.class_id, c.full_name_ar, c.full_name_en, c.child_id_number
    from public.attendance_records ar
    join public.children c on c.id = ar.child_id
    join classes_in ci on ci.id = c.class_id
    where c.nursery_id = p_nursery_id and c.status = 'active'
      and ar.check_in is not null and ar.attendance_date between p_from and v_to
  ),
  joined as (
    select e.*, dr.id as report_id, dr.status, dr.published_at, dr.submitted_by,
           coalesce(dr.status = 'published', false) as sent,
           coalesce(dr.status = 'published' and (dr.published_at at time zone v_tz)::date <= e.day, false) as on_time,
           case when dr.id is null then 0
                else 7 - cardinality(public.daily_report_missing(dr.meals_json, dr.nap_json, dr.mood_json, dr.toilet_json, dr.activities_json)) end as answered
    from expected e
    left join public.daily_reports dr on dr.child_id = e.child_id and dr.report_date = e.day
  ),
  rated as (
    select j.*, ci.name_ar as class_ar, ci.name_en as class_en, ci.lead_id
    from joined j join classes_in ci on ci.id = j.class_id
  )
  select jsonb_build_object(
    'from', p_from,
    'to', v_to,
    'totals', (
      select jsonb_build_object(
        'expected', count(*),
        'sent', count(*) filter (where sent),
        'on_time', count(*) filter (where on_time),
        'late', count(*) filter (where sent and not on_time),
        'missing', count(*) filter (where not sent),
        'drafts', count(*) filter (where status = 'draft'),
        'rate', case when count(*) > 0 then round(count(*) filter (where sent) * 100.0 / count(*), 1) end,
        'on_time_rate', case when count(*) > 0 then round(count(*) filter (where on_time) * 100.0 / count(*), 1) end,
        'avg_completion', case when count(*) > 0 then round(avg(answered) * 100.0 / 7, 1) end
      ) from rated
    ),
    'by_class', coalesce((
      select jsonb_agg(x order by x->>'name_en') from (
        select jsonb_build_object(
          'class_id', ci.id, 'name_ar', ci.name_ar, 'name_en', ci.name_en,
          'lead_ar', public.attendance_user_name(ci.lead_id, 'ar'), 'lead_en', public.attendance_user_name(ci.lead_id, 'en'),
          'expected', count(r.child_id), 'sent', count(r.child_id) filter (where r.sent),
          'on_time', count(r.child_id) filter (where r.on_time), 'missing', count(r.child_id) filter (where not r.sent),
          'rate', case when count(r.child_id) > 0 then round(count(r.child_id) filter (where r.sent) * 100.0 / count(r.child_id), 1) end
        ) as x
        from classes_in ci left join rated r on r.class_id = ci.id
        group by ci.id, ci.name_ar, ci.name_en, ci.lead_id
      ) s
    ), '[]'::jsonb),
    'by_teacher', coalesce((
      select jsonb_agg(x order by (x->>'rate')::numeric nulls last, x->>'name_en') from (
        select jsonb_build_object(
          'teacher_id', u.id, 'name_ar', u.name_ar, 'name_en', u.name_en,
          'classes_ar', string_agg(distinct coalesce(nullif(ci.name_ar, ''), ci.name_en), '، '),
          'classes_en', string_agg(distinct coalesce(nullif(ci.name_en, ''), ci.name_ar), ', '),
          'expected', count(r.child_id), 'sent', count(r.child_id) filter (where r.sent),
          'on_time', count(r.child_id) filter (where r.on_time), 'missing', count(r.child_id) filter (where not r.sent),
          'rate', case when count(r.child_id) > 0 then round(count(r.child_id) filter (where r.sent) * 100.0 / count(r.child_id), 1) end,
          'sent_by_them', (select count(*) from rated r2 where r2.submitted_by = u.id)
        ) as x
        from classes_in ci
        join public.users u on u.id = ci.lead_id
        left join rated r on r.class_id = ci.id
        group by u.id, u.name_ar, u.name_en
      ) s
    ), '[]'::jsonb),
    'by_day', coalesce((
      select jsonb_agg(jsonb_build_object(
               'day', day, 'expected', n, 'sent', sent_n, 'on_time', on_time_n,
               'rate', case when n > 0 then round(sent_n * 100.0 / n, 1) else 0 end) order by day desc)
      from (
        select day, count(*) as n, count(*) filter (where sent) as sent_n, count(*) filter (where on_time) as on_time_n
        from rated group by day
      ) d
    ), '[]'::jsonb),
    'children', coalesce((
      select jsonb_agg(x order by (x->>'missing')::int desc, x->>'name_en') from (
        select jsonb_build_object(
          'child_id', child_id, 'name_ar', max(full_name_ar), 'name_en', max(full_name_en), 'code', max(child_id_number),
          'class_ar', max(class_ar), 'class_en', max(class_en),
          'expected', count(*), 'sent', count(*) filter (where sent), 'missing', count(*) filter (where not sent),
          'rate', round(count(*) filter (where sent) * 100.0 / count(*), 1)
        ) as x
        from rated group by child_id
        order by count(*) filter (where not sent) desc, max(full_name_en)
        limit 500
      ) s
    ), '[]'::jsonb),
    'missing', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object(
          'day', day, 'child_id', child_id, 'name_ar', full_name_ar, 'name_en', full_name_en, 'code', child_id_number,
          'class_ar', class_ar, 'class_en', class_en,
          'lead_ar', public.attendance_user_name(lead_id, 'ar'), 'lead_en', public.attendance_user_name(lead_id, 'en'),
          'status', coalesce(status, 'none'), 'answered', answered
        ) as x
        from rated where not sent
        order by day desc, class_en, full_name_en
        limit 300
      ) s
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.save_daily_report(uuid, date, jsonb) from public, anon;
revoke execute on function public.send_daily_reports(uuid[]) from public, anon;
revoke execute on function public.get_my_daily_reports(date) from public, anon;
revoke execute on function public.get_daily_report_stats(uuid, date, date, uuid, uuid) from public, anon;
revoke execute on function public.daily_report_due(uuid, date) from public, anon;
grant execute on function public.save_daily_report(uuid, date, jsonb) to authenticated, service_role;
grant execute on function public.send_daily_reports(uuid[]) to authenticated, service_role;
grant execute on function public.get_my_daily_reports(date) to authenticated, service_role;
grant execute on function public.get_daily_report_stats(uuid, date, date, uuid, uuid) to authenticated, service_role;
grant execute on function public.daily_report_due(uuid, date) to authenticated, service_role;

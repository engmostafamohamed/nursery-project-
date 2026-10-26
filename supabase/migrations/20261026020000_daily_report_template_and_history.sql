-- The daily report as the family receives it, prepared each morning, and its history.
--
-- 1. Meals are answered in quarters of the plate: none, quarter, half, three_quarters or all
--    ('some' stays valid for the reports written before).
-- 2. Each report keeps the child's data of its day (code and class) and who sent it (name, role,
--    the title the nursery gave them, department, place in the class), so the history reads as it
--    was even after the child moves up a class or the teacher leaves. Reports written before this
--    have none of it; the readers below fall back to the child's and the sender's current data.
-- 3. At the nursery's opening time the day's reports are prepared, one per active child of a
--    class, with the child's data (prepare_daily_reports, every 15 minutes). A prepared report
--    nobody has saved yet counts as not started: get_my_daily_reports and get_daily_report_stats
--    read it as no report, so a child who stays home is never counted as expected.
-- 4. Reading: get_parent_daily_reports (a parent's sent reports, with the child's data and the
--    sender), get_daily_report_history (the sent reports of a teacher's classes, or of the nursery
--    for its admins, by day or period, class, and child name or code) and get_daily_report (one
--    report, now with the child's data and the sender).
-- 5. The family's notice names the sender (template daily_report_sent_by).

alter table public.daily_reports
  add column if not exists child_code text,
  add column if not exists class_id uuid references public.classes(id) on delete set null,
  add column if not exists class_name_ar text,
  add column if not exists class_name_en text,
  add column if not exists prepared_at timestamptz,
  add column if not exists sender_name_ar text,
  add column if not exists sender_name_en text,
  add column if not exists sender_role public.user_role,
  add column if not exists sender_role_title_ar text,
  add column if not exists sender_role_title_en text,
  add column if not exists sender_department public.user_department,
  add column if not exists sender_class_role public.class_staff_role;

create index if not exists idx_daily_reports_class_day on public.daily_reports (class_id, report_date desc);
create index if not exists idx_daily_reports_sent_by_day on public.daily_reports (nursery_id, report_date desc) where status = 'published';

-- A report the system prepared that nobody has saved since: read as no report yet.
create or replace function public.daily_report_untouched(p_status text, p_prepared_at timestamptz, p_last_saved_at timestamptz)
returns boolean
language sql
immutable
as $$
  select p_status = 'draft' and p_prepared_at is not null and p_last_saved_at is null
$$;

-- -----------------------------------------------------------------------------------------------
-- 1. Meals in quarters
create or replace function public.daily_report_missing(p_meals jsonb, p_nap jsonb, p_mood jsonb, p_toilet jsonb, p_activities jsonb)
returns text[]
language sql
immutable
as $$
  select array_remove(array[
    case when coalesce(p_meals -> 'breakfast' ->> 'amount', '') in ('none', 'quarter', 'half', 'three_quarters', 'all', 'some') then null else 'breakfast' end,
    case when coalesce(p_meals -> 'lunch' ->> 'amount', '') in ('none', 'quarter', 'half', 'three_quarters', 'all', 'some') then null else 'lunch' end,
    case when coalesce(p_meals -> 'snacks' ->> 'amount', '') in ('none', 'quarter', 'half', 'three_quarters', 'all', 'some') then null else 'snacks' end,
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

-- -----------------------------------------------------------------------------------------------
-- 2. Saving keeps the child's data of the day; sending also keeps who sent it

create or replace function public.save_daily_report(p_child_id uuid, p_report_date date, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child public.children%rowtype;
  v_class public.classes%rowtype;
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
  select * into v_class from public.classes where id = v_child.class_id;

  insert into public.daily_reports (
    child_id, report_date, nursery_id, teacher_id, status,
    meals_json, nap_json, mood_json, toilet_json, activities_json, feeding_json, special_notes,
    child_code, class_id, class_name_ar, class_name_en,
    last_saved_at, last_saved_by
  )
  values (
    p_child_id, p_report_date, v_child.nursery_id, auth.uid(), 'draft',
    coalesce(p_answers -> 'meals', '{}'::jsonb), coalesce(p_answers -> 'nap', '{}'::jsonb), coalesce(p_answers -> 'mood', '{}'::jsonb),
    coalesce(p_answers -> 'toilet', '{}'::jsonb), coalesce(p_answers -> 'activities', '{}'::jsonb), coalesce(p_answers -> 'feeding', '{}'::jsonb),
    nullif(btrim(coalesce(p_answers ->> 'special_notes', '')), ''),
    v_child.child_id_number, v_class.id, v_class.name_ar, v_class.name_en,
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
    -- A report the system prepared has no teacher yet: the first to write it is.
    teacher_id = coalesce(public.daily_reports.teacher_id, excluded.teacher_id),
    child_code = excluded.child_code,
    class_id = excluded.class_id,
    class_name_ar = excluded.class_name_ar,
    class_name_en = excluded.class_name_en,
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
-- returned with what it misses; one already sent is skipped. Each sent report keeps the child's
-- data and who sent it, and the family's notice names the sender.
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
  v_class public.classes%rowtype;
  v_me public.users%rowtype;
  v_title_ar text;
  v_title_en text;
  v_place public.class_staff_role;
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
  select * into v_me from public.users where id = auth.uid();
  select r.name_ar, r.name_en into v_title_ar, v_title_en from public.roles r where r.id = v_me.role_id;

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

    select * into v_class from public.classes where id = v_child.class_id;
    -- The sender's place in this child's class (lead before assistant before substitute).
    select min(cs.role) into v_place from public.class_staff cs where cs.user_id = auth.uid() and cs.class_id = v_child.class_id;

    update public.daily_reports
       set status = 'published', published_at = now(), submitted_by = auth.uid(),
           child_code = v_child.child_id_number, class_id = v_class.id, class_name_ar = v_class.name_ar, class_name_en = v_class.name_en,
           sender_name_ar = v_me.name_ar, sender_name_en = v_me.name_en, sender_role = v_me.role,
           sender_role_title_ar = v_title_ar, sender_role_title_en = v_title_en,
           sender_department = v_me.department, sender_class_role = v_place
     where id = v_id;
    v_sent := v_sent || v_id;

    insert into public.notifications (nursery_id, user_id, type, channel, template_key, template_params, action_link)
    select
      v_row.nursery_id, pc.parent_id, 'daily_report', 'in_app', 'daily_report_sent_by',
      jsonb_build_object(
        'child', jsonb_build_object('ar', coalesce(nullif(v_child.full_name_ar, ''), v_child.full_name_en), 'en', coalesce(nullif(v_child.full_name_en, ''), v_child.full_name_ar)),
        'sender', jsonb_build_object('ar', coalesce(nullif(v_me.name_ar, ''), v_me.name_en), 'en', coalesce(nullif(v_me.name_en, ''), v_me.name_ar)),
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
-- 3. The day's reports, prepared at the nursery's opening time

create or replace function public.prepare_daily_reports()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with days as (
    select ns.nursery_id,
           coalesce(ns.timezone, 'Africa/Cairo') as tz,
           (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date as today,
           coalesce(ns.standard_start_time, time '07:00') as start_time
    from public.nursery_settings ns
  ),
  open_days as (
    select d.* from days d
    where (now() at time zone d.tz)::time >= d.start_time
      and public.attendance_is_school_day(d.nursery_id, d.today)
  ),
  prepared as (
    insert into public.daily_reports (child_id, report_date, nursery_id, status, child_code, class_id, class_name_ar, class_name_en, prepared_at)
    select c.id, d.today, c.nursery_id, 'draft', c.child_id_number, cl.id, cl.name_ar, cl.name_en, now()
    from open_days d
    join public.children c on c.nursery_id = d.nursery_id and c.status = 'active'
      and coalesce(c.enrollment_date, c.created_at::date) <= d.today
    join public.classes cl on cl.id = c.class_id and cl.deleted_at is null
    where not exists (select 1 from public.daily_reports dr where dr.child_id = c.id and dr.report_date = d.today)
    on conflict (child_id, report_date) do nothing
    returning 1
  )
  select count(*)::integer into v_count from prepared;
  return v_count;
end;
$$;

revoke execute on function public.prepare_daily_reports() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('daily-report-preparation');
exception when others then null;
end $$;
select cron.schedule('daily-report-preparation', '*/15 * * * *', $$select public.prepare_daily_reports()$$);

-- The teacher's day: a prepared report nobody has saved is "none", like no report at all.
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
    case when dr.id is null or public.daily_report_untouched(dr.status, dr.prepared_at, dr.last_saved_at) then 'none' else dr.status end,
    case when dr.id is null then 0 else 7 - cardinality(public.daily_report_missing(dr.meals_json, dr.nap_json, dr.mood_json, dr.toilet_json, dr.activities_json)) end,
    7,
    case when dr.id is null then array['breakfast', 'lunch', 'snacks', 'nap', 'mood', 'toilet', 'activities']
         else public.daily_report_missing(dr.meals_json, dr.nap_json, dr.mood_json, dr.toilet_json, dr.activities_json) end,
    -- A prepared report has an updated_at from the morning, not a save.
    case when dr.prepared_at is not null then dr.last_saved_at else coalesce(dr.last_saved_at, dr.updated_at) end,
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

-- The send rate: an untouched prepared report is no report (not a draft) in the counts.
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
    select e.*, dr.id as report_id,
           case when dr.id is null or public.daily_report_untouched(dr.status, dr.prepared_at, dr.last_saved_at) then null else dr.status end as status,
           dr.published_at, dr.submitted_by,
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

-- -----------------------------------------------------------------------------------------------
-- 4. Reading a report with its child and its sender

-- The report's child data (kept on the report, else the child's current) and its sender (kept on
-- the report, else whoever sent or started it, as they are now), for the readers below.
create or replace view public.daily_report_cards
with (security_invoker = true)
as
select
  dr.id as report_id,
  dr.child_id,
  dr.nursery_id,
  dr.report_date,
  dr.status,
  dr.published_at,
  dr.submitted_by,
  dr.teacher_id,
  dr.meals_json, dr.nap_json, dr.mood_json, dr.toilet_json, dr.activities_json, dr.feeding_json, dr.special_notes,
  c.full_name_ar,
  c.full_name_en,
  c.avatar_url,
  coalesce(dr.child_code, c.child_id_number) as child_code,
  coalesce(dr.class_id, c.class_id) as class_id,
  case when dr.class_id is not null or dr.class_name_ar is not null then dr.class_name_ar else cl.name_ar end as class_name_ar,
  case when dr.class_id is not null or dr.class_name_en is not null then dr.class_name_en else cl.name_en end as class_name_en,
  case when dr.sender_role is not null then dr.sender_name_ar else su.name_ar end as sender_name_ar,
  case when dr.sender_role is not null then dr.sender_name_en else su.name_en end as sender_name_en,
  coalesce(dr.sender_role, su.role) as sender_role,
  case when dr.sender_role is not null then dr.sender_role_title_ar else sr.name_ar end as sender_role_title_ar,
  case when dr.sender_role is not null then dr.sender_role_title_en else sr.name_en end as sender_role_title_en,
  case when dr.sender_role is not null then dr.sender_department else su.department end as sender_department,
  case when dr.sender_role is not null then dr.sender_class_role
       else (select min(cs.role) from public.class_staff cs where cs.user_id = su.id and cs.class_id = coalesce(dr.class_id, c.class_id)) end as sender_class_role
from public.daily_reports dr
join public.children c on c.id = dr.child_id
left join public.classes cl on cl.id = c.class_id
left join public.users su on su.id = coalesce(dr.submitted_by, dr.teacher_id)
left join public.roles sr on sr.id = su.role_id;

-- Only the functions below read it, as its owner.
revoke all on public.daily_report_cards from public, anon, authenticated;

-- A parent's sent reports, newest first: their own children only.
create or replace function public.get_parent_daily_reports(
  p_child_id uuid default null,
  p_from date default null,
  p_to date default null,
  p_limit integer default 200
)
returns table (
  report_id uuid,
  child_id uuid,
  full_name_ar text,
  full_name_en text,
  avatar_url text,
  child_code text,
  class_name_ar text,
  class_name_en text,
  report_date date,
  published_at timestamptz,
  meals_json jsonb,
  nap_json jsonb,
  mood_json jsonb,
  toilet_json jsonb,
  activities_json jsonb,
  feeding_json jsonb,
  special_notes text,
  sender_name_ar text,
  sender_name_en text,
  sender_role public.user_role,
  sender_role_title_ar text,
  sender_role_title_en text,
  sender_department public.user_department,
  sender_class_role public.class_staff_role
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'daily_report_not_authenticated' using errcode = '28000';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'daily_report_date_invalid' using errcode = '22023';
  end if;

  return query
  select
    v.report_id, v.child_id, v.full_name_ar, v.full_name_en, v.avatar_url, v.child_code, v.class_name_ar, v.class_name_en,
    v.report_date, v.published_at,
    v.meals_json, v.nap_json, v.mood_json, v.toilet_json, v.activities_json, v.feeding_json, v.special_notes,
    v.sender_name_ar, v.sender_name_en, v.sender_role, v.sender_role_title_ar, v.sender_role_title_en, v.sender_department, v.sender_class_role
  from public.daily_report_cards v
  where v.status = 'published'
    and exists (select 1 from public.parent_children pc where pc.parent_id = auth.uid() and pc.child_id = v.child_id)
    and (p_child_id is null or v.child_id = p_child_id)
    and (p_from is null or v.report_date >= p_from)
    and (p_to is null or v.report_date <= p_to)
  order by v.report_date desc, v.published_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

-- The sent reports a teacher may look back on: their classes' (by the class kept on the report,
-- else the child's current class) and the ones they sent; the whole nursery for its admin and for
-- managers with the daily reports permission. By period (one day: p_from = p_to), class, and a
-- child's name or code. Newest first, a page at a time, with the total.
create or replace function public.get_daily_report_history(
  p_from date,
  p_to date,
  p_class_id uuid default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  report_id uuid,
  child_id uuid,
  full_name_ar text,
  full_name_en text,
  avatar_url text,
  child_code text,
  class_id uuid,
  class_name_ar text,
  class_name_en text,
  report_date date,
  published_at timestamptz,
  sender_name_ar text,
  sender_name_en text,
  mood text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_me public.users%rowtype;
  v_whole_nursery boolean;
  v_search text := lower(btrim(coalesce(p_search, '')));
begin
  if auth.uid() is null then
    raise exception 'daily_report_not_authenticated' using errcode = '28000';
  end if;
  select * into v_me from public.users where id = auth.uid();
  if v_me.nursery_id is null or v_me.role not in ('teacher', 'manager', 'branch_admin') then
    raise exception 'daily_report_forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 366 then
    raise exception 'daily_report_date_invalid' using errcode = '22023';
  end if;
  if char_length(v_search) > 80 then
    raise exception 'daily_report_search_invalid' using errcode = '22023';
  end if;
  v_whole_nursery := v_me.role = 'branch_admin' or (v_me.role = 'manager' and public.user_can('daily_reports', 'view'));

  return query
  select
    v.report_id, v.child_id, v.full_name_ar, v.full_name_en, v.avatar_url, v.child_code, v.class_id, v.class_name_ar, v.class_name_en,
    v.report_date, v.published_at, v.sender_name_ar, v.sender_name_en, v.mood_json ->> 'mood',
    count(*) over ()
  from public.daily_report_cards v
  where v.status = 'published'
    and v.nursery_id = v_me.nursery_id
    and v.report_date between p_from and p_to
    and (p_class_id is null or v.class_id = p_class_id)
    and (
      v_whole_nursery
      or v.submitted_by = auth.uid()
      or exists (select 1 from public.class_staff cs where cs.user_id = auth.uid() and cs.class_id = v.class_id)
    )
    -- Plain text, not a LIKE pattern: % and _ in the search mean themselves.
    and (
      v_search = ''
      or position(v_search in lower(coalesce(v.full_name_ar, ''))) > 0
      or position(v_search in lower(coalesce(v.full_name_en, ''))) > 0
      or position(v_search in lower(coalesce(v.child_code, ''))) > 0
    )
  order by v.report_date desc, v.published_at desc, v.full_name_en
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- One child's report for one day, for the teacher's editor and their history: the class's
-- teachers, the nursery's admin, managers with the daily reports permission, chain and XO admins
-- (daily_report_guard), and whoever sent it. Now with the child's data and the sender. Null when
-- nothing was saved yet.
create or replace function public.get_daily_report(p_child_id uuid, p_report_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.daily_report_cards%rowtype;
begin
  begin
    perform public.daily_report_guard(p_child_id);
  exception when others then
    -- A teacher who has since moved class may still read the reports they sent.
    if not exists (
      select 1 from public.daily_reports dr
      where dr.child_id = p_child_id and dr.report_date = p_report_date and dr.status = 'published' and dr.submitted_by = auth.uid()
    ) then
      raise;
    end if;
  end;
  select * into v from public.daily_report_cards c where c.child_id = p_child_id and c.report_date = p_report_date;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'id', v.report_id,
    'child_id', v.child_id,
    'report_date', v.report_date,
    'status', v.status,
    'meals_json', v.meals_json,
    'nap_json', v.nap_json,
    'mood_json', v.mood_json,
    'toilet_json', v.toilet_json,
    'activities_json', v.activities_json,
    'feeding_json', v.feeding_json,
    'special_notes', v.special_notes,
    'last_saved_at', (select dr.last_saved_at from public.daily_reports dr where dr.id = v.report_id),
    'published_at', v.published_at,
    'full_name_ar', v.full_name_ar,
    'full_name_en', v.full_name_en,
    'avatar_url', v.avatar_url,
    'child_code', v.child_code,
    'class_name_ar', v.class_name_ar,
    'class_name_en', v.class_name_en,
    'sender_name_ar', v.sender_name_ar,
    'sender_name_en', v.sender_name_en,
    'sender_role', v.sender_role,
    'sender_role_title_ar', v.sender_role_title_ar,
    'sender_role_title_en', v.sender_role_title_en,
    'sender_department', v.sender_department,
    'sender_class_role', v.sender_class_role
  );
end;
$$;

revoke execute on function public.get_parent_daily_reports(uuid, date, date, integer) from public, anon;
revoke execute on function public.get_daily_report_history(date, date, uuid, text, integer, integer) from public, anon;
revoke execute on function public.get_daily_report(uuid, date) from public, anon;
grant execute on function public.get_parent_daily_reports(uuid, date, date, integer) to authenticated, service_role;
grant execute on function public.get_daily_report_history(date, date, uuid, text, integer, integer) to authenticated, service_role;
grant execute on function public.get_daily_report(uuid, date) to authenticated, service_role;

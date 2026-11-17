-- One record of what was done to a class or to a member of staff.
--
-- Three logs existed and none of them answered "what happened here lately": rbac_audit_log held
-- permission changes, role_assignments_log held who changed whose role, class_team_changes held
-- the class teams. A class renamed, a child moved between classes, a member of staff deactivated
-- or an absence recorded left no trace the nursery could read.
--
-- activity_log is written by database triggers rather than by each screen, so an action is
-- recorded wherever it comes from — the dashboard, the teacher's app, an import or a script — and
-- no screen can forget to log. One generic trigger function serves every table; each trigger says
-- which subject and entity it is for.

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  nursery_id uuid not null references public.nurseries(id) on delete cascade,
  -- Who did it; null when the database itself did (a cascade, a scheduled job).
  actor_id uuid references public.users(id) on delete set null,
  -- What it was about, for the two filters the nursery reads by.
  subject text not null check (subject in ('class', 'staff')),
  subject_id uuid,
  -- The kind of record that changed, for the detail line.
  entity text not null,
  action text not null check (action in ('created', 'updated', 'deleted')),
  -- The fields that changed, and the names needed to read the line without more queries.
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists activity_log_nursery_time on public.activity_log (nursery_id, created_at desc);
create index if not exists activity_log_subject on public.activity_log (nursery_id, subject, created_at desc);
create index if not exists activity_log_subject_id on public.activity_log (subject_id, created_at desc) where subject_id is not null;

alter table public.activity_log enable row level security;

-- Only the nursery's own admins and managers read it; nobody writes it by hand.
drop policy if exists activity_log_read on public.activity_log;
create policy activity_log_read on public.activity_log for select using (
  is_xo_super_admin()
  or (current_user_role() in ('branch_admin', 'manager') and nursery_id = current_user_nursery_id())
  or (current_user_role() = 'chain_super_admin' and nursery_id in (select nursery_ids_for_chain_admin()))
);

-- The fields that actually changed on an update, as {field: {from, to}} — the whole row would be
-- noise, and would copy data that lives in the row itself.
create or replace function public.activity_changed_fields(p_old jsonb, p_new jsonb, p_watch text[])
returns jsonb
language sql
immutable
as $function$
  select coalesce(jsonb_object_agg(k, jsonb_build_object('from', p_old -> k, 'to', p_new -> k)), '{}'::jsonb)
    from unnest(p_watch) k
   where (p_old -> k) is distinct from (p_new -> k)
$function$;

/*
 * The one trigger that records a change. Its arguments say what the row is:
 *   TG_ARGV[0] subject      'class' or 'staff'
 *   TG_ARGV[1] entity       the kind of record, for the reader
 *   TG_ARGV[2] nursery col  the column holding the nursery, or 'class' to read it from the class
 *   TG_ARGV[3] subject col  the column holding what the line is about
 *   TG_ARGV[4] watch        comma-separated fields worth recording on an update
 * An update that touches none of the watched fields is not recorded, so timestamps alone do not
 * fill the log.
 */
create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  v_nursery uuid;
  v_subject_id uuid;
  v_action text := lower(tg_op);
  v_summary jsonb := '{}'::jsonb;
  v_watch text[] := string_to_array(coalesce(tg_argv[4], ''), ',');
begin
  v_action := case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;

  if tg_argv[2] = 'class' then
    select c.nursery_id into v_nursery from public.classes c where c.id = (v_row ->> 'class_id')::uuid;
  else
    v_nursery := (v_row ->> tg_argv[2])::uuid;
  end if;
  if v_nursery is null then
    return coalesce(new, old);
  end if;

  v_subject_id := (v_row ->> tg_argv[3])::uuid;

  if tg_op = 'UPDATE' then
    v_summary := public.activity_changed_fields(v_old, v_row, v_watch);
    -- Nothing worth recording changed (a touched timestamp, a recount).
    if v_summary = '{}'::jsonb then
      return new;
    end if;
  end if;

  insert into public.activity_log (nursery_id, actor_id, subject, subject_id, entity, action, summary)
  values (
    v_nursery,
    auth.uid(),
    tg_argv[0],
    v_subject_id,
    tg_argv[1],
    v_action,
    jsonb_build_object('changed', v_summary) || jsonb_strip_nulls(jsonb_build_object(
      'class_id', v_row ->> 'class_id',
      'user_id', v_row ->> 'user_id',
      'role', v_row ->> 'role',
      'name_en', v_row ->> 'name_en',
      'name_ar', v_row ->> 'name_ar',
      'starts_on', v_row ->> 'starts_on',
      'ends_on', v_row ->> 'ends_on',
      'reason', v_row ->> 'reason'
    ))
  );
  return coalesce(new, old);
end;
$function$;

-- A class opened, renamed, moved room, resized or closed.
drop trigger if exists trg_classes_activity on public.classes;
create trigger trg_classes_activity
after insert or update or delete on public.classes
for each row execute function public.log_activity(
  'class', 'class', 'nursery_id', 'id', 'name_ar,name_en,grade_level,room_number,capacity,deleted_at'
);

-- Someone put on a class's team, moved within it, or taken off.
drop trigger if exists trg_class_staff_activity on public.class_staff;
create trigger trg_class_staff_activity
after insert or update or delete on public.class_staff
for each row execute function public.log_activity('class', 'class_team', 'class', 'user_id', 'role,class_id');

-- A member of staff joining, changing role or leaving.
drop trigger if exists trg_staff_activity on public.users;
create trigger trg_staff_activity
after insert or update or delete on public.users
for each row execute function public.log_activity(
  'staff', 'staff', 'nursery_id', 'id', 'role,role_id,status,name_ar,name_en,phone,email'
);

-- An absence recorded or withdrawn.
drop trigger if exists trg_staff_absences_activity on public.staff_absences;
create trigger trg_staff_absences_activity
after insert or update or delete on public.staff_absences
for each row execute function public.log_activity(
  'staff', 'staff_absence', 'nursery_id', 'user_id', 'starts_on,ends_on,reason,cancelled_at'
);

-- A day's clocking corrected by hand.
drop trigger if exists trg_staff_attendance_activity on public.staff_attendance;
create trigger trg_staff_attendance_activity
after insert or update or delete on public.staff_attendance
for each row execute function public.log_activity(
  'staff', 'staff_attendance', 'nursery_id', 'user_id', 'check_in_at,check_out_at,status,note'
);

/*
 * The log as the nursery reads it: newest first, with the names of who did it and who or what it
 * was about resolved here, so a page of lines costs one query. `p_subject` narrows to classes or
 * to staff; `p_subject_id` to one class or one person.
 */
create or replace function public.get_activity_log(
  p_nursery_id uuid,
  p_subject text default null,
  p_subject_id uuid default null,
  p_limit integer default 50,
  p_before timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_role public.user_role := public.current_user_role();
  v_rows jsonb;
begin
  if not coalesce(
    public.is_xo_super_admin()
    or (v_role in ('branch_admin', 'manager') and p_nursery_id = public.current_user_nursery_id())
    or (v_role = 'chain_super_admin' and p_nursery_id in (select public.nursery_ids_for_chain_admin())),
    false
  ) then
    raise exception 'activity_forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(line order by line ->> 'at' desc), '[]'::jsonb) into v_rows
    from (
      select jsonb_build_object(
        'id', a.id,
        'at', a.created_at,
        'subject', a.subject,
        'entity', a.entity,
        'action', a.action,
        'summary', a.summary,
        'actor', jsonb_build_object('ar', actor.name_ar, 'en', actor.name_en),
        -- What the line is about: a class, or a member of staff.
        'about', case
          when a.subject = 'class' and a.entity = 'class'
            then jsonb_build_object('ar', cls.name_ar, 'en', cls.name_en)
          when a.subject = 'class'
            then jsonb_build_object('ar', person.name_ar, 'en', person.name_en)
          else jsonb_build_object('ar', person.name_ar, 'en', person.name_en)
        end,
        -- The class a team change was on, named for the line.
        'class', case when a.summary ? 'class_id'
          then (select jsonb_build_object('ar', c2.name_ar, 'en', c2.name_en)
                  from public.classes c2 where c2.id = (a.summary ->> 'class_id')::uuid)
        end
      ) as line
        from public.activity_log a
        left join public.users actor on actor.id = a.actor_id
        left join public.users person on person.id = a.subject_id
        left join public.classes cls on cls.id = a.subject_id
       where a.nursery_id = p_nursery_id
         and (p_subject is null or a.subject = p_subject)
         and (p_subject_id is null or a.subject_id = p_subject_id)
         and (p_before is null or a.created_at < p_before)
       order by a.created_at desc
       limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) page;

  return jsonb_build_object('lines', v_rows);
end;
$function$;

revoke all on function public.get_activity_log(uuid, text, uuid, integer, timestamptz) from public, anon;
grant execute on function public.get_activity_log(uuid, text, uuid, integer, timestamptz) to authenticated;

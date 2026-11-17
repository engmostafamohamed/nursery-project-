-- The class team speaks the nursery's own words, and a teacher can be moved between classes.
--
-- The place beside the lead teacher was called "assistant", but in this nursery that person is a
-- co-teacher; the assistant is the nanny, who already has her own place. The value is renamed, so
-- the 203 people already in that place keep it under its proper name.
--
-- Until now the only way to move a teacher was to take her out of one class and put her in
-- another, as two separate changes that could half-fail and told her twice. move_class_team_member
-- does both as one change and tells her once, naming the class she is moving from.
--
-- A teacher assigned to a class could not open it: get_class_profile was for admins only, and the
-- notice she received led to her home page. She can now open the class she is on the team of, and
-- the notice leads straight to it.

-- 1 · The place is a co-teacher's.
alter type public.class_staff_role rename value 'assistant' to 'co_teacher';

-- The job title staff were hired under follows the same wording.
update public.staff_profiles set position = 'Co-teacher' where position = 'Assistant teacher';

-- The two functions that name the place by hand follow it.
create or replace function public.class_duty_teachers(p_class_id uuid, p_day date)
returns table(user_id uuid, role public.class_staff_role, covering boolean)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with team as (
    select cs.user_id, cs.role, public.staff_is_absent(cs.user_id, p_day) as away
      from public.class_staff cs
      join public.users u on u.id = cs.user_id and coalesce(u.status, 'active') = 'active'
     where cs.class_id = p_class_id
  )
  select t.user_id, t.role, false from team t where t.role in ('lead', 'co_teacher') and not t.away
  union all
  select t.user_id, t.role, true from team t
   where t.role = 'substitute' and not t.away
     and not exists (select 1 from team l where l.role = 'lead' and not l.away)
$function$;

-- 2 · A teacher may read the class she is on the team of.
create or replace function public.class_team_has_member(p_class_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.class_staff cs
     where cs.class_id = p_class_id and cs.user_id = p_user_id
  )
$function$;

-- 3 · Moving someone from one class to another, as one change.
create or replace function public.move_class_team_member(
  p_from_class_id uuid,
  p_to_class_id uuid,
  p_user_id uuid,
  p_role public.class_staff_role
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_from public.classes%rowtype;
  v_to public.classes%rowtype;
  v_actor uuid;
  v_teacher public.users%rowtype;
  v_previous public.class_staff_role;
  v_replaced uuid;
begin
  if p_from_class_id = p_to_class_id then
    raise exception 'class_team_same_class' using errcode = '22023';
  end if;
  if p_role is null then
    raise exception 'class_team_invalid_role' using errcode = '22023';
  end if;

  select * into v_from from public.classes where id = p_from_class_id and deleted_at is null;
  if not found then
    raise exception 'class_team_class_not_found' using errcode = '22023';
  end if;
  select * into v_to from public.classes where id = p_to_class_id and deleted_at is null;
  if not found then
    raise exception 'class_team_class_not_found' using errcode = '22023';
  end if;
  -- Both classes must be the caller's to change; a move never crosses nurseries.
  if v_from.nursery_id is distinct from v_to.nursery_id then
    raise exception 'class_team_other_nursery' using errcode = '22023';
  end if;
  v_actor := public.class_team_guard(v_from.nursery_id, 'update');

  select * into v_teacher from public.users where id = p_user_id;
  if not found or v_teacher.nursery_id is distinct from v_from.nursery_id or v_teacher.role <> 'teacher' then
    raise exception 'class_team_not_a_teacher' using errcode = '22023';
  end if;
  if coalesce(v_teacher.status, 'active') <> 'active' then
    raise exception 'class_team_teacher_inactive' using errcode = '22023';
  end if;

  delete from public.class_staff cs
   where cs.class_id = p_from_class_id and cs.user_id = p_user_id
  returning cs.role into v_previous;
  if v_previous is null then
    raise exception 'class_team_not_on_that_class' using errcode = '22023';
  end if;
  insert into public.class_team_changes (nursery_id, class_id, user_id, action, role, previous_role, changed_by)
  values (v_from.nursery_id, p_from_class_id, p_user_id, 'removed', null, v_previous, v_actor);

  -- Only one lead and one backup to a class: whoever held the place in the new class steps out.
  if p_role in ('lead', 'substitute') then
    delete from public.class_staff cs
     where cs.class_id = p_to_class_id and cs.role = p_role and cs.user_id <> p_user_id
    returning cs.user_id into v_replaced;
    if v_replaced is not null then
      insert into public.class_team_changes (nursery_id, class_id, user_id, action, role, previous_role, changed_by)
      values (v_to.nursery_id, p_to_class_id, v_replaced, 'removed', null, p_role, v_actor);
    end if;
  end if;

  insert into public.class_staff (class_id, user_id, role)
  values (p_to_class_id, p_user_id, p_role)
  on conflict (class_id, user_id) do update set role = excluded.role, updated_at = now();
  insert into public.class_team_changes (nursery_id, class_id, user_id, action, role, previous_role, changed_by)
  values (v_to.nursery_id, p_to_class_id, p_user_id, 'assigned', p_role, v_previous, v_actor);

  -- She hears about it once, and the notice leads to the class she is moving to.
  if p_user_id <> v_actor then
    insert into public.notifications (nursery_id, user_id, type, channel, template_key, template_params, action_link)
    values (
      v_to.nursery_id, p_user_id, 'class_team', 'in_app', 'class_team_moved',
      jsonb_build_object(
        'from', jsonb_build_object('ar', coalesce(nullif(v_from.name_ar, ''), v_from.name_en), 'en', coalesce(nullif(v_from.name_en, ''), v_from.name_ar)),
        'class', jsonb_build_object('ar', coalesce(nullif(v_to.name_ar, ''), v_to.name_en), 'en', coalesce(nullif(v_to.name_en, ''), v_to.name_ar)),
        'role', jsonb_build_object('i18n', 'classTeam.roles.' || p_role::text)
      ),
      '/teacher/classes/' || p_to_class_id::text
    );
  end if;

  return jsonb_build_object(
    'from_class_id', p_from_class_id, 'to_class_id', p_to_class_id,
    'user_id', p_user_id, 'role', p_role, 'previous_role', v_previous, 'replaced_user_id', v_replaced
  );
end;
$function$;

revoke all on function public.move_class_team_member(uuid, uuid, uuid, public.class_staff_role) from public, anon;
grant execute on function public.move_class_team_member(uuid, uuid, uuid, public.class_staff_role) to authenticated;

-- 4 · Being put on a class leads the teacher to that class, not to her home page.
create or replace function public.set_class_team_member(p_class_id uuid, p_user_id uuid, p_role public.class_staff_role)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_class public.classes%rowtype;
  v_actor uuid;
  v_teacher public.users%rowtype;
  v_previous public.class_staff_role;
  v_replaced uuid;
begin
  select * into v_class from public.classes where id = p_class_id and deleted_at is null;
  if not found then
    raise exception 'class_team_class_not_found' using errcode = '22023';
  end if;
  v_actor := public.class_team_guard(v_class.nursery_id, 'update');
  if p_role is null then
    raise exception 'class_team_invalid_role' using errcode = '22023';
  end if;
  select * into v_teacher from public.users where id = p_user_id;
  if not found or v_teacher.nursery_id is distinct from v_class.nursery_id or v_teacher.role <> 'teacher' then
    raise exception 'class_team_not_a_teacher' using errcode = '22023';
  end if;
  if coalesce(v_teacher.status, 'active') <> 'active' then
    raise exception 'class_team_teacher_inactive' using errcode = '22023';
  end if;

  select cs.role into v_previous from public.class_staff cs where cs.class_id = p_class_id and cs.user_id = p_user_id;
  if v_previous = p_role then
    return jsonb_build_object('class_id', p_class_id, 'user_id', p_user_id, 'role', p_role, 'changed', false);
  end if;

  if p_role in ('lead', 'substitute') then
    delete from public.class_staff cs
     where cs.class_id = p_class_id and cs.role = p_role and cs.user_id <> p_user_id
    returning cs.user_id into v_replaced;
    if v_replaced is not null then
      insert into public.class_team_changes (nursery_id, class_id, user_id, action, role, previous_role, changed_by)
      values (v_class.nursery_id, p_class_id, v_replaced, 'removed', null, p_role, v_actor);
    end if;
  end if;

  insert into public.class_staff (class_id, user_id, role)
  values (p_class_id, p_user_id, p_role)
  on conflict (class_id, user_id) do update set role = excluded.role, updated_at = now();

  insert into public.class_team_changes (nursery_id, class_id, user_id, action, role, previous_role, changed_by)
  values (v_class.nursery_id, p_class_id, p_user_id, case when v_previous is null then 'assigned' else 'changed' end, p_role, v_previous, v_actor);

  if p_user_id <> v_actor then
    insert into public.notifications (nursery_id, user_id, type, channel, template_key, template_params, action_link)
    values (
      v_class.nursery_id, p_user_id, 'class_team', 'in_app', 'class_team_assigned',
      jsonb_build_object(
        'class', jsonb_build_object('ar', coalesce(nullif(v_class.name_ar, ''), v_class.name_en), 'en', coalesce(nullif(v_class.name_en, ''), v_class.name_ar)),
        'role', jsonb_build_object('i18n', 'classTeam.roles.' || p_role::text)
      ),
      '/teacher/classes/' || p_class_id::text
    );
  end if;

  return jsonb_build_object('class_id', p_class_id, 'user_id', p_user_id, 'role', p_role, 'changed', true, 'replaced_user_id', v_replaced);
end;
$function$;

-- 5 · The class a teacher is on the team of opens for her, with the co-teacher in its proper order.
CREATE OR REPLACE FUNCTION public.get_class_profile(p_class_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_class public.classes%rowtype;
  v_role public.user_role := public.current_user_role();
  v_today date;
  v_tz text;
  v_closes time;
  v_open boolean;
begin
  select * into v_class from public.classes where id = p_class_id and deleted_at is null;
  if v_class.id is null then
    raise exception 'class_not_found' using errcode = 'P0002';
  end if;
  -- coalesce: a caller with no role (no users row) makes the test NULL, which must refuse, not pass.
  if not coalesce(
    public.is_xo_super_admin()
    or (v_role in ('branch_admin', 'manager') and v_class.nursery_id = public.current_user_nursery_id())
    or (v_role = 'chain_super_admin' and v_class.nursery_id in (select public.nursery_ids_for_chain_admin()))
    -- A teacher reads the class she is on the team of, and no other.
    or (v_role = 'teacher' and v_class.nursery_id = public.current_user_nursery_id()
        and public.class_team_has_member(p_class_id, auth.uid())),
    false
  ) then
    raise exception 'class_forbidden' using errcode = '42501';
  end if;
  v_today := public.nursery_today(v_class.nursery_id);
  v_tz := coalesce((select s.timezone from public.nursery_settings s where s.nursery_id = v_class.nursery_id), 'Africa/Cairo');
  v_closes := (select n.closes_at from public.nurseries n where n.id = v_class.nursery_id);
  -- Until closing time a child who has not come yet is expected, not absent.
  v_open := public.attendance_is_school_day(v_class.nursery_id, v_today)
            and (v_closes is null or (now() at time zone v_tz)::time < v_closes);

  return jsonb_build_object(
    'today', v_today,
    'school_day', public.attendance_is_school_day(v_class.nursery_id, v_today),
    'day_open', v_open,
    'class', jsonb_build_object(
      'id', v_class.id, 'nursery_id', v_class.nursery_id, 'name_ar', v_class.name_ar, 'name_en', v_class.name_en,
      'grade_level', v_class.grade_level, 'room_number', v_class.room_number, 'capacity', v_class.capacity,
      'created_at', v_class.created_at,
      -- Check-in and pick-up times read in the nursery's own clock.
      'timezone', (select s.timezone from public.nursery_settings s where s.nursery_id = v_class.nursery_id)),

    'team', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', u.id, 'name_ar', u.name_ar, 'name_en', u.name_en, 'email', u.email, 'phone', u.phone,
               'role', cs.role, 'since', cs.created_at, 'active', coalesce(u.status, 'active') = 'active',
               -- Today's clocking in and out (staff_attendance).
               'clock_in', coalesce(sa.check_in_at, sa.clock_in), 'clock_out', coalesce(sa.check_out_at, sa.clock_out),
               'late_minutes', sa.late_minutes, 'clock_source', sa.source,
               'on_duty', d.user_id is not null, 'covering', coalesce(d.covering, false),
               'absence', (select jsonb_build_object('reason', a.reason, 'starts_on', a.starts_on, 'ends_on', a.ends_on)
                             from public.staff_absences a
                            where a.user_id = u.id and a.cancelled_at is null and v_today between a.starts_on and a.ends_on
                            order by a.starts_on
                            limit 1))
             order by array_position(array['lead', 'substitute', 'co_teacher', 'nanny'], cs.role::text), u.name_en)
        from public.class_staff cs
        join public.users u on u.id = cs.user_id
        left join public.class_duty_teachers(v_class.id, v_today) d on d.user_id = cs.user_id
        left join public.staff_attendance sa on sa.user_id = cs.user_id and sa.work_date = v_today
       where cs.class_id = v_class.id
    ), '[]'::jsonb),

    'children', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'name_ar', c.full_name_ar, 'name_en', c.full_name_en, 'code', c.child_id_number,
               'avatar_url', c.avatar_url, 'dob', c.dob, 'gender', c.gender,
               'enrolled_on', coalesce(c.enrollment_date, c.created_at::date),
               -- present (came and went home) | partial (here now) | absent | excused | off | not_enrolled
               'attendance', case
                 when ar.check_in is not null and ar.check_out is not null then 'present'
                 when ar.check_in is not null then 'partial'
                 when coalesce(c.enrollment_date, c.created_at::date) > v_today then 'not_enrolled'
                 when abr.id is not null then 'excused'
                 when not public.attendance_is_school_day(c.nursery_id, v_today) then 'off'
                 when v_open then 'expected'
                 else 'absent'
               end,
               'check_in', ar.check_in, 'check_out', ar.check_out, 'absence_reason', abr.reason,
               'report', case
                 when dr.id is null or public.daily_report_untouched(dr.status, dr.prepared_at, dr.last_saved_at) then 'none'
                 else dr.status
               end,
               'allergies', coalesce((
                 select jsonb_agg(jsonb_build_object('name', a.allergen_name, 'severity', a.severity)
                                  order by array_position(array['life_threatening', 'severe', 'moderate', 'mild'], a.severity), a.allergen_name)
                   from public.child_allergies a
                  where a.child_id = c.id
               ), '[]'::jsonb),
               'conditions', (select count(*) from public.child_chronic_conditions x where x.child_id = c.id),
               -- The medicines the round gives today (consented, in course, not expired).
               'medications', (select count(*) from public.child_medications m
                                where m.child_id = c.id and public.medication_active_on(m, v_today)))
             order by c.full_name_en, c.full_name_ar)
        from public.children c
        left join public.attendance_records ar on ar.child_id = c.id and ar.attendance_date = v_today
        left join public.attendance_absence_reports abr on abr.child_id = c.id and abr.absence_date = v_today
        left join public.daily_reports dr on dr.child_id = c.id and dr.report_date = v_today
       where c.class_id = v_class.id and c.status = 'active'
    ), '[]'::jsonb),

    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'kind', x.kind, 'audience', x.audience, 'status', x.status,
               'body_ar', x.body_ar, 'body_en', x.body_en, 'sender_ar', x.sender_ar, 'sender_en', x.sender_en,
               'sent_at', x.sent_at)
             order by x.sent_at desc)
        from (
          select b.id, 'announcement' as kind, b.audience_scope as audience, coalesce(b.delivery_status, 'sent') as status,
                 b.content_ar as body_ar, b.content_en as body_en, s.name_ar as sender_ar, s.name_en as sender_en,
                 coalesce(b.scheduled_for, b.sent_at, b.created_at) as sent_at
            from public.broadcast_messages b
            left join public.users s on s.id = b.sender_id
           where b.class_id = v_class.id and b.audience_scope = 'class'
          union all
          select f.id, 'family_message', f.audience, 'sent', f.body, f.body, f.sender_name_ar, f.sender_name_en, f.created_at
            from public.family_messages f
           where f.class_id = v_class.id
          order by sent_at desc
          limit 8
        ) x
    ), '[]'::jsonb),

    'waitlist', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', w.id, 'inquiry_id', i.id, 'position', w.position, 'status', w.status,
               'added_at', w.added_at, 'notified_at', w.notified_at,
               'child_name', i.child_name, 'child_dob', i.child_dob, 'parent_name', i.parent_name,
               'parent_phone', i.parent_phone, 'start_date', i.preferred_start_date)
             order by w.position, w.added_at)
        from public.waitlist w
        join public.inquiries i on i.id = w.inquiry_id
       where w.class_id = v_class.id and w.status in ('waiting', 'offered')
    ), '[]'::jsonb),

    'team_changes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'action', x.action, 'role', x.role, 'previous_role', x.previous_role, 'at', x.created_at,
               'name_ar', x.name_ar, 'name_en', x.name_en, 'by_ar', x.by_ar, 'by_en', x.by_en)
             order by x.created_at desc)
        from (
          select t.id, t.action, t.role, t.previous_role, t.created_at, u.name_ar, u.name_en, b.name_ar as by_ar, b.name_en as by_en
            from public.class_team_changes t
            join public.users u on u.id = t.user_id
            left join public.users b on b.id = t.changed_by
           where t.class_id = v_class.id
           order by t.created_at desc
           limit 10
        ) x
    ), '[]'::jsonb),

    'media', jsonb_build_object(
      'pending', (select count(*) from public.media m where m.class_id = v_class.id and m.status = 'pending_approval'),
      'approved_30d', (select count(*) from public.media m
                        where m.class_id = v_class.id and m.status = 'approved' and m.created_at >= now() - interval '30 days')),

    'cameras', coalesce((
      select jsonb_agg(jsonb_build_object('id', k.id, 'name_ar', k.name_ar, 'name_en', k.name_en, 'location', k.location, 'active', k.active)
             order by k.name_en)
        from public.cameras k
       where k.class_id = v_class.id
    ), '[]'::jsonb)
  );
end;
$function$
;

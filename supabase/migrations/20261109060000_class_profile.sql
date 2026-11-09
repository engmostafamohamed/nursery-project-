-- One class as the nursery's admins see it: the class profile page (/admin/classes/:id), opened from
-- a row of the classes list.
--
-- get_class_profile(class) reads, in one go so the page shows one moment:
--   * the class and its room;
--   * its team, with who is on duty today (class_duty_teachers: an absent lead's backup covers) and
--     the absence that keeps someone away;
--   * its children, with today's attendance (the same rules as the teachers' daily reports), the
--     day's report and their health flags (allergies by severity, conditions, medicines due);
--   * what was last sent to its families (class announcements and teachers' family messages);
--   * its waiting list, the team's last changes, its media and its cameras (never a stream URL).
-- Who may read it: XO, the branch's admins and managers, and the chain's admins (as the absences
-- screen).

create or replace function public.get_class_profile(p_class_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_class public.classes%rowtype;
  v_role public.user_role := public.current_user_role();
  v_today date;
begin
  select * into v_class from public.classes where id = p_class_id and deleted_at is null;
  if v_class.id is null then
    raise exception 'class_not_found' using errcode = 'P0002';
  end if;
  -- coalesce: a caller with no role (no users row) makes the test NULL, which must refuse, not pass.
  if not coalesce(
    public.is_xo_super_admin()
    or (v_role in ('branch_admin', 'manager') and v_class.nursery_id = public.current_user_nursery_id())
    or (v_role = 'chain_super_admin' and v_class.nursery_id in (select public.nursery_ids_for_chain_admin())),
    false
  ) then
    raise exception 'class_forbidden' using errcode = '42501';
  end if;
  v_today := public.nursery_today(v_class.nursery_id);

  return jsonb_build_object(
    'today', v_today,
    'school_day', public.attendance_is_school_day(v_class.nursery_id, v_today),
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
               'on_duty', d.user_id is not null, 'covering', coalesce(d.covering, false),
               'absence', (select jsonb_build_object('reason', a.reason, 'starts_on', a.starts_on, 'ends_on', a.ends_on)
                             from public.staff_absences a
                            where a.user_id = u.id and a.cancelled_at is null and v_today between a.starts_on and a.ends_on
                            order by a.starts_on
                            limit 1))
             order by array_position(array['lead', 'substitute', 'assistant'], cs.role::text), u.name_en)
        from public.class_staff cs
        join public.users u on u.id = cs.user_id
        left join public.class_duty_teachers(v_class.id, v_today) d on d.user_id = cs.user_id
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
$$;

revoke execute on function public.get_class_profile(uuid) from public, anon;
grant execute on function public.get_class_profile(uuid) to authenticated, service_role;

-- Everything the nursery holds about one child, read in one go.
--
-- A teacher could see her class's children as a list and their day as it stands, but not what had
-- happened to a child before today: the reports written about her, the days she came and went,
-- the events she joined, the milestones recorded, the health notes, the photographs, and what the
-- teachers told her family. Each of those lived behind its own screen or its own permission, and
-- none of them opened from the class.
--
-- get_child_history answers all of it for one child, newest first, for the teachers of that
-- child's class and for the nursery's own admins. One function means one round trip, one access
-- rule, and no screen assembling a child's past out of six queries.

create or replace function public.get_child_history(p_child_id uuid, p_limit integer default 40)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_child public.children%rowtype;
  v_role public.user_role := public.current_user_role();
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 200);
  v_is_staff boolean;
begin
  select * into v_child from public.children where id = p_child_id;
  if v_child.id is null then
    raise exception 'child_not_found' using errcode = 'P0002';
  end if;

  -- The nursery's own admins and managers, a teacher on this child's class team, or the child's
  -- own family. Everyone else is refused.
  v_is_staff := coalesce(
    public.is_xo_super_admin()
    or (v_role in ('branch_admin', 'manager') and v_child.nursery_id = public.current_user_nursery_id())
    or (v_role = 'chain_super_admin' and v_child.nursery_id in (select public.nursery_ids_for_chain_admin()))
    or (v_role = 'teacher' and v_child.class_id is not null
        and public.class_team_has_member(v_child.class_id, v_uid)),
    false
  );
  if not coalesce(v_is_staff or public.parent_can_access_child(p_child_id), false) then
    raise exception 'child_history_forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'child', jsonb_build_object(
      'id', v_child.id,
      'name_ar', v_child.full_name_ar,
      'name_en', v_child.full_name_en,
      'code', v_child.child_id_number,
      'avatar_url', v_child.avatar_url,
      'dob', v_child.dob,
      'gender', v_child.gender,
      'enrolled_on', coalesce(v_child.enrollment_date, v_child.created_at::date),
      'class', (select jsonb_build_object('id', c.id, 'ar', c.name_ar, 'en', c.name_en)
                  from public.classes c where c.id = v_child.class_id)
    ),

    -- Who to reach, and how.
    'parents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'ar', u.name_ar, 'en', u.name_en,
        'relationship', pc.relationship, 'phone', u.phone
      ) order by pc.is_primary desc nulls last, u.name_en)
        from public.parent_children pc
        join public.users u on u.id = pc.parent_id
       where pc.child_id = p_child_id
    ), '[]'::jsonb),

    -- What the child must not eat, and what she is given.
    'allergies', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', a.allergen_name, 'severity', a.severity,
               'reaction', a.reaction_type, 'treatment', a.treatment_protocol)
             order by case a.severity when 'life_threatening' then 0 when 'severe' then 1 when 'moderate' then 2 else 3 end)
        from public.child_allergies a where a.child_id = p_child_id
    ), '[]'::jsonb),

    -- The reports written about her, newest first.
    'reports', coalesce((
      select jsonb_agg(line order by line ->> 'date' desc) from (
        select jsonb_build_object(
          'id', r.id, 'date', r.report_date, 'status', r.status,
          'mood', r.mood, 'nap_minutes', r.nap_minutes, 'note', r.teacher_note,
          'published_at', r.published_at,
          'by', jsonb_build_object('ar', u.name_ar, 'en', u.name_en)
        ) line
          from public.daily_reports r
          left join public.users u on u.id = coalesce(r.submitted_by, r.teacher_id)
         where r.child_id = p_child_id
         order by r.report_date desc limit v_limit
      ) d
    ), '[]'::jsonb),

    -- The days she came and went.
    'attendance', coalesce((
      select jsonb_agg(line order by line ->> 'date' desc) from (
        select jsonb_build_object(
          'id', ar.id, 'date', ar.attendance_date,
          'check_in', ar.check_in, 'check_out', ar.check_out,
          'late_minutes', coalesce(ar.late_minutes, 0),
          'extra_hours', coalesce(ar.extra_hours, 0)
        ) line
          from public.attendance_records ar
         where ar.child_id = p_child_id
         order by ar.attendance_date desc limit v_limit
      ) d
    ), '[]'::jsonb),

    -- The days her family said she would be away.
    'absences', coalesce((
      select jsonb_agg(line order by line ->> 'date' desc) from (
        select jsonb_build_object('id', abr.id, 'date', abr.absence_date, 'reason', abr.reason, 'note', abr.note) line
          from public.attendance_absence_reports abr
         where abr.child_id = p_child_id
         order by abr.absence_date desc limit v_limit
      ) d
    ), '[]'::jsonb),

    -- The events she was asked to, and whether she went.
    'events', coalesce((
      select jsonb_agg(line order by line ->> 'starts_at' desc) from (
        select jsonb_build_object(
          'id', e.id, 'ar', e.title_ar, 'en', e.title_en,
          'starts_at', e.starts_at, 'category', e.category,
          'permission', p.status,
          'attended', (ea.id is not null)
        ) line
          from public.events e
          left join public.permissions p on p.event_id = e.id and p.child_id = p_child_id and p.deleted_at is null
          left join public.event_attendance ea on ea.event_id = e.id and ea.child_id = p_child_id
         where e.nursery_id = v_child.nursery_id
           and (p.id is not null or ea.id is not null)
         order by e.starts_at desc limit v_limit
      ) d
    ), '[]'::jsonb),

    -- What she reached, as her teachers recorded it.
    'milestones', coalesce((
      select jsonb_agg(line order by line ->> 'at' desc) from (
        select jsonb_build_object(
          'id', m.id, 'at', m.achieved_at, 'category', m.category,
          'ar', m.milestone_name_ar, 'en', m.milestone_name_en, 'note', m.notes,
          'by', jsonb_build_object('ar', u.name_ar, 'en', u.name_en)
        ) line
          from public.milestones m
          left join public.users u on u.id = m.teacher_id
         where m.child_id = p_child_id and m.deleted_at is null
         order by m.achieved_at desc limit v_limit
      ) d
    ), '[]'::jsonb),

    -- The health notes on file; the family's own screen holds the documents.
    'health', coalesce((
      select jsonb_agg(line order by line ->> 'date' desc) from (
        select jsonb_build_object('id', h.id, 'date', h.record_date, 'type', h.record_type, 'note', h.notes) line
          from public.health_records h
         where h.child_id = p_child_id
         order by h.record_date desc limit v_limit
      ) d
    ), '[]'::jsonb),

    -- What the teachers told her family about her class, so a colleague's words are not lost.
    'messages', coalesce((
      select jsonb_agg(line order by line ->> 'at' desc) from (
        select jsonb_build_object(
          'id', fm.id, 'at', fm.created_at, 'body', fm.body,
          'audience', fm.audience,
          'by', jsonb_build_object('ar', fm.sender_name_ar, 'en', fm.sender_name_en)
        ) line
          from public.family_messages fm
         where fm.nursery_id = v_child.nursery_id
           and (fm.class_id = v_child.class_id or fm.audience = 'nursery')
         order by fm.created_at desc limit v_limit
      ) d
    ), '[]'::jsonb),

    -- The photographs of her that were approved to share.
    'media', coalesce((
      select jsonb_agg(line order by line ->> 'at' desc) from (
        select jsonb_build_object(
          'id', md.id, 'at', coalesce(md.captured_at, md.created_at),
          'url', coalesce(md.thumbnail_url, md.file_url, md.url),
          'caption', md.caption, 'type', coalesce(md.file_type, md.type)
        ) line
          from public.media md
         where md.child_ids @> array[p_child_id]
           and coalesce(md.status, 'approved') = 'approved'
         order by coalesce(md.captured_at, md.created_at) desc limit v_limit
      ) d
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_child_history(uuid, integer) from public, anon;
grant execute on function public.get_child_history(uuid, integer) to authenticated;

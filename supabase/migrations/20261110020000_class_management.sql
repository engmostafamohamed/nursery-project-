-- Managing a class: creating it, changing it, putting children in it and taking them out, and
-- deleting it, through functions that check what the screens used to leave to the table.
--
--   * get_class_editor: the class (or none, for a new one), its children with their age and when
--     they joined, the nursery's other children that could join (with the class they are in now),
--     the other classes with their places, the age groups already in use, and what the viewer may do.
--   * save_class: a name in Arabic or English (the other is filled from it), unique in the nursery;
--     the age group and room short; places between 1 and 100.
--   * move_children_to_class: puts several children in a class (or takes them out of their class)
--     at once. Going over the class's places is refused unless the caller says it is meant; the
--     parents of a child who changes class are told which class.
--   * delete_class: a class with children is deleted only after they move to another class; its
--     team leaves it (and the team's history says so).
-- Who may: XO, the chain's admins, the branch's admins, and staff whose role may create, update or
-- delete classes.

create or replace function public.class_manage_allowed(p_nursery_id uuid, p_action text)
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
  if auth.uid() is null or p_nursery_id is null then
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
    return v_nursery is not distinct from p_nursery_id and public.user_can('classes', p_action);
  end if;
  return false;
end;
$$;
revoke execute on function public.class_manage_allowed(uuid, text) from public, anon;
grant execute on function public.class_manage_allowed(uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------------------------
create or replace function public.get_class_editor(p_nursery_id uuid, p_class_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_class public.classes%rowtype;
  v_nursery uuid := p_nursery_id;
begin
  if p_class_id is not null then
    select * into v_class from public.classes where id = p_class_id and deleted_at is null;
    if v_class.id is null then
      raise exception 'class_not_found' using errcode = 'P0002';
    end if;
    v_nursery := v_class.nursery_id;
  end if;
  if not public.class_manage_allowed(v_nursery, 'view') then
    raise exception 'class_forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'nursery_id', v_nursery,
    'today', public.nursery_today(v_nursery),
    'can', jsonb_build_object(
      'create', public.class_manage_allowed(v_nursery, 'create'),
      'update', public.class_manage_allowed(v_nursery, 'update'),
      'delete', public.class_manage_allowed(v_nursery, 'delete')),
    'class', case when v_class.id is null then null else jsonb_build_object(
      'id', v_class.id, 'name_ar', v_class.name_ar, 'name_en', v_class.name_en, 'grade_level', v_class.grade_level,
      'room_number', v_class.room_number, 'capacity', v_class.capacity, 'created_at', v_class.created_at) end,
    'children', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'name_ar', c.full_name_ar, 'name_en', c.full_name_en, 'code', c.child_id_number,
               'dob', c.dob, 'gender', c.gender, 'avatar_url', c.avatar_url,
               'enrolled_on', coalesce(c.enrollment_date, c.created_at::date))
             order by c.full_name_en, c.full_name_ar)
        from public.children c
       where v_class.id is not null and c.class_id = v_class.id and c.status = 'active'
    ), '[]'::jsonb),
    'candidates', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'name_ar', c.full_name_ar, 'name_en', c.full_name_en, 'code', c.child_id_number,
               'dob', c.dob, 'gender', c.gender, 'avatar_url', c.avatar_url,
               'class_id', c.class_id, 'class_ar', k.name_ar, 'class_en', k.name_en)
             order by (c.class_id is not null), c.full_name_en, c.full_name_ar)
        from public.children c
        left join public.classes k on k.id = c.class_id and k.deleted_at is null
       where c.nursery_id = v_nursery and c.status = 'active'
         and (v_class.id is null or c.class_id is distinct from v_class.id)
    ), '[]'::jsonb),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', k.id, 'name_ar', k.name_ar, 'name_en', k.name_en, 'grade_level', k.grade_level, 'capacity', k.capacity,
               'children', (select count(*) from public.children c where c.class_id = k.id and c.status = 'active'))
             order by k.name_en, k.name_ar)
        from public.classes k
       where k.nursery_id = v_nursery and k.deleted_at is null and (v_class.id is null or k.id <> v_class.id)
    ), '[]'::jsonb),
    'grade_levels', coalesce((
      select jsonb_agg(g order by g)
        from (select distinct btrim(k.grade_level) as g from public.classes k
               where k.nursery_id = v_nursery and k.deleted_at is null and nullif(btrim(k.grade_level), '') is not null) x
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.get_class_editor(uuid, uuid) from public, anon;
grant execute on function public.get_class_editor(uuid, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------------------------
-- Creates a class (p_id null) or changes it. Returns its id.
create or replace function public.save_class(
  p_nursery_id uuid, p_id uuid, p_name_ar text, p_name_en text, p_grade_level text, p_room_number text, p_capacity integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ar text := nullif(btrim(coalesce(p_name_ar, '')), '');
  v_en text := nullif(btrim(coalesce(p_name_en, '')), '');
  v_nursery uuid := p_nursery_id;
  v_id uuid := p_id;
begin
  if p_id is not null then
    select nursery_id into v_nursery from public.classes where id = p_id and deleted_at is null;
    if v_nursery is null then
      raise exception 'class_not_found' using errcode = 'P0002';
    end if;
  end if;
  if not public.class_manage_allowed(v_nursery, case when p_id is null then 'create' else 'update' end) then
    raise exception 'class_forbidden' using errcode = '42501';
  end if;
  if v_ar is null and v_en is null then
    raise exception 'class_name_required' using errcode = '22023';
  end if;
  if char_length(coalesce(v_ar, '')) > 60 or char_length(coalesce(v_en, '')) > 60
     or char_length(btrim(coalesce(p_grade_level, ''))) > 40 or char_length(btrim(coalesce(p_room_number, ''))) > 20 then
    raise exception 'class_text_too_long' using errcode = '22023';
  end if;
  if p_capacity is not null and p_capacity not between 1 and 100 then
    raise exception 'class_capacity_invalid' using errcode = '22023';
  end if;
  v_ar := coalesce(v_ar, v_en);
  v_en := coalesce(v_en, v_ar);
  if exists (
    select 1 from public.classes k
     where k.nursery_id = v_nursery and k.deleted_at is null and k.id is distinct from p_id
       and (lower(btrim(k.name_ar)) = lower(v_ar) or lower(btrim(k.name_en)) = lower(v_en))
  ) then
    raise exception 'class_name_taken' using errcode = '23505';
  end if;

  if p_id is null then
    insert into public.classes (nursery_id, name_ar, name_en, grade_level, room_number, capacity)
    values (v_nursery, v_ar, v_en, nullif(btrim(coalesce(p_grade_level, '')), ''), nullif(btrim(coalesce(p_room_number, '')), ''), p_capacity)
    returning id into v_id;
  else
    update public.classes
       set name_ar = v_ar, name_en = v_en,
           grade_level = nullif(btrim(coalesce(p_grade_level, '')), ''), room_number = nullif(btrim(coalesce(p_room_number, '')), ''),
           capacity = p_capacity, updated_at = now()
     where id = p_id;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.save_class(uuid, uuid, text, text, text, text, integer) from public, anon;
grant execute on function public.save_class(uuid, uuid, text, text, text, text, integer) to authenticated, service_role;

-- -----------------------------------------------------------------------------------------------
-- Puts children in a class (p_class_id), or takes them out of their class (null). Going over the
-- class's places needs p_over_capacity_ok. Parents of a child who joins a class are told.
create or replace function public.move_children_to_class(p_child_ids uuid[], p_class_id uuid, p_over_capacity_ok boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class public.classes%rowtype;
  v_nursery uuid;
  v_ids uuid[];
  v_moving integer;
  v_after integer;
  v_child record;
begin
  v_ids := array(select distinct x from unnest(coalesce(p_child_ids, '{}')) x where x is not null);
  if cardinality(v_ids) = 0 or cardinality(v_ids) > 300 then
    raise exception 'class_children_invalid' using errcode = '22023';
  end if;
  if p_class_id is not null then
    select * into v_class from public.classes where id = p_class_id and deleted_at is null;
    if v_class.id is null then
      raise exception 'class_not_found' using errcode = 'P0002';
    end if;
    v_nursery := v_class.nursery_id;
  else
    select min(c.nursery_id::text)::uuid into v_nursery from public.children c where c.id = any (v_ids);
  end if;
  if not public.class_manage_allowed(v_nursery, 'update') then
    raise exception 'class_forbidden' using errcode = '42501';
  end if;
  -- Every child is an active child of this nursery.
  if (select count(*) from public.children c where c.id = any (v_ids) and c.nursery_id = v_nursery and c.status = 'active') <> cardinality(v_ids) then
    raise exception 'class_children_invalid' using errcode = '22023';
  end if;

  select count(*) into v_moving from public.children c where c.id = any (v_ids) and c.class_id is distinct from p_class_id;
  if p_class_id is not null and v_class.capacity is not null then
    v_after := (select count(*) from public.children c where c.class_id = p_class_id and c.status = 'active') + v_moving;
    if v_after > v_class.capacity and not coalesce(p_over_capacity_ok, false) then
      raise exception 'class_over_capacity' using errcode = 'P0001', detail = format('%s/%s', v_after, v_class.capacity);
    end if;
  end if;

  for v_child in
    select c.id, c.full_name_ar, c.full_name_en from public.children c where c.id = any (v_ids) and c.class_id is distinct from p_class_id
  loop
    update public.children set class_id = p_class_id, updated_at = now() where id = v_child.id;
    if p_class_id is not null then
      perform public.notify_users(
        array(select pc.parent_id from public.parent_children pc where pc.child_id = v_child.id),
        v_nursery, 'child_class_changed', 'child_class_changed',
        jsonb_build_object('child', public.i18n_names(v_child.full_name_ar, v_child.full_name_en),
                           'class', public.i18n_names(v_class.name_ar, v_class.name_en)),
        '/parent', 'normal', null);
    end if;
  end loop;

  return jsonb_build_object(
    'moved', v_moving,
    'class_children', case when p_class_id is null then null
                           else (select count(*) from public.children c where c.class_id = p_class_id and c.status = 'active') end,
    'capacity', v_class.capacity);
end;
$$;
revoke execute on function public.move_children_to_class(uuid[], uuid, boolean) from public, anon;
grant execute on function public.move_children_to_class(uuid[], uuid, boolean) to authenticated, service_role;

-- -----------------------------------------------------------------------------------------------
-- Deletes a class. Its children first move to p_move_to (required when it has any); its team leaves
-- it. Returns how many children moved.
create or replace function public.delete_class(p_class_id uuid, p_move_to uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class public.classes%rowtype;
  v_target public.classes%rowtype;
  v_children uuid[];
  v_moved integer := 0;
begin
  select * into v_class from public.classes where id = p_class_id and deleted_at is null;
  if v_class.id is null then
    raise exception 'class_not_found' using errcode = 'P0002';
  end if;
  if not public.class_manage_allowed(v_class.nursery_id, 'delete') then
    raise exception 'class_forbidden' using errcode = '42501';
  end if;
  v_children := array(select c.id from public.children c where c.class_id = p_class_id and c.status = 'active');
  if cardinality(v_children) > 0 then
    if p_move_to is null then
      raise exception 'class_has_children' using errcode = 'P0001', detail = cardinality(v_children)::text;
    end if;
    select * into v_target from public.classes where id = p_move_to and deleted_at is null;
    if v_target.id is null or v_target.id = v_class.id or v_target.nursery_id <> v_class.nursery_id then
      raise exception 'class_not_found' using errcode = 'P0002';
    end if;
    perform public.move_children_to_class(v_children, v_target.id, true);
    v_moved := cardinality(v_children);
  end if;
  -- Children no longer active keep no link to a class that is gone.
  update public.children set class_id = null, updated_at = now() where class_id = p_class_id;

  insert into public.class_team_changes (nursery_id, class_id, user_id, action, role, previous_role, changed_by)
  select v_class.nursery_id, v_class.id, cs.user_id, 'removed', null, cs.role, auth.uid()
    from public.class_staff cs where cs.class_id = v_class.id;
  delete from public.class_staff where class_id = v_class.id;
  update public.classes set deleted_at = now(), updated_at = now() where id = v_class.id;
  return jsonb_build_object('moved', v_moved);
end;
$$;
revoke execute on function public.delete_class(uuid, uuid) from public, anon;
grant execute on function public.delete_class(uuid, uuid) to authenticated, service_role;

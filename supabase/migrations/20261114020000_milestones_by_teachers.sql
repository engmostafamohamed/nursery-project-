-- Milestones, recorded by the teachers of the child's class and shown to the family.
--
-- What was wrong: the table had rules for the admins and the families only, so a teacher could
-- neither read nor record a milestone; and the record screen left out the two required name columns,
-- so even an admin's insert failed. No family ever saw a milestone (there are none on dev). The
-- teacher's screen also sent the family's notice itself (refused: teachers may not write
-- notifications), took the photo as a pasted link, and removed a milestone for good.
--
-- Now:
--  * The staff of the child's class and the nursery's admins read the child's milestones; the family
--    reads the ones shared with it. Removed ones are hidden from both.
--  * They are written only through milestone_save, which checks the milestone (text, kind, a date
--    between the child's birth and today, the photo in the child's folder) and tells the family the
--    first time it is shared with them; and milestone_remove, which sets it aside (deleted_at, by).
--  * The photo is uploaded to the media bucket at <nursery>/milestones/<child>/<file>; the family
--    reads it while the milestone is shared with them.

alter table public.milestones
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.users (id) on delete set null;

create index if not exists idx_milestones_child_achieved on public.milestones (child_id, achieved_at desc) where deleted_at is null;
create index if not exists idx_milestones_photo on public.milestones (photo_url) where photo_url is not null;

-- Whether the signed-in user may record (and read) this child's milestones: the nursery's admins and
-- managers, or a teacher of the child's class.
create or replace function public.milestone_can_record(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.children c
     where c.id = p_child_id
       and (public.is_nursery_staff(c.nursery_id, false)
            or (public.current_user_role() = 'teacher'::public.user_role and c.id in (select public.my_class_children())))
  );
$$;

-- The children of the signed-in teacher's classes, read by the rule below as the teacher.
grant execute on function public.my_class_children() to authenticated;

drop policy if exists milestones_admin_select on public.milestones;
drop policy if exists milestones_branch_all on public.milestones;
drop policy if exists milestones_chain_all on public.milestones;
drop policy if exists milestones_parent_select on public.milestones;
drop policy if exists milestones_staff_select on public.milestones;

create policy milestones_staff_select on public.milestones
  for select to authenticated
  using (
    deleted_at is null
    and (public.is_nursery_staff(nursery_id, false)
         or (public.current_user_role() = 'teacher'::public.user_role and child_id in (select public.my_class_children())))
  );

create policy milestones_parent_select on public.milestones
  for select to authenticated
  using (
    deleted_at is null and shared_with_parent
    and public.current_user_role() = 'parent'::public.user_role
    and public.parent_can_access_child(child_id)
  );

revoke insert, update, delete, truncate on public.milestones from anon, authenticated;

-- Records a milestone (p_milestone_id null) or changes one. p_milestone: child_id (a new one only),
-- category, milestone_text, achieved_at, notes, photo_path, shared_with_parent. Returns its id.
create or replace function public.milestone_save(p_milestone_id uuid, p_milestone jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.milestones;
  v_child public.children;
  v_text text := btrim(coalesce(p_milestone ->> 'milestone_text', ''));
  v_category text := p_milestone ->> 'category';
  v_notes text := nullif(btrim(coalesce(p_milestone ->> 'notes', '')), '');
  v_photo text := nullif(btrim(coalesce(p_milestone ->> 'photo_path', '')), '');
  v_shared boolean := coalesce((p_milestone ->> 'shared_with_parent')::boolean, true);
  v_achieved date;
  v_id uuid;
begin
  if auth.uid() is null or public.current_user_role() is null then
    raise exception 'milestone_forbidden' using errcode = 'P0001';
  end if;

  if p_milestone_id is not null then
    select * into v_old from public.milestones where id = p_milestone_id and deleted_at is null for update;
    if not found then
      raise exception 'milestone_not_found' using errcode = 'P0001';
    end if;
  end if;

  select * into v_child from public.children
   where id = coalesce(v_old.child_id, nullif(p_milestone ->> 'child_id', '')::uuid);
  if not found then
    raise exception 'milestone_child_required' using errcode = 'P0001';
  end if;
  if not public.milestone_can_record(v_child.id) then
    raise exception 'milestone_forbidden' using errcode = 'P0001';
  end if;

  if v_text = '' then
    raise exception 'milestone_text_required' using errcode = 'P0001';
  end if;
  if length(v_text) > 200 or length(coalesce(v_notes, '')) > 300 then
    raise exception 'milestone_too_long' using errcode = 'P0001';
  end if;
  if v_category is null or v_category not in ('motor_skills', 'social', 'cognitive', 'language', 'self_care', 'creative') then
    raise exception 'milestone_category_invalid' using errcode = 'P0001';
  end if;
  begin
    v_achieved := (p_milestone ->> 'achieved_at')::date;
  exception when others then
    v_achieved := null;
  end;
  if v_achieved is null or v_achieved > public.nursery_today(v_child.nursery_id)
     or (v_child.dob is not null and v_achieved < v_child.dob) then
    raise exception 'milestone_date_invalid' using errcode = 'P0001';
  end if;
  -- A new photo is one uploaded to the child's folder (an old one is kept as it was).
  if v_photo is not null and v_photo is distinct from v_old.photo_url
     and (v_photo not like v_child.nursery_id::text || '/milestones/' || v_child.id::text || '/%' or v_photo like '%..%') then
    raise exception 'milestone_photo_invalid' using errcode = 'P0001';
  end if;

  if v_old.id is null then
    insert into public.milestones (
      nursery_id, child_id, teacher_id, category, milestone_text, milestone_name_ar, milestone_name_en,
      achieved_at, notes, photo_url, shared_with_parent
    ) values (
      v_child.nursery_id, v_child.id, auth.uid(), v_category, v_text, v_text, v_text,
      v_achieved, v_notes, v_photo, v_shared
    ) returning id into v_id;
  else
    update public.milestones
       set category = v_category, milestone_text = v_text, milestone_name_ar = v_text, milestone_name_en = v_text,
           achieved_at = v_achieved, notes = v_notes, photo_url = v_photo, shared_with_parent = v_shared
     where id = v_old.id;
    v_id := v_old.id;
  end if;

  -- The family hears of it once: when it is first shared with them.
  if v_shared and not coalesce(v_old.shared_with_parent, false) then
    perform public.notify_users(
      array(select pc.parent_id from public.parent_children pc where pc.child_id = v_child.id),
      v_child.nursery_id, 'milestone_shared', 'milestone_shared',
      jsonb_build_object('child', jsonb_build_object('ar', v_child.full_name_ar, 'en', v_child.full_name_en), 'milestone', v_text),
      '/parent/milestones?child=' || v_child.id::text
    );
  end if;
  return v_id;
end;
$$;

-- Sets a milestone aside: hidden from the staff and the family, kept in the table.
create or replace function public.milestone_remove(p_milestone_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child uuid;
begin
  select child_id into v_child from public.milestones where id = p_milestone_id and deleted_at is null for update;
  if not found then
    raise exception 'milestone_not_found' using errcode = 'P0001';
  end if;
  if not public.milestone_can_record(v_child) then
    raise exception 'milestone_forbidden' using errcode = 'P0001';
  end if;
  update public.milestones set deleted_at = now(), deleted_by = auth.uid() where id = p_milestone_id;
end;
$$;

revoke all on function public.milestone_can_record(uuid) from public, anon;
revoke all on function public.milestone_save(uuid, jsonb) from public, anon;
revoke all on function public.milestone_remove(uuid) from public, anon;
grant execute on function public.milestone_can_record(uuid) to authenticated;
grant execute on function public.milestone_save(uuid, jsonb) to authenticated;
grant execute on function public.milestone_remove(uuid) to authenticated;

-- The storage gate (as in 20261113050000), with the family reading the photo of a milestone shared
-- with them from the media bucket.
create or replace function public.storage_file_access(p_bucket text, p_name text, p_action text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_nursery uuid := public.storage_path_uuid(p_name, 1);
  v_folder text := split_part(p_name, '/', 2);
  v_write boolean := p_action = 'write';
begin
  if auth.uid() is null or public.current_user_role() is null or p_action not in ('read', 'write') then
    return false;
  end if;

  case p_bucket
    when 'application-documents' then
      if v_folder = 'qr-pickup-identities' then
        return public.is_nursery_staff(v_nursery) or public.storage_family_of(v_nursery, public.storage_path_uuid(p_name, 3));
      end if;
      return public.is_nursery_staff(v_nursery, false)
        or exists (
          select 1 from public.applications a
           where a.id = public.storage_path_uuid(p_name, 2) and a.nursery_id = v_nursery and a.parent_id = auth.uid()
        );

    when 'child-documents' then
      if v_folder = 'health' then
        return public.is_nursery_staff(v_nursery, false) or public.storage_family_of(v_nursery, public.storage_path_uuid(p_name, 3));
      end if;
      return public.is_nursery_staff(v_nursery, false);

    when 'authorized-pickup-photos' then
      if v_write then
        return public.is_nursery_staff(v_nursery, false);
      end if;
      return public.is_nursery_staff(v_nursery)
        or exists (
          select 1 from public.authorized_pickups ap
           where ap.photo_url = p_name and public.storage_family_of(v_nursery, ap.child_id)
        );

    when 'pickup-id-photos' then
      if v_write then
        return public.is_nursery_staff(v_nursery);
      end if;
      return public.is_nursery_staff(v_nursery) or public.storage_family_of(v_nursery, public.storage_path_uuid(p_name, 2));

    when 'staff-documents', 'staff-photos' then
      return public.storage_staff_files_admin(v_nursery)
        or (not v_write and exists (
          select 1 from public.staff_profiles sp
           where sp.user_id = auth.uid()
             and sp.id = coalesce(public.storage_path_uuid(p_name, 2), public.storage_path_uuid(p_name, 3))
        ));

    when 'child-avatars' then
      if v_write then
        return public.is_nursery_staff(v_nursery, false);
      end if;
      return public.is_nursery_staff(v_nursery) or public.storage_family_of(v_nursery, public.storage_path_uuid(p_name, 2));

    when 'media' then
      if v_write then
        return public.is_nursery_staff(v_nursery);
      end if;
      return public.is_nursery_staff(v_nursery)
        or (public.current_user_role() = 'parent'::public.user_role and exists (
          select 1 from public.media m
           where m.nursery_id = v_nursery and p_name in (m.file_url, m.url, m.thumbnail_url)
             and public.rls_media_parent_may_view(m.id)
        ))
        or exists (
          select 1 from public.milestones ms
           where ms.photo_url = p_name and ms.nursery_id = v_nursery and ms.shared_with_parent and ms.deleted_at is null
             and public.storage_family_of(v_nursery, ms.child_id)
        );

    when 'chat-files' then
      if split_part(p_name, '/', 1) = auth.uid()::text then
        return true;
      end if;
      return not v_write and exists (
        select 1 from public.chat_messages m
         where m.type = 'file' and m.content = 'chat-file:' || p_name
           and (public.is_chat_member(m.conversation_id) or public.can_moderate_chat(m.conversation_id))
      );

    else
      return false;
  end case;
end;
$$;

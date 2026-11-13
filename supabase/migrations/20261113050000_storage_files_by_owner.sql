-- Security: who opens which file.
--
-- The stored files were read by "anyone whose nursery is the folder's": every family of a nursery
-- listed and downloaded the other families' application documents (birth certificates, parents'
-- IDs), the children's health documents, the photos of the people allowed to collect a child, the
-- staff's documents (national IDs, criminal checks), and every photo of the media library, even
-- the ones not shared or of children whose family refused photos. Any signed-in user, of any
-- nursery, read every chat attachment of the platform, and replaced or deleted any child's photo.
--
-- Now one function decides, from the file's path (each folder names the nursery, then the
-- application, the child or the staff member it belongs to), the same way the screens' tables do:
--   application-documents  <nursery>/<application>/...            the nursery's admins; the family who applied
--                          <nursery>/qr-pickup-identities/<child>/ the nursery's staff; the child's family
--   child-documents        <nursery>/health/<child>/...           the nursery's admins; the child's family
--                          <nursery>/<anything else>/...          the nursery's admins
--   authorized-pickup-photos <nursery>/...                        the nursery's staff; the family whose
--                                                                 authorized person it shows (read)
--   pickup-id-photos       <nursery>/<child>/...                  the nursery's staff; the child's family (read)
--   staff-documents, staff-photos <nursery>/[staff/]<profile>/... the admins and HR; the person (read)
--   child-avatars          <nursery>/<child>/...                  the staff (read), the admins (change);
--                                                                 the child's family (read)
--   media                  <nursery>/<yyyy>/<mm>/...              the nursery's staff; a family when the
--                                                                 photo is shared with them (as media_parent_select)
--   chat-files             <sender>/...                           the sender; the members of the conversation
-- "Admins" are the branch admin and the managers (a chain admin for its nurseries, the platform
-- admin); "staff" adds the teachers. An account that is not active opens nothing.

-- The uuid in one part of a path, or null.
create or replace function public.storage_path_uuid(p_name text, p_part integer)
returns uuid
language sql
immutable
as $$
  select case
    when split_part(p_name, '/', p_part) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(p_name, '/', p_part)::uuid
  end;
$$;

-- Whether the signed-in user is a parent of a child of that nursery.
create or replace function public.storage_family_of(p_nursery_id uuid, p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_child_id is not null
     and public.current_user_role() = 'parent'::public.user_role
     and public.parent_can_access_child(p_child_id)
     and exists (select 1 from public.children c where c.id = p_child_id and c.nursery_id = p_nursery_id);
$$;

-- Who handles the staff's files of a nursery: its branch admin and HR, a chain admin for the chain's
-- nurseries, the platform admin.
create or replace function public.storage_staff_files_admin(p_nursery_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_nursery_id is not null and (
    public.is_xo_super_admin()
    or (public.current_user_role() = 'chain_super_admin'::public.user_role
        and p_nursery_id in (select public.nursery_ids_for_chain_admin()))
    or (public.current_user_nursery_id() = p_nursery_id
        and (public.current_user_role() = 'branch_admin'::public.user_role or public.is_manager_hr()))
  );
$$;

-- Whether the signed-in user may read ('read') or upload and replace ('write') a stored file.
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
        ));

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

create index if not exists idx_chat_messages_file_content on public.chat_messages (content) where type = 'file';
create index if not exists idx_media_file_url on public.media (file_url);

-- The old rules of these buckets.
drop policy if exists "Admins can view nursery media objects" on storage.objects;
drop policy if exists "Teachers can upload media objects in nursery path" on storage.objects;
drop policy if exists "Teachers can view own nursery media objects" on storage.objects;
drop policy if exists "Authenticated read child avatars" on storage.objects;
drop policy if exists "Authenticated upload child avatars" on storage.objects;
drop policy if exists "Authenticated update child avatars" on storage.objects;
drop policy if exists "Authenticated delete child avatars" on storage.objects;
drop policy if exists "Authenticated upload application documents" on storage.objects;
drop policy if exists "Parents and admins read application documents" on storage.objects;
drop policy if exists "Child docs insert nursery path" on storage.objects;
drop policy if exists "Child docs select nursery path" on storage.objects;
drop policy if exists "Pickup id photos insert nursery path" on storage.objects;
drop policy if exists "Pickup id photos select nursery path" on storage.objects;
drop policy if exists "Pickup photos insert nursery path" on storage.objects;
drop policy if exists "Pickup photos select nursery path" on storage.objects;
drop policy if exists "Staff docs insert nursery path" on storage.objects;
drop policy if exists "Staff docs select nursery path" on storage.objects;
drop policy if exists chat_files_authenticated_read on storage.objects;
drop policy if exists chat_files_insert_own_folder on storage.objects;

-- The new ones: one rule for all of them.
drop policy if exists "files: read" on storage.objects;
create policy "files: read" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('application-documents', 'child-documents', 'authorized-pickup-photos', 'pickup-id-photos',
                  'staff-documents', 'staff-photos', 'child-avatars', 'media', 'chat-files')
    and public.storage_file_access(bucket_id, name, 'read')
  );

drop policy if exists "files: upload" on storage.objects;
create policy "files: upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('application-documents', 'child-documents', 'authorized-pickup-photos', 'pickup-id-photos',
                  'staff-documents', 'staff-photos', 'child-avatars', 'media', 'chat-files')
    and public.storage_file_access(bucket_id, name, 'write')
  );

drop policy if exists "files: replace" on storage.objects;
create policy "files: replace" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('application-documents', 'child-documents', 'authorized-pickup-photos', 'pickup-id-photos',
                  'staff-documents', 'staff-photos', 'child-avatars', 'media', 'chat-files')
    and public.storage_file_access(bucket_id, name, 'write')
  )
  with check (
    bucket_id in ('application-documents', 'child-documents', 'authorized-pickup-photos', 'pickup-id-photos',
                  'staff-documents', 'staff-photos', 'child-avatars', 'media', 'chat-files')
    and public.storage_file_access(bucket_id, name, 'write')
  );

-- A child's photo can be taken off (by the admins, as before for anyone).
drop policy if exists "files: child avatar removed" on storage.objects;
create policy "files: child avatar removed" on storage.objects
  for delete to authenticated
  using (bucket_id = 'child-avatars' and public.storage_file_access(bucket_id, name, 'write'));

revoke execute on function public.storage_path_uuid(text, integer) from public, anon;
revoke execute on function public.storage_family_of(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.storage_staff_files_admin(uuid) from public, anon, authenticated;
revoke execute on function public.storage_file_access(text, text, text) from public, anon;
grant execute on function public.storage_path_uuid(text, integer) to authenticated, service_role;
grant execute on function public.storage_family_of(uuid, uuid) to service_role;
grant execute on function public.storage_staff_files_admin(uuid) to service_role;
grant execute on function public.storage_file_access(text, text, text) to authenticated, service_role;

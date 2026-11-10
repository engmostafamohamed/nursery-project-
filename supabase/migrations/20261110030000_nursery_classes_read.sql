-- The nursery's classes for the lists and pickers (useNurseryClasses), read through a function:
-- the service worker answers table reads from its cache first, so a class just created, changed or
-- deleted showed late. Each class with its age group, room, places, active children and team (lead,
-- backup, assistants, nannies, with names). For the nursery's staff, its chain's admins and XO.

create or replace function public.get_nursery_classes(p_nursery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.menu_viewer_kind(p_nursery_id) is distinct from 'staff' then
    raise exception 'class_forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', k.id, 'nursery_id', k.nursery_id, 'name_ar', k.name_ar, 'name_en', k.name_en,
             'grade_level', k.grade_level, 'capacity', k.capacity, 'room_number', k.room_number,
             'child_count', (select count(*) from public.children c where c.class_id = k.id and c.status = 'active'),
             'staff', coalesce((
               select jsonb_agg(jsonb_build_object('user_id', u.id, 'role', cs.role, 'name_ar', u.name_ar, 'name_en', u.name_en,
                                                   'email', u.email, 'phone', u.phone) order by cs.role, u.name_en)
                 from public.class_staff cs join public.users u on u.id = cs.user_id
                where cs.class_id = k.id
             ), '[]'::jsonb))
           order by k.name_en, k.name_ar)
      from public.classes k
     where k.nursery_id = p_nursery_id and k.deleted_at is null
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.get_nursery_classes(uuid) from public, anon;
grant execute on function public.get_nursery_classes(uuid) to authenticated, service_role;

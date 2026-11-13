-- Security: the public inquiry form reads the class names of one nursery, not the classes table.
--
-- To fill its class list, the form let anyone signed out read every class of every nursery (names,
-- capacity, room numbers). Now it asks for the names of one nursery's classes, and the table is
-- closed to the signed-out.

create or replace function public.inquiry_classes(p_nursery_id uuid)
returns table (id uuid, name_ar text, name_en text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name_ar, c.name_en
    from public.classes c
   where c.nursery_id = p_nursery_id and c.deleted_at is null
   order by c.created_at;
$$;

revoke execute on function public.inquiry_classes(uuid) from public;
grant execute on function public.inquiry_classes(uuid) to anon, authenticated, service_role;

drop policy if exists classes_public_select_for_inquiry on public.classes;

-- Chat recipient directory.
--
-- The users table SELECT RLS only lets non-admins read their own row, so the
-- chat recipient picker cannot resolve names/roles for teachers and parents.
-- This SECURITY DEFINER function returns a nursery-scoped directory with a
-- privacy rule: parents only see staff (never other parents); staff and admins
-- see everyone in their nursery. Read-only and idempotent.

create or replace function public.chat_directory(search text default null)
returns table (
  id uuid,
  name_ar text,
  name_en text,
  role text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select nursery_id, role
    from public.users
    where id = auth.uid()
  )
  select u.id, u.name_ar, u.name_en, u.role::text
  from public.users u, me
  where u.nursery_id = me.nursery_id
    and u.id <> auth.uid()
    -- parents only see staff; everyone else sees all roles
    and (me.role <> 'parent' or u.role <> 'parent')
    and (
      search is null
      or btrim(search) = ''
      or u.name_ar ilike '%' || search || '%'
      or u.name_en ilike '%' || search || '%'
    )
  order by u.role::text, u.name_en
  limit 200;
$$;

grant execute on function public.chat_directory(text) to authenticated;

comment on function public.chat_directory(text) is
  'Nursery-scoped chat recipient directory. Parents see staff only; staff/admins see everyone.';

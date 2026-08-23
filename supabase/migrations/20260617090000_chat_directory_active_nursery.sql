-- chat_directory: let chain/xo super admins (who have no home nursery, or manage
-- several) target a specific nursery via p_nursery_id, so the chat recipient
-- picker is populated for them. Everyone else stays scoped to their own nursery.
--
-- Replaces the single-arg version; drop it first to avoid an ambiguous-overload
-- error for existing callers that pass only `search`.

drop function if exists public.chat_directory(text);

create or replace function public.chat_directory(
  search text default null,
  p_nursery_id uuid default null
)
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
    select nursery_id, role from public.users where id = auth.uid()
  ),
  target as (
    select case
      when (select role from me) = 'xo_super_admin' and p_nursery_id is not null
        then p_nursery_id
      when (select role from me) = 'chain_super_admin' and p_nursery_id is not null
        and p_nursery_id in (select public.nursery_ids_for_chain_admin())
        then p_nursery_id
      else (select nursery_id from me)
    end as nursery_id
  )
  select u.id, u.name_ar, u.name_en, u.role::text
  from public.users u, me, target
  where u.nursery_id = target.nursery_id
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

grant execute on function public.chat_directory(text, uuid) to authenticated;

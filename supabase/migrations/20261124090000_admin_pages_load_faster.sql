-- The platform admin's pages load in one go and stop failing and retrying.
--
-- 1. The nurseries list (XO admin): every nursery with its users, children and invoices counted, in
--    one call. The page used to send four counts per nursery from the browser: 89 requests for 22
--    nurseries, each waiting its turn, and the whole set twice.
--
-- 2. A nursery's settings: the platform's super admin (who has no nursery of their own) and a chain's
--    super admin (for their chain's branches) can read and change them. Until now both read nothing:
--    every page that reads the settings then tried to create the row (nobody may: the row is created
--    with the nursery, by trigger), was refused, tried again, and showed the defaults instead of the
--    nursery's real settings.
--
-- 3. Every nursery has its settings row. Two nurseries made by the demo seed had none.

-- 1 ----------------------------------------------------------------------------------------------
create or replace function public.get_xo_nursery_list()
returns table (
  id uuid,
  name_ar text,
  name_en text,
  city text,
  logo_url text,
  subscription_status text,
  subscription_plan text,
  trial_ends_at timestamptz,
  suspended_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz,
  user_count integer,
  child_count integer,
  active_child_count integer,
  invoice_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_xo_super_admin() then
    raise exception 'xo_nursery_list_forbidden' using errcode = '42501';
  end if;

  return query
    select n.id, n.name_ar, n.name_en, n.city, n.logo_url, n.subscription_status, n.subscription_plan,
           n.trial_ends_at, n.suspended_at, n.deleted_at, n.created_at,
           coalesce(u.total, 0)::integer,
           coalesce(c.total, 0)::integer,
           coalesce(c.active, 0)::integer,
           coalesce(i.total, 0)::integer
      from public.nurseries n
      left join (
        select x.nursery_id, count(*) as total from public.users x group by x.nursery_id
      ) u on u.nursery_id = n.id
      left join (
        select x.nursery_id, count(*) as total, count(*) filter (where x.status = 'active') as active
          from public.children x group by x.nursery_id
      ) c on c.nursery_id = n.id
      left join (
        select x.nursery_id, count(*) as total from public.invoices x group by x.nursery_id
      ) i on i.nursery_id = n.id
     order by n.created_at desc;
end;
$$;

revoke execute on function public.get_xo_nursery_list() from public, anon;
grant execute on function public.get_xo_nursery_list() to authenticated, service_role;

-- 2 ----------------------------------------------------------------------------------------------
-- (select ...) around each check: worked out once per query, not once per row.
drop policy if exists nursery_settings_platform_select on public.nursery_settings;
create policy nursery_settings_platform_select on public.nursery_settings
  for select to authenticated
  using (
    (select public.is_xo_super_admin())
    or (
      (select public.current_user_role()) = 'chain_super_admin'::public.user_role
      and nursery_id in (select public.nursery_ids_for_chain_admin())
    )
  );

drop policy if exists nursery_settings_platform_update on public.nursery_settings;
create policy nursery_settings_platform_update on public.nursery_settings
  for update to authenticated
  using (
    (select public.is_xo_super_admin())
    or (
      (select public.current_user_role()) = 'chain_super_admin'::public.user_role
      and nursery_id in (select public.nursery_ids_for_chain_admin())
    )
  )
  with check (
    (select public.is_xo_super_admin())
    or (
      (select public.current_user_role()) = 'chain_super_admin'::public.user_role
      and nursery_id in (select public.nursery_ids_for_chain_admin())
    )
  );

-- 3 ----------------------------------------------------------------------------------------------
insert into public.nursery_settings (nursery_id)
select n.id
  from public.nurseries n
 where not exists (select 1 from public.nursery_settings s where s.nursery_id = n.id);

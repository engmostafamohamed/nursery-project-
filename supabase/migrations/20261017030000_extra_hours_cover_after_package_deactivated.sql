-- Switching off an extra-hours package stops new sales only; children who already hold it keep
-- their cover, as a tuition package keeps billing its subscribers after it is switched off.
--
-- 1. package_apply_extra_hours: drop the "package is active" condition. Before, deactivating a
--    package silently charged late fees to every child who had paid for it. Expiry (expires_at)
--    and the hours quota still end the cover. Identical to the live function otherwise.
-- 2. packages_parent_select: a parent still sees a switched-off package one of their children
--    holds (its name and hours on the child's billing card); new choices list active ones only.

begin;

CREATE OR REPLACE FUNCTION public.package_apply_extra_hours(p_child_id uuid, p_extra_hours numeric, p_consume boolean DEFAULT false)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cp        public.child_packages%rowtype;
  pkg       public.packages%rowtype;
  remaining numeric;
  covered   numeric := 0;
begin
  if p_extra_hours is null or p_extra_hours <= 0 then
    return 0;
  end if;

  select * into cp
  from public.child_packages
  where child_id = p_child_id and status = 'active'
  limit 1;
  if not found then
    return 0;
  end if;

  if cp.expires_at is not null and cp.expires_at <= now() then
    return 0;
  end if;

  select * into pkg from public.packages where id = cp.package_id;
  -- Changed: no longer "or not pkg.active". Switching a package off stops selling it; a child who
  -- already holds it keeps its cover until it expires or is used up.
  if not found then
    return 0;
  end if;

  if pkg.coverage_type = 'unlimited' then
    return p_extra_hours;
  end if;

  remaining := greatest(coalesce(pkg.included_hours, 0) - cp.hours_used, 0);
  covered := least(p_extra_hours, remaining);

  if p_consume and covered > 0 then
    update public.child_packages
       set hours_used = hours_used + covered
     where id = cp.id;
  end if;

  return covered;
end;
$function$;

drop policy if exists packages_parent_select on public.packages;
create policy packages_parent_select on public.packages for select to authenticated
  using (
    public.current_user_role() = 'parent'::public.user_role
    and nursery_id = public.current_user_nursery_id()
    and (
      active = true
      or exists (
        select 1
          from public.child_packages cp
          join public.parent_children pc on pc.child_id = cp.child_id
         where cp.package_id = packages.id
           and cp.status = 'active'
           and pc.parent_id = auth.uid()
      )
    )
  );

commit;

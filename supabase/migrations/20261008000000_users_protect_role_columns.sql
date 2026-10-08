-- Security hotfix: who a user is (role, role_id, department, nursery, chain) could be changed
-- by the user themselves.
--
--   * `users_update_own` lets anyone update their own row with no column restriction, so a
--     parent could run `update users set role = 'xo_super_admin' where id = auth.uid()` from
--     the browser and become platform super admin.
--   * `users_self_insert_bootstrap` lets a user insert their own row with any role.
--   * HR managers may edit any staff profile in their nursery; setting position "admin" makes
--     the position-sync trigger promote that user (themselves included) to branch_admin, and
--     setting a lower position on the branch admin's profile demotes them.
--
-- Fix: these columns change only through trusted code — SECURITY DEFINER functions (signup,
-- nursery bootstrap, position sync, admin RPCs), the service role, or an XO super admin — and the
-- position sync refuses to grant or take away admin roles unless an admin of that nursery asks.

begin;

-- SECURITY INVOKER on purpose: current_user is 'authenticated'/'anon' for direct API writes, and
-- the function owner inside SECURITY DEFINER functions.
create or replace function public.users_guard_privileged_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.role is distinct from 'parent'::public.user_role
       or new.department is not null
       or new.chain_id is not null
       or (new.role_id is not null and not exists (
             select 1 from public.roles r where r.id = new.role_id and r.base_role = 'parent'
           )) then
      raise exception 'rbac_protected_column' using errcode = '42501';
    end if;
    return new;
  end if;

  if (new.role, new.role_id, new.department, new.nursery_id, new.chain_id)
     is distinct from (old.role, old.role_id, old.department, old.nursery_id, old.chain_id)
     and not public.is_xo_super_admin() then
    raise exception 'rbac_protected_column'
      using errcode = '42501', hint = 'Roles are assigned by a nursery admin through the role assignment function.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_users_guard_privileged_columns on public.users;
create trigger trg_users_guard_privileged_columns
before insert or update on public.users
for each row execute function public.users_guard_privileged_columns();

create or replace function public.sync_user_role_from_position()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
  v_base_role public.user_role;
  v_base_dept public.user_department;
  v_old_role_id uuid;
  v_target_role public.user_role;
  v_actor_role public.user_role;
  v_actor_nursery uuid;
  v_actor_chain uuid;
  v_actor_is_admin boolean := false;
begin
  if new.position_id is null or new.user_id is null then
    return new;
  end if;

  -- Skip if position_id unchanged on UPDATE
  if tg_op = 'UPDATE' and old.position_id is not distinct from new.position_id then
    return new;
  end if;

  select p.role_id, r.base_role, r.base_department
    into v_role_id, v_base_role, v_base_dept
    from public.positions p
    join public.roles r on r.id = p.role_id
   where p.id = new.position_id;

  if v_role_id is null then
    return new;
  end if;

  select role_id, role into v_old_role_id, v_target_role from public.users where id = new.user_id;

  -- Granting or removing an admin role needs an admin of this nursery (or its chain, or XO).
  -- Without a signed-in caller (service role, maintenance) the change is trusted.
  if auth.uid() is not null and not public.is_xo_super_admin() then
    select u.role, u.nursery_id, u.chain_id
      into v_actor_role, v_actor_nursery, v_actor_chain
      from public.users u where u.id = auth.uid();
    v_actor_is_admin :=
      (v_actor_role = 'branch_admin' and v_actor_nursery is not distinct from new.nursery_id)
      or (v_actor_role = 'chain_super_admin' and v_actor_chain is not null and exists (
            select 1 from public.nurseries n where n.id = new.nursery_id and n.chain_id = v_actor_chain));
    if v_base_role in ('chain_super_admin', 'xo_super_admin')
       or v_target_role in ('chain_super_admin', 'xo_super_admin') then
      raise exception 'rbac_forbidden_role_change' using errcode = '42501';
    end if;
    if (v_base_role = 'branch_admin' or v_target_role = 'branch_admin') and not v_actor_is_admin then
      raise exception 'rbac_forbidden_role_change' using errcode = '42501';
    end if;
  end if;

  update public.users
     set role_id = v_role_id,
         role = v_base_role,
         department = v_base_dept
   where id = new.user_id;

  if v_old_role_id is distinct from v_role_id then
    insert into public.role_assignments_log (user_id, old_role_id, new_role_id, changed_by, reason)
    values (new.user_id, v_old_role_id, v_role_id, auth.uid(),
            'position-sync: staff_profiles.position_id changed');
  end if;

  return new;
end;
$$;

revoke execute on function public.users_guard_privileged_columns() from public, anon, authenticated;

commit;

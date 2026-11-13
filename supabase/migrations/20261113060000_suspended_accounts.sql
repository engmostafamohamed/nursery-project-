-- Security: a deactivated account is shut out.
--
-- "Deactivate" on a staff member only set users.status to inactive, and nothing read it: the
-- person kept every right (the children, the families, the money) for as long as they kept a
-- session, could sign in again, and could even set their own status back to active (the column was
-- not protected).
-- Now:
-- * Who the signed-in user is (current_user_role, current_user_nursery_id, current_user_chain_id,
--   current_user_department, is_xo_super_admin, is_manager_hr) is nobody for an account that is not
--   active, so every rule and server function built on them refuses at once.
-- * Only set_staff_active changes a staff member's status: the nursery's branch admin or HR (for
--   teachers and managers), a chain admin (for its nurseries), the platform admin; never oneself.
--   It also blocks (or unblocks) the sign-in itself, so the open sessions cannot be renewed.
-- * users.status joins the columns nobody changes on their own row.

create or replace function public.current_user_role()
returns public.user_role
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  r public.user_role;
begin
  select u.role into r from public.users u where u.id = auth.uid() and coalesce(u.status, 'active') = 'active';
  return r;
end;
$$;

create or replace function public.current_user_nursery_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  nid uuid;
begin
  select u.nursery_id into nid from public.users u where u.id = auth.uid() and coalesce(u.status, 'active') = 'active';
  return nid;
end;
$$;

create or replace function public.current_user_chain_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  cid uuid;
begin
  select u.chain_id into cid from public.users u where u.id = auth.uid() and coalesce(u.status, 'active') = 'active';
  return cid;
end;
$$;

create or replace function public.current_user_department()
returns public.user_department
language sql
stable
security definer
set search_path = public
as $$
  select u.department from public.users u where u.id = auth.uid() and coalesce(u.status, 'active') = 'active';
$$;

create or replace function public.is_xo_super_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  return exists (
    select 1 from public.users u
     where u.id = auth.uid() and u.role = 'xo_super_admin'::public.user_role and coalesce(u.status, 'active') = 'active'
  );
end;
$$;

create or replace function public.is_manager_hr()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
     where u.id = auth.uid() and u.role = 'manager'::public.user_role and u.department = 'hr'::public.user_department
       and coalesce(u.status, 'active') = 'active'
  );
$$;

-- Nobody changes their own role, nursery, chain, department or status (the role assignment and
-- set_staff_active functions do, as their owner).
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
       or coalesce(new.status, 'active') <> 'active'
       or (new.role_id is not null and not exists (
             select 1 from public.roles r where r.id = new.role_id and r.base_role = 'parent'
           )) then
      raise exception 'rbac_protected_column' using errcode = '42501';
    end if;
    return new;
  end if;
  if (new.role, new.role_id, new.department, new.nursery_id, new.chain_id, new.status)
     is distinct from (old.role, old.role_id, old.department, old.nursery_id, old.chain_id, old.status)
     and not public.is_xo_super_admin() then
    raise exception 'rbac_protected_column'
      using errcode = '42501', hint = 'Roles are assigned by a nursery admin through the role assignment function.';
  end if;
  return new;
end;
$$;

-- Deactivates (or reactivates) a staff member: their status, and whether they may sign in.
create or replace function public.set_staff_active(p_user_id uuid, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.users;
  v_role public.user_role := public.current_user_role();
  v_allowed boolean;
begin
  if auth.uid() is null or v_role is null then
    raise exception 'staff_forbidden' using errcode = '42501';
  end if;
  if p_user_id is null or p_active is null then
    raise exception 'staff_invalid' using errcode = '22023';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'staff_not_yourself' using errcode = '22023';
  end if;
  select * into v_target from public.users where id = p_user_id for update;
  if not found or v_target.role not in ('teacher'::public.user_role, 'manager'::public.user_role, 'branch_admin'::public.user_role) then
    raise exception 'staff_not_found' using errcode = 'P0002';
  end if;

  v_allowed := public.is_xo_super_admin()
    or (v_role = 'chain_super_admin'::public.user_role and v_target.nursery_id in (select public.nursery_ids_for_chain_admin()))
    or (v_target.role in ('teacher'::public.user_role, 'manager'::public.user_role)
        and v_target.nursery_id = public.current_user_nursery_id()
        and (v_role = 'branch_admin'::public.user_role or public.is_manager_hr()));
  if not v_allowed then
    raise exception 'staff_forbidden' using errcode = '42501';
  end if;

  update public.users set status = case when p_active then 'active' else 'inactive' end, updated_at = now() where id = p_user_id;
  -- The sign-in itself: a blocked account cannot sign in nor renew an open session.
  update auth.users set banned_until = case when p_active then null else 'infinity'::timestamptz end where id = p_user_id;

  return jsonb_build_object('status', case when p_active then 'active' else 'inactive' end);
end;
$$;

revoke execute on function public.set_staff_active(uuid, boolean) from public, anon;
grant execute on function public.set_staff_active(uuid, boolean) to authenticated, service_role;

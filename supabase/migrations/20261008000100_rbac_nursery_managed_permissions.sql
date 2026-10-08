-- Roles and permissions managed by each nursery's admin.
--
-- Before: roles were platform-wide rows (each seed role existed twice), only the XO super admin
-- could edit them, the catalogue covered 25 of the app's modules, and a grant only hid buttons —
-- the database kept deciding by base role and department.
--
-- Now:
--   * Each nursery has its own editable copy of the default staff roles (finance / HR /
--     operations manager, teacher) and can add its own roles. Branch and chain admins manage
--     them through rbac_save_role / rbac_delete_role / rbac_assign_user_role; every change is
--     written to rbac_audit_log. Admin roles (branch, chain, XO) always have every permission,
--     so an admin can never lock themselves out.
--   * The catalogue covers every module (invoices, payments, payroll, packages, deals, courses,
--     chat, community, settings, the QR scanner, roles) with the actions that make sense for each:
--     view, create, update, delete, approve, export. Feature labels live in the app's locale
--     files (rbac.features.*), not here.
--   * user_can(feature, action) is the server-side check. Payments, attendance, invoices,
--     payroll and nursery settings now require it for managers and staff.

begin;

-- =============================================================================
-- 1. Actions and the feature catalogue
-- =============================================================================

alter table public.role_features drop constraint if exists role_features_actions_subset_ck;
alter table public.role_features
  add constraint role_features_actions_subset_ck
  check (actions <@ array['view', 'create', 'update', 'delete', 'approve', 'export']);

alter table public.features
  add column if not exists actions text[] not null default array['view', 'create', 'update', 'delete'],
  add column if not exists sort_order integer not null default 100;
alter table public.features alter column name_en drop not null;
alter table public.features alter column name_ar drop not null;

do $$
begin
  alter table public.features
    add constraint features_actions_ck
    check (actions <@ array['view', 'create', 'update', 'delete', 'approve', 'export'] and 'view' = any (actions));
exception when duplicate_object then null;
end $$;

-- Every module of the app, its category, order and the actions it supports.
insert into public.features (id, category, actions, sort_order, is_seed)
values
  ('dashboard_attendance', 'operations', array['view', 'create', 'update', 'delete', 'approve', 'export'], 10, true),
  ('qr_scanner',           'operations', array['view'], 11, true),
  ('classes',              'operations', array['view', 'create', 'update', 'delete'], 12, true),
  ('event_calendar',       'operations', array['view', 'create', 'update', 'delete'], 13, true),
  ('daily_reports',        'operations', array['view', 'create', 'update', 'delete', 'approve'], 14, true),
  ('meals',                'operations', array['view', 'create', 'update', 'delete'], 15, true),
  ('inventory',            'operations', array['view', 'create', 'update', 'delete'], 16, true),
  ('kids_applications',    'children',   array['view', 'create', 'update', 'delete', 'export'], 20, true),
  ('child_enrollment',     'children',   array['view', 'create'], 21, true),
  ('admissions',           'children',   array['view', 'create', 'update', 'delete', 'approve'], 22, true),
  ('health_alerts',        'children',   array['view', 'create', 'update'], 23, true),
  ('permissions',          'children',   array['view', 'create', 'update', 'delete'], 24, true),
  ('qr_code',              'children',   array['view', 'create', 'update', 'delete'], 25, true),
  ('staff',                'staff',      array['view', 'create', 'update', 'delete', 'export'], 30, true),
  ('staff_onboarding',     'staff',      array['view', 'create'], 31, true),
  ('payroll',              'staff',      array['view', 'create', 'update', 'approve', 'export'], 32, true),
  ('dashboard_finance',    'finance',    array['view'], 40, true),
  ('invoices',             'finance',    array['view', 'create', 'update', 'delete', 'export'], 41, true),
  ('payments',             'finance',    array['view', 'create', 'approve', 'export'], 42, true),
  ('financial_reports',    'finance',    array['view', 'export'], 43, true),
  ('packages',             'finance',    array['view', 'create', 'update', 'delete'], 44, true),
  ('deals',                'finance',    array['view', 'create', 'update', 'delete'], 45, true),
  ('loyalty',              'finance',    array['view', 'create', 'update'], 46, true),
  ('newsfeed',             'communication', array['view', 'create', 'update', 'delete'], 50, true),
  ('notifications',        'communication', array['view', 'create'], 51, true),
  ('messages',             'communication', array['view', 'create'], 52, true),
  ('chat',                 'communication', array['view', 'create'], 53, true),
  ('broadcast_messages',   'communication', array['view', 'create'], 54, true),
  ('surveys',              'communication', array['view', 'create', 'update', 'delete'], 55, true),
  ('community',            'communication', array['view', 'create', 'update', 'delete'], 56, true),
  ('media_library',        'content',    array['view', 'create', 'update', 'delete', 'approve'], 60, true),
  ('upload_media',         'content',    array['view', 'create'], 61, true),
  ('content_library',      'content',    array['view', 'create', 'update', 'delete'], 62, true),
  ('courses',              'content',    array['view', 'create', 'update', 'delete'], 63, true),
  ('settings',             'settings',   array['view', 'update'], 70, true),
  ('roles_permissions',    'settings',   array['view'], 71, true)
on conflict (id) do update
  set category = excluded.category,
      actions = excluded.actions,
      sort_order = excluded.sort_order,
      is_seed = true,
      updated_at = now();

-- Grants keep only actions their feature supports.
update public.role_features rf
   set actions = array(select a from unnest(rf.actions) a where a = any (f.actions))
  from public.features f
 where f.id = rf.feature_id
   and not (rf.actions <@ f.actions);

-- =============================================================================
-- 2. One row per platform-wide seed role / position (each existed twice)
-- =============================================================================

create temp table rbac_role_dups on commit drop as
select id, keeper
from (
  select r.id,
         first_value(r.id) over (
           partition by r.key
           order by (select count(*) from public.users u where u.role_id = r.id) desc, r.created_at, r.id
         ) as keeper
  from public.roles r
  where r.nursery_id is null
) ranked
where id <> keeper;

-- The keeper ends up with every action either copy granted.
insert into public.role_features (role_id, feature_id, access, actions, requires_approval)
select d.keeper, rf.feature_id, rf.access, rf.actions, rf.requires_approval
from public.role_features rf
join rbac_role_dups d on d.id = rf.role_id
on conflict (role_id, feature_id) do update
  set actions = array(select distinct a from unnest(public.role_features.actions || excluded.actions) a),
      requires_approval = public.role_features.requires_approval and excluded.requires_approval;

update public.users u set role_id = d.keeper from rbac_role_dups d where u.role_id = d.id;
update public.positions p set role_id = d.keeper from rbac_role_dups d where p.role_id = d.id;
update public.role_assignments_log l set old_role_id = d.keeper from rbac_role_dups d where l.old_role_id = d.id;
update public.role_assignments_log l set new_role_id = d.keeper from rbac_role_dups d where l.new_role_id = d.id;
delete from public.roles r using rbac_role_dups d where r.id = d.id;

create temp table rbac_position_dups on commit drop as
select id, keeper
from (
  select p.id,
         first_value(p.id) over (
           partition by p.key
           order by (select count(*) from public.staff_profiles s where s.position_id = p.id) desc, p.created_at, p.id
         ) as keeper
  from public.positions p
  where p.nursery_id is null
) ranked
where id <> keeper;

update public.staff_profiles s set position_id = d.keeper from rbac_position_dups d where s.position_id = d.id;
delete from public.positions p using rbac_position_dups d where p.id = d.id;

create unique index if not exists roles_global_key_uniq on public.roles (key) where nursery_id is null;
create unique index if not exists positions_global_key_uniq on public.positions (key) where nursery_id is null;

-- =============================================================================
-- 3. Default grants for the new modules (templates; nurseries copy them below)
-- =============================================================================

-- Adds actions to a template role's grant (never removes any).
create or replace function public.rbac_seed_grant(p_role_key text, p_feature text, p_actions text[], p_requires_approval boolean default false)
returns void
language sql
as $$
  insert into public.role_features (role_id, feature_id, access, actions, requires_approval)
  select r.id, p_feature, case when p_requires_approval then 'with_approval' else 'full' end, p_actions, p_requires_approval
  from public.roles r
  where r.nursery_id is null and r.key = p_role_key
  on conflict (role_id, feature_id) do update
    set actions = array(select distinct a from unnest(public.role_features.actions || excluded.actions) a)
$$;

do $$
declare
  v_manager text;
begin
  -- Every manager: the gate scanner, chat, courses, community, and the "approve" steps that
  -- only admins and managers could do until now.
  foreach v_manager in array array['manager_operations', 'manager_hr', 'manager_finance'] loop
    perform public.rbac_seed_grant(v_manager, 'qr_scanner', array['view']);
    perform public.rbac_seed_grant(v_manager, 'chat', array['view', 'create']);
    perform public.rbac_seed_grant(v_manager, 'courses', array['view']);
    perform public.rbac_seed_grant(v_manager, 'community', array['view', 'create', 'update', 'delete']);
    perform public.rbac_seed_grant(v_manager, 'dashboard_attendance', array['view', 'create', 'update', 'delete', 'approve', 'export']);
    perform public.rbac_seed_grant(v_manager, 'daily_reports', array['view', 'approve']);
    perform public.rbac_seed_grant(v_manager, 'media_library', array['view', 'approve']);
    perform public.rbac_seed_grant(v_manager, 'admissions', array['view', 'approve']);
  end loop;

  perform public.rbac_seed_grant('manager_operations', 'courses', array['view', 'create', 'update', 'delete']);
  perform public.rbac_seed_grant('manager_operations', 'packages', array['view']);
  perform public.rbac_seed_grant('manager_operations', 'settings', array['view']);

  -- Finance: invoices, payments, pricing, payroll.
  perform public.rbac_seed_grant('manager_finance', 'invoices', array['view', 'create', 'update', 'delete', 'export']);
  perform public.rbac_seed_grant('manager_finance', 'payments', array['view', 'create', 'approve', 'export']);
  perform public.rbac_seed_grant('manager_finance', 'financial_reports', array['view', 'export']);
  perform public.rbac_seed_grant('manager_finance', 'packages', array['view', 'create', 'update', 'delete']);
  perform public.rbac_seed_grant('manager_finance', 'deals', array['view', 'create', 'update', 'delete']);
  perform public.rbac_seed_grant('manager_finance', 'payroll', array['view', 'create', 'update', 'approve', 'export']);

  -- HR: staff and payroll; it could already confirm payments, so it keeps that.
  perform public.rbac_seed_grant('manager_hr', 'staff', array['view', 'create', 'update', 'delete', 'export']);
  perform public.rbac_seed_grant('manager_hr', 'payroll', array['view', 'create', 'update', 'approve', 'export']);
  perform public.rbac_seed_grant('manager_hr', 'invoices', array['view']);
  perform public.rbac_seed_grant('manager_hr', 'payments', array['view', 'approve']);

  -- Teachers: scan at the gate, chat, courses, community.
  perform public.rbac_seed_grant('teacher', 'qr_scanner', array['view']);
  perform public.rbac_seed_grant('teacher', 'chat', array['view', 'create']);
  perform public.rbac_seed_grant('teacher', 'courses', array['view']);
  perform public.rbac_seed_grant('teacher', 'community', array['view', 'create', 'update', 'delete']);
end $$;

-- Teachers record drop-off/pickup and undo their own mistakes; corrections stay with managers.
update public.role_features rf
   set actions = array(select a from unnest(rf.actions) a where a in ('view', 'create', 'delete'))
  from public.roles r
 where r.id = rf.role_id and r.nursery_id is null and r.key = 'teacher' and rf.feature_id = 'dashboard_attendance';

drop function public.rbac_seed_grant(text, text, text[], boolean);

-- =============================================================================
-- 4. Each nursery gets its own editable copy of the staff roles
-- =============================================================================

alter table public.roles add column if not exists is_system boolean not null default false;

create or replace function public.rbac_seed_nursery_roles(p_nursery_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.roles (nursery_id, key, name_en, name_ar, base_role, base_department, is_seed, is_system, managed_position_keys)
  select p_nursery_id, t.key, t.name_en, t.name_ar, t.base_role, t.base_department, false, true, t.managed_position_keys
  from public.roles t
  where t.nursery_id is null and t.is_seed and t.base_role in ('manager', 'teacher')
  on conflict (nursery_id, key) do update set is_system = true;

  -- Grants are copied only into copies that have none yet, so an admin's edits are never reset.
  insert into public.role_features (role_id, feature_id, access, actions, requires_approval)
  select n.id, rf.feature_id, rf.access, rf.actions, rf.requires_approval
  from public.roles n
  join public.roles t on t.nursery_id is null and t.is_seed and t.key = n.key
  join public.role_features rf on rf.role_id = t.id
  where n.nursery_id = p_nursery_id
    and n.is_system
    and not exists (select 1 from public.role_features x where x.role_id = n.id)
  on conflict (role_id, feature_id) do nothing;
end;
$$;

select public.rbac_seed_nursery_roles(n.id) from public.nurseries n;

create or replace function public.nurseries_after_insert_seed_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.rbac_seed_nursery_roles(new.id);
  return new;
end;
$$;

drop trigger if exists trg_nurseries_seed_roles on public.nurseries;
create trigger trg_nurseries_seed_roles
after insert on public.nurseries
for each row execute function public.nurseries_after_insert_seed_roles();

-- The nursery's own role for a platform-wide role key (or the role itself).
create or replace function public.rbac_nursery_role_id(p_role_id uuid, p_nursery_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select n.id
       from public.roles g
       join public.roles n on n.key = g.key and n.nursery_id = p_nursery_id
      where g.id = p_role_id and g.nursery_id is null),
    p_role_id
  )
$$;

-- Staff point at their nursery's copy.
update public.users u
   set role_id = n.id
  from public.roles n
 where n.nursery_id = u.nursery_id
   and n.is_system
   and u.role in ('manager', 'teacher')
   and n.key = case when u.role = 'teacher' then 'teacher' else 'manager_' || coalesce(u.department::text, 'operations') end
   and (u.role_id is null or exists (select 1 from public.roles g where g.id = u.role_id and g.nursery_id is null));

-- Everyone else without a role row points at the platform role for their base role.
update public.users u
   set role_id = g.id
  from public.roles g
 where u.role_id is null
   and g.nursery_id is null
   and g.key = case u.role
     when 'xo_super_admin' then 'super_admin'
     when 'chain_super_admin' then 'chain_admin'
     when 'branch_admin' then 'branch_admin'
     when 'parent' then 'parent'
     when 'teacher' then 'teacher'
     else 'manager_' || coalesce(u.department::text, 'operations')
   end;

-- Position changes follow the nursery's copy of the position's role.
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
  if tg_op = 'UPDATE' and old.position_id is not distinct from new.position_id then
    return new;
  end if;

  select public.rbac_nursery_role_id(p.role_id, new.nursery_id)
    into v_role_id
    from public.positions p
   where p.id = new.position_id;
  if v_role_id is null then
    return new;
  end if;
  select r.base_role, r.base_department into v_base_role, v_base_dept from public.roles r where r.id = v_role_id;

  select role_id, role into v_old_role_id, v_target_role from public.users where id = new.user_id;

  -- Granting or removing an admin role needs an admin of this nursery (or its chain, or XO).
  if auth.uid() is not null and not public.is_xo_super_admin() then
    select u.role, u.nursery_id, u.chain_id into v_actor_role, v_actor_nursery, v_actor_chain
      from public.users u where u.id = auth.uid();
    v_actor_is_admin :=
      (v_actor_role = 'branch_admin' and v_actor_nursery is not distinct from new.nursery_id)
      or (v_actor_role = 'chain_super_admin' and v_actor_chain is not null and exists (
            select 1 from public.nurseries n where n.id = new.nursery_id and n.chain_id = v_actor_chain));
    if v_base_role in ('chain_super_admin', 'xo_super_admin') or v_target_role in ('chain_super_admin', 'xo_super_admin') then
      raise exception 'rbac_forbidden_role_change' using errcode = '42501';
    end if;
    if (v_base_role = 'branch_admin' or v_target_role = 'branch_admin') and not v_actor_is_admin then
      raise exception 'rbac_forbidden_role_change' using errcode = '42501';
    end if;
  end if;

  update public.users
     set role_id = v_role_id, role = v_base_role, department = v_base_dept
   where id = new.user_id;

  if v_old_role_id is distinct from v_role_id then
    insert into public.role_assignments_log (user_id, old_role_id, new_role_id, changed_by, reason)
    values (new.user_id, v_old_role_id, v_role_id, auth.uid(), 'position-sync: staff_profiles.position_id changed');
  end if;
  return new;
end;
$$;

-- =============================================================================
-- 5. Permission checks
-- =============================================================================

-- May the signed-in user do `p_action` on `p_feature`? Admin roles always may; parents never;
-- managers and staff when their role grants it. Inactive accounts may do nothing.
create or replace function public.user_can(p_feature text, p_action text default 'view')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when u.role in ('xo_super_admin', 'chain_super_admin', 'branch_admin') then true
      when u.role = 'parent' then false
      else exists (
        select 1
        from public.role_features rf
        where rf.role_id = coalesce(
                u.role_id,
                (select g.id from public.roles g
                  where g.nursery_id is null
                    and g.key = case when u.role = 'teacher' then 'teacher' else 'manager_' || coalesce(u.department::text, 'operations') end)
              )
          and rf.feature_id = p_feature
          and p_action = any (rf.actions)
      )
    end
    from public.users u
    where u.id = auth.uid() and coalesce(u.status, 'active') <> 'inactive'
  ), false)
$$;

-- May the signed-in user manage roles and permissions of p_nursery_id?
create or replace function public.rbac_manages_nursery(p_nursery_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case u.role
      when 'xo_super_admin' then true
      when 'branch_admin' then u.nursery_id is not distinct from p_nursery_id
      when 'chain_super_admin' then u.chain_id is not null and exists (
        select 1 from public.nurseries n where n.id = p_nursery_id and n.chain_id = u.chain_id)
      else false
    end
    from public.users u
    where u.id = auth.uid()
  ), false)
$$;

-- =============================================================================
-- 6. Role management (nursery admins)
-- =============================================================================

create table if not exists public.rbac_audit_log (
  id uuid primary key default gen_random_uuid(),
  nursery_id uuid references public.nurseries(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  action text not null check (action in ('role_created', 'role_updated', 'role_deleted', 'role_assigned')),
  role_id uuid,
  target_user_id uuid references public.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists rbac_audit_log_nursery_idx on public.rbac_audit_log (nursery_id, created_at desc);
alter table public.rbac_audit_log enable row level security;
drop policy if exists rbac_audit_log_select on public.rbac_audit_log;
create policy rbac_audit_log_select on public.rbac_audit_log
  for select to authenticated using (public.rbac_manages_nursery(nursery_id));

-- Creates (p_role_id null) or updates a role and replaces its permissions in one step.
-- p_grants: [{"feature": "invoices", "actions": ["view", "create"], "requires_approval": false}, ...]
create or replace function public.rbac_save_role(
  p_role_id uuid,
  p_nursery_id uuid,
  p_name_ar text,
  p_name_en text,
  p_base_role public.user_role,
  p_base_department public.user_department,
  p_grants jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.roles%rowtype;
  v_nursery uuid;
  v_grant jsonb;
  v_feature public.features%rowtype;
  v_actions text[];
  v_approval boolean;
  v_name_ar text := nullif(trim(coalesce(p_name_ar, '')), '');
  v_name_en text := nullif(trim(coalesce(p_name_en, '')), '');
  v_department public.user_department := case when p_base_role = 'manager' then coalesce(p_base_department, 'operations') end;
begin
  if p_role_id is not null then
    select * into v_role from public.roles where id = p_role_id for update;
    if not found then
      raise exception 'rbac_role_not_found' using errcode = 'P0002';
    end if;
    v_nursery := v_role.nursery_id;
  else
    v_nursery := p_nursery_id;
  end if;

  -- Platform templates are the XO super admin's; a nursery's roles are its admin's.
  if v_nursery is null then
    if not public.is_xo_super_admin() then
      raise exception 'rbac_forbidden' using errcode = '42501';
    end if;
  elsif not public.rbac_manages_nursery(v_nursery) then
    raise exception 'rbac_forbidden' using errcode = '42501';
  end if;

  if v_name_ar is null and v_name_en is null then
    raise exception 'rbac_name_required' using errcode = '22023';
  end if;
  -- Roles here are for staff; admin roles always have everything and are not edited.
  if p_base_role not in ('manager', 'teacher') then
    raise exception 'rbac_invalid_base_role' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_grants, '[]'::jsonb)) <> 'array' then
    raise exception 'rbac_invalid_grants' using errcode = '22023';
  end if;

  if p_role_id is null then
    insert into public.roles (nursery_id, key, name_en, name_ar, base_role, base_department, is_seed, is_system, created_by)
    values (
      v_nursery,
      'custom_' || replace(gen_random_uuid()::text, '-', ''),
      coalesce(v_name_en, v_name_ar),
      coalesce(v_name_ar, v_name_en),
      p_base_role,
      v_department,
      false,
      false,
      auth.uid()
    )
    returning * into v_role;
  else
    if (v_role.is_system or v_role.is_seed)
       and (p_base_role is distinct from v_role.base_role or v_department is distinct from v_role.base_department) then
      raise exception 'rbac_system_role_type_locked' using errcode = '22023';
    end if;
    update public.roles
       set name_en = coalesce(v_name_en, v_name_ar),
           name_ar = coalesce(v_name_ar, v_name_en),
           base_role = p_base_role,
           base_department = v_department,
           updated_at = now()
     where id = v_role.id
    returning * into v_role;

    -- People on this role follow its data-access type.
    update public.users
       set role = v_role.base_role, department = v_role.base_department
     where role_id = v_role.id
       and (role, department) is distinct from (v_role.base_role, v_role.base_department);
  end if;

  delete from public.role_features where role_id = v_role.id;
  for v_grant in select value from jsonb_array_elements(coalesce(p_grants, '[]'::jsonb)) loop
    select * into v_feature from public.features where id = v_grant ->> 'feature';
    if not found then
      raise exception 'rbac_unknown_feature' using errcode = '22023', detail = coalesce(v_grant ->> 'feature', '');
    end if;
    v_actions := array(
      select a from unnest(v_feature.actions) a
      where a in (select jsonb_array_elements_text(coalesce(v_grant -> 'actions', '[]'::jsonb)))
    );
    -- Any action implies seeing the module.
    if cardinality(v_actions) > 0 and not ('view' = any (v_actions)) then
      v_actions := array['view'] || v_actions;
    end if;
    continue when cardinality(v_actions) = 0;
    v_approval := coalesce((v_grant ->> 'requires_approval')::boolean, false);
    insert into public.role_features (role_id, feature_id, access, actions, requires_approval)
    values (v_role.id, v_feature.id, case when v_approval then 'with_approval' else 'full' end, v_actions, v_approval);
  end loop;

  insert into public.rbac_audit_log (nursery_id, actor_id, action, role_id, details)
  values (
    v_nursery, auth.uid(), case when p_role_id is null then 'role_created' else 'role_updated' end, v_role.id,
    jsonb_build_object('base_role', v_role.base_role, 'base_department', v_role.base_department,
                       'grants', (select coalesce(jsonb_agg(jsonb_build_object('feature', feature_id, 'actions', actions,
                                   'requires_approval', requires_approval) order by feature_id), '[]'::jsonb)
                                  from public.role_features where role_id = v_role.id))
  );
  return v_role.id;
end;
$$;

create or replace function public.rbac_delete_role(p_role_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.roles%rowtype;
  v_users integer;
begin
  select * into v_role from public.roles where id = p_role_id for update;
  if not found then
    raise exception 'rbac_role_not_found' using errcode = 'P0002';
  end if;
  if v_role.nursery_id is null or not public.rbac_manages_nursery(v_role.nursery_id) then
    raise exception 'rbac_forbidden' using errcode = '42501';
  end if;
  if v_role.is_system or v_role.is_seed then
    raise exception 'rbac_system_role_locked' using errcode = '22023';
  end if;
  select count(*) into v_users from public.users where role_id = v_role.id;
  if v_users > 0 or exists (select 1 from public.positions where role_id = v_role.id) then
    raise exception 'rbac_role_in_use' using errcode = '22023', detail = v_users::text;
  end if;

  insert into public.rbac_audit_log (nursery_id, actor_id, action, role_id, details)
  values (v_role.nursery_id, auth.uid(), 'role_deleted', v_role.id,
          jsonb_build_object('name_en', v_role.name_en, 'name_ar', v_role.name_ar));
  delete from public.roles where id = v_role.id;
end;
$$;

-- Gives a staff member (manager or teacher) one of their nursery's roles.
create or replace function public.rbac_assign_user_role(p_user_id uuid, p_role_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_role public.roles%rowtype;
begin
  select * into v_user from public.users where id = p_user_id for update;
  if not found then
    raise exception 'rbac_user_not_found' using errcode = 'P0002';
  end if;
  select * into v_role from public.roles where id = p_role_id;
  if not found then
    raise exception 'rbac_role_not_found' using errcode = 'P0002';
  end if;
  if v_user.nursery_id is null or not public.rbac_manages_nursery(v_user.nursery_id) then
    raise exception 'rbac_forbidden' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'rbac_cannot_change_own_role' using errcode = '42501';
  end if;
  if v_user.role not in ('manager', 'teacher') then
    raise exception 'rbac_user_not_staff' using errcode = '22023';
  end if;
  if v_role.nursery_id is distinct from v_user.nursery_id or v_role.base_role not in ('manager', 'teacher') then
    raise exception 'rbac_role_wrong_nursery' using errcode = '22023';
  end if;
  if v_user.role_id is not distinct from v_role.id then
    return;
  end if;

  update public.users
     set role_id = v_role.id, role = v_role.base_role, department = v_role.base_department
   where id = p_user_id;

  insert into public.role_assignments_log (user_id, old_role_id, new_role_id, changed_by, reason)
  values (p_user_id, v_user.role_id, v_role.id, auth.uid(), 'assigned by nursery admin');
  insert into public.rbac_audit_log (nursery_id, actor_id, action, role_id, target_user_id, details)
  values (v_user.nursery_id, auth.uid(), 'role_assigned', v_role.id, p_user_id,
          jsonb_build_object('old_role_id', v_user.role_id));
end;
$$;

-- Roles and grants are readable inside the reader's own nursery (plus platform templates);
-- writes go through the functions above (or the XO super admin).
drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles
  for select to authenticated
  using (nursery_id is null or nursery_id = public.current_user_nursery_id() or public.rbac_manages_nursery(nursery_id));

drop policy if exists role_features_select on public.role_features;
create policy role_features_select on public.role_features
  for select to authenticated
  using (exists (
    select 1 from public.roles r
    where r.id = role_features.role_id
      and (r.nursery_id is null or r.nursery_id = public.current_user_nursery_id() or public.rbac_manages_nursery(r.nursery_id))
  ));

-- =============================================================================
-- 7. Enforcement: payments, attendance, invoices, payroll, settings
-- =============================================================================

-- Payments: managers and staff need the permission (was: finance/HR department).
drop function if exists public.payment_staff_guard(uuid);
create function public.payment_staff_guard(
  p_nursery_id uuid,
  p_feature text default 'payments',
  p_action text default 'approve'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_nursery uuid;
  v_chain uuid;
begin
  if v_uid is null then
    raise exception 'payment_not_authenticated' using errcode = '28000';
  end if;
  select u.role, u.nursery_id, u.chain_id into v_role, v_nursery, v_chain from public.users u where u.id = v_uid;

  if public.is_xo_super_admin() then
    return v_uid;
  end if;
  if v_role = 'chain_super_admin' then
    if v_chain is not null and exists (select 1 from public.nurseries n where n.id = p_nursery_id and n.chain_id = v_chain) then
      return v_uid;
    end if;
  elsif v_role = 'branch_admin' then
    if v_nursery is not distinct from p_nursery_id then
      return v_uid;
    end if;
  elsif v_role in ('manager', 'teacher') then
    if v_nursery is not distinct from p_nursery_id and public.user_can(p_feature, p_action) then
      return v_uid;
    end if;
  end if;
  raise exception 'payment_forbidden' using errcode = '42501';
end;
$$;

-- Attendance: managers and staff need the matching attendance permission
-- (view by default, update for corrections, or the action the caller names).
drop function if exists public.attendance_require_staff(uuid, boolean);
create function public.attendance_require_staff(
  p_nursery_id uuid,
  p_admin_only boolean default false,
  p_action text default null
)
returns public.user_role
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_nursery uuid;
  v_action text := coalesce(p_action, case when p_admin_only then 'update' else 'view' end);
begin
  if auth.uid() is null then
    raise exception 'attendance_not_authenticated' using errcode = '28000';
  end if;
  select u.role, u.nursery_id into v_role, v_nursery from public.users u where u.id = auth.uid();

  if v_role = 'xo_super_admin' then
    return v_role;
  end if;
  if v_role = 'chain_super_admin' and exists (
    select 1 from public.nurseries n
    join public.users u on u.id = auth.uid()
    where n.id = p_nursery_id and n.chain_id is not null and n.chain_id = u.chain_id
  ) then
    return v_role;
  end if;
  if v_role = 'branch_admin' and v_nursery is not distinct from p_nursery_id then
    return v_role;
  end if;
  if v_role in ('manager', 'teacher') and v_nursery is not distinct from p_nursery_id then
    if public.user_can('dashboard_attendance', v_action) then
      return v_role;
    end if;
    raise exception 'attendance_no_permission' using errcode = '42501';
  end if;
  raise exception 'attendance_forbidden' using errcode = '42501';
end;
$$;

-- Recording, undoing, waiving and resolving name the action they need.
create or replace function public.record_attendance_check_in(
  p_child_id uuid,
  p_method text default 'manual',
  p_qr_token_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_child public.children%rowtype;
  v_ns public.nursery_settings%rowtype;
  v_role public.user_role;
  v_tz text;
  v_today date;
  v_att public.attendance_records%rowtype;
  v_early integer := 0;
  v_staff jsonb;
begin
  select * into v_child from public.children where id = p_child_id;
  if not found then
    raise exception 'attendance_child_not_found' using errcode = 'P0002';
  end if;
  v_role := public.attendance_require_staff(v_child.nursery_id, false, 'create');
  if v_child.status <> 'active' then
    raise exception 'attendance_child_not_active' using errcode = 'P0001';
  end if;
  if p_method not in ('qr_parent', 'qr_custom', 'manual') then
    raise exception 'attendance_invalid_method' using errcode = '22023';
  end if;

  select * into v_ns from public.nursery_settings where nursery_id = v_child.nursery_id;
  v_tz := coalesce(v_ns.timezone, 'Africa/Cairo');
  v_today := (now() at time zone v_tz)::date;

  if p_method = 'manual' and coalesce(v_ns.require_qr_for_attendance, false) and v_role = 'teacher' then
    raise exception 'attendance_qr_required' using errcode = 'P0001';
  end if;

  -- Rejected scans are returned (not raised) so the audit event survives the call.
  -- A custom QR names a person allowed to PICK UP; it is not a drop-off pass.
  if p_method = 'qr_custom' then
    perform public.attendance_log_event(null, p_child_id, 'scan_rejected', p_method, p_qr_token_id,
      jsonb_build_object('reason', 'attendance_custom_qr_pickup_only', 'action', 'check_in'));
    return jsonb_build_object('status', 'rejected', 'reason', 'attendance_custom_qr_pickup_only');
  end if;
  if p_method = 'qr_parent' then
    begin
      perform public.attendance_check_qr(p_qr_token_id, p_child_id, 'parent');
    exception when sqlstate 'P0001' then
      perform public.attendance_log_event(null, p_child_id, 'scan_rejected', p_method, p_qr_token_id,
        jsonb_build_object('reason', sqlerrm, 'action', 'check_in'));
      return jsonb_build_object('status', 'rejected', 'reason', sqlerrm);
    end;
  end if;

  select * into v_att
  from public.attendance_records
  where child_id = p_child_id and attendance_date = v_today
  for update;

  if found and v_att.check_out is not null then
    perform public.attendance_log_event(v_att.id, p_child_id, 'scan_rejected', p_method, p_qr_token_id,
      jsonb_build_object('reason', 'attendance_already_checked_out', 'action', 'check_in'));
    return jsonb_build_object(
      'status', 'already_checked_out',
      'attendance_id', v_att.id,
      'check_in', v_att.check_in,
      'check_out', v_att.check_out
    );
  end if;
  if found and v_att.check_in is not null then
    return jsonb_build_object(
      'status', 'already_checked_in',
      'attendance_id', v_att.id,
      'check_in', v_att.check_in,
      'checked_in_by', public.attendance_user_name(v_att.check_in_by, 'en')
    );
  end if;

  if v_ns.standard_start_time is not null then
    v_early := greatest(0, floor(extract(epoch from (
      ((v_today::text || ' ' || v_ns.standard_start_time::text)::timestamp at time zone v_tz) - now()
    )) / 60)::integer);
  end if;

  insert into public.attendance_records (
    child_id, attendance_date, check_in, check_out, check_in_by, check_in_method, check_in_qr_token_id, early_minutes
  )
  values (p_child_id, v_today, now(), null, v_uid, p_method, p_qr_token_id, v_early)
  on conflict (child_id, attendance_date) do update
     set check_in = excluded.check_in,
         check_in_by = excluded.check_in_by,
         check_in_method = excluded.check_in_method,
         check_in_qr_token_id = excluded.check_in_qr_token_id,
         early_minutes = excluded.early_minutes
  returning * into v_att;

  perform public.attendance_log_event(
    v_att.id, p_child_id, 'check_in', p_method, p_qr_token_id,
    jsonb_build_object('early_minutes', v_early)
  );

  v_staff := public.user_names(v_uid);
  perform public.attendance_notify_parents(
    p_child_id,
    'attendance_checkin',
    'attendance_checkin',
    jsonb_build_object(
      'child', public.i18n_names(v_child.full_name_ar, v_child.full_name_en),
      'time', v_att.check_in,
      'tz', v_tz,
      'staff', v_staff,
      'segments', case when v_staff is not null then '["staff"]'::jsonb else '[]'::jsonb end
    )
  );

  return jsonb_build_object(
    'status', 'checked_in',
    'attendance_id', v_att.id,
    'attendance_date', v_att.attendance_date,
    'check_in', v_att.check_in,
    'early_minutes', v_early
  );
end;
$$;

create or replace function public.record_attendance_check_out(
  p_attendance_id uuid,
  p_method text default 'manual',
  p_qr_token_id uuid default null,
  p_pickup jsonb default '{}'::jsonb,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_att public.attendance_records%rowtype;
  v_child public.children%rowtype;
  v_ns public.nursery_settings%rowtype;
  v_role public.user_role;
  v_tok public.qr_tokens%rowtype;
  v_pickup jsonb := case when jsonb_typeof(p_pickup) = 'object' then p_pickup else '{}'::jsonb end;
  v_person text;
  v_relationship text;
  v_charge jsonb;
  v_now timestamptz := now();
  v_staff jsonb;
  v_hours numeric;
  v_covered numeric;
  v_fee numeric;
  v_segments jsonb := '[]'::jsonb;
begin
  if octet_length(v_pickup::text) > 8000 then
    raise exception 'attendance_pickup_payload_too_large' using errcode = '22023';
  end if;

  select * into v_att from public.attendance_records where id = p_attendance_id for update;
  if not found then
    raise exception 'attendance_not_found' using errcode = 'P0002';
  end if;
  select * into v_child from public.children where id = v_att.child_id;
  v_role := public.attendance_require_staff(v_child.nursery_id, false, 'create');
  select * into v_ns from public.nursery_settings where nursery_id = v_child.nursery_id;

  if p_method not in ('qr_parent', 'qr_custom', 'manual') then
    raise exception 'attendance_invalid_method' using errcode = '22023';
  end if;
  if v_att.check_in is null then
    raise exception 'attendance_not_checked_in' using errcode = 'P0001';
  end if;
  if v_att.check_out is not null then
    raise exception 'attendance_already_checked_out' using errcode = 'P0001';
  end if;
  if p_method = 'manual' and coalesce(v_ns.require_qr_for_attendance, false) and v_role = 'teacher' then
    raise exception 'attendance_qr_required' using errcode = 'P0001';
  end if;
  -- A second scan right after drop-off is almost always an accidental double scan.
  if not p_force and v_now - v_att.check_in < make_interval(mins => coalesce(v_ns.min_minutes_between_scans, 5)) then
    perform public.attendance_log_event(v_att.id, v_att.child_id, 'scan_rejected', p_method, p_qr_token_id,
      jsonb_build_object('reason', 'attendance_too_soon', 'action', 'check_out'));
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'attendance_too_soon',
      'attendance_id', v_att.id,
      'check_in', v_att.check_in,
      'min_minutes', coalesce(v_ns.min_minutes_between_scans, 5)
    );
  end if;

  if p_method in ('qr_parent', 'qr_custom') then
    begin
      v_tok := public.attendance_check_qr(
        p_qr_token_id, v_att.child_id, case when p_method = 'qr_custom' then 'delegate' else 'parent' end
      );
    exception when sqlstate 'P0001' then
      perform public.attendance_log_event(v_att.id, v_att.child_id, 'scan_rejected', p_method, p_qr_token_id,
        jsonb_build_object('reason', sqlerrm, 'action', 'check_out'));
      return jsonb_build_object('status', 'rejected', 'reason', sqlerrm, 'attendance_id', v_att.id);
    end;
    -- One-time QRs are spent only now that staff confirmed the person.
    if v_tok.single_use then
      update public.qr_tokens set consumed_at = v_now where id = v_tok.id;
    end if;
  end if;

  v_person := coalesce(
    nullif(trim(v_pickup ->> 'pickup_person_name'), ''),
    nullif(trim(v_tok.pickup_person_full_name), ''),
    nullif(trim(v_tok.delegate_name), ''),
    case when p_method = 'qr_parent' then public.attendance_user_name(v_tok.issued_by, 'en') end
  );
  v_relationship := coalesce(nullif(trim(v_pickup ->> 'pickup_relationship'), ''), nullif(trim(v_tok.pickup_relationship), ''));

  update public.attendance_records
     set check_out = v_now,
         check_out_by = v_uid,
         check_out_method = p_method,
         check_out_qr_token_id = case when p_method = 'manual' then null else p_qr_token_id end,
         pickup_person_name = v_person,
         pickup_relationship = v_relationship,
         qr_scan_log = coalesce(qr_scan_log, '{}'::jsonb)
           || (v_pickup - 'late_pickup' - 'extra_hours' - 'extra_fee' - 'fee_per_hour')
           || jsonb_build_object('checked_out_at', v_now, 'pickup_purpose',
                case p_method when 'qr_custom' then 'delegate' when 'qr_parent' then 'parent' else 'manual' end)
   where id = p_attendance_id;

  v_charge := public.apply_attendance_late_charge(p_attendance_id, v_now, 'checkout', true);

  update public.attendance_records
     set qr_scan_log = qr_scan_log || jsonb_build_object(
       'late_pickup', coalesce((v_charge ->> 'late_pickup')::boolean, false),
       'extra_hours', coalesce((v_charge ->> 'extra_hours')::numeric, 0),
       'extra_fee', coalesce((v_charge ->> 'extra_fee')::numeric, 0),
       'end_time', v_ns.standard_end_time,
       'grace_minutes', v_ns.late_pickup_grace_minutes,
       'fee_per_hour', v_ns.late_pickup_fee_per_hour
     )
   where id = p_attendance_id;

  perform public.attendance_log_event(
    p_attendance_id, v_att.child_id, 'check_out', p_method, p_qr_token_id,
    jsonb_build_object(
      'pickup_person_name', v_person, 'pickup_relationship', v_relationship,
      'identity_verified', v_pickup -> 'identity_verified', 'charge', v_charge
    )
  );

  v_hours := coalesce((v_charge ->> 'extra_hours')::numeric, 0);
  v_covered := coalesce((v_charge ->> 'extra_hours_covered')::numeric, 0);
  v_fee := coalesce((v_charge ->> 'extra_fee')::numeric, 0);
  v_staff := public.user_names(v_uid);

  if v_person is not null then v_segments := v_segments || to_jsonb('pickup'::text); end if;
  if v_staff is not null then v_segments := v_segments || to_jsonb('staff'::text); end if;
  if v_hours > 0 then v_segments := v_segments || to_jsonb('extra'::text); end if;
  if v_covered > 0 then v_segments := v_segments || to_jsonb('covered'::text); end if;
  if v_fee > 0 then v_segments := v_segments || to_jsonb('fee'::text); end if;

  perform public.attendance_notify_parents(
    v_att.child_id,
    'attendance_checkout',
    'attendance_checkout',
    jsonb_build_object(
      'child', public.i18n_names(v_child.full_name_ar, v_child.full_name_en),
      'time', v_now,
      'tz', coalesce(v_ns.timezone, 'Africa/Cairo'),
      'pickup', v_person,
      'staff', v_staff,
      'hours', v_hours,
      'covered', v_covered,
      'fee', v_fee,
      'currency', coalesce(v_ns.currency, 'EGP'),
      'segments', v_segments
    ),
    case when v_fee > 0 then '/parent/invoices' else '/parent/attendance' end,
    case when v_fee > 0 then 'high' else 'normal' end,
    nullif(v_pickup ->> 'pickup_photo_url', '')
  );

  return jsonb_build_object(
    'status', 'checked_out',
    'attendance_id', p_attendance_id,
    'check_out', v_now,
    'pickup_person_name', v_person
  ) || coalesce(v_charge, '{}'::jsonb);
end;
$$;

create or replace function public.undo_attendance_check_in(p_attendance_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att public.attendance_records%rowtype;
  v_child public.children%rowtype;
  v_role public.user_role;
begin
  select * into v_att from public.attendance_records where id = p_attendance_id for update;
  if not found then
    raise exception 'attendance_not_found' using errcode = 'P0002';
  end if;
  select * into v_child from public.children where id = v_att.child_id;
  v_role := public.attendance_require_staff(v_child.nursery_id, false, 'delete');

  if v_att.check_out is not null or coalesce(v_att.extra_hours, 0) > 0 then
    raise exception 'attendance_undo_not_allowed' using errcode = 'P0001';
  end if;
  if v_role = 'teacher' and (v_att.check_in_by is distinct from auth.uid() or now() - v_att.check_in > interval '15 minutes') then
    raise exception 'attendance_undo_window_passed' using errcode = 'P0001';
  end if;

  perform public.attendance_log_event(
    p_attendance_id, v_att.child_id, 'check_in_undone', v_att.check_in_method, v_att.check_in_qr_token_id,
    jsonb_build_object('check_in', v_att.check_in)
  );
  delete from public.attendance_records where id = p_attendance_id;

  perform public.attendance_notify_parents(
    v_att.child_id,
    'attendance_checkin_cancelled',
    'attendance_checkin_cancelled',
    jsonb_build_object('child', public.i18n_names(v_child.full_name_ar, v_child.full_name_en))
  );

  return jsonb_build_object('status', 'undone', 'attendance_id', p_attendance_id);
end;
$$;

create or replace function public.admin_waive_late_charge(p_attendance_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att public.attendance_records%rowtype;
  v_child public.children%rowtype;
  v_result jsonb;
begin
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'attendance_reason_required' using errcode = '22023';
  end if;
  select * into v_att from public.attendance_records where id = p_attendance_id for update;
  if not found then
    raise exception 'attendance_not_found' using errcode = 'P0002';
  end if;
  select * into v_child from public.children where id = v_att.child_id;
  perform public.attendance_require_staff(v_child.nursery_id, true, 'approve');

  v_result := public.attendance_reduce_late_charge(p_attendance_id, 0);
  update public.attendance_records
     set late_charge_waived = true,
         late_charge_status = case when check_out is not null then 'final' else late_charge_status end
   where id = p_attendance_id;

  perform public.attendance_log_event(
    p_attendance_id, v_att.child_id, 'charge_waived', null, null,
    jsonb_build_object('reason', trim(p_reason), 'charge', v_result)
  );
  perform public.attendance_notify_parents(
    v_att.child_id,
    'extra_hours_waived',
    'extra_hours_waived',
    jsonb_build_object(
      'child', public.i18n_names(v_child.full_name_ar, v_child.full_name_en),
      'date', v_att.attendance_date
    )
  );
  return jsonb_build_object('status', 'waived', 'attendance_id', p_attendance_id) || v_result;
end;
$$;

create or replace function public.admin_resolve_attendance_review(p_attendance_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att public.attendance_records%rowtype;
  v_child public.children%rowtype;
begin
  select * into v_att from public.attendance_records where id = p_attendance_id for update;
  if not found then
    raise exception 'attendance_not_found' using errcode = 'P0002';
  end if;
  select * into v_child from public.children where id = v_att.child_id;
  perform public.attendance_require_staff(v_child.nursery_id, true, 'approve');

  update public.attendance_records set needs_review = false, review_reason = null where id = p_attendance_id;
  perform public.attendance_log_event(
    p_attendance_id, v_att.child_id, 'review_resolved', null, null,
    jsonb_build_object('previous_reason', v_att.review_reason, 'note', nullif(trim(coalesce(p_note, '')), ''))
  );
  return jsonb_build_object('status', 'resolved', 'attendance_id', p_attendance_id);
end;
$$;


-- Invoices: managers and staff by permission (was: finance/HR department). Branch, chain and XO
-- policies are unchanged.
drop policy if exists invoices_finance_manager_select on public.invoices;
drop policy if exists invoices_finance_manager_update on public.invoices;
drop policy if exists invoices_perm_select on public.invoices;
drop policy if exists invoices_perm_insert on public.invoices;
drop policy if exists invoices_perm_update on public.invoices;
drop policy if exists invoices_perm_delete on public.invoices;
create policy invoices_perm_select on public.invoices for select to authenticated
  using (public.current_user_role() in ('manager', 'teacher') and nursery_id = public.current_user_nursery_id()
         and public.user_can('invoices', 'view'));
create policy invoices_perm_insert on public.invoices for insert to authenticated
  with check (public.current_user_role() in ('manager', 'teacher') and nursery_id = public.current_user_nursery_id()
              and public.user_can('invoices', 'create'));
create policy invoices_perm_update on public.invoices for update to authenticated
  using (public.current_user_role() in ('manager', 'teacher') and nursery_id = public.current_user_nursery_id()
         and public.user_can('invoices', 'update'))
  with check (public.current_user_role() in ('manager', 'teacher') and nursery_id = public.current_user_nursery_id()
              and public.user_can('invoices', 'update'));
create policy invoices_perm_delete on public.invoices for delete to authenticated
  using (public.current_user_role() in ('manager', 'teacher') and nursery_id = public.current_user_nursery_id()
         and public.user_can('invoices', 'delete'));

-- Payments and payment attempts: managers read by permission; every change goes through the
-- payment functions (no direct writes).
drop policy if exists payments_finance_manager_select on public.payments;
drop policy if exists payments_finance_manager_insert on public.payments;
drop policy if exists payments_finance_manager_update on public.payments;
drop policy if exists payments_perm_select on public.payments;
create policy payments_perm_select on public.payments for select to authenticated
  using (public.current_user_role() in ('manager', 'teacher') and public.user_can('payments', 'view')
         and exists (select 1 from public.invoices i where i.id = payments.invoice_id and i.nursery_id = public.current_user_nursery_id()));

drop policy if exists payment_attempts_finance_manager_select on public.payment_attempts;
drop policy if exists payment_attempts_finance_manager_update on public.payment_attempts;
drop policy if exists payment_attempts_perm_select on public.payment_attempts;
create policy payment_attempts_perm_select on public.payment_attempts for select to authenticated
  using (public.current_user_role() in ('manager', 'teacher') and nursery_id = public.current_user_nursery_id()
         and public.user_can('payments', 'view'));

-- Payroll: managers and staff by permission (until now only branch/chain admins could).
drop policy if exists staff_payroll_perm_select on public.staff_payroll;
drop policy if exists staff_payroll_perm_insert on public.staff_payroll;
drop policy if exists staff_payroll_perm_update on public.staff_payroll;
create policy staff_payroll_perm_select on public.staff_payroll for select to authenticated
  using (public.current_user_role() in ('manager', 'teacher') and nursery_id = public.current_user_nursery_id()
         and public.user_can('payroll', 'view'));
create policy staff_payroll_perm_insert on public.staff_payroll for insert to authenticated
  with check (public.current_user_role() in ('manager', 'teacher') and nursery_id = public.current_user_nursery_id()
              and public.user_can('payroll', 'create'));
create policy staff_payroll_perm_update on public.staff_payroll for update to authenticated
  using (public.current_user_role() in ('manager', 'teacher') and nursery_id = public.current_user_nursery_id()
         and (public.user_can('payroll', 'update') or public.user_can('payroll', 'approve')))
  with check (public.current_user_role() in ('manager', 'teacher') and nursery_id = public.current_user_nursery_id()
              and (public.user_can('payroll', 'update') or public.user_can('payroll', 'approve')));

-- Nursery settings: managers and staff may change them when granted (admins already can).
drop policy if exists nursery_settings_perm_update on public.nursery_settings;
create policy nursery_settings_perm_update on public.nursery_settings for update to authenticated
  using (public.current_user_role() in ('manager', 'teacher') and nursery_id = public.current_user_nursery_id()
         and public.user_can('settings', 'update'))
  with check (public.current_user_role() in ('manager', 'teacher') and nursery_id = public.current_user_nursery_id()
              and public.user_can('settings', 'update'));

-- =============================================================================
-- 8. Function permissions
-- =============================================================================

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.rbac_seed_nursery_roles(uuid)',
    'public.nurseries_after_insert_seed_roles()',
    'public.rbac_nursery_role_id(uuid, uuid)',
    'public.payment_staff_guard(uuid, text, text)',
    'public.attendance_require_staff(uuid, boolean, text)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', v_fn);
  end loop;

  foreach v_fn in array array[
    'public.user_can(text, text)',
    'public.rbac_manages_nursery(uuid)',
    'public.rbac_save_role(uuid, uuid, text, text, public.user_role, public.user_department, jsonb)',
    'public.rbac_delete_role(uuid)',
    'public.rbac_assign_user_role(uuid, uuid)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end $$;

commit;

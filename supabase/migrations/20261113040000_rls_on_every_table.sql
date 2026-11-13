-- Security: no table without its rules.
--
-- Four tables had row level security off: the milestone reminders of the children (92 on dev), the
-- milestone templates, and the children's routines and their logs. With it off, the public key the
-- app ships with read, changed and deleted them without signing in. No screen uses them yet; now
-- only the staff of the child's nursery reach them (the service role, for jobs, as before).
-- The database test security_baseline keeps every public table with its rules on.

-- Whether the signed-in user works at a nursery: its branch admin and managers (and, with
-- p_with_teachers, its teachers), a chain admin for the chain's nurseries, the platform admin.
-- An account that is not active is nobody (current_user_role is null for it).
create or replace function public.is_nursery_staff(p_nursery_id uuid, p_with_teachers boolean default true)
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
        and (public.current_user_role() in ('branch_admin'::public.user_role, 'manager'::public.user_role)
             or (p_with_teachers and public.current_user_role() = 'teacher'::public.user_role)))
  );
$$;

revoke execute on function public.is_nursery_staff(uuid, boolean) from public, anon;
grant execute on function public.is_nursery_staff(uuid, boolean) to authenticated, service_role;

alter table public.age_milestone_reminders enable row level security;
alter table public.age_milestone_templates enable row level security;
alter table public.child_routine_items enable row level security;
alter table public.child_routine_logs enable row level security;

drop policy if exists age_milestone_reminders_staff on public.age_milestone_reminders;
create policy age_milestone_reminders_staff on public.age_milestone_reminders
  for all to authenticated
  using (public.is_nursery_staff(nursery_id))
  with check (public.is_nursery_staff(nursery_id));

drop policy if exists age_milestone_templates_staff on public.age_milestone_templates;
create policy age_milestone_templates_staff on public.age_milestone_templates
  for all to authenticated
  using (public.is_nursery_staff(nursery_id))
  with check (public.is_nursery_staff(nursery_id, false));

drop policy if exists child_routine_items_staff on public.child_routine_items;
create policy child_routine_items_staff on public.child_routine_items
  for all to authenticated
  using (public.is_nursery_staff(nursery_id))
  with check (public.is_nursery_staff(nursery_id));

drop policy if exists child_routine_logs_staff on public.child_routine_logs;
create policy child_routine_logs_staff on public.child_routine_logs
  for all to authenticated
  using (public.is_nursery_staff(nursery_id))
  with check (public.is_nursery_staff(nursery_id));

-- Nobody signed out reaches them at all.
revoke all on public.age_milestone_reminders, public.age_milestone_templates, public.child_routine_items, public.child_routine_logs from anon;

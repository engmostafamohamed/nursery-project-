-- The parent dashboard billing card (useParentChildBilling) needs to read a child's active
-- extra-hours package assignment and its package details. Neither packages nor child_packages
-- had a parent-facing SELECT policy at all before this — parents could never see their own
-- child's extra-hours coverage, only admins/teachers could. Mirrors the existing
-- tuition_packages_parent_select / child_tuition_subscriptions_parent_select pattern.

begin;

drop policy if exists packages_parent_select on public.packages;
create policy packages_parent_select
  on public.packages for select to authenticated
  using (
    public.current_user_role() = 'parent'
    and active = true
    and nursery_id = public.current_user_nursery_id()
  );

drop policy if exists child_packages_parent_select on public.child_packages;
create policy child_packages_parent_select
  on public.child_packages for select to authenticated
  using (
    public.current_user_role() = 'parent'
    and exists (
      select 1 from public.parent_children pc
      where pc.child_id = child_packages.child_id
        and pc.parent_id = auth.uid()
    )
  );

commit;

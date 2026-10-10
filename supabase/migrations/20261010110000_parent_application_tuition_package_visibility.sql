-- Parents choose tuition packages for a specific application. Their profile nursery can be
-- unset or different from the nursery selected for that application, so package visibility
-- must be scoped to their own application rather than users.nursery_id.

begin;

drop policy if exists tuition_packages_parent_select on public.tuition_packages;
create policy tuition_packages_parent_select
  on public.tuition_packages for select to authenticated
  using (
    public.current_user_role() = 'parent'
    and active = true
    and exists (
      select 1
      from public.applications a
      where a.parent_id = auth.uid()
        and a.nursery_id = tuition_packages.nursery_id
    )
  );

drop policy if exists tuition_package_billing_periods_parent_select
  on public.tuition_package_billing_periods;
create policy tuition_package_billing_periods_parent_select
  on public.tuition_package_billing_periods for select to authenticated
  using (
    public.current_user_role() = 'parent'
    and active = true
    and exists (
      select 1
      from public.applications a
      join public.tuition_packages tp
        on tp.nursery_id = a.nursery_id
       and tp.id = tuition_package_billing_periods.tuition_package_id
      where a.parent_id = auth.uid()
        and tp.active = true
        and tuition_package_billing_periods.nursery_id = a.nursery_id
    )
  );

drop policy if exists deals_parent_select on public.deals;
create policy deals_parent_select
  on public.deals for select to authenticated
  using (
    public.current_user_role() = 'parent'
    and exists (
      select 1
      from public.applications a
      join public.tuition_packages tp
        on tp.nursery_id = a.nursery_id
       and tp.deal_id = deals.id
      where a.parent_id = auth.uid()
        and tp.active = true
        and deals.nursery_id = a.nursery_id
    )
  );

commit;

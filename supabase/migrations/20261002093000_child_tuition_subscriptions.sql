-- An enrolled child's ongoing tuition relationship. Before this, the one invoice created at
-- admission time was the only tuition artifact ever produced — nothing billed again after
-- enrollment. This table tracks what package/period a child is currently subscribed to and
-- when the next invoice is due, so a scheduled job (20261002110000) can generate it.

begin;

create table if not exists public.child_tuition_subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  nursery_id               uuid not null references public.nurseries(id) on delete cascade,
  child_id                 uuid not null references public.children(id) on delete cascade,
  -- set null (not cascade): deleting a package definition must never erase billing history.
  tuition_package_id       uuid references public.tuition_packages(id) on delete set null,
  -- Snapshotted at selection time so history reads correctly even if the package is renamed.
  tuition_package_name_ar  text not null default '',
  tuition_package_name_en  text not null default '',
  billing_period           text not null check (billing_period in ('monthly', 'quarterly', 'half_annual', 'annual')),
  duration_months          integer not null check (duration_months > 0),
  locked_price             numeric(10,2) not null check (locked_price >= 0),
  billed_parent_id         uuid not null references public.users(id) on delete cascade,
  status                   text not null default 'active' check (status in ('active', 'cancelled')),
  started_at               date not null default current_date,
  next_invoice_date        date not null,
  last_invoice_id          uuid references public.invoices(id) on delete set null,
  source_application_id    uuid references public.applications(id) on delete set null,
  -- null = created automatically by the system at enrollment approval, not by an admin.
  created_by               uuid references public.users(id) on delete set null,
  cancelled_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_child_tuition_subscriptions_nursery
  on public.child_tuition_subscriptions (nursery_id);
create index if not exists idx_child_tuition_subscriptions_child
  on public.child_tuition_subscriptions (child_id);
create index if not exists idx_child_tuition_subscriptions_due
  on public.child_tuition_subscriptions (next_invoice_date) where status = 'active';

-- At most one active subscription per child, mirroring uniq_child_active_package.
create unique index if not exists uniq_child_active_tuition_subscription
  on public.child_tuition_subscriptions (child_id) where status = 'active';

drop trigger if exists trg_child_tuition_subscriptions_updated_at on public.child_tuition_subscriptions;
create trigger trg_child_tuition_subscriptions_updated_at
  before update on public.child_tuition_subscriptions
  for each row execute function public.set_updated_at();

alter table public.child_tuition_subscriptions enable row level security;

drop policy if exists child_tuition_subscriptions_xo_all on public.child_tuition_subscriptions;
create policy child_tuition_subscriptions_xo_all on public.child_tuition_subscriptions for all to authenticated
  using (public.is_xo_super_admin()) with check (public.is_xo_super_admin());

drop policy if exists child_tuition_subscriptions_admin_all on public.child_tuition_subscriptions;
create policy child_tuition_subscriptions_admin_all on public.child_tuition_subscriptions for all to authenticated
  using (
    public.current_user_role() in ('branch_admin', 'chain_super_admin')
    and nursery_id = public.current_user_nursery_id()
  )
  with check (
    public.current_user_role() in ('branch_admin', 'chain_super_admin')
    and nursery_id = public.current_user_nursery_id()
  );

drop policy if exists child_tuition_subscriptions_staff_select on public.child_tuition_subscriptions;
create policy child_tuition_subscriptions_staff_select on public.child_tuition_subscriptions for select to authenticated
  using (
    public.current_user_role() in ('teacher', 'manager')
    and nursery_id = public.current_user_nursery_id()
  );

-- Parents may only ever SELECT their own child's subscription — there is deliberately no
-- insert/update/delete policy for 'parent' at all, so "view + pay only, admin changes it"
-- is enforced structurally, not just by hiding a button in the UI.
drop policy if exists child_tuition_subscriptions_parent_select on public.child_tuition_subscriptions;
create policy child_tuition_subscriptions_parent_select
  on public.child_tuition_subscriptions for select to authenticated
  using (
    public.current_user_role() = 'parent'
    and exists (
      select 1 from public.parent_children pc
      where pc.child_id = child_tuition_subscriptions.child_id
        and pc.parent_id = auth.uid()
    )
  );

commit;

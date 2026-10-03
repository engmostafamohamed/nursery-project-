-- Deals & Discounts: a reusable library of time-limited offers the admin can assign to a
-- tuition package or an extra-hours package. A deal can also be created inline while editing a
-- package (one-off/custom) — it still lands in this same table, just not necessarily reused
-- elsewhere, so there's only ever one discount mechanism to reason about.

begin;

create table if not exists public.deals (
  id              uuid primary key default gen_random_uuid(),
  nursery_id      uuid not null references public.nurseries(id) on delete cascade,
  name_ar         text not null default '',
  name_en         text not null default '',
  description_ar  text,
  description_en  text,
  discount_type   text not null check (discount_type in ('percentage', 'fixed_amount')),
  discount_value  numeric(10,2) not null check (discount_value > 0),
  -- NULL starts_at = active immediately; NULL ends_at = no countdown / never expires on its own.
  starts_at       timestamptz,
  ends_at         timestamptz,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_deals_nursery on public.deals (nursery_id);

drop trigger if exists trg_deals_updated_at on public.deals;
create trigger trg_deals_updated_at
  before update on public.deals
  for each row execute function public.set_updated_at();

alter table public.deals enable row level security;

drop policy if exists deals_xo_all on public.deals;
create policy deals_xo_all on public.deals for all to authenticated
  using (public.is_xo_super_admin()) with check (public.is_xo_super_admin());

drop policy if exists deals_admin_all on public.deals;
create policy deals_admin_all on public.deals for all to authenticated
  using (
    public.current_user_role() in ('branch_admin', 'chain_super_admin')
    and nursery_id = public.current_user_nursery_id()
  )
  with check (
    public.current_user_role() in ('branch_admin', 'chain_super_admin')
    and nursery_id = public.current_user_nursery_id()
  );

drop policy if exists deals_staff_select on public.deals;
create policy deals_staff_select on public.deals for select to authenticated
  using (
    public.current_user_role() in ('teacher', 'manager')
    and nursery_id = public.current_user_nursery_id()
  );

-- Parents need to read active deals to show the discount/countdown while applying.
drop policy if exists deals_parent_select on public.deals;
create policy deals_parent_select on public.deals for select to authenticated
  using (
    public.current_user_role() = 'parent'
    and active = true
    and nursery_id = public.current_user_nursery_id()
  );

-- A package may have at most one deal assigned. set null (not cascade): deleting a deal must
-- never delete the package it was attached to.
alter table public.tuition_packages
  add column if not exists deal_id uuid references public.deals(id) on delete set null;

alter table public.packages
  add column if not exists deal_id uuid references public.deals(id) on delete set null;

commit;

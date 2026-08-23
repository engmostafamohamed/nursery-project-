-- Packages: prepaid extra-hours bundles. Admin creates packages and assigns
-- children; late-pickup attendance fees are then waived/decremented against
-- the child's active package instead of being charged.

begin;

create table if not exists public.packages (
  id             uuid primary key default gen_random_uuid(),
  nursery_id     uuid not null references public.nurseries(id) on delete cascade,
  name_ar        text not null default '',
  name_en        text not null default '',
  description_ar text,
  description_en text,
  coverage_type  text not null default 'unlimited'
                   check (coverage_type in ('unlimited', 'hours_quota')),
  included_hours integer,
  price          numeric(10,2) not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.child_packages (
  id          uuid primary key default gen_random_uuid(),
  package_id  uuid not null references public.packages(id) on delete cascade,
  child_id    uuid not null references public.children(id) on delete cascade,
  nursery_id  uuid not null references public.nurseries(id) on delete cascade,
  status      text not null default 'active' check (status in ('active', 'cancelled')),
  hours_used  numeric(10,2) not null default 0,
  assigned_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_packages_nursery on public.packages (nursery_id);
create index if not exists idx_child_packages_child on public.child_packages (child_id);
create index if not exists idx_child_packages_package on public.child_packages (package_id);
-- At most one active package per child.
create unique index if not exists uniq_child_active_package
  on public.child_packages (child_id) where status = 'active';

drop trigger if exists trg_packages_updated_at on public.packages;
create trigger trg_packages_updated_at
  before update on public.packages
  for each row execute function public.set_updated_at();

drop trigger if exists trg_child_packages_updated_at on public.child_packages;
create trigger trg_child_packages_updated_at
  before update on public.child_packages
  for each row execute function public.set_updated_at();

alter table public.packages enable row level security;
alter table public.child_packages enable row level security;

-- ── packages RLS ────────────────────────────────────────────────────────────
drop policy if exists packages_xo_all on public.packages;
create policy packages_xo_all on public.packages for all to authenticated
  using (public.is_xo_super_admin()) with check (public.is_xo_super_admin());

drop policy if exists packages_admin_all on public.packages;
create policy packages_admin_all on public.packages for all to authenticated
  using (
    public.current_user_role() in ('branch_admin', 'chain_super_admin')
    and nursery_id = public.current_user_nursery_id()
  )
  with check (
    public.current_user_role() in ('branch_admin', 'chain_super_admin')
    and nursery_id = public.current_user_nursery_id()
  );

drop policy if exists packages_teacher_select on public.packages;
create policy packages_teacher_select on public.packages for select to authenticated
  using (
    public.current_user_role() = 'teacher'
    and nursery_id = public.current_user_nursery_id()
  );

-- ── child_packages RLS ──────────────────────────────────────────────────────
drop policy if exists child_packages_xo_all on public.child_packages;
create policy child_packages_xo_all on public.child_packages for all to authenticated
  using (public.is_xo_super_admin()) with check (public.is_xo_super_admin());

drop policy if exists child_packages_admin_all on public.child_packages;
create policy child_packages_admin_all on public.child_packages for all to authenticated
  using (
    public.current_user_role() in ('branch_admin', 'chain_super_admin')
    and nursery_id = public.current_user_nursery_id()
  )
  with check (
    public.current_user_role() in ('branch_admin', 'chain_super_admin')
    and nursery_id = public.current_user_nursery_id()
  );

drop policy if exists child_packages_teacher_select on public.child_packages;
create policy child_packages_teacher_select on public.child_packages for select to authenticated
  using (
    public.current_user_role() = 'teacher'
    and nursery_id = public.current_user_nursery_id()
  );

-- ── coverage RPC ────────────────────────────────────────────────────────────
-- Returns how many of p_extra_hours are covered by the child's active package.
-- When p_consume is true and the package is quota-based, the covered hours are
-- deducted from the remaining balance (atomic). Unlimited packages cover all.
create or replace function public.package_apply_extra_hours(
  p_child_id   uuid,
  p_extra_hours numeric,
  p_consume    boolean default false
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
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

  select * into pkg from public.packages where id = cp.package_id;
  if not found or not pkg.active then
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
$$;

grant execute on function public.package_apply_extra_hours(uuid, numeric, boolean) to authenticated;

commit;

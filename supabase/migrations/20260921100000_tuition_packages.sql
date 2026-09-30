-- Tuition packages: the nursery's own cost plans (separate from the extra-hours
-- coverage packages in packages/child_packages). Each plan has a price, how many
-- hours of daily care it covers, and an admin-authored list of included features.
-- Kept in its own table (not a "kind" on packages) because a parent must be able to
-- select one tuition package AND one extra-hours package at the same time, and the
-- existing child_packages junction enforces at most one *active* row per child for
-- the extra-hours use case.

begin;

create table if not exists public.tuition_packages (
  id             uuid primary key default gen_random_uuid(),
  nursery_id     uuid not null references public.nurseries(id) on delete cascade,
  name_ar        text not null default '',
  name_en        text not null default '',
  description_ar text,
  description_en text,
  daily_hours    numeric(4,1),
  -- Bilingual bullet list: [{"ar": "...", "en": "..."}, ...]
  features_json  jsonb not null default '[]'::jsonb,
  price          numeric(10,2) not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_tuition_packages_nursery on public.tuition_packages (nursery_id);

drop trigger if exists trg_tuition_packages_updated_at on public.tuition_packages;
create trigger trg_tuition_packages_updated_at
  before update on public.tuition_packages
  for each row execute function public.set_updated_at();

alter table public.tuition_packages enable row level security;

drop policy if exists tuition_packages_xo_all on public.tuition_packages;
create policy tuition_packages_xo_all on public.tuition_packages for all to authenticated
  using (public.is_xo_super_admin()) with check (public.is_xo_super_admin());

drop policy if exists tuition_packages_admin_all on public.tuition_packages;
create policy tuition_packages_admin_all on public.tuition_packages for all to authenticated
  using (
    public.current_user_role() in ('branch_admin', 'chain_super_admin')
    and nursery_id = public.current_user_nursery_id()
  )
  with check (
    public.current_user_role() in ('branch_admin', 'chain_super_admin')
    and nursery_id = public.current_user_nursery_id()
  );

drop policy if exists tuition_packages_staff_select on public.tuition_packages;
create policy tuition_packages_staff_select on public.tuition_packages for select to authenticated
  using (
    public.current_user_role() in ('teacher', 'manager')
    and nursery_id = public.current_user_nursery_id()
  );

-- Mirrors packages_parent_select: a parent's own nursery_id is set at signup, so this
-- scopes them to exactly the nursery they registered with — never another one.
drop policy if exists tuition_packages_parent_select on public.tuition_packages;
create policy tuition_packages_parent_select
  on public.tuition_packages for select to authenticated
  using (
    public.current_user_role() = 'parent'
    and active = true
    and nursery_id = public.current_user_nursery_id()
  );

commit;

-- Admin-configurable billing periods per tuition package. Previously the only choice a
-- parent had (monthly/quarterly/half_annual/annual) was a hardcoded 1x/3x/6x/12x multiplier
-- of the package's single price, baked into select_application_payment_package. This lets
-- the admin set a real price and duration per period, per package, instead.

begin;

create table if not exists public.tuition_package_billing_periods (
  id                  uuid primary key default gen_random_uuid(),
  nursery_id          uuid not null references public.nurseries(id) on delete cascade,
  tuition_package_id  uuid not null references public.tuition_packages(id) on delete cascade,
  billing_period      text not null check (billing_period in ('monthly', 'quarterly', 'half_annual', 'annual')),
  duration_months     integer not null check (duration_months > 0),
  -- Total price for this whole period (not a per-month rate), so the admin can set real,
  -- non-linear pricing (e.g. a discounted annual rate) instead of a forced multiple.
  price               numeric(10,2) not null check (price >= 0),
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (tuition_package_id, billing_period)
);

create index if not exists idx_tuition_package_billing_periods_package
  on public.tuition_package_billing_periods (tuition_package_id);
create index if not exists idx_tuition_package_billing_periods_nursery
  on public.tuition_package_billing_periods (nursery_id);

drop trigger if exists trg_tuition_package_billing_periods_updated_at on public.tuition_package_billing_periods;
create trigger trg_tuition_package_billing_periods_updated_at
  before update on public.tuition_package_billing_periods
  for each row execute function public.set_updated_at();

alter table public.tuition_package_billing_periods enable row level security;

drop policy if exists tuition_package_billing_periods_xo_all on public.tuition_package_billing_periods;
create policy tuition_package_billing_periods_xo_all on public.tuition_package_billing_periods for all to authenticated
  using (public.is_xo_super_admin()) with check (public.is_xo_super_admin());

drop policy if exists tuition_package_billing_periods_admin_all on public.tuition_package_billing_periods;
create policy tuition_package_billing_periods_admin_all on public.tuition_package_billing_periods for all to authenticated
  using (
    public.current_user_role() in ('branch_admin', 'chain_super_admin')
    and nursery_id = public.current_user_nursery_id()
  )
  with check (
    public.current_user_role() in ('branch_admin', 'chain_super_admin')
    and nursery_id = public.current_user_nursery_id()
  );

drop policy if exists tuition_package_billing_periods_staff_select on public.tuition_package_billing_periods;
create policy tuition_package_billing_periods_staff_select on public.tuition_package_billing_periods for select to authenticated
  using (
    public.current_user_role() in ('teacher', 'manager')
    and nursery_id = public.current_user_nursery_id()
  );

-- Parents still need to read these at APPLICATION time to pick a period — this does not
-- conflict with "view only, no self-service" for an already-enrolled child, since that rule
-- is about child_tuition_subscriptions (see 20261002093000), not the price list itself.
drop policy if exists tuition_package_billing_periods_parent_select on public.tuition_package_billing_periods;
create policy tuition_package_billing_periods_parent_select
  on public.tuition_package_billing_periods for select to authenticated
  using (
    public.current_user_role() = 'parent'
    and active = true
    and nursery_id = public.current_user_nursery_id()
    and exists (
      select 1 from public.tuition_packages tp
      where tp.id = tuition_package_billing_periods.tuition_package_id
        and tp.active = true
    )
  );

-- Backfill: give every existing tuition package the legacy 4 periods at the legacy
-- multiplier pricing, so nothing changes numerically until an admin edits a period.
insert into public.tuition_package_billing_periods (nursery_id, tuition_package_id, billing_period, duration_months, price)
select tp.nursery_id, tp.id, period.name, period.months, tp.price * period.months
from public.tuition_packages tp
cross join (values
  ('monthly', 1),
  ('quarterly', 3),
  ('half_annual', 6),
  ('annual', 12)
) as period(name, months)
on conflict (tuition_package_id, billing_period) do nothing;

-- Re-point select_application_payment_package at the new table (price/duration), falling
-- back to the old hardcoded multiplier only if no active period row exists yet for that
-- package+period combo (keeps any not-yet-backfilled edge case safe). Same 3-arg signature
-- and same line_items_json keys as 20260921130000_fix_tuition_package_billing_period_regression.sql
-- — no client-side changes required.
create or replace function public.select_application_payment_package(
  p_application_id uuid,
  p_package_id uuid,
  p_billing_period text default 'monthly'
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_user_nursery_id uuid;
  v_user_chain_id uuid;
  v_app public.applications%rowtype;
  v_pkg public.tuition_packages%rowtype;
  v_period public.tuition_package_billing_periods%rowtype;
  v_invoice public.invoices%rowtype;
  v_paid numeric := 0;
  v_due_days integer := 7;
  v_invoice_id uuid;
  v_line_items jsonb;
  v_billing_period text := coalesce(nullif(p_billing_period, ''), 'monthly');
  v_billing_months integer := 1;
  v_total numeric := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select u.role, u.nursery_id, u.chain_id
    into v_role, v_user_nursery_id, v_user_chain_id
  from public.users u
  where u.id = v_uid;

  select *
    into v_app
  from public.applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'Application not found' using errcode = '42704';
  end if;

  if v_app.parent_id is null then
    raise exception 'Application must be linked to a parent before selecting a package' using errcode = '22023';
  end if;

  if v_role = 'parent'::public.user_role then
    if v_app.parent_id is distinct from v_uid or v_app.status in ('approved', 'rejected') then
      raise exception 'Cannot change this application package' using errcode = '42501';
    end if;
  elsif v_role in ('branch_admin'::public.user_role, 'manager'::public.user_role) then
    if v_user_nursery_id is distinct from v_app.nursery_id then
      raise exception 'Cannot change applications outside your nursery' using errcode = '42501';
    end if;
  elsif v_role = 'chain_super_admin'::public.user_role then
    if v_user_chain_id is null or not exists (
      select 1
      from public.nurseries n
      where n.id = v_app.nursery_id
        and n.chain_id = v_user_chain_id
    ) then
      raise exception 'Cannot change applications outside your chain' using errcode = '42501';
    end if;
  elsif not public.is_xo_super_admin() then
    raise exception 'Cannot select application package' using errcode = '42501';
  end if;

  select *
    into v_pkg
  from public.tuition_packages
  where id = p_package_id
    and nursery_id = v_app.nursery_id
    and active = true;

  if not found then
    raise exception 'Package not found' using errcode = '42704';
  end if;

  v_billing_period := case v_billing_period
    when 'monthly' then 'monthly'
    when 'quarterly' then 'quarterly'
    when 'half_annual' then 'half_annual'
    when 'annual' then 'annual'
    else 'monthly'
  end;

  select *
    into v_period
  from public.tuition_package_billing_periods
  where tuition_package_id = p_package_id
    and billing_period = v_billing_period
    and active = true;

  if found then
    v_billing_months := v_period.duration_months;
    v_total := v_period.price;
  else
    -- Legacy fallback for a package with no configured periods yet.
    v_billing_months := case v_billing_period
      when 'quarterly' then 3
      when 'half_annual' then 6
      when 'annual' then 12
      else 1
    end;
    v_total := v_pkg.price * v_billing_months;
  end if;

  select *
    into v_invoice
  from public.invoices i
  where i.nursery_id = v_app.nursery_id
    and i.parent_id = v_app.parent_id
    and i.line_items_json->>'application_id' = p_application_id::text
  order by i.created_at desc
  limit 1
  for update;

  if found then
    select coalesce(sum(p.amount), 0)
      into v_paid
    from public.payments p
    where p.invoice_id = v_invoice.id
      and p.status = 'completed';

    if v_paid > 0 then
      raise exception 'Cannot change package after payment has started' using errcode = '22023';
    end if;
  end if;

  select coalesce(ns.invoice_due_days, 7)
    into v_due_days
  from public.nursery_settings ns
  where ns.nursery_id = v_app.nursery_id;

  v_line_items := jsonb_build_object(
    'application_id', p_application_id,
    'application_payment', true,
    'package_id', p_package_id,
    'package_name_ar', v_pkg.name_ar,
    'package_name_en', v_pkg.name_en,
    'daily_hours', v_pkg.daily_hours,
    'features_json', v_pkg.features_json,
    'billing_period', v_billing_period,
    'billing_months', v_billing_months,
    'monthly_price', v_pkg.price,
    'items', jsonb_build_array(
      jsonb_build_object(
        'description', coalesce(nullif(v_pkg.name_en, ''), nullif(v_pkg.name_ar, ''), 'Admission package'),
        'quantity', v_billing_months,
        'unitPrice', v_pkg.price,
        'unit_price', v_pkg.price,
        'total', v_total
      )
    ),
    'notes', 'Admission package selected before approval'
  );

  if v_invoice.id is not null then
    update public.invoices
       set amount = v_total,
           due_date = (current_date + v_due_days),
           status = 'pending',
           invoice_type = 'monthly',
           line_items_json = v_line_items,
           payment_method = null,
           paid_at = null,
           updated_at = now()
     where id = v_invoice.id
     returning id into v_invoice_id;
  else
    insert into public.invoices (
      nursery_id,
      parent_id,
      amount,
      due_date,
      status,
      invoice_type,
      line_items_json
    )
    values (
      v_app.nursery_id,
      v_app.parent_id,
      v_total,
      (current_date + v_due_days),
      'pending',
      'monthly',
      v_line_items
    )
    returning id into v_invoice_id;
  end if;

  return v_invoice_id;
end;
$$;

grant execute on function public.select_application_payment_package(uuid, uuid, text) to authenticated;

commit;

-- Applies a tuition package's assigned deal (if any, and currently active/within its window) to
-- the admission invoice total — the discount only ever affects this one-time application
-- invoice, never the recurring tuition invoices generated later (first-invoice-only, by design).
-- CREATE OR REPLACE on top of 20261002090000_tuition_package_billing_periods.sql's version —
-- identical body, plus the discount block and a few new line_items_json keys for transparency.

begin;

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
  v_deal public.deals%rowtype;
  v_invoice public.invoices%rowtype;
  v_paid numeric := 0;
  v_due_days integer := 7;
  v_invoice_id uuid;
  v_line_items jsonb;
  v_billing_period text := coalesce(nullif(p_billing_period, ''), 'monthly');
  v_billing_months integer := 1;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_discount_amount numeric := 0;
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
    v_subtotal := v_period.price;
  else
    -- Legacy fallback for a package with no configured periods yet.
    v_billing_months := case v_billing_period
      when 'quarterly' then 3
      when 'half_annual' then 6
      when 'annual' then 12
      else 1
    end;
    v_subtotal := v_pkg.price * v_billing_months;
  end if;

  v_total := v_subtotal;

  -- Apply the package's assigned deal, if it's currently active and within its time window.
  if v_pkg.deal_id is not null then
    select *
      into v_deal
    from public.deals
    where id = v_pkg.deal_id
      and active = true
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at > now());

    if found then
      if v_deal.discount_type = 'percentage' then
        v_discount_amount := round(v_subtotal * v_deal.discount_value / 100, 2);
      else
        v_discount_amount := v_deal.discount_value;
      end if;
      v_discount_amount := least(v_discount_amount, v_subtotal);
      v_total := greatest(v_subtotal - v_discount_amount, 0);
    end if;
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
    'subtotal', v_subtotal,
    'deal_id', v_deal.id,
    'discount_type', v_deal.discount_type,
    'discount_value', v_deal.discount_value,
    'discount_amount', v_discount_amount,
    'items', jsonb_build_array(
      jsonb_build_object(
        'description', coalesce(nullif(v_pkg.name_en, ''), nullif(v_pkg.name_ar, ''), 'Admission package'),
        'quantity', v_billing_months,
        'unitPrice', v_pkg.price,
        'unit_price', v_pkg.price,
        'total', v_subtotal
      )
    ) || case
      when v_discount_amount > 0 then jsonb_build_array(
        jsonb_build_object(
          'description', coalesce(nullif(v_deal.name_en, ''), nullif(v_deal.name_ar, ''), 'Discount'),
          'quantity', 1,
          'unitPrice', -v_discount_amount,
          'unit_price', -v_discount_amount,
          'total', -v_discount_amount
        )
      )
      else '[]'::jsonb
    end,
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

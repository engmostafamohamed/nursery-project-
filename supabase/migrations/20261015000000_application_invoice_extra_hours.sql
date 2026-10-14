-- Extra-hours packages are paid on the application invoice, in the same single payment as the
-- tuition package.
--
-- Until now select_application_extra_hours_package only recorded the choice: the package was
-- assigned to the child on approval but its price was never invoiced (parent signup added it
-- itself in the edge function). Now the application invoice always carries the chosen
-- extra-hours package as its own lines:
--   items[]: { kind: 'extra_hours_package', scope: 'extra_hours', ... }
--            { kind: 'discount', scope: 'extra_hours', ... }   when the package's deal is live
--   keys:    extra_hours_package_id, extra_hours_package_name_ar/_en,
--            extra_hours_subtotal, extra_hours_discount_amount   (same keys signup writes)
-- and its amount is the tuition total plus the extra-hours total.
--
-- No package chosen means "pay per hour": late pickup is billed at
-- nursery_settings.late_pickup_fee_per_hour, as before. Nothing changes there.
--
-- Parent signup keeps working unchanged: it reads the invoice before saving the extra-hours
-- choice and writes the full amount back itself, so the package is still counted once.

-- -----------------------------------------------------------------------------
-- 1. Rebuild the extra-hours lines of an application invoice
-- -----------------------------------------------------------------------------
-- Internal helper (no permission checks): callers have already authorised the change.
-- Other lines and adjustments on the invoice are kept: only the previous extra-hours lines'
-- total is taken off the amount and the new one added.
create or replace function public.application_invoice_sync_extra_hours(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_app public.applications%rowtype;
  v_invoice public.invoices%rowtype;
  v_pkg public.packages%rowtype;
  v_deal public.deals%rowtype;
  v_items jsonb;
  v_old_extra_total numeric := 0;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_extra_items jsonb := '[]'::jsonb;
begin
  select * into v_app from public.applications where id = p_application_id;
  if not found then
    return;
  end if;

  select * into v_invoice
  from public.invoices i
  where i.nursery_id = v_app.nursery_id
    and i.parent_id = v_app.parent_id
    and i.line_items_json ->> 'application_id' = p_application_id::text
  order by i.created_at desc
  limit 1
  for update;
  -- No invoice yet: select_application_payment_package adds the lines when it creates one.
  if not found or v_invoice.status in ('paid', 'cancelled') then
    return;
  end if;
  -- Never change an amount the parent has already paid or submitted.
  if public.invoice_paid_total(v_invoice.id) > 0 or public.invoice_pending_total(v_invoice.id) > 0 then
    return;
  end if;

  v_items := v_invoice.line_items_json -> 'items';
  if v_items is null or jsonb_typeof(v_items) <> 'array' then
    v_items := '[]'::jsonb;
  end if;

  select coalesce(sum(coalesce((item ->> 'total')::numeric, 0)), 0)
    into v_old_extra_total
  from jsonb_array_elements(v_items) item
  where item ->> 'kind' = 'extra_hours_package' or item ->> 'scope' = 'extra_hours';

  select coalesce(jsonb_agg(item), '[]'::jsonb)
    into v_items
  from jsonb_array_elements(v_items) item
  where coalesce(item ->> 'kind', '') <> 'extra_hours_package'
    and coalesce(item ->> 'scope', '') <> 'extra_hours';

  if v_app.extra_hours_package_id is not null then
    select * into v_pkg
    from public.packages
    where id = v_app.extra_hours_package_id and nursery_id = v_app.nursery_id;
  end if;

  if v_pkg.id is not null then
    v_subtotal := round(coalesce(v_pkg.price, 0), 2);

    if v_pkg.deal_id is not null then
      select * into v_deal
      from public.deals
      where id = v_pkg.deal_id
        and active = true
        and (starts_at is null or starts_at <= now())
        and (ends_at is null or ends_at > now());
      if found then
        v_discount := case
          when v_deal.discount_type = 'percentage' then round(v_subtotal * v_deal.discount_value / 100, 2)
          else v_deal.discount_value
        end;
        v_discount := least(greatest(v_discount, 0), v_subtotal);
      end if;
    end if;

    v_extra_items := jsonb_build_array(
      jsonb_build_object(
        'kind', 'extra_hours_package',
        'scope', 'extra_hours',
        'name_ar', nullif(v_pkg.name_ar, ''),
        'name_en', nullif(v_pkg.name_en, ''),
        'description', coalesce(nullif(v_pkg.name_en, ''), nullif(v_pkg.name_ar, ''), 'Extra hours package'),
        'quantity', 1,
        'unitPrice', v_subtotal,
        'unit_price', v_subtotal,
        'total', v_subtotal
      )
    ) || case
      when v_discount > 0 then jsonb_build_array(
        jsonb_build_object(
          'kind', 'discount',
          'scope', 'extra_hours',
          'name_ar', nullif(v_deal.name_ar, ''),
          'name_en', nullif(v_deal.name_en, ''),
          'description', coalesce(nullif(v_deal.name_en, ''), nullif(v_deal.name_ar, ''), 'Discount'),
          'quantity', 1,
          'unitPrice', -v_discount,
          'unit_price', -v_discount,
          'total', -v_discount
        )
      )
      else '[]'::jsonb
    end;
  end if;

  update public.invoices
     set amount = greatest(round(v_invoice.amount - v_old_extra_total + v_subtotal - v_discount, 2), 0),
         line_items_json = (
           coalesce(v_invoice.line_items_json, '{}'::jsonb)
             - 'extra_hours_package_id'
             - 'extra_hours_package_name_ar'
             - 'extra_hours_package_name_en'
             - 'extra_hours_subtotal'
             - 'extra_hours_discount_amount'
         ) || jsonb_build_object('items', v_items || v_extra_items)
           || case
                when v_pkg.id is not null then jsonb_build_object(
                  'extra_hours_package_id', v_pkg.id,
                  'extra_hours_package_name_ar', v_pkg.name_ar,
                  'extra_hours_package_name_en', v_pkg.name_en,
                  'extra_hours_subtotal', v_subtotal,
                  'extra_hours_discount_amount', v_discount
                )
                else '{}'::jsonb
              end,
         updated_at = now()
   where id = v_invoice.id;
end;
$$;

revoke execute on function public.application_invoice_sync_extra_hours(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Choosing (or clearing) the extra-hours package updates the invoice
-- -----------------------------------------------------------------------------
create or replace function public.select_application_extra_hours_package(
  p_application_id uuid,
  p_package_id uuid
)
returns void
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
  v_invoice_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select u.role, u.nursery_id, u.chain_id
    into v_role, v_user_nursery_id, v_user_chain_id
  from public.users u
  where u.id = v_uid;

  select * into v_app from public.applications where id = p_application_id for update;
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
      select 1 from public.nurseries n where n.id = v_app.nursery_id and n.chain_id = v_user_chain_id
    ) then
      raise exception 'Cannot change applications outside your chain' using errcode = '42501';
    end if;
  elsif not public.is_xo_super_admin() then
    raise exception 'Cannot select application package' using errcode = '42501';
  end if;

  -- Saving the same choice again changes nothing.
  if v_app.extra_hours_package_id is not distinct from p_package_id then
    return;
  end if;

  if p_package_id is not null then
    perform 1 from public.packages
    where id = p_package_id and nursery_id = v_app.nursery_id and active = true;
    if not found then
      raise exception 'Package not found' using errcode = '42704';
    end if;
  end if;

  -- The price is on the invoice: once a payment is made or submitted, the choice is final.
  select i.id into v_invoice_id
  from public.invoices i
  where i.nursery_id = v_app.nursery_id
    and i.parent_id = v_app.parent_id
    and i.line_items_json ->> 'application_id' = p_application_id::text
  order by i.created_at desc
  limit 1;
  if v_invoice_id is not null
     and (public.invoice_paid_total(v_invoice_id) > 0 or public.invoice_pending_total(v_invoice_id) > 0) then
    raise exception 'extra_hours_locked_after_payment' using errcode = '22023';
  end if;

  update public.applications
     set extra_hours_package_id = p_package_id
   where id = p_application_id;

  perform public.application_invoice_sync_extra_hours(p_application_id);
end;
$$;

grant execute on function public.select_application_extra_hours_package(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Choosing the tuition package keeps the extra-hours lines
-- -----------------------------------------------------------------------------
-- Same as 20261007000000_notification_templates_payments_hardening.sql, with the two
-- changes marked "Changed:".

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

  select * into v_app from public.applications where id = p_application_id for update;
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
      select 1 from public.nurseries n where n.id = v_app.nursery_id and n.chain_id = v_user_chain_id
    ) then
      raise exception 'Cannot change applications outside your chain' using errcode = '42501';
    end if;
  elsif not public.is_xo_super_admin() then
    raise exception 'Cannot select application package' using errcode = '42501';
  end if;

  select * into v_pkg
  from public.tuition_packages
  where id = p_package_id and nursery_id = v_app.nursery_id and active = true;
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

  select * into v_period
  from public.tuition_package_billing_periods
  where tuition_package_id = p_package_id and billing_period = v_billing_period and active = true;

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
    select * into v_deal
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

  select * into v_invoice
  from public.invoices i
  where i.nursery_id = v_app.nursery_id
    and i.parent_id = v_app.parent_id
    and i.line_items_json ->> 'application_id' = p_application_id::text
  order by i.created_at desc
  limit 1
  for update;

  if found then
    select coalesce(sum(p.amount), 0) into v_paid
    from public.payments p
    where p.invoice_id = v_invoice.id and p.status = 'completed';
    -- Changed: a payment awaiting confirmation also locks the package, so the amount the
    -- parent submitted always matches the invoice.
    if v_paid > 0 or public.invoice_pending_total(v_invoice.id) > 0 then
      raise exception 'Cannot change package after payment has started' using errcode = '22023';
    end if;
  end if;

  select coalesce(ns.invoice_due_days, 7) into v_due_days
  from public.nursery_settings ns where ns.nursery_id = v_app.nursery_id;

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
        'kind', 'admission_package',
        'name_ar', nullif(v_pkg.name_ar, ''),
        'name_en', nullif(v_pkg.name_en, ''),
        'description', coalesce(nullif(v_pkg.name_en, ''), nullif(v_pkg.name_ar, '')),
        'quantity', v_billing_months,
        'unitPrice', v_pkg.price,
        'unit_price', v_pkg.price,
        'total', v_subtotal
      )
    ) || case
      when v_discount_amount > 0 then jsonb_build_array(
        jsonb_build_object(
          'kind', 'discount',
          'name_ar', nullif(v_deal.name_ar, ''),
          'name_en', nullif(v_deal.name_en, ''),
          'description', coalesce(nullif(v_deal.name_en, ''), nullif(v_deal.name_ar, '')),
          'quantity', 1,
          'unitPrice', -v_discount_amount,
          'unit_price', -v_discount_amount,
          'total', -v_discount_amount
        )
      )
      else '[]'::jsonb
    end
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
    insert into public.invoices (nursery_id, parent_id, amount, due_date, status, invoice_type, line_items_json)
    values (v_app.nursery_id, v_app.parent_id, v_total, (current_date + v_due_days), 'pending', 'monthly', v_line_items)
    returning id into v_invoice_id;
  end if;

  -- Changed: the invoice is rebuilt from the tuition package above, so add the extra-hours
  -- package the parent chose back onto it.
  perform public.application_invoice_sync_extra_hours(p_application_id);

  return v_invoice_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Open application invoices that already have an extra-hours choice
-- -----------------------------------------------------------------------------
-- Draft applications chose a package that was never invoiced; add it while nothing is paid.
-- (The helper skips invoices with a payment made or submitted.)
do $$
declare
  r record;
begin
  for r in
    select a.id
    from public.applications a
    where a.extra_hours_package_id is not null
      and a.status = 'draft'
  loop
    perform public.application_invoice_sync_extra_hours(r.id);
  end loop;
end;
$$;

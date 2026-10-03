-- Daily cron that advances each active child_tuition_subscriptions row whose next_invoice_date
-- has arrived, generating a new invoice shaped like the existing admission invoice so it plugs
-- straight into the parent's existing invoice/payment UI with no changes there.

begin;

create extension if not exists pg_cron;

-- Internal only.
create or replace function public._generate_tuition_invoice(p_subscription_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.child_tuition_subscriptions%rowtype;
  v_due_days integer := 7;
  v_invoice_id uuid;
  v_line_items jsonb;
begin
  select * into v_sub
  from public.child_tuition_subscriptions
  where id = p_subscription_id
    and status = 'active'
  for update;

  if not found or v_sub.next_invoice_date > current_date then
    return null;
  end if;

  select coalesce(ns.invoice_due_days, 7) into v_due_days
  from public.nursery_settings ns where ns.nursery_id = v_sub.nursery_id;

  v_line_items := jsonb_build_object(
    'child_id', v_sub.child_id,
    'subscription_id', v_sub.id,
    'tuition_package_id', v_sub.tuition_package_id,
    'package_id', v_sub.tuition_package_id,
    'package_name_ar', v_sub.tuition_package_name_ar,
    'package_name_en', v_sub.tuition_package_name_en,
    'billing_period', v_sub.billing_period,
    'billing_months', v_sub.duration_months,
    'monthly_price', v_sub.locked_price,
    'recurring_tuition', true,
    'items', jsonb_build_array(
      jsonb_build_object(
        'description', coalesce(nullif(v_sub.tuition_package_name_en, ''), nullif(v_sub.tuition_package_name_ar, ''), 'Tuition'),
        'quantity', v_sub.duration_months,
        'unitPrice', round(v_sub.locked_price / greatest(v_sub.duration_months, 1), 2),
        'unit_price', round(v_sub.locked_price / greatest(v_sub.duration_months, 1), 2),
        'total', v_sub.locked_price
      )
    )
  );

  insert into public.invoices (
    nursery_id, parent_id, amount, due_date, status, invoice_type, line_items_json
  )
  values (
    v_sub.nursery_id,
    v_sub.billed_parent_id,
    v_sub.locked_price,
    current_date + v_due_days,
    'pending',
    'monthly',
    v_line_items
  )
  returning id into v_invoice_id;

  update public.child_tuition_subscriptions
     set next_invoice_date = v_sub.next_invoice_date + make_interval(months => v_sub.duration_months),
         last_invoice_id = v_invoice_id
   where id = v_sub.id;

  return v_invoice_id;
end;
$$;

revoke execute on function public._generate_tuition_invoice(uuid) from public;

create or replace function public.run_tuition_subscription_billing()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_processed integer := 0;
  v_row record;
begin
  for v_row in
    select cts.id
    from public.child_tuition_subscriptions cts
    join public.children c on c.id = cts.child_id
    join public.nursery_settings ns on ns.nursery_id = cts.nursery_id
    where cts.status = 'active'
      and cts.next_invoice_date <= current_date
      and c.status = 'active'
      and coalesce(ns.auto_tuition_billing_enabled, true)
    for update of cts skip locked
  loop
    perform public._generate_tuition_invoice(v_row.id);
    v_processed := v_processed + 1;
  end loop;

  return v_processed;
end;
$$;

revoke execute on function public.run_tuition_subscription_billing() from public;

do $$
begin
  perform cron.unschedule('tuition-subscription-billing-daily');
exception when others then null;
end $$;

select cron.schedule('tuition-subscription-billing-daily', '0 6 * * *',
  $$select public.run_tuition_subscription_billing()$$);

commit;

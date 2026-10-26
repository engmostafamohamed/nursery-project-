-- Demo seed · 17 · Invoices and payments ({{branches}})
--
-- Tuition invoices since August (as the billing job writes them, billed to the subscription's parent):
-- monthly payers have one a month, term and year payers one in September. Nearly all of August's and
-- September's are paid; October's are a mix: paid, paid in part, waiting for the nursery to confirm a
-- transfer, or not paid yet (overdue once the 5 days to pay have passed). Payments come by InstaPay,
-- cash, Vodafone Cash, bank transfer or card, confirmed by the branch's finance manager.
-- The invoices go in unpaid, then their payments, then the paid ones are closed: the payments table
-- refuses money for a closed invoice.

create temp table bills on commit drop as
select
  seed.uid('invoice:' || s.child_id || ':' || m.month) as invoice_id,
  s.id as subscription_id,
  s.nursery_id,
  s.child_id,
  s.billed_parent_id,
  s.locked_price as amount,
  m.month,
  s.billing_period,
  s.duration_months,
  s.tuition_package_id,
  s.tuition_package_name_ar,
  s.tuition_package_name_en,
  (m.month + 5) as due_date,
  case
    when m.month < date '2026-10-01' then seed.pick_weighted(array['paid', 'unpaid'], array[96, 4], 'outcome:' || s.child_id || m.month)
    else seed.pick_weighted(array['paid', 'partial', 'review', 'unpaid'], array[55, 12, 6, 27], 'outcome:' || s.child_id || m.month)
  end as outcome,
  seed.pick_weighted(array['instapay', 'cash', 'vodafone_cash', 'bank_transfer', 'card'], array[35, 30, 15, 10, 10], 'method:' || s.child_id || m.month) as method,
  ((m.month + seed.int_between(0, 9, 'paid-day:' || s.child_id || m.month) + time '10:00'
     + make_interval(mins => seed.int_between(0, 600, 'paid-time:' || s.child_id || m.month))) at time zone 'Africa/Cairo') as paid_at,
  (select st.user_id from seed.staff st where st.branch = k.branch and st.key = 'finance') as confirmed_by
from public.child_tuition_subscriptions s
join seed.kids k on k.child_id = s.child_id
cross join lateral (
  select month::date from generate_series(date '2026-08-01', date '2026-10-01', interval '1 month') month
  where month >= date_trunc('month', s.started_at)
    and (s.billing_period = 'monthly' or month = greatest(date '2026-09-01', date_trunc('month', s.started_at)::date))
) m
where k.branch = any({{branches}});

insert into public.invoices (id, nursery_id, parent_id, amount, due_date, status, invoice_type, created_at, line_items_json)
select
  b.invoice_id, b.nursery_id, b.billed_parent_id, b.amount, b.due_date,
  case when b.due_date < seed.config('today')::date then 'overdue' else 'pending' end,
  'monthly',
  (b.month + time '06:00') at time zone 'Africa/Cairo',
  jsonb_build_object(
    'child_id', b.child_id,
    'subscription_id', b.subscription_id,
    'tuition_package_id', b.tuition_package_id,
    'package_id', b.tuition_package_id,
    'package_name_ar', b.tuition_package_name_ar,
    'package_name_en', b.tuition_package_name_en,
    'billing_period', b.billing_period,
    'billing_months', b.duration_months,
    'monthly_price', b.amount,
    'recurring_tuition', true,
    'items', jsonb_build_array(jsonb_build_object(
      'kind', 'tuition',
      'name_ar', b.tuition_package_name_ar,
      'name_en', b.tuition_package_name_en,
      'description', b.tuition_package_name_en,
      'quantity', b.duration_months,
      'unitPrice', round(b.amount / greatest(b.duration_months, 1), 2),
      'unit_price', round(b.amount / greatest(b.duration_months, 1), 2),
      'total', b.amount))
  )
from bills b
on conflict (id) do nothing;

-- The money: in full, half of it, or a transfer still to confirm.
insert into public.payment_attempts (invoice_id, parent_id, nursery_id, amount, payment_method, status, created_at, confirmed_at, confirmed_by, reference, notes)
select
  b.invoice_id,
  b.billed_parent_id,
  b.nursery_id,
  case when b.outcome = 'partial' then round(b.amount / 2 / 50) * 50 else b.amount end,
  b.method,
  case when b.outcome = 'review' then 'pending_confirmation' else 'confirmed' end,
  b.paid_at - interval '20 minutes',
  case when b.outcome = 'review' then null else b.paid_at end,
  case when b.outcome = 'review' then null else b.confirmed_by end,
  case b.method
    when 'instapay' then 'IPN' || lpad(seed.int_between(0, 99999999, 'ref:' || b.invoice_id)::text, 8, '0')
    when 'bank_transfer' then 'FT' || lpad(seed.int_between(0, 99999999, 'ref:' || b.invoice_id)::text, 8, '0')
    when 'vodafone_cash' then 'VC' || lpad(seed.int_between(0, 99999999, 'ref:' || b.invoice_id)::text, 8, '0')
    when 'card' then 'CARD-' || lpad(seed.int_between(0, 9999, 'ref:' || b.invoice_id)::text, 4, '0')
    else 'RCPT-' || lpad(seed.int_between(0, 99999, 'ref:' || b.invoice_id)::text, 5, '0')
  end,
  case when b.method = 'cash' then 'دفع نقدًا في مكتب الحضانة' end
from bills b
where b.outcome in ('paid', 'partial', 'review')
  and not exists (select 1 from public.payment_attempts pa where pa.invoice_id = b.invoice_id);

update public.invoices i
   set status = 'paid', paid_at = b.paid_at, payment_method = b.method
  from bills b
 where i.id = b.invoice_id and b.outcome = 'paid';

-- Each subscription points at its latest invoice, as the billing job leaves it.
update public.child_tuition_subscriptions s
   set last_invoice_id = latest.invoice_id
  from (select distinct on (subscription_id) subscription_id, invoice_id from bills order by subscription_id, month desc) latest
 where s.id = latest.subscription_id;

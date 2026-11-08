-- Database test · The parent's bills (get_parent_billing, get_parent_invoice): only the parent's own
-- invoices; paid = completed payments, in review = payment requests waiting for the nursery, payable =
-- amount - paid - in review; overdue by the nursery's own day; a cancelled or paid invoice has nothing
-- payable; an admission invoice names its application and child; the points offer is capped at half of
-- the original amount over all redemptions and at what is payable; another parent is refused.
-- Dates are relative to today, so the test runs on any day. Everything is rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

insert into public.nurseries (id, name_ar, name_en) values
  ('00000000-0000-4000-9200-00000000000a', 'حضانة أ', 'Billing Nursery');
update public.nursery_settings
   set timezone = 'Africa/Cairo', loyalty_enabled = true, points_redemption_rate = 0.10
 where nursery_id = '00000000-0000-4000-9200-00000000000a';

insert into auth.users (id, email) values
  ('00000000-0000-4000-9200-000000000a01', 'bill.mona@test.local'),
  ('00000000-0000-4000-9200-000000000a02', 'bill.karim@test.local');
update public.users u
   set role = 'parent', nursery_id = '00000000-0000-4000-9200-00000000000a', name_ar = v.name_ar, name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9200-000000000a01', 'منى', 'Mona'),
    ('00000000-0000-4000-9200-000000000a02', 'كريم', 'Karim')
  ) as v(id, name_ar, name_en)
 where u.id = v.id::uuid;

insert into public.children (id, nursery_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-9200-0000000000c1', '00000000-0000-4000-9200-00000000000a', 'ليلى', 'Laila', '2023-01-01', 'active', '2026-01-01');
insert into public.parent_children (parent_id, child_id, is_primary) values
  ('00000000-0000-4000-9200-000000000a01', '00000000-0000-4000-9200-0000000000c1', true);
insert into public.applications (id, nursery_id, status, child_id) values
  ('00000000-0000-4000-9200-0000000000a9', '00000000-0000-4000-9200-00000000000a', 'approved', '00000000-0000-4000-9200-0000000000c1');

insert into public.invoices (id, nursery_id, parent_id, amount, due_date, status, invoice_type, line_items_json) values
  -- Five days late, 500 confirmed and 1000 waiting for the nursery: 1500 left to send.
  ('00000000-0000-4000-9200-000000000081', '00000000-0000-4000-9200-00000000000a', '00000000-0000-4000-9200-000000000a01',
   3000, (now() at time zone 'Africa/Cairo')::date - 5, 'pending', 'monthly', '{}'::jsonb),
  -- Not due yet; 100 off with points already (originally 1100).
  ('00000000-0000-4000-9200-000000000082', '00000000-0000-4000-9200-00000000000a', '00000000-0000-4000-9200-000000000a01',
   1000, (now() at time zone 'Africa/Cairo')::date + 10, 'pending', 'monthly',
   jsonb_build_object('items', jsonb_build_array(
     jsonb_build_object('kind', 'tuition', 'total', 1100),
     jsonb_build_object('kind', 'loyalty_discount', 'points', 1000, 'total', -100)))),
  ('00000000-0000-4000-9200-000000000083', '00000000-0000-4000-9200-00000000000a', '00000000-0000-4000-9200-000000000a01',
   2000, (now() at time zone 'Africa/Cairo')::date - 20, 'paid', 'monthly', '{}'::jsonb),
  -- Cancelled after a payment was sent for it.
  ('00000000-0000-4000-9200-000000000084', '00000000-0000-4000-9200-00000000000a', '00000000-0000-4000-9200-000000000a01',
   999, (now() at time zone 'Africa/Cairo')::date - 3, 'pending', 'other', '{}'::jsonb),
  -- The admission invoice of Laila's application.
  ('00000000-0000-4000-9200-000000000085', '00000000-0000-4000-9200-00000000000a', '00000000-0000-4000-9200-000000000a01',
   4500, (now() at time zone 'Africa/Cairo')::date + 2, 'pending', 'other',
   jsonb_build_object('application_id', '00000000-0000-4000-9200-0000000000a9', 'items', jsonb_build_array(jsonb_build_object('kind', 'admission_package', 'total', 4500)))),
  -- Karim's.
  ('00000000-0000-4000-9200-000000000086', '00000000-0000-4000-9200-00000000000a', '00000000-0000-4000-9200-000000000a02',
   700, (now() at time zone 'Africa/Cairo')::date, 'pending', 'monthly', '{}'::jsonb);

insert into public.payments (invoice_id, amount, method, status, paid_at) values
  ('00000000-0000-4000-9200-000000000081', 500, 'cash', 'completed', now() - interval '2 days'),
  ('00000000-0000-4000-9200-000000000083', 2000, 'instapay', 'completed', now() - interval '20 days');

-- Written directly: the payment triggers are for the parent's and the nursery's own actions.
alter table public.payment_attempts disable trigger user;
insert into public.payment_attempts (invoice_id, parent_id, nursery_id, amount, payment_method, status) values
  ('00000000-0000-4000-9200-000000000081', '00000000-0000-4000-9200-000000000a01', '00000000-0000-4000-9200-00000000000a', 1000, 'instapay', 'pending_confirmation'),
  ('00000000-0000-4000-9200-000000000081', '00000000-0000-4000-9200-000000000a01', '00000000-0000-4000-9200-00000000000a', 300, 'instapay', 'failed'),
  ('00000000-0000-4000-9200-000000000084', '00000000-0000-4000-9200-000000000a01', '00000000-0000-4000-9200-00000000000a', 999, 'instapay', 'pending_confirmation');
alter table public.payment_attempts enable trigger user;
update public.invoices set status = 'cancelled' where id = '00000000-0000-4000-9200-000000000084';

insert into public.loyalty_transactions (nursery_id, parent_id, transaction_type, points, source) values
  ('00000000-0000-4000-9200-00000000000a', '00000000-0000-4000-9200-000000000a01', 'earned', 1300, 'manual'),
  ('00000000-0000-4000-9200-00000000000a', '00000000-0000-4000-9200-000000000a01', 'redeemed', -1000, 'manual');

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

-- One invoice of the list, as a line of its figures.
create function pg_temp.line(p_list jsonb, p_id uuid) returns text
language sql as $$
  select format('%s late=%s paid=%s review=%s payable=%s', r ->> 'status', r ->> 'overdue_days', r ->> 'paid_amount', r ->> 'pending_amount', r ->> 'payable')
    from jsonb_array_elements(p_list) r where r ->> 'id' = p_id::text
$$;

-- ---------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-9200-000000000a01');
select set_config('bill.list', public.get_parent_billing()::text, true);
select set_config('bill.late', public.get_parent_invoice('00000000-0000-4000-9200-000000000081')::text, true);
select set_config('bill.points', public.get_parent_invoice('00000000-0000-4000-9200-000000000082')::text, true);
select set_config('bill.missing', coalesce(public.get_parent_invoice('00000000-0000-4000-9200-0000000000ff')::text, 'null'), true);

select pg_temp.act_as('00000000-0000-4000-9200-000000000a02');
select throws_ok(
  $$ select public.get_parent_invoice('00000000-0000-4000-9200-000000000081') $$,
  '42501', 'payment_invoice_not_yours',
  'another parent cannot read the invoice'
);
reset role;

select is(
  (select string_agg(r ->> 'invoice_number', ',' order by r ->> 'id')
     from jsonb_array_elements(current_setting('bill.list')::jsonb) r),
  (select string_agg(public.invoice_number_label(i), ',' order by i.id::text)
     from public.invoices i where i.parent_id = '00000000-0000-4000-9200-000000000a01'),
  'the list has every invoice of the parent and none of another parent'
);

select is(
  pg_temp.line(current_setting('bill.list')::jsonb, '00000000-0000-4000-9200-000000000081'),
  'overdue late=5 paid=500.00 review=1000.00 payable=1500.00',
  'a late invoice: the confirmed part, the part waiting for the nursery, and what is left to send (a refused request counts nowhere)'
);

select is(
  pg_temp.line(current_setting('bill.list')::jsonb, '00000000-0000-4000-9200-000000000082'),
  'pending late=0 paid=0 review=0 payable=1000.00',
  'an invoice not due yet'
);

select is(
  pg_temp.line(current_setting('bill.list')::jsonb, '00000000-0000-4000-9200-000000000083'),
  'paid late=0 paid=2000.00 review=0 payable=0',
  'a paid invoice has nothing to pay'
);

select is(
  pg_temp.line(current_setting('bill.list')::jsonb, '00000000-0000-4000-9200-000000000084'),
  'cancelled late=0 paid=0 review=0 payable=0',
  'a cancelled invoice has nothing to pay or wait for, even with a request still open'
);

select is(
  (select format('%s %s', r ->> 'application_id', r -> 'child_ids')
     from jsonb_array_elements(current_setting('bill.list')::jsonb) r
    where r ->> 'id' = '00000000-0000-4000-9200-000000000085'),
  '00000000-0000-4000-9200-0000000000a9 ["00000000-0000-4000-9200-0000000000c1"]',
  'an admission invoice names its application and the child'
);

select is(
  (select format('review=%s payments=%s parent=%s', jsonb_array_length(j -> 'in_review'), j -> 'payments' -> 0 ->> 'amount', j -> 'parent' ->> 'name_en')
     from (select current_setting('bill.late')::jsonb as j) x),
  'review=1 payments=500.00 parent=Mona',
  'one invoice: the request waiting for the nursery and the confirmed payment'
);

select is(
  (select format('enabled=%s balance=%s min=%s max=%s', j -> 'loyalty' ->> 'enabled', j -> 'loyalty' ->> 'balance',
                 j -> 'loyalty' ->> 'min_points', j -> 'loyalty' ->> 'max_discount')
     from (select current_setting('bill.points')::jsonb as j) x),
  'enabled=true balance=300 min=100 max=450.00',
  'points: the balance at this nursery, and at most half of the original 1100 over all redemptions (100 already used)'
);

select is(
  (select (j -> 'loyalty' ->> 'max_discount')::numeric
     from (select current_setting('bill.late')::jsonb as j) x),
  1500.00,
  'points never take off more than is left to send'
);

select is(current_setting('bill.missing'), 'null', 'an invoice that does not exist reads as nothing');

select ok(
  not has_function_privilege('anon', 'public.get_parent_billing()', 'execute')
  and not has_function_privilege('anon', 'public.get_parent_invoice(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.parent_invoice_summary(public.invoices)', 'execute'),
  'signed-out visitors cannot read bills, and the inner helper is not callable'
);

select * from finish();
rollback;

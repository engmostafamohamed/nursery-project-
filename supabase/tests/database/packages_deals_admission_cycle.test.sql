-- Database test · Deals → packages → admission → payment → enrollment → extra hours → renewal.
-- The whole money cycle of a new child, with the role each step really runs as: the finance
-- manager builds the offer, the parent chooses and pays, the admin confirms and enrolls, the
-- daily jobs bill late pickups and the next tuition period. Everything is rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(39);

-- ---------------------------------------------------------------------------------------------
-- Test data (as the database owner, so RLS does not apply yet)
-- ---------------------------------------------------------------------------------------------

insert into public.nurseries (id, name_ar, name_en) values
  ('00000000-0000-4000-9000-00000000000a', 'حضانة أ', 'Nursery A'),
  ('00000000-0000-4000-9000-00000000000b', 'حضانة ب', 'Nursery B');

insert into auth.users (id, email) values
  ('00000000-0000-4000-9000-000000000a01', 'cycle.admin@test.local'),
  ('00000000-0000-4000-9000-000000000a02', 'cycle.finance@test.local'),
  ('00000000-0000-4000-9000-000000000a03', 'cycle.hr@test.local'),
  ('00000000-0000-4000-9000-000000000a06', 'cycle.parent@test.local'),
  ('00000000-0000-4000-9000-000000000b02', 'cycle.finance.b@test.local');

update public.users u
   set role = v.role::public.user_role,
       nursery_id = v.nursery_id::uuid,
       department = v.department::public.user_department,
       status = 'active'
  from (values
    ('00000000-0000-4000-9000-000000000a01', 'branch_admin', '00000000-0000-4000-9000-00000000000a', null),
    ('00000000-0000-4000-9000-000000000a02', 'manager',      '00000000-0000-4000-9000-00000000000a', 'finance'),
    ('00000000-0000-4000-9000-000000000a03', 'manager',      '00000000-0000-4000-9000-00000000000a', 'hr'),
    ('00000000-0000-4000-9000-000000000a06', 'parent',       '00000000-0000-4000-9000-00000000000a', null),
    ('00000000-0000-4000-9000-000000000b02', 'manager',      '00000000-0000-4000-9000-00000000000b', 'finance')
  ) as v(id, role, nursery_id, department)
 where u.id = v.id::uuid;

-- Closing time 15:00, 50 EGP per late hour billed by the hour from closing time.
update public.nursery_settings
   set standard_start_time = '08:00',
       standard_end_time = '15:00',
       late_pickup_fee_per_hour = 50,
       late_pickup_grace_minutes = 0,
       late_billing_unit_minutes = 60,
       late_billing_from = 'end_time',
       late_billing_base = 'closing_time',
       timezone = 'Africa/Cairo',
       invoice_due_days = 7
 where nursery_id = '00000000-0000-4000-9000-00000000000a';

insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-9000-000000000c01', '00000000-0000-4000-9000-00000000000a', 'الفراشات', 'Butterflies');

-- The parent's application, information complete and terms accepted, waiting for a package.
insert into public.applications (id, nursery_id, parent_id, status, terms_accepted, parent_info_json, child_info_json) values
  ('00000000-0000-4000-9000-000000000d01', '00000000-0000-4000-9000-00000000000a', '00000000-0000-4000-9000-000000000a06',
   'draft', true, '{"mother": {"full_name": "Mona"}}',
   '{"full_name_ar": "ليلى", "full_name_en": "Laila", "dob": "2023-03-01", "gender": "female"}'),
  ('00000000-0000-4000-9000-000000000d02', '00000000-0000-4000-9000-00000000000a', '00000000-0000-4000-9000-000000000a06',
   'draft', true, '{"mother": {"full_name": "Mona"}}',
   '{"full_name_ar": "يوسف", "full_name_en": "Youssef", "dob": "2024-01-01", "gender": "male"}');

-- The first application has its four required documents, so paying sends it for review.
insert into public.application_documents (application_id, document_type, file_url)
select '00000000-0000-4000-9000-000000000d01', doc, 'application-documents/test/' || doc || '.pdf'
  from unnest(array['birth_certificate', 'vaccination_card', 'parent_id', 'proof_of_address']) as doc;

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

create function pg_temp.app_invoice(p_application uuid) returns public.invoices
language sql as $$
  select * from public.invoices where line_items_json ->> 'application_id' = p_application::text
   order by created_at desc limit 1
$$;

-- ---------------------------------------------------------------------------------------------
-- 1. The finance manager builds the offer
-- ---------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-9000-000000000a02');

select lives_ok(
  $$ insert into public.deals (id, nursery_id, name_en, name_ar, discount_type, discount_value) values
       ('00000000-0000-4000-9000-0000000de001', '00000000-0000-4000-9000-00000000000a', 'Opening offer', 'عرض الافتتاح', 'percentage', 10),
       ('00000000-0000-4000-9000-0000000de002', '00000000-0000-4000-9000-00000000000a', 'Late pack offer', 'عرض الساعات', 'fixed_amount', 50) $$,
  'the finance manager creates a percentage deal and a fixed-amount deal'
);

select throws_ok(
  $$ insert into public.deals (nursery_id, name_en, discount_type, discount_value)
     values ('00000000-0000-4000-9000-00000000000a', 'Too generous', 'percentage', 150) $$,
  '23514', null,
  'a percentage deal over 100% is refused'
);

select lives_ok(
  $$ insert into public.tuition_packages (id, nursery_id, name_en, name_ar, price, daily_hours, active, deal_id)
     values ('00000000-0000-4000-9000-0000000a1001', '00000000-0000-4000-9000-00000000000a', 'Full day', 'يوم كامل', 1000, 7, true,
             '00000000-0000-4000-9000-0000000de001') $$,
  'the finance manager creates a tuition package with the 10% deal'
);

select lives_ok(
  $$ insert into public.tuition_package_billing_periods (tuition_package_id, nursery_id, billing_period, duration_months, price, active) values
       ('00000000-0000-4000-9000-0000000a1001', '00000000-0000-4000-9000-00000000000a', 'monthly', 1, 1000, true),
       ('00000000-0000-4000-9000-0000000a1001', '00000000-0000-4000-9000-00000000000a', 'quarterly', 3, 2700, true),
       ('00000000-0000-4000-9000-0000000a1001', '00000000-0000-4000-9000-00000000000a', 'annual', 12, 12000, false)
     on conflict (tuition_package_id, billing_period) do update set price = excluded.price, active = excluded.active $$,
  'the finance manager saves its billing periods (annual switched off)'
);

select lives_ok(
  $$ insert into public.packages (id, nursery_id, name_en, name_ar, coverage_type, included_hours, price, active, deal_id) values
       ('00000000-0000-4000-9000-0000000eb001', '00000000-0000-4000-9000-00000000000a', '5-hour pack', 'باقة 5 ساعات', 'hours_quota', 5, 300, true,
        '00000000-0000-4000-9000-0000000de002'),
       ('00000000-0000-4000-9000-0000000eb002', '00000000-0000-4000-9000-00000000000a', 'Old pack', 'باقة قديمة', 'unlimited', null, 900, false, null) $$,
  'the finance manager creates extra-hours packages'
);

select pg_temp.act_as('00000000-0000-4000-9000-000000000a03');

select is(
  (select count(*)::int from public.packages where nursery_id = '00000000-0000-4000-9000-00000000000a'),
  0,
  'an HR manager does not see the extra-hours packages'
);

select throws_ok(
  $$ insert into public.deals (nursery_id, name_en, discount_type, discount_value)
     values ('00000000-0000-4000-9000-00000000000a', 'HR deal', 'percentage', 5) $$,
  '42501', null,
  'an HR manager cannot create a deal'
);

select pg_temp.act_as('00000000-0000-4000-9000-000000000b02');

select is(
  (select count(*)::int from public.tuition_packages where nursery_id = '00000000-0000-4000-9000-00000000000a'),
  0,
  'a finance manager of another nursery does not see these packages'
);

-- Row-level security hides the rows instead of raising, so the update touches nothing.
select results_eq(
  $$ with changed as (
       update public.tuition_packages set price = 1 where id = '00000000-0000-4000-9000-0000000a1001' returning 1
     ) select count(*)::int from changed $$,
  $$ values (0) $$,
  'a finance manager of another nursery cannot change them'
);

reset role;
select is(
  (select price from public.tuition_packages where id = '00000000-0000-4000-9000-0000000a1001'),
  1000::numeric,
  'the package price is unchanged'
);

-- ---------------------------------------------------------------------------------------------
-- 2. The parent chooses a package
-- ---------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-9000-000000000a06');

select throws_ok(
  $$ select public.select_application_payment_package(
       '00000000-0000-4000-9000-000000000d01', '00000000-0000-4000-9000-0000000a1001', 'annual') $$,
  '22023', 'billing_period_not_offered',
  'a billing period the nursery switched off cannot be chosen'
);

select lives_ok(
  $$ select public.select_application_payment_package(
       '00000000-0000-4000-9000-000000000d01', '00000000-0000-4000-9000-0000000a1001', 'quarterly') $$,
  'the parent chooses the quarterly period'
);

select is(
  (select (amount, (line_items_json ->> 'subtotal')::numeric, (line_items_json ->> 'discount_amount')::numeric)::text
     from pg_temp.app_invoice('00000000-0000-4000-9000-000000000d01')),
  '(2430.00,2700.00,270.00)',
  'the admission invoice is the quarterly price less the 10% deal'
);

select lives_ok(
  $$ select public.select_application_extra_hours_package(
       '00000000-0000-4000-9000-000000000d01', '00000000-0000-4000-9000-0000000eb001') $$,
  'the parent adds the 5-hour pack'
);

select is(
  (select amount from pg_temp.app_invoice('00000000-0000-4000-9000-000000000d01')),
  2680.00::numeric,
  'the invoice adds the pack less its fixed 50 EGP deal (2430 + 250)'
);

select is(
  (select sum((item ->> 'total')::numeric) from pg_temp.app_invoice('00000000-0000-4000-9000-000000000d01') i,
          jsonb_array_elements(i.line_items_json -> 'items') item),
  2680.00::numeric,
  'the invoice lines add up to its amount'
);

-- ---------------------------------------------------------------------------------------------
-- 3. The parent pays; finance confirms
-- ---------------------------------------------------------------------------------------------
select lives_ok(
  $$ select public.submit_invoice_payment(
       (select id from pg_temp.app_invoice('00000000-0000-4000-9000-000000000d01')), 2680, 'instapay', 'IPN-2680', null,
       '00000000-0000-4000-9000-0000000f0001') $$,
  'the parent submits the full InstaPay payment'
);

reset role;
select is(
  (select status from public.applications where id = '00000000-0000-4000-9000-000000000d01'),
  'submitted',
  'paying sends the application for review'
);

select pg_temp.act_as('00000000-0000-4000-9000-000000000a06');
select throws_ok(
  $$ select public.select_application_payment_package(
       '00000000-0000-4000-9000-000000000d01', '00000000-0000-4000-9000-0000000a1001', 'monthly') $$,
  '22023', 'Cannot change package after payment has started',
  'the package cannot change once a payment is waiting'
);

select pg_temp.act_as('00000000-0000-4000-9000-000000000a01');
select lives_ok(
  $$ select public.confirm_invoice_payment_attempt(
       (select id from public.payment_attempts where idempotency_key = '00000000-0000-4000-9000-0000000f0001')) $$,
  'the admin confirms the payment'
);

reset role;
select is(
  (select status from pg_temp.app_invoice('00000000-0000-4000-9000-000000000d01')),
  'paid',
  'the admission invoice is paid'
);

-- ---------------------------------------------------------------------------------------------
-- 4. The admin enrolls the child into a class
-- ---------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-9000-000000000a01');
select lives_ok(
  $$ select public.approve_application_enrollment(
       '00000000-0000-4000-9000-000000000d01', '00000000-0000-4000-9000-00000000000a', true,
       '00000000-0000-4000-9000-000000000c01') $$,
  'the admin approves and enrolls the child into Butterflies'
);

reset role;
select set_config('test.child_id',
  (select child_id::text from public.applications where id = '00000000-0000-4000-9000-000000000d01'), true);

select is(
  (select class_id::text from public.children where id = current_setting('test.child_id')::uuid),
  '00000000-0000-4000-9000-000000000c01',
  'the child is in the chosen class'
);

select is(
  (select (billing_period, duration_months, locked_price, next_invoice_date = current_date + interval '3 months')::text
     from public.child_tuition_subscriptions
    where child_id = current_setting('test.child_id')::uuid and status = 'active'),
  '(quarterly,3,2700.00,t)',
  'the subscription bills the full quarterly price from the next quarter; the deal was first-invoice only'
);

select is(
  (select package_id::text from public.child_packages
    where child_id = current_setting('test.child_id')::uuid and status = 'active'),
  '00000000-0000-4000-9000-0000000eb001',
  'the child holds the 5-hour pack'
);

-- ---------------------------------------------------------------------------------------------
-- 5. Late pickups: the pack covers, keeps covering after it stops being sold, then is billed
-- ---------------------------------------------------------------------------------------------
insert into public.attendance_records (id, child_id, attendance_date, check_in) values
  ('00000000-0000-4000-9000-0000000a7001', current_setting('test.child_id')::uuid, current_date - 1, now() - interval '1 day'),
  ('00000000-0000-4000-9000-0000000a7002', current_setting('test.child_id')::uuid, current_date, now());

-- Picked up three hours after closing time.
select is(
  (select (public.apply_attendance_late_charge(a.id, public.attendance_billing_start(a, ns) + interval '3 hours', 'checkout', true)
           ->> 'skipped') is null
     from public.attendance_records a, public.nursery_settings ns
    where a.id = '00000000-0000-4000-9000-0000000a7001' and ns.nursery_id = '00000000-0000-4000-9000-00000000000a'),
  true,
  'a three-hour late pickup is charged'
);

select is(
  (select (extra_hours, extra_hours_covered, extra_fee)::text from public.attendance_records
    where id = '00000000-0000-4000-9000-0000000a7001'),
  '(3.00,3.00,0.00)',
  'the pack covers all three hours, so there is no fee'
);

select pg_temp.act_as('00000000-0000-4000-9000-000000000a02');
select lives_ok(
  $$ update public.packages set active = false where id = '00000000-0000-4000-9000-0000000eb001' $$,
  'the finance manager stops selling the 5-hour pack'
);

reset role;
select is(
  public.package_apply_extra_hours(current_setting('test.child_id')::uuid, 1, false),
  1::numeric,
  'the child still has cover after the pack stops being sold'
);

select pg_temp.act_as('00000000-0000-4000-9000-000000000a06');
select results_eq(
  $$ select id::text from public.packages where nursery_id = '00000000-0000-4000-9000-00000000000a' order by id $$,
  $$ values ('00000000-0000-4000-9000-0000000eb001') $$,
  'the parent still sees the pack their child holds, but no other switched-off pack'
);

reset role;
select lives_ok(
  $$ select public.apply_attendance_late_charge(a.id, public.attendance_billing_start(a, ns) + interval '3 hours', 'checkout', true)
       from public.attendance_records a, public.nursery_settings ns
      where a.id = '00000000-0000-4000-9000-0000000a7002' and ns.nursery_id = '00000000-0000-4000-9000-00000000000a' $$,
  'another three-hour late pickup the next day'
);

select is(
  (select (extra_hours_covered, extra_hours_billed, extra_fee)::text from public.attendance_records
    where id = '00000000-0000-4000-9000-0000000a7002'),
  '(2.00,1.00,50.00)',
  'the last two pack hours are used and the third hour is billed at 50 EGP'
);

select is(
  (select (i.invoice_type, i.amount, i.status)::text from public.invoices i
    join public.attendance_records a on a.late_charge_invoice_id = i.id
   where a.id = '00000000-0000-4000-9000-0000000a7002'),
  '(extra_hours,50.00,pending)',
  'the late hour is on an unpaid extra-hours invoice'
);

select is(
  (select hours_used from public.child_packages
    where child_id = current_setting('test.child_id')::uuid and status = 'active'),
  5.00::numeric,
  'the pack is used up'
);

-- ---------------------------------------------------------------------------------------------
-- 6. The next tuition period is billed at the full price
-- ---------------------------------------------------------------------------------------------
update public.child_tuition_subscriptions set next_invoice_date = current_date
 where child_id = current_setting('test.child_id')::uuid and status = 'active';

select set_config('test.renewal_invoice',
  (select public._generate_tuition_invoice(id)::text from public.child_tuition_subscriptions
    where child_id = current_setting('test.child_id')::uuid and status = 'active'), true);

select is(
  (select (amount, line_items_json ->> 'billing_period', line_items_json ->> 'discount_amount')::text
     from public.invoices where id = current_setting('test.renewal_invoice')::uuid),
  '(2700.00,quarterly,)',
  'the renewal invoice is the full quarterly price with no discount'
);

select is(
  (select next_invoice_date from public.child_tuition_subscriptions
    where child_id = current_setting('test.child_id')::uuid and status = 'active'),
  (current_date + interval '3 months')::date,
  'the following invoice is due a quarter later'
);

-- ---------------------------------------------------------------------------------------------
-- 7. A switched-off deal no longer discounts new admissions
-- ---------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-9000-000000000a02');
select lives_ok(
  $$ update public.deals set active = false where id = '00000000-0000-4000-9000-0000000de001' $$,
  'the finance manager ends the opening offer'
);

select pg_temp.act_as('00000000-0000-4000-9000-000000000a06');
select lives_ok(
  $$ select public.select_application_payment_package(
       '00000000-0000-4000-9000-000000000d02', '00000000-0000-4000-9000-0000000a1001', 'monthly') $$,
  'the parent chooses the monthly period for a second child'
);

reset role;
select is(
  (select (amount, (line_items_json ->> 'discount_amount')::numeric)::text
     from pg_temp.app_invoice('00000000-0000-4000-9000-000000000d02')),
  '(1000.00,0)',
  'the second admission is charged in full'
);

select * from finish();
rollback;

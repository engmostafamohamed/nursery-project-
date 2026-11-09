-- Database test · kitchen sales and children's extras: only the kitchen's editors price items; a
-- member of staff takes an item and it leaves stock at their price with the best discount, once
-- even if sent twice, never more than is there; a teacher gives a child an extra, served at once when
-- the parents agreed at enrollment, otherwise waiting for the parent; an allergy refuses it; a child's
-- charges go on the family's monthly food invoice (the next month's once it is paid); a parent orders
-- extras for open days; cancelling puts stock back and takes the line off a pending invoice, never a
-- paid one; a payslip deducts the open staff charges as far as the pay allows; old requests expire.
-- Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(31);

insert into public.nurseries (id, name_ar, name_en, working_days) values
  ('00000000-0000-4000-9700-00000000000a', 'حضانة المطبخ', 'Kitchen Nursery', '["sun", "mon", "tue", "wed", "thu", "fri", "sat"]');
update public.nursery_settings set invoice_due_days = 7 where nursery_id = '00000000-0000-4000-9700-00000000000a';

insert into auth.users (id, email) values
  ('00000000-0000-4000-9700-000000000a01', 'k.admin@test.local'),
  ('00000000-0000-4000-9700-000000000a02', 'k.teacher@test.local'),
  ('00000000-0000-4000-9700-000000000a03', 'k.parent@test.local'),
  ('00000000-0000-4000-9700-000000000a04', 'k.other.teacher@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = '00000000-0000-4000-9700-00000000000a', name_ar = v.name_en, name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9700-000000000a01', 'branch_admin', 'Admin'),
    ('00000000-0000-4000-9700-000000000a02', 'teacher', 'Teacher Sara'),
    ('00000000-0000-4000-9700-000000000a03', 'parent', 'Mona'),
    ('00000000-0000-4000-9700-000000000a04', 'teacher', 'Teacher Rana')
  ) as v(id, role, name_en)
 where u.id = v.id::uuid;
insert into public.staff_profiles (id, user_id, nursery_id, employee_id, department, position, hire_date, contract_type, salary_amount) values
  ('00000000-0000-4000-9700-0000000000e1', '00000000-0000-4000-9700-000000000a02', '00000000-0000-4000-9700-00000000000a', 'K-1', 'teaching', 'Teacher', '2025-01-01', 'full_time', 8);

insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-9700-0000000000b1', '00000000-0000-4000-9700-00000000000a', 'الفراشات', 'Butterflies'),
  ('00000000-0000-4000-9700-0000000000b2', '00000000-0000-4000-9700-00000000000a', 'النحل', 'Bees');
insert into public.class_staff (class_id, user_id, role) values
  ('00000000-0000-4000-9700-0000000000b1', '00000000-0000-4000-9700-000000000a02', 'lead'),
  ('00000000-0000-4000-9700-0000000000b2', '00000000-0000-4000-9700-000000000a04', 'lead');
insert into public.children (id, nursery_id, class_id, full_name_ar, full_name_en, dob, status, enrollment_date, daily_care_preferences) values
  ('00000000-0000-4000-9700-0000000000c1', '00000000-0000-4000-9700-00000000000a', '00000000-0000-4000-9700-0000000000b1', 'ليلى', 'Laila', '2023-01-01', 'active', '2026-01-01', '{"accepts_extra_snacks": true}'),
  ('00000000-0000-4000-9700-0000000000c2', '00000000-0000-4000-9700-00000000000a', '00000000-0000-4000-9700-0000000000b1', 'آدم', 'Adam', '2023-01-01', 'active', '2026-01-01', '{"accepts_extra_snacks": false}');
insert into public.parent_children (parent_id, child_id, is_primary) values
  ('00000000-0000-4000-9700-000000000a03', '00000000-0000-4000-9700-0000000000c1', true),
  ('00000000-0000-4000-9700-000000000a03', '00000000-0000-4000-9700-0000000000c2', true);
insert into public.child_allergies (child_id, nursery_id, allergen_name, severity) values
  ('00000000-0000-4000-9700-0000000000c1', '00000000-0000-4000-9700-00000000000a', 'Cow milk', 'severe');

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.item(p_name text) returns uuid language sql security definer as $$
  select id from public.inventory where nursery_id = '00000000-0000-4000-9700-00000000000a' and item_name = p_name
$$;
create function pg_temp.stock(p_name text) returns text language sql security definer as $$
  select quantity::text from public.inventory where nursery_id = '00000000-0000-4000-9700-00000000000a' and item_name = p_name
$$;
create function pg_temp.food_invoice(p_child uuid) returns text language sql security definer as $$
  select coalesce(string_agg(format('%s %s %s', i.line_items_json ->> 'billing_month', i.amount, i.status), ' | ' order by i.created_at), '-')
    from public.invoices i where i.invoice_type = 'food_extras' and i.line_items_json ->> 'child_id' = p_child::text
$$;
create function pg_temp.today() returns date language sql as $$ select public.nursery_today('00000000-0000-4000-9700-00000000000a') $$;

-- ---------------------------------------------------------------------------------------------
-- Items and prices
select pg_temp.act_as('00000000-0000-4000-9700-000000000a02');
select throws_ok(
  $$ select public.save_kitchen_item('00000000-0000-4000-9700-00000000000a', null, 'Juice', 'drinks', 'box', 2, null, 3, 10, 8, 24, 'carton', 'drink', '{}') $$,
  '42501', 'menu_forbidden', 'a teacher without the meals permission cannot price items'
);
select pg_temp.act_as('00000000-0000-4000-9700-000000000a01');
select throws_ok(
  $$ select public.save_kitchen_item('00000000-0000-4000-9700-00000000000a', null, 'Cake', 'food', 'slice', 2, null, null, null, null, null, null, 'snack', '{}') $$,
  '22023', 'kitchen_item_invalid', 'an extra needs a price for children'
);
select set_config('t.s1', public.save_kitchen_item('00000000-0000-4000-9700-00000000000a', null, 'Juice', 'drinks', 'box', 2, null, 3, 10, 8, 24, 'carton', 'drink', '{}')::text, true);
select set_config('t.s2', public.save_kitchen_item('00000000-0000-4000-9700-00000000000a', null, 'Milk box', 'drinks', 'box', 2, null, 2, 6, null, null, null, 'drink', array['milk'])::text, true);
select set_config('t.s3', public.save_kitchen_item('00000000-0000-4000-9700-00000000000a', null, 'Water', 'drinks', 'bottle', 5, null, 1, null, 5, 12, 'carton', null, '{}')::text, true);
select is(
  (select format('%s/%s/%s/%s', i ->> 'child_price', i ->> 'staff_price', i ->> 'pack_size', i ->> 'extra_kind')
     from jsonb_array_elements(public.get_kitchen_stock('00000000-0000-4000-9700-00000000000a') -> 'items') i where i ->> 'name' = 'Juice'),
  '10.00/8.00/24.00/drink', 'an item keeps its prices, pack and extra kind'
);
select set_config('t.r1', public.record_kitchen_movement(pg_temp.item('Juice'), 'restocked', 20)::text, true);
select set_config('t.r2', public.record_kitchen_movement(pg_temp.item('Milk box'), 'restocked', 10)::text, true);
select set_config('t.r3', public.record_kitchen_movement(pg_temp.item('Water'), 'restocked', 120)::text, true);
select set_config('t.d1', public.save_kitchen_discount('00000000-0000-4000-9700-00000000000a', null, 'خصم الموظفين', 'Staff discount', 'all_staff', null, null, 50, null, null, true)::text, true);
select set_config('t.d2', public.save_kitchen_discount('00000000-0000-4000-9700-00000000000a', null, 'خصم ليلى', 'Laila juice', 'child', '00000000-0000-4000-9700-0000000000c1', pg_temp.item('Juice'), 10, null, null, true)::text, true);
select throws_ok(
  $$ select public.save_kitchen_discount('00000000-0000-4000-9700-00000000000a', null, 'x', 'x', 'child', null, null, 10, null, null, true) $$,
  '22023', 'kitchen_discount_invalid', 'a discount for one child names the child'
);

-- Staff takings
select pg_temp.act_as('00000000-0000-4000-9700-000000000a02');
select set_config('t.w1', public.charge_staff_kitchen_item(pg_temp.item('Water'), 2, null, null, '00000000-0000-4000-9700-0000000000f1')::text, true);
select is(
  (select format('%s %s %s %s', gross, discount_name_en, discount_amount, net) from public.kitchen_charges where id = current_setting('t.w1')::uuid),
  '10.00 Staff discount 5.00 5.00', 'a member of staff pays their price less the best discount'
);
select is(public.charge_staff_kitchen_item(pg_temp.item('Water'), 2, null, null, '00000000-0000-4000-9700-0000000000f1')::text, current_setting('t.w1'), 'the same taking sent twice is charged once');
select is(pg_temp.stock('Water'), '118.00', 'the stock went down once');
select throws_ok(
  $$ select public.charge_staff_kitchen_item(pg_temp.item('Water'), 500) $$,
  'P0001', 'kitchen_not_enough', 'nobody takes more than is there'
);
select throws_ok(
  $$ select public.charge_staff_kitchen_item(pg_temp.item('Water'), 1, '00000000-0000-4000-9700-000000000a04') $$,
  '42501', 'kitchen_forbidden', 'a teacher records takings only for themselves'
);

-- A teacher gives extras
select set_config('t.g1', public.give_child_extra('00000000-0000-4000-9700-0000000000c1', pg_temp.item('Juice'), 1)::text, true);
select is(current_setting('t.g1')::jsonb ->> 'status', 'served', 'with the enrollment consent an extra is served at once');
select is(pg_temp.food_invoice('00000000-0000-4000-9700-0000000000c1'), to_char(pg_temp.today(), 'YYYY-MM') || ' 9.00 pending', 'it goes on the family’s food invoice for the month, with the child’s discount');
select throws_ok(
  $$ select public.give_child_extra('00000000-0000-4000-9700-0000000000c1', pg_temp.item('Milk box'), 1) $$,
  'P0001', 'kitchen_allergy', 'an extra with a food the child is allergic to is refused'
);
select set_config('t.g2', public.give_child_extra('00000000-0000-4000-9700-0000000000c2', pg_temp.item('Juice'), 2)::text, true);
select is(current_setting('t.g2')::jsonb ->> 'status', 'waiting_parent', 'without consent it waits for the parent');
select is(pg_temp.food_invoice('00000000-0000-4000-9700-0000000000c2'), '-', 'nothing is charged while it waits');
select throws_ok(
  format($$ select public.decide_child_extra(%L, true) $$, current_setting('t.g2')::jsonb ->> 'request_id'),
  '42501', 'kitchen_forbidden', 'only a parent answers'
);
select pg_temp.act_as('00000000-0000-4000-9700-000000000a04');
select throws_ok(
  $$ select public.give_child_extra('00000000-0000-4000-9700-0000000000c1', pg_temp.item('Juice'), 1) $$,
  '42501', 'kitchen_forbidden', 'a teacher of another class cannot give the child an extra'
);

-- The parent answers and orders
select pg_temp.act_as('00000000-0000-4000-9700-000000000a03');
select set_config('t.yes', public.decide_child_extra((current_setting('t.g2')::jsonb ->> 'request_id')::uuid, true)::text, true);
select is(public.order_child_extra('00000000-0000-4000-9700-0000000000c1', pg_temp.item('Juice'), 1, array[pg_temp.today(), pg_temp.today() + 1, pg_temp.today() + 1]), 2, 'a parent orders an extra for open days, each day once');
select throws_ok(
  $$ select public.order_child_extra('00000000-0000-4000-9700-0000000000c1', pg_temp.item('Juice'), 1, array[pg_temp.today() - 1]) $$,
  '22023', 'kitchen_invalid_dates', 'not for a day already gone'
);
select is(
  (select format('%s:%s:%s', jsonb_array_length(c -> 'extras'),
                 (select e ->> 'conflicts' from jsonb_array_elements(c -> 'extras') e where e ->> 'name' = 'Milk box'),
                 (select e ->> 'final_price' from jsonb_array_elements(c -> 'extras') e where e ->> 'name' = 'Juice'))
     from jsonb_array_elements(public.get_family_extras()) c where c ->> 'name_en' = 'Laila'),
  '2:["milk"]:9.00', 'the family sees each child’s extras, the allergy ones marked, priced with the child’s discount'
);

select pg_temp.act_as('00000000-0000-4000-9700-000000000a02');
select set_config('t.serve', public.serve_child_extra((current_setting('t.g2')::jsonb ->> 'request_id')::uuid, '00000000-0000-4000-9700-0000000000f2')::text, true);
select is(public.serve_child_extra((current_setting('t.g2')::jsonb ->> 'request_id')::uuid)::text, current_setting('t.serve'), 'serving twice charges once');
select is(pg_temp.food_invoice('00000000-0000-4000-9700-0000000000c2'), to_char(pg_temp.today(), 'YYYY-MM') || ' 20.00 pending', 'once approved and served, it is on that child’s own invoice');
select is(
  (select string_agg(format('%s:%s', c ->> 'name_en', jsonb_array_length(c -> 'requests')), ',' order by c ->> 'name_en') from jsonb_array_elements(public.get_class_extras() -> 'children') c),
  'Adam:1,Laila:2', 'the teacher sees today’s extras of the children they look after'
);

reset role;
select is(
  (select string_agg(type, ',' order by type) from public.notifications where nursery_id = '00000000-0000-4000-9700-00000000000a' and type like 'extra_%'),
  'extra_approved,extra_needs_approval,extra_ordered,extra_served,extra_served', 'parents and teachers are told at each step'
);

-- Cancelling
select pg_temp.act_as('00000000-0000-4000-9700-000000000a01');
select throws_ok(
  format($$ select public.cancel_kitchen_charge(%L, '') $$, current_setting('t.serve')),
  '22023', 'kitchen_reason_required', 'cancelling needs a reason'
);
select set_config('t.c1', public.cancel_kitchen_charge(current_setting('t.serve')::uuid, 'Given by mistake')::text, true);
select is(
  pg_temp.food_invoice('00000000-0000-4000-9700-0000000000c2') || ' / ' || pg_temp.stock('Juice'),
  to_char(pg_temp.today(), 'YYYY-MM') || ' 0.00 cancelled / 19.00', 'cancelling takes the line off the invoice and puts the stock back'
);
reset role;
update public.invoices set status = 'paid' where invoice_type = 'food_extras' and line_items_json ->> 'child_id' = '00000000-0000-4000-9700-0000000000c1';
select pg_temp.act_as('00000000-0000-4000-9700-000000000a01');
select throws_ok(
  format($$ select public.cancel_kitchen_charge(%L, 'Too late') $$, (current_setting('t.g1')::jsonb ->> 'charge_id')),
  'P0001', 'kitchen_charge_settled', 'a paid charge cannot be cancelled'
);
select pg_temp.act_as('00000000-0000-4000-9700-000000000a02');
select set_config('t.g3', public.give_child_extra('00000000-0000-4000-9700-0000000000c1', pg_temp.item('Juice'), 1)::text, true);
select is(
  pg_temp.food_invoice('00000000-0000-4000-9700-0000000000c1'),
  format('%s 9.00 paid | %s 9.00 pending', to_char(pg_temp.today(), 'YYYY-MM'), to_char(pg_temp.today() + interval '1 month', 'YYYY-MM')),
  'after the month’s invoice is paid, new charges go on the next month’s'
);

-- Payslips deduct staff charges
select set_config('t.w2', public.charge_staff_kitchen_item(pg_temp.item('Water'), 2)::text, true);
select is((public.get_my_kitchen_account(pg_temp.today()) ->> 'open_total')::numeric, 10.00, 'the member of staff sees what is still open');
reset role;
insert into public.staff_payroll (staff_id, nursery_id, pay_period_start, pay_period_end, base_salary, bonuses, deductions)
values ('00000000-0000-4000-9700-0000000000e1', '00000000-0000-4000-9700-00000000000a', date_trunc('month', pg_temp.today())::date, (date_trunc('month', pg_temp.today()) + interval '1 month - 1 day')::date, 8, 0, 0);
select is(
  (select format('%s %s %s', kitchen_deductions, deductions, total_amount) from public.staff_payroll where staff_id = '00000000-0000-4000-9700-0000000000e1'),
  '5.00 5.00 3.00', 'a payslip deducts the open charges oldest first, as far as the pay allows'
);
select is(
  (select string_agg(case when payroll_id is null then 'open' else 'deducted' end, ',' order by payroll_id is null) from public.kitchen_charges where staff_user_id = '00000000-0000-4000-9700-000000000a02'),
  'deducted,open', 'what did not fit stays open for the next payslip'
);

-- Old requests expire
update public.child_extra_requests set for_date = pg_temp.today() - 1
 where child_id = '00000000-0000-4000-9700-0000000000c1' and source = 'parent' and for_date = pg_temp.today() + 1;
select set_config('t.exp', public.run_child_extras_expiry()::text, true);
select is(
  (select status from public.child_extra_requests where child_id = '00000000-0000-4000-9700-0000000000c1' and source = 'parent' and for_date = pg_temp.today() - 1),
  'expired', 'an extra not served by the end of its day expires'
);

select * from finish();
rollback;

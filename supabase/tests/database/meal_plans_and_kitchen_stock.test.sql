-- Database test · F&B meal plans and kitchen stock: only menu editors change them; a plan is checked;
-- a child keeps the price they were given; a plan changed the same day is replaced; the tuition
-- invoice carries the charged meal plan for its months (none when the package includes it); the
-- package report leaves the meal line out of tuition; kitchen stock is restocked, used and counted,
-- never below zero, and every change is logged. Dates are relative to today. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(15);

insert into public.nurseries (id, name_ar, name_en) values ('00000000-0000-4000-9400-00000000000a', 'حضانة الوجبات', 'Meals Nursery');

insert into auth.users (id, email) values
  ('00000000-0000-4000-9400-000000000a01', 'meal.admin@test.local'),
  ('00000000-0000-4000-9400-000000000a02', 'meal.teacher@test.local'),
  ('00000000-0000-4000-9400-000000000a03', 'meal.parent@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = '00000000-0000-4000-9400-00000000000a', name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9400-000000000a01', 'branch_admin', 'Admin'),
    ('00000000-0000-4000-9400-000000000a02', 'teacher', 'Teacher'),
    ('00000000-0000-4000-9400-000000000a03', 'parent', 'Mona')
  ) as v(id, role, name_en)
 where u.id = v.id::uuid;

insert into public.children (id, nursery_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-9400-0000000000c1', '00000000-0000-4000-9400-00000000000a', 'ليلى', 'Laila', '2023-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9400-0000000000c2', '00000000-0000-4000-9400-00000000000a', 'آدم', 'Adam', '2023-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9400-0000000000c3', '00000000-0000-4000-9400-00000000000a', 'عمر', 'Omar', '2023-01-01', 'active', '2026-01-01');
insert into public.parent_children (parent_id, child_id, is_primary) values
  ('00000000-0000-4000-9400-000000000a03', '00000000-0000-4000-9400-0000000000c1', true),
  ('00000000-0000-4000-9400-000000000a03', '00000000-0000-4000-9400-0000000000c2', true),
  ('00000000-0000-4000-9400-000000000a03', '00000000-0000-4000-9400-0000000000c3', true);

insert into public.tuition_packages (id, nursery_id, name_ar, name_en, price, active) values
  ('00000000-0000-4000-9400-0000000000d1', '00000000-0000-4000-9400-00000000000a', 'يوم كامل', 'Full day', 3000, true);
insert into public.child_tuition_subscriptions
  (id, nursery_id, child_id, tuition_package_id, tuition_package_name_ar, tuition_package_name_en, billing_period, duration_months,
   locked_price, billed_parent_id, status, started_at, next_invoice_date)
values
  ('00000000-0000-4000-9400-0000000000f1', '00000000-0000-4000-9400-00000000000a', '00000000-0000-4000-9400-0000000000c1',
   '00000000-0000-4000-9400-0000000000d1', 'يوم كامل', 'Full day', 'monthly', 1, 3000, '00000000-0000-4000-9400-000000000a03', 'active', current_date - 40, current_date),
  ('00000000-0000-4000-9400-0000000000f2', '00000000-0000-4000-9400-00000000000a', '00000000-0000-4000-9400-0000000000c2',
   '00000000-0000-4000-9400-0000000000d1', 'يوم كامل', 'Full day', 'quarterly', 3, 9000, '00000000-0000-4000-9400-000000000a03', 'active', current_date - 40, current_date),
  ('00000000-0000-4000-9400-0000000000f3', '00000000-0000-4000-9400-00000000000a', '00000000-0000-4000-9400-0000000000c3',
   '00000000-0000-4000-9400-0000000000d1', 'يوم كامل', 'Full day', 'quarterly', 3, 9000, '00000000-0000-4000-9400-000000000a03', 'active', current_date - 40, current_date);

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.plan_id(p_name text) returns uuid language sql as $$
  select id from public.nursery_meal_plans where nursery_id = '00000000-0000-4000-9400-00000000000a' and name_en = p_name
$$;
create function pg_temp.current_plan(p_child uuid) returns text language sql as $$
  select coalesce((select format('%s %s %s', plan_name_en, monthly_price, case when charged then 'charged' else 'included' end)
                     from public.child_meal_plans where child_id = p_child and ended_on is null), 'none')
$$;

-- ---------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-9400-000000000a02');
select throws_ok(
  $$ select public.save_nursery_meal_plan('00000000-0000-4000-9400-00000000000a', null, 'كامل', 'Full meals', array['lunch'], 800, true) $$,
  '42501', 'menu_forbidden', 'a teacher without the meals permission cannot add a meal plan'
);

select pg_temp.act_as('00000000-0000-4000-9400-000000000a01');
select throws_ok(
  $$ select public.save_nursery_meal_plan('00000000-0000-4000-9400-00000000000a', null, 'فارغة', 'Empty', array[]::text[], 100, true) $$,
  '22023', 'meal_plan_invalid', 'a plan needs at least one meal'
);
select set_config('t.a', public.save_nursery_meal_plan('00000000-0000-4000-9400-00000000000a', null, 'وجبات كاملة', 'Full meals', array['snacks', 'breakfast', 'lunch', 'lunch'], 800, true)::text, true);
select set_config('t.b', public.save_nursery_meal_plan('00000000-0000-4000-9400-00000000000a', null, 'غداء فقط', 'Lunch only', array['lunch'], 500, true)::text, true);

select is(
  (select string_agg(format('%s %s %s', p ->> 'name_en', p ->> 'monthly_price', p -> 'meals'), ' | ')
     from jsonb_array_elements(public.get_meal_plans('00000000-0000-4000-9400-00000000000a') -> 'plans') p),
  'Full meals 800.00 ["breakfast", "lunch", "snacks"] | Lunch only 500.00 ["lunch"]',
  'the nursery''s plans, meals in order and each once'
);

-- Laila: full meals, then changed the same day to lunch only (replaced, not kept as a one-day plan).
select set_config('t.c', public.set_child_meal_plan('00000000-0000-4000-9400-0000000000c1', pg_temp.plan_id('Full meals'), true)::text, true);
select set_config('t.d', public.set_child_meal_plan('00000000-0000-4000-9400-0000000000c1', pg_temp.plan_id('Lunch only'), true)::text, true);
select is(
  (select format('%s / rows=%s', pg_temp.current_plan('00000000-0000-4000-9400-0000000000c1'),
                 (select count(*) from public.child_meal_plans where child_id = '00000000-0000-4000-9400-0000000000c1'))),
  'Lunch only 500.00 charged / rows=1',
  'a plan changed on the day it was given replaces it'
);
-- Adam's full meals come with his package; Omar pays for full meals.
select set_config('t.e', public.set_child_meal_plan('00000000-0000-4000-9400-0000000000c2', pg_temp.plan_id('Full meals'), false)::text, true);
select set_config('t.f', public.set_child_meal_plan('00000000-0000-4000-9400-0000000000c3', pg_temp.plan_id('Full meals'), true)::text, true);

-- The nursery raises the price: those who already have the plan keep theirs.
select set_config('t.g', public.save_nursery_meal_plan('00000000-0000-4000-9400-00000000000a', pg_temp.plan_id('Full meals'), 'وجبات كاملة', 'Full meals',
  array['breakfast', 'lunch', 'snacks'], 950, true)::text, true);
select is(pg_temp.current_plan('00000000-0000-4000-9400-0000000000c3'), 'Full meals 800.00 charged', 'a price change does not move what a family already pays');

select is(
  (select format('%s plan=%s tuition=%s', c ->> 'name_en', c -> 'current' ->> 'name_en', c ->> 'has_tuition')
     from jsonb_array_elements(public.get_meal_plans('00000000-0000-4000-9400-00000000000a') -> 'children') c
    where c ->> 'child_id' = '00000000-0000-4000-9400-0000000000c2'),
  'Adam plan=Full meals tuition=true',
  'each child is listed with their current plan and whether they are billed monthly'
);

-- ---------------------------------------------------------------------------------------------
reset role;
select set_config('t.inv1', public._generate_tuition_invoice('00000000-0000-4000-9400-0000000000f1')::text, true);
select set_config('t.inv2', public._generate_tuition_invoice('00000000-0000-4000-9400-0000000000f2')::text, true);
select set_config('t.inv3', public._generate_tuition_invoice('00000000-0000-4000-9400-0000000000f3')::text, true);

create function pg_temp.invoice_line(p_invoice text) returns text language sql as $$
  select format('%s = %s', i.amount,
           (select string_agg(format('%s %s×%s=%s', it ->> 'kind', it ->> 'quantity', it ->> 'unit_price', it ->> 'total'), ' + ')
              from jsonb_array_elements(i.line_items_json -> 'items') it))
    from public.invoices i where i.id = p_invoice::uuid
$$;

select is(pg_temp.invoice_line(current_setting('t.inv1')), '3500.00 = tuition 1×3000.00=3000.00 + meal_plan 1×500.00=500.00',
  'a monthly invoice carries the child''s meal plan for that month');
select is(pg_temp.invoice_line(current_setting('t.inv3')), '11400.00 = tuition 3×3000.00=9000.00 + meal_plan 3×800.00=2400.00',
  'a quarterly invoice carries it for three months, at the price the child was given');
select is(pg_temp.invoice_line(current_setting('t.inv2')), '9000.00 = tuition 3×3000.00=9000.00',
  'a plan the package includes adds nothing');

select pg_temp.act_as('00000000-0000-4000-9400-000000000a01');
select is(
  (select string_agg(format('%s billed=%s', s.child_name_en, s.billed), ', ' order by s.child_name_en)
     from public.get_package_subscriptions('00000000-0000-4000-9400-00000000000a') s where s.kind = 'tuition'),
  'Adam billed=9000.00, Laila billed=3000.00, Omar billed=9000.00',
  'the package report counts only the tuition part, not the meals'
);

-- ---------------------------------------------------------------------------------------------
-- Kitchen stock
select throws_ok(
  $$ select public.save_kitchen_item('00000000-0000-4000-9400-00000000000a', null, 'Teddy bears', 'art', 'piece', 1, null) $$,
  '22023', 'kitchen_item_invalid', 'a category of neither the kitchen nor the store is refused'
);
select set_config('t.k1', public.save_kitchen_item('00000000-0000-4000-9400-00000000000a', null, 'Milk', 'drinks', 'liter', 5, null)::text, true);
select set_config('t.k0', public.save_kitchen_item('00000000-0000-4000-9400-00000000000a', null, 'Crayons', 'supplies', 'box', 1, null)::text, true);
create function pg_temp.milk() returns uuid language sql as $$
  select id from public.inventory where nursery_id = '00000000-0000-4000-9400-00000000000a' and item_name = 'Milk'
$$;
select set_config('t.k2', public.record_kitchen_movement(pg_temp.milk(), 'restocked', 10, current_date + 3, 'Weekly delivery')::text, true);
select set_config('t.k3', public.record_kitchen_movement(pg_temp.milk(), 'used', 4, null, null)::text, true);
select throws_ok(
  format($$ select public.record_kitchen_movement(%L, 'used', 7, null, null) $$, pg_temp.milk()),
  'P0001', 'kitchen_not_enough', 'more than is there cannot be taken'
);
select set_config('t.k4', public.record_kitchen_movement(pg_temp.milk(), 'counted', 3, null, 'Fridge count')::text, true);

select is(
  (select format('%s items: %s %s %s, expires %s; log: %s',
                 jsonb_array_length(j -> 'items'),
                 (j -> 'items' -> 0 ->> 'name'), (j -> 'items' -> 0 ->> 'quantity'), (j -> 'items' -> 0 ->> 'unit'),
                 case when (j -> 'items' -> 0 ->> 'expires_on')::date = current_date + 3 then 'in 3 days' else j -> 'items' -> 0 ->> 'expires_on' end,
                 (select string_agg(format('%s %s→%s', m ->> 'kind', m ->> 'change', m ->> 'quantity_after'), ', ' order by (m ->> 'at'))
                    from jsonb_array_elements(j -> 'movements') m))
     from (select public.get_kitchen_stock('00000000-0000-4000-9400-00000000000a') j) x),
  '1 items: Milk 3.00 liter, expires in 3 days; log: restocked 10.00→10.00, used -4.00→6.00, counted -3.00→3.00',
  'kitchen stock: restocked with its expiry, used, counted, each change logged (other inventory left out)'
);

select pg_temp.act_as('00000000-0000-4000-9400-000000000a02');
select throws_ok(
  format($$ select public.record_kitchen_movement(%L, 'used', 1, null, null) $$, pg_temp.milk()),
  '42501', 'menu_forbidden', 'a teacher without the meals permission cannot change stock'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.get_meal_plans(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.get_kitchen_stock(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public._generate_tuition_invoice(uuid)', 'execute'),
  'signed-out visitors cannot read plans or stock, and nobody signed in can issue an invoice directly'
);

select * from finish();
rollback;

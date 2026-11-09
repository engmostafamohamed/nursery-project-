-- Database test · the warehouse: the store's items (classroom supplies, cleaning, hygiene…) live in
-- the same stock as the kitchen's, every change logged. Only the admins (or staff whose role may update
-- the inventory) change the store; nobody writes the table directly. A delivery keeps its supplier and
-- price, an issue names the class or the person who took it and never takes more than is there; each
-- section reads only its items; an item with a child's price is charged to the child (on the family's
-- extras invoice, parents told) and cancelling puts it back; the month's history sums what came in
-- and went out by class; the daily alert reaches the admins once.
-- Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(28);

insert into public.nurseries (id, name_ar, name_en, working_days) values
  ('00000000-0000-4000-9800-00000000000a', 'حضانة المخزن', 'Store Nursery', '["sun", "mon", "tue", "wed", "thu", "fri", "sat"]'),
  ('00000000-0000-4000-9800-00000000000b', 'حضانة أخرى', 'Other Nursery', '["sun", "mon", "tue", "wed", "thu", "fri", "sat"]');

insert into auth.users (id, email) values
  ('00000000-0000-4000-9800-000000000a01', 's.admin@test.local'),
  ('00000000-0000-4000-9800-000000000a02', 's.teacher@test.local'),
  ('00000000-0000-4000-9800-000000000a03', 's.parent@test.local'),
  ('00000000-0000-4000-9800-000000000a04', 's.other@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = v.nursery::uuid, name_ar = v.name_en, name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9800-000000000a01', 'branch_admin', 'Admin', '00000000-0000-4000-9800-00000000000a'),
    ('00000000-0000-4000-9800-000000000a02', 'teacher', 'Teacher Hala', '00000000-0000-4000-9800-00000000000a'),
    ('00000000-0000-4000-9800-000000000a03', 'parent', 'Mona', '00000000-0000-4000-9800-00000000000a'),
    ('00000000-0000-4000-9800-000000000a04', 'teacher', 'Other Teacher', '00000000-0000-4000-9800-00000000000b')
  ) as v(id, role, name_en, nursery)
 where u.id = v.id::uuid;

insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-9800-0000000000b1', '00000000-0000-4000-9800-00000000000a', 'الفراشات', 'Butterflies'),
  ('00000000-0000-4000-9800-0000000000b9', '00000000-0000-4000-9800-00000000000b', 'غرباء', 'Elsewhere');
insert into public.children (id, nursery_id, class_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-9800-0000000000c1', '00000000-0000-4000-9800-00000000000a', '00000000-0000-4000-9800-0000000000b1', 'ليلى', 'Laila', '2024-01-01', 'active', '2026-01-01');
insert into public.parent_children (parent_id, child_id, is_primary) values
  ('00000000-0000-4000-9800-000000000a03', '00000000-0000-4000-9800-0000000000c1', true);

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.item(p_name text) returns uuid language sql security definer as $$
  select id from public.inventory where nursery_id = '00000000-0000-4000-9800-00000000000a' and item_name = p_name
$$;
create function pg_temp.stock(p_name text) returns text language sql security definer as $$
  select quantity::text from public.inventory where nursery_id = '00000000-0000-4000-9800-00000000000a' and item_name = p_name
$$;
create function pg_temp.names(p_stock jsonb) returns text language sql as $$
  select string_agg(i ->> 'name', ',' order by i ->> 'name') from jsonb_array_elements(p_stock -> 'items') i
$$;
-- Runs as the caller: the table's policies decide.
create function pg_temp.try_update() returns integer language plpgsql as $$
declare
  v_rows integer;
begin
  update public.inventory set quantity = 999 where nursery_id = '00000000-0000-4000-9800-00000000000a';
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;
create function pg_temp.today() returns date language sql as $$ select public.nursery_today('00000000-0000-4000-9800-00000000000a') $$;

-- ---------------------------------------------------------------------------------------------
-- Items
select pg_temp.act_as('00000000-0000-4000-9800-000000000a02');
select throws_ok(
  $$ select public.save_kitchen_item('00000000-0000-4000-9800-00000000000a', null, 'Crayons', 'supplies', 'box', 5, null) $$,
  '42501', 'menu_forbidden', 'a teacher without the inventory permission cannot add to the store'
);
select pg_temp.act_as('00000000-0000-4000-9800-000000000a01');
select throws_ok(
  $$ select public.save_kitchen_item('00000000-0000-4000-9800-00000000000a', null, 'Crayons', 'stationery', 'box', 5, null) $$,
  '22023', 'kitchen_item_invalid', 'a category outside both sections is refused'
);
select throws_ok(
  $$ select public.save_kitchen_item('00000000-0000-4000-9800-00000000000a', null, 'Wipes', 'hygiene', 'pack', 5, null, 20, 35, null, null, null, 'snack', '{}') $$,
  '22023', 'kitchen_item_invalid', 'only the kitchen''s items are menu extras'
);
select set_config('t.i1', public.save_kitchen_item('00000000-0000-4000-9800-00000000000a', null, 'Crayons', 'supplies', 'box', 5, null, 30, null, null, 12, 'carton', null, '{}', 'Store room · shelf 2')::text, true);
select set_config('t.i2', public.save_kitchen_item('00000000-0000-4000-9800-00000000000a', null, 'Diapers', 'hygiene', 'piece', 50, null, 4, 6, null, 40, 'pack', null, '{}', 'Changing room')::text, true);
select set_config('t.i3', public.save_kitchen_item('00000000-0000-4000-9800-00000000000a', null, 'Water', 'drinks', 'bottle', 10, null, 2, null, 5, 12, 'carton', null, '{}')::text, true);
select is(
  (select format('%s|%s|%s', i ->> 'scope', i ->> 'location', i ->> 'can_edit') from jsonb_array_elements(current_setting('t.i2')::jsonb -> 'items') i where i ->> 'name' = 'Diapers'),
  'store|Changing room|true', 'a store item keeps its section and where it is kept'
);
select throws_ok(
  $$ insert into public.inventory (nursery_id, item_name, category, quantity, unit) values ('00000000-0000-4000-9800-00000000000a', 'Sneaky', 'toys', 5, 'piece') $$,
  '42501', null, 'nobody writes the table directly'
);
select is(pg_temp.try_update(), 0, 'nor changes a quantity without a movement');

-- Deliveries and issues
select set_config('t.r1', public.record_kitchen_movement(pg_temp.item('Crayons'), 'restocked', 24, null, null, null, null, 32.5, 'Al Nour Bookshop')::text, true);
select is(
  (select format('%s %s', quantity, unit_cost) from public.inventory where id = pg_temp.item('Crayons')),
  '24.00 32.50', 'a delivery adds to the stock and sets what a unit costs'
);
select is(
  (select format('%s|%s|%s', m ->> 'supplier', m ->> 'unit_cost', m ->> 'value') from jsonb_array_elements(current_setting('t.r1')::jsonb -> 'movements') m limit 1),
  'Al Nour Bookshop|32.50|780.00', 'the delivery keeps its supplier, price and worth'
);
select throws_ok(
  $$ select public.record_kitchen_movement(pg_temp.item('Crayons'), 'issued', 2) $$,
  '22023', 'stock_issue_target', 'an issue names a class or who took it'
);
select throws_ok(
  $$ select public.record_kitchen_movement(pg_temp.item('Crayons'), 'issued', 2, null, null, '00000000-0000-4000-9800-0000000000b9') $$,
  '22023', 'stock_issue_target', 'not a class of another nursery'
);
select throws_ok(
  $$ select public.record_kitchen_movement(pg_temp.item('Crayons'), 'issued', 2, null, null, null, '00000000-0000-4000-9800-000000000a03') $$,
  '22023', 'stock_issue_target', 'nor a parent'
);
select throws_ok(
  $$ select public.record_kitchen_movement(pg_temp.item('Crayons'), 'used', 2, null, null, null, null, 10) $$,
  '22023', 'stock_invalid_cost', 'only a delivery carries a price'
);
select throws_ok(
  $$ select public.record_kitchen_movement(pg_temp.item('Crayons'), 'issued', 30, null, null, '00000000-0000-4000-9800-0000000000b1') $$,
  'P0001', 'kitchen_not_enough', 'nobody issues more than is there'
);
select set_config('t.x1', public.record_kitchen_movement(pg_temp.item('Crayons'), 'issued', 4, null, 'Art week', '00000000-0000-4000-9800-0000000000b1', '00000000-0000-4000-9800-000000000a02')::text, true);
select is(
  (select format('%s|%s|%s|%s', m ->> 'kind', m ->> 'class_en', m ->> 'taken_by_en', m ->> 'change') from jsonb_array_elements(current_setting('t.x1')::jsonb -> 'movements') m limit 1),
  'issued|Butterflies|Teacher Hala|-4.00', 'an issue goes to the class, taken by a teacher'
);
select is(pg_temp.stock('Crayons'), '20.00', 'and leaves the stock');
select set_config('t.r2', public.record_kitchen_movement(pg_temp.item('Diapers'), 'restocked', 80, null, null, null, null, 4, 'Pampers dealer')::text, true);
select set_config('t.r3', public.record_kitchen_movement(pg_temp.item('Water'), 'restocked', 24)::text, true);

-- Sections
select is(pg_temp.names(public.get_stock('00000000-0000-4000-9800-00000000000a', 'store')), 'Crayons,Diapers', 'the store lists its items');
select is(pg_temp.names(public.get_kitchen_stock('00000000-0000-4000-9800-00000000000a')), 'Water', 'the kitchen lists only its own');
select is(
  (select format('%s %s', jsonb_array_length(s -> 'classes'), jsonb_array_length(s -> 'staff'))
     from (select public.get_stock('00000000-0000-4000-9800-00000000000a', 'all') s) x),
  '1 2', 'an editor gets the classes and staff an item can be issued to'
);

-- Selling a store item to a child
select set_config('t.c1', public.charge_child_stock_item('00000000-0000-4000-9800-0000000000c1', pg_temp.item('Diapers'), 6, null, '00000000-0000-4000-9800-0000000000f1')::text, true);
select is(public.charge_child_stock_item('00000000-0000-4000-9800-0000000000c1', pg_temp.item('Diapers'), 6, null, '00000000-0000-4000-9800-0000000000f1')::text, current_setting('t.c1'), 'the same charge sent twice is made once');
reset role;
select is(
  (select format('%s %s %s', i.amount, i.line_items_json -> 'items' -> 0 ->> 'name_en', i.status) from public.invoices i
    where i.invoice_type = 'food_extras' and i.line_items_json ->> 'child_id' = '00000000-0000-4000-9800-0000000000c1'),
  '36.00 Diapers pending', 'it goes on the family''s extras invoice at the child''s price'
);
select is(
  (select count(*)::int from public.notifications where user_id = '00000000-0000-4000-9800-000000000a03' and type = 'stock_child_charged'),
  1, 'and the parents are told once'
);
select pg_temp.act_as('00000000-0000-4000-9800-000000000a01');
select throws_ok(
  $$ select public.charge_child_stock_item('00000000-0000-4000-9800-0000000000c1', pg_temp.item('Water'), 1) $$,
  '22023', 'kitchen_not_for_sale', 'the kitchen''s items reach children only as extras'
);
select lives_ok(
  format($$ select public.cancel_kitchen_charge(%L, 'Parents brought their own') $$, current_setting('t.c1')),
  'the admin cancels the charge'
);
select is(pg_temp.stock('Diapers'), '80.00', 'and the diapers are back in stock');

-- The month
select is(
  (select format('%s|%s|%s', h -> 'summary' ->> 'received_value', h -> 'by_class' -> 0 ->> 'name_en', h -> 'by_class' -> 0 ->> 'value')
     from (select public.get_stock_history('00000000-0000-4000-9800-00000000000a', pg_temp.today(), 'store') h) x),
  '1100.00|Butterflies|130.00', 'the month sums what came in and what each class took'
);

-- The daily alert (Crayons are 20, low at 5: fine; Water is 24, low at 10: fine; add one that is out)
select set_config('t.i4', public.save_kitchen_item('00000000-0000-4000-9800-00000000000a', null, 'Hand soap', 'cleaning', 'bottle', 3, null)::text, true);
reset role;
select lives_ok('select public.run_stock_alerts()', 'the alert runs');
select lives_ok('select public.run_stock_alerts()', 'and runs again the same day');
select is(
  (select format('%s %s', count(*), max(template_params ->> 'out')) from public.notifications
    where user_id = '00000000-0000-4000-9800-000000000a01' and type = 'stock_attention'),
  '1 1', 'the admin hears once a day what is out'
);

select * from finish();
rollback;

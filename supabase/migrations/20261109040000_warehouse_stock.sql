-- The warehouse: one stock for the whole nursery, kept the way the kitchen's is.
--
-- The kitchen's stock (food, drinks, kitchen supplies) already logs every change, has prices, packs
-- and expiry dates, and charges what a child or a member of staff takes. The rest of the nursery's
-- things (classroom supplies, cleaning, hygiene, first aid, toys, furniture) were edited straight in
-- the table, a quantity up or down with no trace. Now:
--
-- 1. Every item has a category of one of two sections: the kitchen (food, drinks, kitchen_supplies)
--    or the store (supplies, cleaning, hygiene, medical, toys, furniture, other), and where it is kept.
-- 2. Every change is a movement, as in the kitchen: a delivery (with its supplier and what a unit
--    cost), use, an issue to a class or to a member of staff (who took it), something thrown away
--    or broken, a count. Each movement keeps what a unit was worth then, for the month's figures.
-- 3. Who may change what: the kitchen's items, staff who may change the menu (menu_can_edit); the
--    store's, the admins and staff whose role may update the inventory (store_can_edit).
-- 4. Store items with a price can be sold too: to staff (deducted from their pay, as in the kitchen)
--    or charged to a child (a line on the family's monthly extras invoice; the parents are told).
-- 5. get_stock_history: a month of movements with what came in, went out, to which class, and its
--    worth. run_stock_alerts tells the branch admins once a day what is out, low or expiring.
-- Every write goes through these functions: the table no longer takes direct writes.

-- -----------------------------------------------------------------------------------------------
-- 1. Items
create or replace function public.stock_scope(p_category text)
returns text
language sql
immutable
as $$
  select case
    when p_category in ('food', 'drinks', 'kitchen_supplies') then 'kitchen'
    when p_category in ('supplies', 'cleaning', 'hygiene', 'medical', 'toys', 'furniture', 'other') then 'store'
  end
$$;

update public.inventory set category = 'other' where public.stock_scope(category) is null;
alter table public.inventory drop constraint if exists inventory_category_check;
alter table public.inventory add constraint inventory_category_check check (public.stock_scope(category) is not null);

alter table public.inventory
  add column if not exists location text check (location is null or char_length(btrim(location)) between 1 and 60);

-- Only the kitchen's items are menu extras or carry food allergens.
update public.inventory set extra_kind = null, food_allergens = '{}' where public.stock_scope(category) = 'store';
alter table public.inventory drop constraint if exists inventory_extras_in_kitchen;
alter table public.inventory add constraint inventory_extras_in_kitchen
  check (public.stock_scope(category) = 'kitchen' or (extra_kind is null and food_allergens = '{}'));

-- Reads only: every change is a function below.
drop policy if exists inv_branch_all on public.inventory;
drop policy if exists inv_chain_all on public.inventory;
drop policy if exists inv_xo_all on public.inventory;
drop policy if exists inv_branch_read on public.inventory;
drop policy if exists inv_chain_read on public.inventory;
drop policy if exists inv_xo_read on public.inventory;
create policy inv_branch_read on public.inventory for select to authenticated
  using (public.current_user_role() = 'branch_admin' and nursery_id = public.current_user_nursery_id());
create policy inv_chain_read on public.inventory for select to authenticated
  using (public.current_user_role() = 'chain_super_admin' and nursery_id in (select public.nursery_ids_for_chain_admin()));
create policy inv_xo_read on public.inventory for select to authenticated
  using (public.is_xo_super_admin());

-- -----------------------------------------------------------------------------------------------
-- 2. Movements
alter table public.inventory_movements
  add column if not exists class_id uuid references public.classes (id) on delete set null,
  add column if not exists taken_by uuid references public.users (id) on delete set null,
  add column if not exists unit_cost numeric(10, 2) check (unit_cost is null or unit_cost between 0 and 100000),
  add column if not exists supplier text check (supplier is null or char_length(supplier) <= 80);
alter table public.inventory_movements drop constraint if exists inventory_movements_kind_check;
alter table public.inventory_movements
  add constraint inventory_movements_kind_check check (kind in ('restocked', 'used', 'issued', 'spoiled', 'counted', 'charged', 'returned'));
create index if not exists idx_inventory_movements_class on public.inventory_movements (class_id, created_at desc) where class_id is not null;

-- What a unit was worth when it moved, from the item's cost then (deliveries keep their own price).
update public.inventory_movements mv
   set unit_cost = i.unit_cost
  from public.inventory i
 where i.id = mv.item_id and mv.unit_cost is null and i.unit_cost is not null;

-- -----------------------------------------------------------------------------------------------
-- 3. Who may change what
create or replace function public.store_can_edit(p_nursery_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_nursery uuid;
  v_chain uuid;
begin
  if auth.uid() is null or p_nursery_id is null then
    return false;
  end if;
  if public.is_xo_super_admin() then
    return true;
  end if;
  select u.role, u.nursery_id, u.chain_id into v_role, v_nursery, v_chain from public.users u where u.id = auth.uid();
  if v_role = 'chain_super_admin' then
    return v_chain is not null and exists (select 1 from public.nurseries n where n.id = p_nursery_id and n.chain_id = v_chain);
  elsif v_role = 'branch_admin' then
    return v_nursery is not distinct from p_nursery_id;
  elsif v_role in ('manager', 'teacher') then
    return v_nursery is not distinct from p_nursery_id and public.user_can('inventory', 'update');
  end if;
  return false;
end;
$$;

create or replace function public.stock_can_edit(p_nursery_id uuid, p_category text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case public.stock_scope(p_category)
           when 'kitchen' then public.menu_can_edit(p_nursery_id)
           when 'store' then public.store_can_edit(p_nursery_id)
           else false
         end
$$;
revoke execute on function public.store_can_edit(uuid) from public, anon;
revoke execute on function public.stock_can_edit(uuid, text) from public, anon;
grant execute on function public.store_can_edit(uuid) to authenticated, service_role;
grant execute on function public.stock_can_edit(uuid, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------------------------
-- 4. Reading the stock

-- Movements of a nursery's section between two days (null: no bound), newest first. Not callable by the app.
create or replace function public.stock_movement_rows(p_nursery_id uuid, p_scope text, p_from date, p_to date, p_limit integer)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(m.row order by m.at desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'id', mv.id, 'item_id', mv.item_id, 'item_name', i.item_name, 'unit', i.unit, 'category', i.category,
               'kind', mv.kind, 'change', mv.change, 'quantity_after', mv.quantity_after, 'note', mv.note,
               'by_ar', u.name_ar, 'by_en', u.name_en, 'at', mv.created_at,
               'for_ar', coalesce(ch.full_name_ar, su.name_ar), 'for_en', coalesce(ch.full_name_en, su.name_en),
               'class_id', mv.class_id, 'class_ar', cl.name_ar, 'class_en', cl.name_en,
               'taken_by_ar', tb.name_ar, 'taken_by_en', tb.name_en,
               'supplier', mv.supplier, 'unit_cost', mv.unit_cost,
               'value', case when mv.unit_cost is null then null else round(abs(mv.change) * mv.unit_cost, 2) end) as row,
             mv.created_at as at
        from public.inventory_movements mv
        join public.inventory i on i.id = mv.item_id
        left join public.users u on u.id = mv.created_by
        left join public.kitchen_charges kc on kc.movement_id = mv.id
        left join public.children ch on ch.id = kc.child_id
        left join public.users su on su.id = kc.staff_user_id
        left join public.classes cl on cl.id = mv.class_id
        left join public.users tb on tb.id = mv.taken_by
       where mv.nursery_id = p_nursery_id
         and (p_scope = 'all' or public.stock_scope(i.category) = p_scope)
         and (p_from is null or (mv.created_at at time zone 'Africa/Cairo')::date >= p_from)
         and (p_to is null or (mv.created_at at time zone 'Africa/Cairo')::date <= p_to)
       order by mv.created_at desc
       limit p_limit
    ) m
$$;

-- What a month's movements and sales were worth, for a section.
create or replace function public.stock_month_summary(p_nursery_id uuid, p_scope text, p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with mv as (
    select mv.kind, mv.change, abs(mv.change) * coalesce(mv.unit_cost, 0) as worth
      from public.inventory_movements mv
      join public.inventory i on i.id = mv.item_id
     where mv.nursery_id = p_nursery_id
       and (p_scope = 'all' or public.stock_scope(i.category) = p_scope)
       and (mv.created_at at time zone 'Africa/Cairo')::date between p_from and p_to
  )
  select jsonb_build_object(
    'deliveries', (select count(*) from mv where kind = 'restocked'),
    'received_value', (select coalesce(round(sum(worth), 2), 0) from mv where kind = 'restocked'),
    'issued_value', (select coalesce(round(sum(worth), 2), 0) from mv where kind = 'issued'),
    'used_value', (select coalesce(round(sum(worth), 2), 0) from mv where kind = 'used'),
    'spoiled_value', (select coalesce(round(sum(worth), 2), 0) from mv where kind = 'spoiled'),
    'issues', (select count(*) from mv where kind = 'issued'),
    'sales_net', (
      select coalesce(round(sum(kc.net), 2), 0)
        from public.kitchen_charges kc
        left join public.inventory i on i.id = kc.item_id
       where kc.nursery_id = p_nursery_id and kc.cancelled_at is null and kc.charged_on between p_from and p_to
         and (p_scope = 'all' or coalesce(public.stock_scope(i.category), 'kitchen') = p_scope)
    )
  )
$$;
revoke execute on function public.stock_movement_rows(uuid, text, date, date, integer) from public, anon, authenticated;
revoke execute on function public.stock_month_summary(uuid, text, date, date) from public, anon, authenticated;

-- A section of the stock (kitchen, store or all) with its latest changes, this month's figures, and
-- for those who may change it, the classes and staff an item can be issued to.
create or replace function public.get_stock(p_nursery_id uuid, p_scope text default 'all')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kitchen boolean;
  v_store boolean;
  v_can boolean;
  v_today date;
begin
  if public.menu_viewer_kind(p_nursery_id) is distinct from 'staff' then
    raise exception 'menu_forbidden' using errcode = '42501';
  end if;
  if coalesce(p_scope, '') not in ('kitchen', 'store', 'all') then
    raise exception 'stock_invalid_scope' using errcode = '22023';
  end if;
  v_kitchen := public.menu_can_edit(p_nursery_id);
  v_store := public.store_can_edit(p_nursery_id);
  v_can := case p_scope when 'kitchen' then v_kitchen when 'store' then v_store else v_kitchen or v_store end;
  v_today := public.nursery_today(p_nursery_id);
  return jsonb_build_object(
    'scope', p_scope,
    'can_edit', v_can,
    'can_edit_kitchen', v_kitchen,
    'can_edit_store', v_store,
    'today', v_today,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'name', i.item_name, 'category', i.category, 'scope', public.stock_scope(i.category),
               'quantity', i.quantity, 'unit', i.unit,
               'low_stock_level', coalesce(i.low_stock_threshold, i.reorder_level, 0), 'expires_on', i.expires_on,
               'last_restocked', i.last_restocked, 'updated_at', i.updated_at,
               'unit_cost', i.unit_cost, 'child_price', i.child_price, 'staff_price', i.staff_price,
               'pack_size', i.pack_size, 'pack_unit', i.pack_unit, 'extra_kind', i.extra_kind,
               'food_allergens', to_jsonb(i.food_allergens), 'location', i.location,
               'can_edit', case public.stock_scope(i.category) when 'kitchen' then v_kitchen else v_store end)
             order by i.item_name)
        from public.inventory i
       where i.nursery_id = p_nursery_id
         and (p_scope = 'all' or public.stock_scope(i.category) = p_scope)
    ), '[]'::jsonb),
    'movements', public.stock_movement_rows(p_nursery_id, p_scope, null, null, 40),
    'month', public.stock_month_summary(p_nursery_id, p_scope, date_trunc('month', v_today)::date, v_today),
    'classes', case when v_can then coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name_ar', c.name_ar, 'name_en', c.name_en) order by c.name_en)
        from public.classes c
       where c.nursery_id = p_nursery_id and c.deleted_at is null
    ), '[]'::jsonb) else '[]'::jsonb end,
    'staff', case when v_can then coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'name_ar', u.name_ar, 'name_en', u.name_en, 'role', u.role) order by u.name_en)
        from public.users u
       where u.nursery_id = p_nursery_id and u.role <> 'parent' and coalesce(u.status, 'active') = 'active'
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;
revoke execute on function public.get_stock(uuid, text) from public, anon;
grant execute on function public.get_stock(uuid, text) to authenticated, service_role;

-- The kitchen's section, as before.
create or replace function public.get_kitchen_stock(p_nursery_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.get_stock(p_nursery_id, 'kitchen')
$$;

-- A month of a section's movements: every one, what came in and went out and its worth, by class
-- and by category.
create or replace function public.get_stock_history(p_nursery_id uuid, p_month date, p_scope text default 'all')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from date := date_trunc('month', coalesce(p_month, current_date))::date;
  v_to date := (date_trunc('month', coalesce(p_month, current_date)) + interval '1 month - 1 day')::date;
begin
  if public.menu_viewer_kind(p_nursery_id) is distinct from 'staff' then
    raise exception 'menu_forbidden' using errcode = '42501';
  end if;
  if coalesce(p_scope, '') not in ('kitchen', 'store', 'all') then
    raise exception 'stock_invalid_scope' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'month', to_char(v_from, 'YYYY-MM'),
    'scope', p_scope,
    'today', public.nursery_today(p_nursery_id),
    'summary', public.stock_month_summary(p_nursery_id, p_scope, v_from, v_to),
    'movements', public.stock_movement_rows(p_nursery_id, p_scope, v_from, v_to, 2000),
    'by_class', coalesce((
      select jsonb_agg(jsonb_build_object('class_id', x.class_id, 'name_ar', x.name_ar, 'name_en', x.name_en,
                                          'issues', x.issues, 'items', x.items, 'value', x.worth)
             order by x.worth desc, x.issues desc)
        from (
          select mv.class_id, cl.name_ar, cl.name_en, count(*) as issues, count(distinct mv.item_id) as items,
                 round(sum(abs(mv.change) * coalesce(mv.unit_cost, 0)), 2) as worth
            from public.inventory_movements mv
            join public.inventory i on i.id = mv.item_id
            left join public.classes cl on cl.id = mv.class_id
           where mv.nursery_id = p_nursery_id and mv.kind = 'issued'
             and (p_scope = 'all' or public.stock_scope(i.category) = p_scope)
             and (mv.created_at at time zone 'Africa/Cairo')::date between v_from and v_to
           group by mv.class_id, cl.name_ar, cl.name_en
        ) x
    ), '[]'::jsonb),
    'by_category', coalesce((
      select jsonb_agg(jsonb_build_object('category', x.category, 'in_value', x.in_value, 'out_value', x.out_value,
                                          'spoiled_value', x.spoiled_value, 'movements', x.movements)
             order by x.out_value desc, x.category)
        from (
          select i.category, count(*) as movements,
                 round(sum(abs(mv.change) * coalesce(mv.unit_cost, 0)) filter (where mv.kind = 'restocked'), 2) as in_value,
                 round(coalesce(sum(abs(mv.change) * coalesce(mv.unit_cost, 0)) filter (where mv.kind in ('used', 'issued', 'charged')), 0)
                       - coalesce(sum(abs(mv.change) * coalesce(mv.unit_cost, 0)) filter (where mv.kind = 'returned'), 0), 2) as out_value,
                 round(sum(abs(mv.change) * coalesce(mv.unit_cost, 0)) filter (where mv.kind = 'spoiled'), 2) as spoiled_value
            from public.inventory_movements mv
            join public.inventory i on i.id = mv.item_id
           where mv.nursery_id = p_nursery_id
             and (p_scope = 'all' or public.stock_scope(i.category) = p_scope)
             and (mv.created_at at time zone 'Africa/Cairo')::date between v_from and v_to
           group by i.category
        ) x
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.get_stock_history(uuid, date, text) from public, anon;
grant execute on function public.get_stock_history(uuid, date, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------------------------
-- 5. Changing the stock

-- Adds or changes an item of either section (replaces the earlier one: adds where it is kept).
drop function if exists public.save_kitchen_item(uuid, uuid, text, text, text, numeric, date, numeric, numeric, numeric, numeric, text, text, text[]);
create or replace function public.save_kitchen_item(
  p_nursery_id uuid, p_id uuid, p_name text, p_category text, p_unit text, p_low_stock_level numeric, p_expires_on date,
  p_unit_cost numeric default null, p_child_price numeric default null, p_staff_price numeric default null,
  p_pack_size numeric default null, p_pack_unit text default null, p_extra_kind text default null,
  p_food_allergens text[] default '{}', p_location text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allergens text[];
  v_old public.inventory%rowtype;
  v_kitchen boolean := public.stock_scope(p_category) = 'kitchen';
begin
  if public.stock_scope(p_category) is null then
    raise exception 'kitchen_item_invalid' using errcode = '22023';
  end if;
  if not public.stock_can_edit(p_nursery_id, p_category) then
    raise exception 'menu_forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 80
     or char_length(btrim(coalesce(p_unit, ''))) not between 1 and 20
     or p_low_stock_level is null or p_low_stock_level < 0
     or (p_unit_cost is not null and p_unit_cost not between 0 and 100000)
     or (p_child_price is not null and p_child_price not between 0 and 100000)
     or (p_staff_price is not null and p_staff_price not between 0 and 100000)
     or (p_pack_size is not null and p_pack_size not between 1 and 10000)
     or ((p_pack_size is null) <> (nullif(btrim(coalesce(p_pack_unit, '')), '') is null))
     or (p_pack_unit is not null and char_length(btrim(p_pack_unit)) > 20)
     or (p_extra_kind is not null and p_extra_kind not in ('meal', 'drink', 'snack'))
     or (p_extra_kind is not null and p_child_price is null)
     or (p_extra_kind is not null and not v_kitchen)
     or (not v_kitchen and cardinality(coalesce(p_food_allergens, '{}')) > 0)
     or (p_location is not null and char_length(btrim(p_location)) > 60) then
    raise exception 'kitchen_item_invalid' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_food_allergens, '{}')) a where a not in (select code from public.food_allergens)) then
    raise exception 'kitchen_item_invalid' using errcode = '22023';
  end if;
  v_allergens := array(select fa.code from public.food_allergens fa where fa.code = any (coalesce(p_food_allergens, '{}')) order by fa.sort_order);
  if p_id is null then
    insert into public.inventory (nursery_id, item_name, category, quantity, unit, low_stock_threshold, reorder_level, expires_on,
                                  unit_cost, child_price, staff_price, pack_size, pack_unit, extra_kind, food_allergens, location)
    values (p_nursery_id, btrim(p_name), p_category, 0, btrim(p_unit), p_low_stock_level, p_low_stock_level, p_expires_on,
            p_unit_cost, p_child_price, p_staff_price, p_pack_size, nullif(btrim(coalesce(p_pack_unit, '')), ''), p_extra_kind, v_allergens,
            nullif(btrim(coalesce(p_location, '')), ''));
  else
    select * into v_old from public.inventory where id = p_id and nursery_id = p_nursery_id for update;
    if v_old.id is null then
      raise exception 'kitchen_item_not_found' using errcode = 'P0001';
    end if;
    -- Moving an item to the other section needs the right to change both.
    if not public.stock_can_edit(p_nursery_id, v_old.category) then
      raise exception 'menu_forbidden' using errcode = '42501';
    end if;
    update public.inventory
       set item_name = btrim(p_name), category = p_category, unit = btrim(p_unit),
           low_stock_threshold = p_low_stock_level, reorder_level = p_low_stock_level, expires_on = p_expires_on,
           unit_cost = p_unit_cost, child_price = p_child_price, staff_price = p_staff_price,
           pack_size = p_pack_size, pack_unit = nullif(btrim(coalesce(p_pack_unit, '')), ''), extra_kind = p_extra_kind,
           food_allergens = v_allergens, location = nullif(btrim(coalesce(p_location, '')), ''), updated_at = now()
     where id = v_old.id;
  end if;
  return public.get_stock(p_nursery_id, public.stock_scope(p_category));
end;
$$;
revoke execute on function public.save_kitchen_item(uuid, uuid, text, text, text, numeric, date, numeric, numeric, numeric, numeric, text, text, text[], text) from public, anon;
grant execute on function public.save_kitchen_item(uuid, uuid, text, text, text, numeric, date, numeric, numeric, numeric, numeric, text, text, text[], text) to authenticated, service_role;

-- Records a change: restocked and used/issued/spoiled add or take p_quantity; counted sets it.
-- A delivery may carry its supplier and what a unit cost (the item's cost becomes that); an issue
-- names the class it went to, who took it, or both. Taking more than is there is refused.
drop function if exists public.record_kitchen_movement(uuid, text, numeric, date, text);
create or replace function public.record_kitchen_movement(
  p_item_id uuid, p_kind text, p_quantity numeric, p_expires_on date default null, p_note text default null,
  p_class_id uuid default null, p_taken_by uuid default null, p_unit_cost numeric default null, p_supplier text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory%rowtype;
  v_after numeric;
  v_cost numeric;
begin
  select * into v_item from public.inventory where id = p_item_id for update;
  if not found then
    raise exception 'kitchen_item_not_found' using errcode = 'P0001';
  end if;
  if not public.stock_can_edit(v_item.nursery_id, v_item.category) then
    raise exception 'menu_forbidden' using errcode = '42501';
  end if;
  if coalesce(p_kind, '') not in ('restocked', 'used', 'issued', 'spoiled', 'counted') or p_quantity is null or p_quantity < 0
     or (p_kind <> 'counted' and p_quantity = 0) or p_quantity > 1000000 or p_quantity <> round(p_quantity, 2) then
    raise exception 'kitchen_invalid_quantity' using errcode = '22023';
  end if;
  if p_note is not null and char_length(btrim(p_note)) > 300 then
    raise exception 'kitchen_invalid_quantity' using errcode = '22023';
  end if;
  -- Who an issue went to; nobody else names one.
  if p_kind = 'issued' then
    if (p_class_id is null and p_taken_by is null)
       or (p_class_id is not null and not exists (select 1 from public.classes c where c.id = p_class_id and c.nursery_id = v_item.nursery_id and c.deleted_at is null))
       or (p_taken_by is not null and not exists (select 1 from public.users u where u.id = p_taken_by and u.nursery_id = v_item.nursery_id and u.role <> 'parent')) then
      raise exception 'stock_issue_target' using errcode = '22023';
    end if;
  elsif p_class_id is not null or p_taken_by is not null then
    raise exception 'stock_issue_target' using errcode = '22023';
  end if;
  if (p_unit_cost is not null or nullif(btrim(coalesce(p_supplier, '')), '') is not null) and p_kind <> 'restocked' then
    raise exception 'stock_invalid_cost' using errcode = '22023';
  end if;
  if (p_unit_cost is not null and (p_unit_cost < 0 or p_unit_cost > 100000 or p_unit_cost <> round(p_unit_cost, 2)))
     or char_length(btrim(coalesce(p_supplier, ''))) > 80 then
    raise exception 'stock_invalid_cost' using errcode = '22023';
  end if;

  v_after := case p_kind
               when 'restocked' then coalesce(v_item.quantity, 0) + p_quantity
               when 'counted' then p_quantity
               else coalesce(v_item.quantity, 0) - p_quantity
             end;
  if v_after < 0 then
    raise exception 'kitchen_not_enough' using errcode = 'P0001', detail = coalesce(v_item.quantity, 0)::text;
  end if;
  v_cost := coalesce(p_unit_cost, v_item.unit_cost);
  update public.inventory
     set quantity = v_after,
         last_restocked = case when p_kind = 'restocked' then public.nursery_today(v_item.nursery_id) else last_restocked end,
         expires_on = case when p_kind = 'restocked' and p_expires_on is not null then p_expires_on else expires_on end,
         unit_cost = case when p_kind = 'restocked' and p_unit_cost is not null then p_unit_cost else unit_cost end,
         updated_at = now()
   where id = v_item.id;
  insert into public.inventory_movements (nursery_id, item_id, kind, change, quantity_after, note, created_by, class_id, taken_by, unit_cost, supplier)
  values (v_item.nursery_id, v_item.id, p_kind, v_after - coalesce(v_item.quantity, 0), v_after, nullif(btrim(coalesce(p_note, '')), ''), auth.uid(),
          p_class_id, p_taken_by, v_cost, nullif(btrim(coalesce(p_supplier, '')), ''));
  return public.get_stock(v_item.nursery_id, public.stock_scope(v_item.category));
end;
$$;
revoke execute on function public.record_kitchen_movement(uuid, text, numeric, date, text, uuid, uuid, numeric, text) from public, anon;
grant execute on function public.record_kitchen_movement(uuid, text, numeric, date, text, uuid, uuid, numeric, text) to authenticated, service_role;

-- Removes an item and its history.
create or replace function public.delete_kitchen_item(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory%rowtype;
begin
  select * into v_item from public.inventory where id = p_item_id;
  if not found then
    raise exception 'kitchen_item_not_found' using errcode = 'P0001';
  end if;
  if not public.stock_can_edit(v_item.nursery_id, v_item.category) then
    raise exception 'menu_forbidden' using errcode = '42501';
  end if;
  delete from public.inventory where id = v_item.id;
  return public.get_stock(v_item.nursery_id, public.stock_scope(v_item.category));
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- 6. Selling: the kitchen's extras as before; a store item with a child's price is charged to the
--    child at once. Each charge's movement keeps what a unit cost.
create or replace function public.kitchen_charge_core(
  p_item_id uuid, p_quantity numeric, p_consumer text, p_child_id uuid, p_staff_user_id uuid,
  p_note text, p_idempotency_key uuid, p_extra_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory%rowtype;
  v_existing uuid;
  v_day date;
  v_price numeric;
  v_discount public.kitchen_discounts%rowtype;
  v_gross numeric;
  v_off numeric := 0;
  v_after numeric;
  v_movement uuid;
  v_charge public.kitchen_charges%rowtype;
  v_conflicts text[];
begin
  if p_idempotency_key is not null then
    select id into v_existing from public.kitchen_charges where idempotency_key = p_idempotency_key;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;
  select * into v_item from public.inventory where id = p_item_id for update;
  if v_item.id is null or public.stock_scope(v_item.category) is null then
    raise exception 'kitchen_item_not_found' using errcode = 'P0001';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000 or p_quantity <> round(p_quantity, 2) then
    raise exception 'kitchen_invalid_quantity' using errcode = '22023';
  end if;
  v_day := public.nursery_today(v_item.nursery_id);

  if p_consumer = 'child' then
    if not exists (select 1 from public.children c where c.id = p_child_id and c.nursery_id = v_item.nursery_id and c.status = 'active') then
      raise exception 'kitchen_person_invalid' using errcode = '22023';
    end if;
    -- The kitchen sells children its menu extras; the store, whatever has a child's price.
    if v_item.child_price is null or (public.stock_scope(v_item.category) = 'kitchen' and v_item.extra_kind is null) then
      raise exception 'kitchen_not_for_sale' using errcode = '22023';
    end if;
    v_conflicts := public.kitchen_item_allergy_conflicts(v_item.id, p_child_id);
    if cardinality(v_conflicts) > 0 then
      raise exception 'kitchen_allergy' using errcode = 'P0001', detail = array_to_string(v_conflicts, ',');
    end if;
    v_price := v_item.child_price;
  elsif p_consumer = 'staff' then
    if not exists (select 1 from public.users u where u.id = p_staff_user_id and u.nursery_id = v_item.nursery_id and u.role <> 'parent') then
      raise exception 'kitchen_person_invalid' using errcode = '22023';
    end if;
    v_price := coalesce(v_item.staff_price, v_item.child_price);
    if v_price is null then
      raise exception 'kitchen_not_for_sale' using errcode = '22023';
    end if;
  else
    raise exception 'kitchen_person_invalid' using errcode = '22023';
  end if;

  v_after := coalesce(v_item.quantity, 0) - p_quantity;
  if v_after < 0 then
    raise exception 'kitchen_not_enough' using errcode = 'P0001', detail = coalesce(v_item.quantity, 0)::text;
  end if;

  v_gross := round(v_price * p_quantity, 2);
  v_discount := public.kitchen_best_discount(v_item.nursery_id, v_item.id, p_consumer, p_child_id, p_staff_user_id, v_day);
  if v_discount.id is not null then
    v_off := round(v_gross * v_discount.percent / 100, 2);
  end if;

  update public.inventory set quantity = v_after, updated_at = now() where id = v_item.id;
  insert into public.inventory_movements (nursery_id, item_id, kind, change, quantity_after, note, created_by, unit_cost)
  values (v_item.nursery_id, v_item.id, 'charged', -p_quantity, v_after, nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), v_item.unit_cost)
  returning id into v_movement;

  insert into public.kitchen_charges (
    nursery_id, item_id, item_name, unit, consumer, child_id, staff_user_id, quantity, unit_price, gross,
    discount_id, discount_name_ar, discount_name_en, discount_percent, discount_amount, net, charged_on,
    movement_id, extra_request_id, note, idempotency_key, created_by
  )
  values (
    v_item.nursery_id, v_item.id, v_item.item_name, v_item.unit, p_consumer,
    case when p_consumer = 'child' then p_child_id end, case when p_consumer = 'staff' then p_staff_user_id end,
    p_quantity, v_price, v_gross,
    v_discount.id, v_discount.name_ar, v_discount.name_en, coalesce(v_discount.percent, 0), v_off, v_gross - v_off, v_day,
    v_movement, p_extra_request_id, nullif(btrim(coalesce(p_note, '')), ''), p_idempotency_key, auth.uid()
  )
  returning * into v_charge;

  if p_consumer = 'child' then
    update public.kitchen_charges set invoice_id = public.kitchen_bill_child_charge(v_charge) where id = v_charge.id;
  end if;
  return v_charge.id;
end;
$$;
revoke execute on function public.kitchen_charge_core(uuid, numeric, text, uuid, uuid, text, uuid, uuid) from public, anon, authenticated;

-- A member of staff takes an item for themselves, or those who may change its section record one
-- for anyone on the staff. Returns the charge.
create or replace function public.charge_staff_kitchen_item(
  p_item_id uuid, p_quantity numeric, p_staff_user_id uuid default null, p_note text default null, p_idempotency_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory%rowtype;
  v_person uuid := coalesce(p_staff_user_id, auth.uid());
begin
  select * into v_item from public.inventory where id = p_item_id;
  if v_item.id is null then
    raise exception 'kitchen_item_not_found' using errcode = 'P0001';
  end if;
  if not (
    public.stock_can_edit(v_item.nursery_id, v_item.category)
    or (v_person = auth.uid() and exists (select 1 from public.users u where u.id = auth.uid() and u.nursery_id = v_item.nursery_id and u.role <> 'parent'))
  ) then
    raise exception 'kitchen_forbidden' using errcode = '42501';
  end if;
  return public.kitchen_charge_core(p_item_id, p_quantity, 'staff', null, v_person, p_note, p_idempotency_key, null);
end;
$$;

-- The store charges a child an item (nappies, wipes, a uniform): out of stock, onto the family's
-- monthly extras invoice, and the parents are told. Returns the charge.
create or replace function public.charge_child_stock_item(
  p_child_id uuid, p_item_id uuid, p_quantity numeric, p_note text default null, p_idempotency_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child public.children%rowtype;
  v_item public.inventory%rowtype;
  v_charge public.kitchen_charges%rowtype;
  v_id uuid;
begin
  select * into v_child from public.children where id = p_child_id;
  if v_child.id is null or not public.store_can_edit(v_child.nursery_id) then
    raise exception 'kitchen_forbidden' using errcode = '42501';
  end if;
  if p_idempotency_key is not null then
    select * into v_charge from public.kitchen_charges where idempotency_key = p_idempotency_key;
    if v_charge.id is not null then
      return v_charge.id;
    end if;
  end if;
  select * into v_item from public.inventory where id = p_item_id and nursery_id = v_child.nursery_id;
  if v_item.id is null or public.stock_scope(v_item.category) <> 'store' or v_item.child_price is null then
    raise exception 'kitchen_not_for_sale' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 100 or p_quantity <> round(p_quantity, 2) then
    raise exception 'kitchen_invalid_quantity' using errcode = '22023';
  end if;
  if p_note is not null and char_length(btrim(p_note)) > 200 then
    raise exception 'kitchen_invalid_note' using errcode = '22023';
  end if;
  v_id := public.kitchen_charge_core(v_item.id, p_quantity, 'child', p_child_id, null, p_note, p_idempotency_key, null);
  select * into v_charge from public.kitchen_charges where id = v_id;
  perform public.notify_users(
    array(select pc.parent_id from public.parent_children pc where pc.child_id = p_child_id),
    v_child.nursery_id, 'stock_child_charged', 'stock_child_charged',
    jsonb_build_object('child', public.i18n_names(v_child.full_name_ar, v_child.full_name_en), 'item', v_item.item_name,
                       'quantity', p_quantity, 'unit', v_item.unit, 'amount', v_charge.net),
    '/parent/invoices', 'normal', null
  );
  return v_charge.id;
end;
$$;
revoke execute on function public.charge_child_stock_item(uuid, uuid, numeric, text, uuid) from public, anon;
grant execute on function public.charge_child_stock_item(uuid, uuid, numeric, text, uuid) to authenticated, service_role;

-- Cancelling a charge: by those who may change its item's section (any section, once the item is gone).
create or replace function public.cancel_kitchen_charge(p_charge_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_charge public.kitchen_charges%rowtype;
  v_invoice public.invoices%rowtype;
  v_category text;
  v_allowed boolean;
  v_after numeric;
  v_items jsonb;
begin
  select * into v_charge from public.kitchen_charges where id = p_charge_id for update;
  if v_charge.id is not null then
    select category into v_category from public.inventory where id = v_charge.item_id;
    v_allowed := case when v_category is not null then public.stock_can_edit(v_charge.nursery_id, v_category)
                      else public.menu_can_edit(v_charge.nursery_id) or public.store_can_edit(v_charge.nursery_id) end;
  end if;
  if v_charge.id is null or not coalesce(v_allowed, false) then
    raise exception 'kitchen_forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 200 then
    raise exception 'kitchen_reason_required' using errcode = '22023';
  end if;
  if v_charge.cancelled_at is not null then
    raise exception 'kitchen_charge_closed' using errcode = 'P0001';
  end if;
  if v_charge.payroll_id is not null then
    raise exception 'kitchen_charge_settled' using errcode = 'P0001';
  end if;
  if v_charge.invoice_id is not null then
    select * into v_invoice from public.invoices where id = v_charge.invoice_id for update;
    if v_invoice.status <> 'pending' or exists (
      select 1 from public.payment_attempts pa where pa.invoice_id = v_invoice.id and pa.status in ('pending_confirmation', 'confirmed')
    ) then
      raise exception 'kitchen_charge_settled' using errcode = 'P0001';
    end if;
    v_items := coalesce((
      select jsonb_agg(it) from jsonb_array_elements(v_invoice.line_items_json -> 'items') it
       where it ->> 'charge_id' is distinct from v_charge.id::text
    ), '[]'::jsonb);
    update public.invoices
       set amount = greatest(amount - v_charge.net, 0),
           line_items_json = jsonb_set(line_items_json, '{items}', v_items),
           status = case when jsonb_array_length(v_items) = 0 then 'cancelled' else status end,
           updated_at = now()
     where id = v_invoice.id;
  end if;

  if v_charge.item_id is not null then
    update public.inventory set quantity = coalesce(quantity, 0) + v_charge.quantity, updated_at = now()
     where id = v_charge.item_id
    returning quantity into v_after;
    insert into public.inventory_movements (nursery_id, item_id, kind, change, quantity_after, note, created_by, unit_cost)
    values (v_charge.nursery_id, v_charge.item_id, 'returned', v_charge.quantity, v_after, btrim(p_reason), auth.uid(),
            (select unit_cost from public.inventory where id = v_charge.item_id));
  end if;

  update public.kitchen_charges
     set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason)
   where id = v_charge.id;
  update public.child_extra_requests set status = 'cancelled', updated_at = now()
   where id = v_charge.extra_request_id and status = 'served';
end;
$$;

-- The month's sales: for those who may change either section (the store sells too).
create or replace function public.get_kitchen_sales(p_nursery_id uuid, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from date := date_trunc('month', p_month)::date;
  v_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_today date := public.nursery_today(p_nursery_id);
begin
  if not (public.menu_can_edit(p_nursery_id) or public.store_can_edit(p_nursery_id)) then
    raise exception 'kitchen_forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'today', v_today,
    'month', to_char(v_from, 'YYYY-MM'),
    'charges', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', kc.id, 'item_name', kc.item_name, 'unit', kc.unit, 'consumer', kc.consumer,
               'person_id', coalesce(kc.child_id, kc.staff_user_id),
               'name_ar', coalesce(c.full_name_ar, u.name_ar), 'name_en', coalesce(c.full_name_en, u.name_en),
               'class_ar', cl.name_ar, 'class_en', cl.name_en,
               'quantity', kc.quantity, 'unit_price', kc.unit_price, 'gross', kc.gross,
               'discount_name_ar', kc.discount_name_ar, 'discount_name_en', kc.discount_name_en,
               'discount_percent', kc.discount_percent, 'discount_amount', kc.discount_amount, 'net', kc.net,
               'charged_on', kc.charged_on, 'created_at', kc.created_at,
               'billing', case when kc.cancelled_at is not null then 'cancelled'
                               when kc.consumer = 'staff' then case when kc.payroll_id is not null then 'deducted' else 'open' end
                               when kc.invoice_id is null then 'no_parent'
                               else coalesce((select case when iv.status = 'paid' then 'paid' else 'invoiced' end from public.invoices iv where iv.id = kc.invoice_id), 'invoiced') end,
               'invoice_id', kc.invoice_id, 'cancel_reason', kc.cancel_reason, 'from_request', kc.extra_request_id is not null,
               'by_ar', b.name_ar, 'by_en', b.name_en)
             order by kc.created_at desc)
        from public.kitchen_charges kc
        left join public.children c on c.id = kc.child_id
        left join public.classes cl on cl.id = c.class_id
        left join public.users u on u.id = kc.staff_user_id
        left join public.users b on b.id = kc.created_by
       where kc.nursery_id = p_nursery_id and kc.charged_on between v_from and v_to
    ), '[]'::jsonb),
    'discounts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'name_ar', d.name_ar, 'name_en', d.name_en, 'audience', d.audience,
               'person_id', coalesce(d.staff_user_id, d.child_id),
               'person_ar', coalesce(su.name_ar, c.full_name_ar), 'person_en', coalesce(su.name_en, c.full_name_en),
               'item_id', d.item_id, 'item_name', i.item_name, 'percent', d.percent,
               'starts_on', d.starts_on, 'ends_on', d.ends_on, 'active', d.active)
             order by d.active desc, d.name_en)
        from public.kitchen_discounts d
        left join public.users su on su.id = d.staff_user_id
        left join public.children c on c.id = d.child_id
        left join public.inventory i on i.id = d.item_id
       where d.nursery_id = p_nursery_id
    ), '[]'::jsonb),
    'requests_today', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'child_id', r.child_id, 'name_ar', c.full_name_ar, 'name_en', c.full_name_en,
               'class_ar', cl.name_ar, 'class_en', cl.name_en, 'item_name', r.item_name, 'quantity', r.quantity,
               'source', r.source, 'status', r.status, 'note', r.note)
             order by r.status, c.full_name_en)
        from public.child_extra_requests r
        join public.children c on c.id = r.child_id
        left join public.classes cl on cl.id = c.class_id
       where r.nursery_id = p_nursery_id and r.for_date = v_today
    ), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'name_ar', u.name_ar, 'name_en', u.name_en, 'role', u.role) order by u.name_en)
        from public.users u
       where u.nursery_id = p_nursery_id and u.role <> 'parent' and coalesce(u.status, 'active') = 'active'
    ), '[]'::jsonb),
    'staff_open', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'name_ar', u.name_ar, 'name_en', u.name_en, 'open', s.total) order by s.total desc)
        from (select staff_user_id, sum(net) as total from public.kitchen_charges
               where nursery_id = p_nursery_id and consumer = 'staff' and payroll_id is null and cancelled_at is null
               group by staff_user_id) s
        join public.users u on u.id = s.staff_user_id
    ), '[]'::jsonb)
  );
end;
$$;

-- Children whose name matches, for the pickers of those who may sell from either section.
create or replace function public.search_kitchen_children(p_nursery_id uuid, p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := '%' || lower(btrim(coalesce(p_query, ''))) || '%';
begin
  if not (public.menu_can_edit(p_nursery_id) or public.store_can_edit(p_nursery_id)) then
    raise exception 'kitchen_forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x.row)
      from (
        select jsonb_build_object('id', c.id, 'name_ar', c.full_name_ar, 'name_en', c.full_name_en, 'class_ar', cl.name_ar, 'class_en', cl.name_en) as row
          from public.children c
          left join public.classes cl on cl.id = c.class_id
         where c.nursery_id = p_nursery_id and c.status = 'active'
           and (lower(c.full_name_en) like v_q or lower(c.full_name_ar) like v_q)
         order by c.full_name_en
         limit 20
      ) x
  ), '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- 7. Once a day: tell each branch's admins what is out, low, expired or about to expire.
create or replace function public.run_stock_alerts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_sent integer := 0;
begin
  for r in
    select x.nursery_id, x.out_count, x.low_count, x.expired_count, x.expiring_count
      from (
        select i.nursery_id,
               count(*) filter (where i.quantity <= 0) as out_count,
               count(*) filter (where i.quantity > 0 and coalesce(i.low_stock_threshold, i.reorder_level, 0) > 0
                                  and i.quantity <= coalesce(i.low_stock_threshold, i.reorder_level, 0)) as low_count,
               count(*) filter (where i.quantity > 0 and i.expires_on < public.nursery_today(i.nursery_id)) as expired_count,
               count(*) filter (where i.quantity > 0 and i.expires_on between public.nursery_today(i.nursery_id) and public.nursery_today(i.nursery_id) + 3) as expiring_count
          from public.inventory i
         group by i.nursery_id
      ) x
     where x.out_count + x.low_count + x.expired_count + x.expiring_count > 0
  loop
    v_sent := v_sent + public.notify_users(
      array(
        select u.id from public.users u
         where u.nursery_id = r.nursery_id and u.role = 'branch_admin' and coalesce(u.status, 'active') = 'active'
           and not exists (select 1 from public.notifications n where n.user_id = u.id and n.type = 'stock_attention' and n.sent_at > now() - interval '20 hours')
      ),
      r.nursery_id, 'stock_attention', 'stock_attention',
      jsonb_build_object('out', r.out_count, 'low', r.low_count, 'expired', r.expired_count, 'expiring', r.expiring_count),
      '/admin/inventory?show=attention',
      case when r.out_count + r.expired_count > 0 then 'high' else 'normal' end,
      null
    );
  end loop;
  return v_sent;
end;
$$;
revoke execute on function public.run_stock_alerts() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'stock-alerts';
    perform cron.schedule('stock-alerts', '0 5 * * *', 'select public.run_stock_alerts()');
  end if;
end;
$$;

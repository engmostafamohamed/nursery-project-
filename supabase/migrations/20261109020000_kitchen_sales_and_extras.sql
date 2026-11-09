-- Kitchen sales: what a child or a member of staff takes from the kitchen is taken out of stock and
-- charged to them, with any discount, at the moment it is taken.
--
-- 1. Items carry their cost, a price for children and one for staff, a pack size (a carton of 12),
--    whether they are an "extra" on the menu (meal, drink, snack) and the food allergens in them.
-- 2. kitchen_discounts: named percentage discounts for all staff, all children, one member of staff
--    or one child, on every item or one, between dates. The best one that applies is used, and its
--    name and amount are kept on the charge (a later change does not touch past charges).
-- 3. kitchen_charges: one row per taking, with the price, the discount and the net amount.
--    - A child's charge goes on the family's monthly "food extras" invoice for that child (one line
--      per charge); once that month's invoice is no longer pending, new charges go on the next month's.
--    - A staff member's charges stay open until a payslip is made for them: the payslip deducts them
--      (as much as the pay allows, oldest first) and they are marked settled by it.
--    - Cancelling a charge puts the stock back and takes the line off a pending invoice; a charge
--      already paid or deducted from a salary cannot be cancelled.
-- 4. child_extra_requests: an extra for a child on a day.
--    - A parent orders one (approved at once, served on the day).
--    - A teacher gives one: served at once when the parents agreed to extras at enrollment
--      (accepts_extra_meals for a meal, accepts_extra_snacks for a drink or snack), otherwise it
--      waits for the parent's yes or no.
--    - An extra with a food the child is allergic to is refused. Requests not served by the end of
--      their day expire.
-- Every write goes through the functions below; the tables allow no direct writes.

-- -----------------------------------------------------------------------------------------------
-- 1. Items
alter table public.inventory
  add column if not exists unit_cost numeric(10, 2) check (unit_cost is null or unit_cost between 0 and 100000),
  add column if not exists child_price numeric(10, 2) check (child_price is null or child_price between 0 and 100000),
  add column if not exists staff_price numeric(10, 2) check (staff_price is null or staff_price between 0 and 100000),
  add column if not exists pack_size numeric(10, 2) check (pack_size is null or pack_size between 1 and 10000),
  add column if not exists pack_unit text check (pack_unit is null or char_length(btrim(pack_unit)) between 1 and 20),
  add column if not exists extra_kind text check (extra_kind is null or extra_kind in ('meal', 'drink', 'snack')),
  add column if not exists food_allergens text[] not null default '{}';

-- Each change keeps its own moment, so changes made in one transaction still list in order.
alter table public.inventory_movements alter column created_at set default clock_timestamp();
alter table public.inventory_movements drop constraint if exists inventory_movements_kind_check;
alter table public.inventory_movements
  add constraint inventory_movements_kind_check check (kind in ('restocked', 'used', 'spoiled', 'counted', 'charged', 'returned'));

-- -----------------------------------------------------------------------------------------------
-- 2. Discounts
create table if not exists public.kitchen_discounts (
  id uuid primary key default gen_random_uuid(),
  nursery_id uuid not null references public.nurseries (id) on delete cascade,
  name_ar text not null check (char_length(btrim(name_ar)) between 1 and 80),
  name_en text not null check (char_length(btrim(name_en)) between 1 and 80),
  audience text not null check (audience in ('all_staff', 'all_children', 'staff_member', 'child')),
  staff_user_id uuid references public.users (id) on delete cascade,
  child_id uuid references public.children (id) on delete cascade,
  item_id uuid references public.inventory (id) on delete cascade,
  percent numeric(5, 2) not null check (percent > 0 and percent <= 100),
  starts_on date,
  ends_on date,
  active boolean not null default true,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kitchen_discounts_person check (
    (audience = 'staff_member') = (staff_user_id is not null) and (audience = 'child') = (child_id is not null)
  ),
  constraint kitchen_discounts_dates check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index if not exists idx_kitchen_discounts_nursery on public.kitchen_discounts (nursery_id) where active;
alter table public.kitchen_discounts enable row level security;
drop policy if exists kitchen_discounts_read on public.kitchen_discounts;
create policy kitchen_discounts_read on public.kitchen_discounts for select to authenticated
  using (public.menu_can_edit(nursery_id));

-- -----------------------------------------------------------------------------------------------
-- 3. Charges
create table if not exists public.kitchen_charges (
  id uuid primary key default gen_random_uuid(),
  nursery_id uuid not null references public.nurseries (id) on delete cascade,
  item_id uuid references public.inventory (id) on delete set null,
  item_name text not null,
  unit text not null,
  consumer text not null check (consumer in ('child', 'staff')),
  child_id uuid references public.children (id) on delete cascade,
  staff_user_id uuid references public.users (id) on delete cascade,
  quantity numeric(10, 2) not null check (quantity > 0),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  gross numeric(12, 2) not null check (gross >= 0),
  discount_id uuid references public.kitchen_discounts (id) on delete set null,
  discount_name_ar text,
  discount_name_en text,
  discount_percent numeric(5, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),
  net numeric(12, 2) not null check (net >= 0),
  charged_on date not null,
  movement_id uuid references public.inventory_movements (id) on delete set null,
  invoice_id uuid references public.invoices (id) on delete set null,
  payroll_id uuid references public.staff_payroll (id) on delete set null,
  extra_request_id uuid,
  note text check (note is null or char_length(note) <= 200),
  idempotency_key uuid unique,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.users (id) on delete set null,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 200),
  constraint kitchen_charges_person check ((consumer = 'child') = (child_id is not null) and (consumer = 'staff') = (staff_user_id is not null))
);
create index if not exists idx_kitchen_charges_nursery on public.kitchen_charges (nursery_id, charged_on desc);
create index if not exists idx_kitchen_charges_child on public.kitchen_charges (child_id, charged_on desc) where child_id is not null;
create index if not exists idx_kitchen_charges_staff_open on public.kitchen_charges (staff_user_id, charged_on)
  where staff_user_id is not null and payroll_id is null and cancelled_at is null;
alter table public.kitchen_charges enable row level security;
drop policy if exists kitchen_charges_read on public.kitchen_charges;
create policy kitchen_charges_read on public.kitchen_charges for select to authenticated
  using (public.menu_can_edit(nursery_id) or staff_user_id = auth.uid());

-- What the payslip deducted for food and drinks.
alter table public.staff_payroll add column if not exists kitchen_deductions numeric(12, 2) not null default 0;

-- -----------------------------------------------------------------------------------------------
-- 4. Extra requests
create table if not exists public.child_extra_requests (
  id uuid primary key default gen_random_uuid(),
  nursery_id uuid not null references public.nurseries (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  item_id uuid references public.inventory (id) on delete set null,
  item_name text not null,
  quantity numeric(10, 2) not null check (quantity > 0 and quantity <= 10),
  for_date date not null,
  source text not null check (source in ('parent', 'staff')),
  status text not null check (status in ('waiting_parent', 'approved', 'declined', 'served', 'cancelled', 'expired')),
  requested_by uuid references public.users (id) on delete set null,
  decided_by uuid references public.users (id) on delete set null,
  decided_at timestamptz,
  served_by uuid references public.users (id) on delete set null,
  served_at timestamptz,
  charge_id uuid references public.kitchen_charges (id) on delete set null,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_child_extra_requests_day on public.child_extra_requests (nursery_id, for_date);
create index if not exists idx_child_extra_requests_child on public.child_extra_requests (child_id, for_date desc);
alter table public.child_extra_requests enable row level security;
drop policy if exists child_extra_requests_read on public.child_extra_requests;
create policy child_extra_requests_read on public.child_extra_requests for select to authenticated
  using (public.menu_can_edit(nursery_id) or public.rls_staff_can_access_child(child_id) or public.parent_can_access_child(child_id));

alter table public.kitchen_charges drop constraint if exists kitchen_charges_extra_request_fk;
alter table public.kitchen_charges
  add constraint kitchen_charges_extra_request_fk foreign key (extra_request_id) references public.child_extra_requests (id) on delete set null;

-- -----------------------------------------------------------------------------------------------
-- Helpers (not callable by the app)

-- The best discount for a taking on a day (null when none applies).
create or replace function public.kitchen_best_discount(
  p_nursery_id uuid, p_item_id uuid, p_consumer text, p_child_id uuid, p_staff_user_id uuid, p_day date
)
returns public.kitchen_discounts
language sql
stable
security definer
set search_path = public
as $$
  select d.*
    from public.kitchen_discounts d
   where d.nursery_id = p_nursery_id
     and d.active
     and (d.item_id is null or d.item_id = p_item_id)
     and (d.starts_on is null or d.starts_on <= p_day)
     and (d.ends_on is null or d.ends_on >= p_day)
     and (
       (p_consumer = 'staff' and (d.audience = 'all_staff' or (d.audience = 'staff_member' and d.staff_user_id = p_staff_user_id)))
       or (p_consumer = 'child' and (d.audience = 'all_children' or (d.audience = 'child' and d.child_id = p_child_id)))
     )
   order by d.percent desc, d.created_at
   limit 1
$$;

-- Whether the parents agreed at enrollment to extras of this kind.
create or replace function public.child_accepts_extra(p_child_id uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case when p_kind = 'meal' then (c.daily_care_preferences ->> 'accepts_extra_meals') = 'true'
                else (c.daily_care_preferences ->> 'accepts_extra_snacks') = 'true' end
      from public.children c
     where c.id = p_child_id and jsonb_typeof(c.daily_care_preferences) = 'object'
  ), false)
$$;

-- The food allergens of an item the child is allergic to.
create or replace function public.kitchen_item_allergy_conflicts(p_item_id uuid, p_child_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct x order by x), '{}')
    from public.inventory i
   cross join lateral unnest(i.food_allergens) x
   where i.id = p_item_id
     and exists (select 1 from public.child_allergies a where a.child_id = p_child_id and x = any (a.food_allergens))
$$;

-- Puts a child's charge on the family's pending "food extras" invoice for its month, or the next
-- month's once that month's invoice is no longer pending. Returns the invoice (null without a parent).
create or replace function public.kitchen_bill_child_charge(p_charge public.kitchen_charges)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent uuid;
  v_month date := date_trunc('month', p_charge.charged_on)::date;
  v_invoice public.invoices%rowtype;
  v_due_days integer;
  v_line jsonb;
begin
  select pc.parent_id into v_parent
    from public.parent_children pc
   where pc.child_id = p_charge.child_id
   order by pc.is_primary desc nulls last, pc.created_at
   limit 1;
  if v_parent is null then
    return null;
  end if;
  select coalesce(ns.invoice_due_days, 7) into v_due_days from public.nursery_settings ns where ns.nursery_id = p_charge.nursery_id;

  -- A month whose invoice was already settled takes no more lines: move on to the next month.
  for i in 0..12 loop
    select * into v_invoice
      from public.invoices iv
     where iv.nursery_id = p_charge.nursery_id and iv.parent_id = v_parent and iv.invoice_type = 'food_extras'
       and iv.line_items_json ->> 'child_id' = p_charge.child_id::text
       and iv.line_items_json ->> 'billing_month' = to_char(v_month, 'YYYY-MM')
     order by (iv.status = 'pending') desc, iv.created_at desc
     limit 1
     for update;
    exit when v_invoice.id is null or v_invoice.status = 'pending';
    v_month := (v_month + interval '1 month')::date;
  end loop;

  v_line := jsonb_build_object(
    'kind', 'food_extra', 'charge_id', p_charge.id, 'date', p_charge.charged_on,
    'name_ar', p_charge.item_name, 'name_en', p_charge.item_name, 'unit', p_charge.unit,
    'quantity', p_charge.quantity, 'unit_price', p_charge.unit_price, 'unitPrice', p_charge.unit_price,
    'gross', p_charge.gross, 'discount_name_ar', p_charge.discount_name_ar, 'discount_name_en', p_charge.discount_name_en,
    'discount_percent', p_charge.discount_percent, 'discount_amount', p_charge.discount_amount, 'total', p_charge.net
  );

  if v_invoice.id is not null then
    update public.invoices
       set amount = amount + p_charge.net,
           line_items_json = jsonb_set(line_items_json, '{items}', coalesce(line_items_json -> 'items', '[]'::jsonb) || jsonb_build_array(v_line)),
           updated_at = now()
     where id = v_invoice.id;
    return v_invoice.id;
  end if;

  insert into public.invoices (nursery_id, parent_id, amount, due_date, status, invoice_type, line_items_json)
  values (
    p_charge.nursery_id, v_parent, p_charge.net,
    greatest((v_month + interval '1 month')::date, current_date) + v_due_days,
    'pending', 'food_extras',
    jsonb_build_object('child_id', p_charge.child_id, 'billing_month', to_char(v_month, 'YYYY-MM'), 'items', jsonb_build_array(v_line))
  )
  returning id into v_invoice.id;
  return v_invoice.id;
end;
$$;

-- Takes an item out of stock and charges it. No permission check: the callers check.
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
  if v_item.id is null or v_item.category not in ('food', 'drinks', 'kitchen_supplies') then
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
    if v_item.extra_kind is null or v_item.child_price is null then
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
  insert into public.inventory_movements (nursery_id, item_id, kind, change, quantity_after, note, created_by)
  values (v_item.nursery_id, v_item.id, 'charged', -p_quantity, v_after, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
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

revoke execute on function public.kitchen_best_discount(uuid, uuid, text, uuid, uuid, date) from public, anon, authenticated;
revoke execute on function public.child_accepts_extra(uuid, text) from public, anon, authenticated;
revoke execute on function public.kitchen_item_allergy_conflicts(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.kitchen_bill_child_charge(public.kitchen_charges) from public, anon, authenticated;
revoke execute on function public.kitchen_charge_core(uuid, numeric, text, uuid, uuid, text, uuid, uuid) from public, anon, authenticated;

-- Whether the caller may give extras to a child: the kitchen's editors, and the staff of the child's class.
create or replace function public.kitchen_can_serve_child(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.children c
     where c.id = p_child_id
       and (public.menu_can_edit(c.nursery_id)
            or (public.current_user_role() = 'teacher' and public.rls_staff_can_access_child(c.id)))
  )
$$;
revoke execute on function public.kitchen_can_serve_child(uuid) from public, anon, authenticated;

-- Tells the parents of a child.
create or replace function public.kitchen_notify_parents(p_child_id uuid, p_type text, p_params jsonb, p_urgency text default 'normal')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nursery uuid := (select nursery_id from public.children where id = p_child_id);
begin
  perform public.notify_users(
    array(select pc.parent_id from public.parent_children pc where pc.child_id = p_child_id),
    v_nursery, p_type, p_type, p_params, '/parent/meals?view=extras', p_urgency, null
  );
end;
$$;
revoke execute on function public.kitchen_notify_parents(uuid, text, jsonb, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------------------------
-- Items: details and prices (replaces the earlier save_kitchen_item; the new fields default to none)
drop function if exists public.save_kitchen_item(uuid, uuid, text, text, text, numeric, date);
create or replace function public.save_kitchen_item(
  p_nursery_id uuid, p_id uuid, p_name text, p_category text, p_unit text, p_low_stock_level numeric, p_expires_on date,
  p_unit_cost numeric default null, p_child_price numeric default null, p_staff_price numeric default null,
  p_pack_size numeric default null, p_pack_unit text default null, p_extra_kind text default null,
  p_food_allergens text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allergens text[];
begin
  if not public.menu_can_edit(p_nursery_id) then
    raise exception 'menu_forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 80
     or coalesce(p_category, '') not in ('food', 'drinks', 'kitchen_supplies')
     or char_length(btrim(coalesce(p_unit, ''))) not between 1 and 20
     or p_low_stock_level is null or p_low_stock_level < 0
     or (p_unit_cost is not null and p_unit_cost not between 0 and 100000)
     or (p_child_price is not null and p_child_price not between 0 and 100000)
     or (p_staff_price is not null and p_staff_price not between 0 and 100000)
     or (p_pack_size is not null and p_pack_size not between 1 and 10000)
     or ((p_pack_size is null) <> (nullif(btrim(coalesce(p_pack_unit, '')), '') is null))
     or (p_pack_unit is not null and char_length(btrim(p_pack_unit)) > 20)
     or (p_extra_kind is not null and p_extra_kind not in ('meal', 'drink', 'snack'))
     or (p_extra_kind is not null and p_child_price is null) then
    raise exception 'kitchen_item_invalid' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_food_allergens, '{}')) a where a not in (select code from public.food_allergens)) then
    raise exception 'kitchen_item_invalid' using errcode = '22023';
  end if;
  v_allergens := array(select fa.code from public.food_allergens fa where fa.code = any (coalesce(p_food_allergens, '{}')) order by fa.sort_order);
  if p_id is null then
    insert into public.inventory (nursery_id, item_name, category, quantity, unit, low_stock_threshold, reorder_level, expires_on,
                                  unit_cost, child_price, staff_price, pack_size, pack_unit, extra_kind, food_allergens)
    values (p_nursery_id, btrim(p_name), p_category, 0, btrim(p_unit), p_low_stock_level, p_low_stock_level, p_expires_on,
            p_unit_cost, p_child_price, p_staff_price, p_pack_size, nullif(btrim(coalesce(p_pack_unit, '')), ''), p_extra_kind, v_allergens);
  else
    update public.inventory
       set item_name = btrim(p_name), category = p_category, unit = btrim(p_unit),
           low_stock_threshold = p_low_stock_level, reorder_level = p_low_stock_level, expires_on = p_expires_on,
           unit_cost = p_unit_cost, child_price = p_child_price, staff_price = p_staff_price,
           pack_size = p_pack_size, pack_unit = nullif(btrim(coalesce(p_pack_unit, '')), ''), extra_kind = p_extra_kind,
           food_allergens = v_allergens, updated_at = now()
     where id = p_id and nursery_id = p_nursery_id and category in ('food', 'drinks', 'kitchen_supplies');
    if not found then
      raise exception 'kitchen_item_not_found' using errcode = 'P0001';
    end if;
  end if;
  return public.get_kitchen_stock(p_nursery_id);
end;
$$;
revoke execute on function public.save_kitchen_item(uuid, uuid, text, text, text, numeric, date, numeric, numeric, numeric, numeric, text, text, text[]) from public, anon;
grant execute on function public.save_kitchen_item(uuid, uuid, text, text, text, numeric, date, numeric, numeric, numeric, numeric, text, text, text[]) to authenticated, service_role;

-- The kitchen's items with their prices, and their latest changes (adds the new fields).
create or replace function public.get_kitchen_stock(p_nursery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.menu_viewer_kind(p_nursery_id) is distinct from 'staff' then
    raise exception 'menu_forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'can_edit', public.menu_can_edit(p_nursery_id),
    'today', public.nursery_today(p_nursery_id),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'name', i.item_name, 'category', i.category, 'quantity', i.quantity, 'unit', i.unit,
               'low_stock_level', coalesce(i.low_stock_threshold, i.reorder_level, 0), 'expires_on', i.expires_on,
               'last_restocked', i.last_restocked, 'updated_at', i.updated_at,
               'unit_cost', i.unit_cost, 'child_price', i.child_price, 'staff_price', i.staff_price,
               'pack_size', i.pack_size, 'pack_unit', i.pack_unit, 'extra_kind', i.extra_kind, 'food_allergens', to_jsonb(i.food_allergens))
             order by i.item_name)
        from public.inventory i
       where i.nursery_id = p_nursery_id and i.category in ('food', 'drinks', 'kitchen_supplies')
    ), '[]'::jsonb),
    'movements', coalesce((
      select jsonb_agg(m.row order by m.at desc)
        from (
          select jsonb_build_object('id', mv.id, 'item_id', mv.item_id, 'item_name', i.item_name, 'unit', i.unit, 'kind', mv.kind,
                                    'change', mv.change, 'quantity_after', mv.quantity_after, 'note', mv.note,
                                    'by_ar', u.name_ar, 'by_en', u.name_en, 'at', mv.created_at,
                                    'for_ar', coalesce(ch.full_name_ar, su.name_ar), 'for_en', coalesce(ch.full_name_en, su.name_en)) as row,
                 mv.created_at as at
            from public.inventory_movements mv
            join public.inventory i on i.id = mv.item_id
            left join public.users u on u.id = mv.created_by
            left join public.kitchen_charges kc on kc.movement_id = mv.id
            left join public.children ch on ch.id = kc.child_id
            left join public.users su on su.id = kc.staff_user_id
           where mv.nursery_id = p_nursery_id
           order by mv.created_at desc
           limit 40
        ) m
    ), '[]'::jsonb)
  );
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- Staff takings
--
-- A member of staff takes an item for themselves, or the kitchen's editors record one for anyone on
-- the staff. Returns the charge.
create or replace function public.charge_staff_kitchen_item(
  p_item_id uuid, p_quantity numeric, p_staff_user_id uuid default null, p_note text default null, p_idempotency_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nursery uuid := (select nursery_id from public.inventory where id = p_item_id);
  v_person uuid := coalesce(p_staff_user_id, auth.uid());
begin
  if v_nursery is null then
    raise exception 'kitchen_item_not_found' using errcode = 'P0001';
  end if;
  if not (
    public.menu_can_edit(v_nursery)
    or (v_person = auth.uid() and exists (select 1 from public.users u where u.id = auth.uid() and u.nursery_id = v_nursery and u.role <> 'parent'))
  ) then
    raise exception 'kitchen_forbidden' using errcode = '42501';
  end if;
  return public.kitchen_charge_core(p_item_id, p_quantity, 'staff', null, v_person, p_note, p_idempotency_key, null);
end;
$$;
revoke execute on function public.charge_staff_kitchen_item(uuid, numeric, uuid, text, uuid) from public, anon;
grant execute on function public.charge_staff_kitchen_item(uuid, numeric, uuid, text, uuid) to authenticated, service_role;

-- Cancels a charge: the stock comes back and the line leaves a pending invoice. A charge already
-- paid, or deducted from a salary, cannot be cancelled.
create or replace function public.cancel_kitchen_charge(p_charge_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_charge public.kitchen_charges%rowtype;
  v_invoice public.invoices%rowtype;
  v_after numeric;
  v_items jsonb;
begin
  select * into v_charge from public.kitchen_charges where id = p_charge_id for update;
  if v_charge.id is null or not public.menu_can_edit(v_charge.nursery_id) then
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
    insert into public.inventory_movements (nursery_id, item_id, kind, change, quantity_after, note, created_by)
    values (v_charge.nursery_id, v_charge.item_id, 'returned', v_charge.quantity, v_after, btrim(p_reason), auth.uid());
  end if;

  update public.kitchen_charges
     set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason)
   where id = v_charge.id;
  update public.child_extra_requests set status = 'cancelled', updated_at = now()
   where id = v_charge.extra_request_id and status = 'served';
end;
$$;
revoke execute on function public.cancel_kitchen_charge(uuid, text) from public, anon;
grant execute on function public.cancel_kitchen_charge(uuid, text) to authenticated, service_role;

-- A payslip deducts its member of staff's open kitchen charges up to its end date, oldest first, as
-- far as the pay allows; the rest stay open for the next one.
create or replace function public.staff_payroll_settle_kitchen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select user_id from public.staff_profiles where id = new.staff_id);
  v_room numeric := greatest(coalesce(new.base_salary, 0) + coalesce(new.bonuses, 0) - coalesce(new.deductions, 0), 0);
  v_total numeric := 0;
  r record;
begin
  if v_user is null then
    return new;
  end if;
  for r in
    select kc.id, kc.net from public.kitchen_charges kc
     where kc.staff_user_id = v_user and kc.nursery_id = new.nursery_id
       and kc.payroll_id is null and kc.cancelled_at is null and kc.charged_on <= new.pay_period_end
     order by kc.charged_on, kc.created_at
     for update
  loop
    exit when v_total + r.net > v_room;
    update public.kitchen_charges set payroll_id = new.id where id = r.id;
    v_total := v_total + r.net;
  end loop;
  if v_total > 0 then
    update public.staff_payroll
       set kitchen_deductions = v_total, deductions = deductions + v_total
     where id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_staff_payroll_settle_kitchen on public.staff_payroll;
create trigger trg_staff_payroll_settle_kitchen
  after insert on public.staff_payroll
  for each row execute function public.staff_payroll_settle_kitchen();

-- -----------------------------------------------------------------------------------------------
-- Children's extras

-- A teacher (or the kitchen) gives a child an extra: served now when the parents agreed to extras of
-- its kind at enrollment, otherwise it waits for the parent. Returns { status, request_id, charge_id }.
create or replace function public.give_child_extra(
  p_child_id uuid, p_item_id uuid, p_quantity numeric, p_note text default null, p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child public.children%rowtype;
  v_item public.inventory%rowtype;
  v_day date;
  v_request uuid;
  v_charge uuid;
  v_existing public.kitchen_charges%rowtype;
  v_conflicts text[];
  v_params jsonb;
begin
  select * into v_child from public.children where id = p_child_id;
  if v_child.id is null or not public.kitchen_can_serve_child(p_child_id) then
    raise exception 'kitchen_forbidden' using errcode = '42501';
  end if;
  if p_idempotency_key is not null then
    select * into v_existing from public.kitchen_charges where idempotency_key = p_idempotency_key;
    if v_existing.id is not null then
      return jsonb_build_object('status', 'served', 'request_id', v_existing.extra_request_id, 'charge_id', v_existing.id);
    end if;
  end if;
  select * into v_item from public.inventory where id = p_item_id and nursery_id = v_child.nursery_id;
  if v_item.id is null or v_item.extra_kind is null or v_item.child_price is null then
    raise exception 'kitchen_not_for_sale' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 10 or p_quantity <> round(p_quantity, 2) then
    raise exception 'kitchen_invalid_quantity' using errcode = '22023';
  end if;
  if p_note is not null and char_length(btrim(p_note)) > 200 then
    raise exception 'kitchen_invalid_note' using errcode = '22023';
  end if;
  v_conflicts := public.kitchen_item_allergy_conflicts(v_item.id, p_child_id);
  if cardinality(v_conflicts) > 0 then
    raise exception 'kitchen_allergy' using errcode = 'P0001', detail = array_to_string(v_conflicts, ',');
  end if;
  v_day := public.nursery_today(v_child.nursery_id);
  v_params := jsonb_build_object(
    'child', public.i18n_names(v_child.full_name_ar, v_child.full_name_en), 'item', v_item.item_name,
    'quantity', p_quantity, 'amount', round(v_item.child_price * p_quantity, 2)
  );

  if public.child_accepts_extra(p_child_id, v_item.extra_kind) then
    insert into public.child_extra_requests (nursery_id, child_id, item_id, item_name, quantity, for_date, source, status, requested_by, served_by, served_at, note)
    values (v_child.nursery_id, p_child_id, v_item.id, v_item.item_name, p_quantity, v_day, 'staff', 'served', auth.uid(), auth.uid(), now(), nullif(btrim(coalesce(p_note, '')), ''))
    returning id into v_request;
    v_charge := public.kitchen_charge_core(v_item.id, p_quantity, 'child', p_child_id, null, p_note, p_idempotency_key, v_request);
    update public.child_extra_requests set charge_id = v_charge where id = v_request;
    perform public.kitchen_notify_parents(p_child_id, 'extra_served',
      v_params || jsonb_build_object('amount', (select net from public.kitchen_charges where id = v_charge)));
    return jsonb_build_object('status', 'served', 'request_id', v_request, 'charge_id', v_charge);
  end if;

  if (select coalesce(quantity, 0) from public.inventory where id = v_item.id) < p_quantity then
    raise exception 'kitchen_not_enough' using errcode = 'P0001', detail = (select coalesce(quantity, 0) from public.inventory where id = v_item.id)::text;
  end if;
  insert into public.child_extra_requests (nursery_id, child_id, item_id, item_name, quantity, for_date, source, status, requested_by, note)
  values (v_child.nursery_id, p_child_id, v_item.id, v_item.item_name, p_quantity, v_day, 'staff', 'waiting_parent', auth.uid(), nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_request;
  perform public.kitchen_notify_parents(p_child_id, 'extra_needs_approval', v_params, 'high');
  return jsonb_build_object('status', 'waiting_parent', 'request_id', v_request, 'charge_id', null);
end;
$$;
revoke execute on function public.give_child_extra(uuid, uuid, numeric, text, uuid) from public, anon;
grant execute on function public.give_child_extra(uuid, uuid, numeric, text, uuid) to authenticated, service_role;

-- A parent orders an extra for their child on one or more open days (today to 30 days ahead).
create or replace function public.order_child_extra(p_child_id uuid, p_item_id uuid, p_quantity numeric, p_dates date[], p_note text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child public.children%rowtype;
  v_item public.inventory%rowtype;
  v_today date;
  v_day date;
  v_count integer := 0;
  v_conflicts text[];
begin
  select * into v_child from public.children where id = p_child_id;
  if v_child.id is null or v_child.status <> 'active' or not public.parent_can_access_child(p_child_id) or public.current_user_role() <> 'parent' then
    raise exception 'kitchen_forbidden' using errcode = '42501';
  end if;
  select * into v_item from public.inventory where id = p_item_id and nursery_id = v_child.nursery_id;
  if v_item.id is null or v_item.extra_kind is null or v_item.child_price is null then
    raise exception 'kitchen_not_for_sale' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 10 or p_quantity <> round(p_quantity, 2) then
    raise exception 'kitchen_invalid_quantity' using errcode = '22023';
  end if;
  if p_note is not null and char_length(btrim(p_note)) > 200 then
    raise exception 'kitchen_invalid_note' using errcode = '22023';
  end if;
  v_conflicts := public.kitchen_item_allergy_conflicts(v_item.id, p_child_id);
  if cardinality(v_conflicts) > 0 then
    raise exception 'kitchen_allergy' using errcode = 'P0001', detail = array_to_string(v_conflicts, ',');
  end if;
  v_today := public.nursery_today(v_child.nursery_id);
  if p_dates is null or cardinality(p_dates) = 0 or cardinality(p_dates) > 31 then
    raise exception 'kitchen_invalid_dates' using errcode = '22023';
  end if;
  foreach v_day in array p_dates loop
    if v_day < v_today or v_day > v_today + 30 or not public.attendance_is_school_day(v_child.nursery_id, v_day) then
      raise exception 'kitchen_invalid_dates' using errcode = '22023';
    end if;
  end loop;
  foreach v_day in array (select array_agg(distinct d order by d) from unnest(p_dates) d) loop
    insert into public.child_extra_requests (nursery_id, child_id, item_id, item_name, quantity, for_date, source, status, requested_by, decided_by, decided_at, note)
    values (v_child.nursery_id, p_child_id, v_item.id, v_item.item_name, p_quantity, v_day, 'parent', 'approved', auth.uid(), auth.uid(), now(), nullif(btrim(coalesce(p_note, '')), ''));
    v_count := v_count + 1;
  end loop;
  if v_today = any (p_dates) then
    perform public.notify_child_class_duty(p_child_id, 'extra_ordered', 'extra_ordered',
      jsonb_build_object('child', public.i18n_names(v_child.full_name_ar, v_child.full_name_en), 'item', v_item.item_name, 'quantity', p_quantity),
      '/teacher/meals', 'normal');
  end if;
  return v_count;
end;
$$;
revoke execute on function public.order_child_extra(uuid, uuid, numeric, date[], text) from public, anon;
grant execute on function public.order_child_extra(uuid, uuid, numeric, date[], text) to authenticated, service_role;

-- The parent answers a teacher's extra: yes (it can then be served today) or no.
create or replace function public.decide_child_extra(p_request_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.child_extra_requests%rowtype;
  v_child public.children%rowtype;
begin
  select * into v_request from public.child_extra_requests where id = p_request_id for update;
  if v_request.id is null or public.current_user_role() <> 'parent' or not public.parent_can_access_child(v_request.child_id) then
    raise exception 'kitchen_forbidden' using errcode = '42501';
  end if;
  if v_request.status <> 'waiting_parent' or v_request.for_date < public.nursery_today(v_request.nursery_id) then
    raise exception 'kitchen_request_closed' using errcode = 'P0001';
  end if;
  update public.child_extra_requests
     set status = case when p_approve then 'approved' else 'declined' end, decided_by = auth.uid(), decided_at = now(), updated_at = now()
   where id = v_request.id;
  select * into v_child from public.children where id = v_request.child_id;
  if v_request.requested_by is not null then
    perform public.notify_users(
      array[v_request.requested_by], v_request.nursery_id,
      case when p_approve then 'extra_approved' else 'extra_declined' end,
      case when p_approve then 'extra_approved' else 'extra_declined' end,
      jsonb_build_object('child', public.i18n_names(v_child.full_name_ar, v_child.full_name_en), 'item', v_request.item_name),
      '/teacher/meals', case when p_approve then 'high' else 'normal' end, null
    );
  end if;
end;
$$;
revoke execute on function public.decide_child_extra(uuid, boolean) from public, anon;
grant execute on function public.decide_child_extra(uuid, boolean) to authenticated, service_role;

-- Staff serve an approved extra on its day: taken out of stock and charged.
create or replace function public.serve_child_extra(p_request_id uuid, p_idempotency_key uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.child_extra_requests%rowtype;
  v_child public.children%rowtype;
  v_charge uuid;
begin
  select * into v_request from public.child_extra_requests where id = p_request_id for update;
  if v_request.id is null or not public.kitchen_can_serve_child(v_request.child_id) then
    raise exception 'kitchen_forbidden' using errcode = '42501';
  end if;
  if v_request.status = 'served' then
    return v_request.charge_id;
  end if;
  if v_request.status <> 'approved' or v_request.for_date <> public.nursery_today(v_request.nursery_id) then
    raise exception 'kitchen_request_closed' using errcode = 'P0001';
  end if;
  if v_request.item_id is null then
    raise exception 'kitchen_item_not_found' using errcode = 'P0001';
  end if;
  v_charge := public.kitchen_charge_core(v_request.item_id, v_request.quantity, 'child', v_request.child_id, null, v_request.note, p_idempotency_key, v_request.id);
  update public.child_extra_requests
     set status = 'served', served_by = auth.uid(), served_at = now(), charge_id = v_charge, updated_at = now()
   where id = v_request.id;
  select * into v_child from public.children where id = v_request.child_id;
  perform public.kitchen_notify_parents(v_request.child_id, 'extra_served', jsonb_build_object(
    'child', public.i18n_names(v_child.full_name_ar, v_child.full_name_en), 'item', v_request.item_name,
    'quantity', v_request.quantity, 'amount', (select net from public.kitchen_charges where id = v_charge)));
  return v_charge;
end;
$$;
revoke execute on function public.serve_child_extra(uuid, uuid) from public, anon;
grant execute on function public.serve_child_extra(uuid, uuid) to authenticated, service_role;

-- A request not served yet is cancelled: by the parent who can see it, or by staff.
create or replace function public.cancel_child_extra(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.child_extra_requests%rowtype;
begin
  select * into v_request from public.child_extra_requests where id = p_request_id for update;
  if v_request.id is null or not (
    (public.current_user_role() = 'parent' and public.parent_can_access_child(v_request.child_id))
    or public.kitchen_can_serve_child(v_request.child_id)
  ) then
    raise exception 'kitchen_forbidden' using errcode = '42501';
  end if;
  if v_request.status not in ('waiting_parent', 'approved') then
    raise exception 'kitchen_request_closed' using errcode = 'P0001';
  end if;
  update public.child_extra_requests set status = 'cancelled', updated_at = now() where id = v_request.id;
end;
$$;
revoke execute on function public.cancel_child_extra(uuid) from public, anon;
grant execute on function public.cancel_child_extra(uuid) to authenticated, service_role;

-- Every hour: requests whose day is over and were not served expire.
create or replace function public.run_child_extras_expiry()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.child_extra_requests r
     set status = 'expired', updated_at = now()
   where r.status in ('waiting_parent', 'approved')
     and r.for_date < public.nursery_today(r.nursery_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.run_child_extras_expiry() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'child-extras-expiry';
    perform cron.schedule('child-extras-expiry', '5 * * * *', 'select public.run_child_extras_expiry()');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- Discounts
create or replace function public.save_kitchen_discount(
  p_nursery_id uuid, p_id uuid, p_name_ar text, p_name_en text, p_audience text, p_person_id uuid,
  p_item_id uuid, p_percent numeric, p_starts_on date, p_ends_on date, p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.menu_can_edit(p_nursery_id) then
    raise exception 'kitchen_forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name_ar, ''))) not between 1 and 80 or char_length(btrim(coalesce(p_name_en, ''))) not between 1 and 80
     or coalesce(p_audience, '') not in ('all_staff', 'all_children', 'staff_member', 'child')
     or p_percent is null or p_percent <= 0 or p_percent > 100
     or (p_ends_on is not null and p_starts_on is not null and p_ends_on < p_starts_on)
     or (p_audience in ('staff_member', 'child') and p_person_id is null) then
    raise exception 'kitchen_discount_invalid' using errcode = '22023';
  end if;
  if p_audience = 'staff_member' and not exists (select 1 from public.users u where u.id = p_person_id and u.nursery_id = p_nursery_id and u.role <> 'parent') then
    raise exception 'kitchen_discount_invalid' using errcode = '22023';
  end if;
  if p_audience = 'child' and not exists (select 1 from public.children c where c.id = p_person_id and c.nursery_id = p_nursery_id) then
    raise exception 'kitchen_discount_invalid' using errcode = '22023';
  end if;
  if p_item_id is not null and not exists (select 1 from public.inventory i where i.id = p_item_id and i.nursery_id = p_nursery_id) then
    raise exception 'kitchen_discount_invalid' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.kitchen_discounts (nursery_id, name_ar, name_en, audience, staff_user_id, child_id, item_id, percent, starts_on, ends_on, active, created_by)
    values (p_nursery_id, btrim(p_name_ar), btrim(p_name_en), p_audience,
            case when p_audience = 'staff_member' then p_person_id end, case when p_audience = 'child' then p_person_id end,
            p_item_id, round(p_percent, 2), p_starts_on, p_ends_on, coalesce(p_active, true), auth.uid())
    returning id into v_id;
  else
    update public.kitchen_discounts
       set name_ar = btrim(p_name_ar), name_en = btrim(p_name_en), audience = p_audience,
           staff_user_id = case when p_audience = 'staff_member' then p_person_id end,
           child_id = case when p_audience = 'child' then p_person_id end,
           item_id = p_item_id, percent = round(p_percent, 2), starts_on = p_starts_on, ends_on = p_ends_on,
           active = coalesce(p_active, true), updated_at = now()
     where id = p_id and nursery_id = p_nursery_id
    returning id into v_id;
    if v_id is null then
      raise exception 'kitchen_discount_invalid' using errcode = '22023';
    end if;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.save_kitchen_discount(uuid, uuid, text, text, text, uuid, uuid, numeric, date, date, boolean) from public, anon;
grant execute on function public.save_kitchen_discount(uuid, uuid, text, text, text, uuid, uuid, numeric, date, date, boolean) to authenticated, service_role;

-- -----------------------------------------------------------------------------------------------
-- Reading

-- The kitchen's sales for a month: every charge, the discounts, today's extras, and who can be
-- charged (staff; children are searched with search_kitchen_children).
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
  if not public.menu_can_edit(p_nursery_id) then
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
revoke execute on function public.get_kitchen_sales(uuid, date) from public, anon;
grant execute on function public.get_kitchen_sales(uuid, date) to authenticated, service_role;

-- Children of the nursery whose name matches, for the kitchen's pickers (the first 20).
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
  if not public.menu_can_edit(p_nursery_id) then
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
revoke execute on function public.search_kitchen_children(uuid, text) from public, anon;
grant execute on function public.search_kitchen_children(uuid, text) to authenticated, service_role;

-- The extras a child may have, priced for them (with their best discount), and whether each is
-- allowed (allergies) and in stock.
create or replace function public.kitchen_extras_for_child(p_child_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'name', i.item_name, 'unit', i.unit, 'kind', i.extra_kind, 'price', i.child_price,
           'discount_percent', coalesce(d.percent, 0), 'discount_name_ar', d.name_ar, 'discount_name_en', d.name_en,
           'final_price', round(i.child_price * (1 - coalesce(d.percent, 0) / 100), 2),
           'in_stock', coalesce(i.quantity, 0) > 0, 'allergens', to_jsonb(i.food_allergens),
           'conflicts', to_jsonb(public.kitchen_item_allergy_conflicts(i.id, c.id)),
           'pre_approved', public.child_accepts_extra(c.id, i.extra_kind))
         order by array_position(array['meal', 'drink', 'snack'], i.extra_kind), i.item_name), '[]'::jsonb)
    from public.children c
    join public.inventory i on i.nursery_id = c.nursery_id and i.extra_kind is not null and i.child_price is not null
    left join lateral (select * from public.kitchen_best_discount(c.nursery_id, i.id, 'child', c.id, null, public.nursery_today(c.nursery_id))) d on d.id is not null
   where c.id = p_child_id
$$;
revoke execute on function public.kitchen_extras_for_child(uuid) from public, anon, authenticated;

-- A family's extras: each child's menu of extras, their requests (the coming ones and the last 30
-- days), and what waits for the parent's answer.
create or replace function public.get_family_extras()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.current_user_role() <> 'parent' then
    raise exception 'kitchen_forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'child_id', c.id, 'name_ar', c.full_name_ar, 'name_en', c.full_name_en,
             'today', public.nursery_today(c.nursery_id),
             'open_days', (select coalesce(jsonb_agg(d::date order by d), '[]'::jsonb)
                             from generate_series(public.nursery_today(c.nursery_id), public.nursery_today(c.nursery_id) + 30, interval '1 day') d
                            where public.attendance_is_school_day(c.nursery_id, d::date)),
             'accepts_meals', public.child_accepts_extra(c.id, 'meal'), 'accepts_snacks', public.child_accepts_extra(c.id, 'snack'),
             'extras', public.kitchen_extras_for_child(c.id),
             'requests', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', r.id, 'item_name', r.item_name, 'quantity', r.quantity, 'for_date', r.for_date,
                        'source', r.source, 'status', r.status, 'note', r.note,
                        'amount', (select net from public.kitchen_charges k where k.id = r.charge_id),
                        'by_ar', u.name_ar, 'by_en', u.name_en)
                      order by r.for_date desc, r.created_at desc)
                 from public.child_extra_requests r
                 left join public.users u on u.id = r.requested_by
                where r.child_id = c.id and r.for_date >= public.nursery_today(c.nursery_id) - 30
             ), '[]'::jsonb))
           order by c.full_name_en)
      from public.children c
     where c.status = 'active'
       and c.id in (select pc.child_id from public.parent_children pc where pc.parent_id = auth.uid())
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.get_family_extras() from public, anon;
grant execute on function public.get_family_extras() to authenticated, service_role;

-- A teacher's extras for today: the children of the classes they look after today, each with
-- today's requests, whether the parents agreed to extras, and the extras they may have.
create or replace function public.get_class_extras()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_today date;
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user.id is null or v_user.role = 'parent' or v_user.nursery_id is null then
    raise exception 'kitchen_forbidden' using errcode = '42501';
  end if;
  v_today := public.nursery_today(v_user.nursery_id);
  return jsonb_build_object(
    'today', v_today,
    'children', coalesce((
      select jsonb_agg(jsonb_build_object(
               'child_id', c.id, 'name_ar', c.full_name_ar, 'name_en', c.full_name_en,
               'class_ar', cl.name_ar, 'class_en', cl.name_en,
               'here', exists (select 1 from public.attendance_records ar where ar.child_id = c.id and ar.attendance_date = v_today and ar.check_in is not null and ar.check_out is null),
               'accepts_meals', public.child_accepts_extra(c.id, 'meal'), 'accepts_snacks', public.child_accepts_extra(c.id, 'snack'),
               'requests', coalesce((
                 select jsonb_agg(jsonb_build_object('id', r.id, 'item_name', r.item_name, 'quantity', r.quantity, 'source', r.source, 'status', r.status, 'note', r.note)
                                  order by r.created_at)
                   from public.child_extra_requests r where r.child_id = c.id and r.for_date = v_today
               ), '[]'::jsonb))
             order by cl.name_en, c.full_name_en)
        from public.children c
        join public.classes cl on cl.id = c.class_id and cl.deleted_at is null
       where c.status = 'active'
         and exists (select 1 from public.class_duty_teachers(cl.id, v_today) d where d.user_id = v_user.id)
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.item_name, 'unit', i.unit, 'kind', i.extra_kind, 'price', i.child_price,
                                          'in_stock', coalesce(i.quantity, 0) > 0, 'allergens', to_jsonb(i.food_allergens))
                       order by array_position(array['meal', 'drink', 'snack'], i.extra_kind), i.item_name)
        from public.inventory i
       where i.nursery_id = v_user.nursery_id and i.extra_kind is not null and i.child_price is not null
    ), '[]'::jsonb),
    'allergies', coalesce((
      select jsonb_object_agg(x.child_id, x.foods)
        from (
          select a.child_id, jsonb_agg(distinct f) as foods
            from public.child_allergies a
            join public.children c on c.id = a.child_id and c.nursery_id = v_user.nursery_id
           cross join lateral unnest(a.food_allergens) f
           group by a.child_id
        ) x
    ), '{}'::jsonb)
  );
end;
$$;
revoke execute on function public.get_class_extras() from public, anon;
grant execute on function public.get_class_extras() to authenticated, service_role;

-- A member of staff's food account: the month's charges, what is still open (deducted from the next
-- payslip), and the items they may take.
create or replace function public.get_my_kitchen_account(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_from date := date_trunc('month', p_month)::date;
  v_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  select * into v_user from public.users where id = auth.uid();
  if v_user.id is null or v_user.role = 'parent' or v_user.nursery_id is null then
    raise exception 'kitchen_forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'today', public.nursery_today(v_user.nursery_id),
    'month', to_char(v_from, 'YYYY-MM'),
    'open_total', coalesce((select sum(net) from public.kitchen_charges where staff_user_id = v_user.id and payroll_id is null and cancelled_at is null), 0),
    'charges', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', kc.id, 'item_name', kc.item_name, 'unit', kc.unit, 'quantity', kc.quantity, 'unit_price', kc.unit_price,
               'gross', kc.gross, 'discount_name_ar', kc.discount_name_ar, 'discount_name_en', kc.discount_name_en,
               'discount_percent', kc.discount_percent, 'discount_amount', kc.discount_amount, 'net', kc.net,
               'charged_on', kc.charged_on, 'created_at', kc.created_at,
               'billing', case when kc.cancelled_at is not null then 'cancelled' when kc.payroll_id is not null then 'deducted' else 'open' end,
               'payslip_month', (select to_char(sp.pay_period_start, 'YYYY-MM') from public.staff_payroll sp where sp.id = kc.payroll_id))
             order by kc.created_at desc)
        from public.kitchen_charges kc
       where kc.staff_user_id = v_user.id and kc.charged_on between v_from and v_to
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'name', i.item_name, 'unit', i.unit, 'price', coalesce(i.staff_price, i.child_price),
               'discount_percent', coalesce(d.percent, 0), 'discount_name_ar', d.name_ar, 'discount_name_en', d.name_en,
               'final_price', round(coalesce(i.staff_price, i.child_price) * (1 - coalesce(d.percent, 0) / 100), 2),
               'in_stock', coalesce(i.quantity, 0) > 0, 'quantity', i.quantity)
             order by i.item_name)
        from public.inventory i
        left join lateral (select * from public.kitchen_best_discount(i.nursery_id, i.id, 'staff', null, v_user.id, public.nursery_today(i.nursery_id))) d on d.id is not null
       where i.nursery_id = v_user.nursery_id and i.category in ('food', 'drinks', 'kitchen_supplies')
         and coalesce(i.staff_price, i.child_price) is not null
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.get_my_kitchen_account(date) from public, anon;
grant execute on function public.get_my_kitchen_account(date) to authenticated, service_role;

-- -----------------------------------------------------------------------------------------------
-- The new invoice type
alter table public.invoices drop constraint if exists invoices_invoice_type_check;
alter table public.invoices
  add constraint invoices_invoice_type_check check (invoice_type in ('monthly', 'event', 'extra_hours', 'other', 'food_extras'));

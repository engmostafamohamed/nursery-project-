-- F&B: monthly meal plans (charged on the child's monthly invoice) and the kitchen's stock.
--
-- Meal plans
--   * nursery_meal_plans: what the nursery offers (e.g. full meals, lunch only): which meals and a
--     monthly price.
--   * child_meal_plans: each child's plan over time (one current plan at most). The plan's name,
--     meals and price are kept as they were when given, so a later price change does not move
--     what a family already pays; "charged = false" means the tuition package includes it.
--   * Billing: when the child's tuition invoice is issued (_generate_tuition_invoice), a charged
--     current plan adds one "meal_plan" line for the same months, at its kept monthly price.
--     The package report (get_package_subscriptions) leaves that line out of the tuition figures.
--   * A child without a running tuition plan has no monthly invoice, so the screen says their meals
--     are not billed automatically.
-- Kitchen stock
--   * The kitchen's items are the inventory rows in the food, drinks and kitchen_supplies
--     categories, now with an expiry date, and every change is logged in inventory_movements
--     (restocked, used, spoiled, counted). Quantities never go below zero.
-- Everything is read and written through the functions below, by staff who may change the menu
-- (menu_can_edit); staff of the nursery may read.

-- -----------------------------------------------------------------------------------------------
-- Meal plans
create table if not exists public.nursery_meal_plans (
  id uuid primary key default gen_random_uuid(),
  nursery_id uuid not null references public.nurseries (id) on delete cascade,
  name_ar text not null check (char_length(btrim(name_ar)) between 1 and 80),
  name_en text not null check (char_length(btrim(name_en)) between 1 and 80),
  meals text[] not null check (cardinality(meals) between 1 and 3 and meals <@ array['breakfast', 'lunch', 'snacks']),
  monthly_price numeric(10, 2) not null check (monthly_price >= 0 and monthly_price <= 100000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_nursery_meal_plans_nursery on public.nursery_meal_plans (nursery_id);
drop trigger if exists trg_nursery_meal_plans_updated_at on public.nursery_meal_plans;
create trigger trg_nursery_meal_plans_updated_at before update on public.nursery_meal_plans
  for each row execute function public.set_updated_at();

create table if not exists public.child_meal_plans (
  id uuid primary key default gen_random_uuid(),
  nursery_id uuid not null references public.nurseries (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  meal_plan_id uuid references public.nursery_meal_plans (id) on delete set null,
  plan_name_ar text not null,
  plan_name_en text not null,
  meals text[] not null,
  monthly_price numeric(10, 2) not null check (monthly_price >= 0),
  charged boolean not null default true,
  started_on date not null,
  ended_on date,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint child_meal_plans_dates check (ended_on is null or ended_on >= started_on)
);

create unique index if not exists child_meal_plans_one_current on public.child_meal_plans (child_id) where ended_on is null;
create index if not exists idx_child_meal_plans_nursery on public.child_meal_plans (nursery_id);
create index if not exists idx_child_meal_plans_plan on public.child_meal_plans (meal_plan_id);

alter table public.nursery_meal_plans enable row level security;
alter table public.child_meal_plans enable row level security;

drop policy if exists nursery_meal_plans_read on public.nursery_meal_plans;
create policy nursery_meal_plans_read on public.nursery_meal_plans for select to authenticated
  using (public.menu_viewer_kind(nursery_id) is not null);

drop policy if exists child_meal_plans_read on public.child_meal_plans;
create policy child_meal_plans_read on public.child_meal_plans for select to authenticated
  using (
    (public.menu_viewer_kind(nursery_id) = 'staff' and public.rls_staff_can_access_child(child_id))
    or public.parent_can_access_child(child_id)
  );

-- The nursery's own calendar day.
create or replace function public.nursery_today(p_nursery_id uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone coalesce((select ns.timezone from public.nursery_settings ns where ns.nursery_id = p_nursery_id), 'Africa/Cairo'))::date
$$;

-- The nursery's meal plans and every child the caller may see with their current plan.
create or replace function public.get_meal_plans(p_nursery_id uuid)
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
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'name_ar', p.name_ar, 'name_en', p.name_en, 'meals', to_jsonb(p.meals),
               'monthly_price', p.monthly_price, 'active', p.active,
               'children', (select count(*) from public.child_meal_plans cm
                             join public.children c on c.id = cm.child_id and c.status = 'active'
                            where cm.meal_plan_id = p.id and cm.ended_on is null))
             order by p.active desc, p.monthly_price desc, p.name_en)
        from public.nursery_meal_plans p where p.nursery_id = p_nursery_id
    ), '[]'::jsonb),
    'children', coalesce((
      select jsonb_agg(jsonb_build_object(
               'child_id', c.id, 'name_ar', c.full_name_ar, 'name_en', c.full_name_en,
               'class_id', c.class_id, 'class_name_ar', cl.name_ar, 'class_name_en', cl.name_en,
               'eats_nursery_meals', coalesce(dp.eats_nursery_meals, true),
               'has_tuition', exists (select 1 from public.child_tuition_subscriptions s where s.child_id = c.id and s.status = 'active'),
               'current', (select jsonb_build_object(
                             'id', cm.id, 'meal_plan_id', cm.meal_plan_id, 'name_ar', cm.plan_name_ar, 'name_en', cm.plan_name_en,
                             'meals', to_jsonb(cm.meals), 'monthly_price', cm.monthly_price, 'charged', cm.charged, 'started_on', cm.started_on)
                             from public.child_meal_plans cm where cm.child_id = c.id and cm.ended_on is null))
             order by c.full_name_en)
        from public.children c
        left join public.classes cl on cl.id = c.class_id
        left join public.child_dietary_preferences dp on dp.child_id = c.id
       where c.nursery_id = p_nursery_id and c.status = 'active' and public.rls_staff_can_access_child(c.id)
    ), '[]'::jsonb)
  );
end;
$$;

-- Adds a meal plan, or changes one (a new price applies to children given the plan afterwards).
create or replace function public.save_nursery_meal_plan(
  p_nursery_id uuid, p_id uuid, p_name_ar text, p_name_en text, p_meals text[], p_monthly_price numeric, p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meals text[];
begin
  if not public.menu_can_edit(p_nursery_id) then
    raise exception 'menu_forbidden' using errcode = '42501';
  end if;
  select coalesce(array_agg(m order by array_position(array['breakfast', 'lunch', 'snacks'], m)), '{}') into v_meals
    from (select distinct unnest(coalesce(p_meals, '{}')) as m) x;
  if char_length(btrim(coalesce(p_name_ar, ''))) not between 1 and 80
     or char_length(btrim(coalesce(p_name_en, ''))) not between 1 and 80
     or cardinality(v_meals) = 0 or not (v_meals <@ array['breakfast', 'lunch', 'snacks'])
     or p_monthly_price is null or p_monthly_price < 0 or p_monthly_price > 100000 then
    raise exception 'meal_plan_invalid' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.nursery_meal_plans (nursery_id, name_ar, name_en, meals, monthly_price, active)
    values (p_nursery_id, btrim(p_name_ar), btrim(p_name_en), v_meals, round(p_monthly_price, 2), coalesce(p_active, true));
  else
    update public.nursery_meal_plans
       set name_ar = btrim(p_name_ar), name_en = btrim(p_name_en), meals = v_meals,
           monthly_price = round(p_monthly_price, 2), active = coalesce(p_active, true)
     where id = p_id and nursery_id = p_nursery_id;
    if not found then
      raise exception 'meal_plan_not_found' using errcode = 'P0001';
    end if;
  end if;
  return public.get_meal_plans(p_nursery_id);
end;
$$;

-- Gives a child a meal plan from today (ending the one they had), or with a null plan stops it.
-- A plan given and changed on the same day is replaced, not kept as a one-day plan.
create or replace function public.set_child_meal_plan(p_child_id uuid, p_meal_plan_id uuid, p_charged boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child public.children%rowtype;
  v_plan public.nursery_meal_plans%rowtype;
  v_current public.child_meal_plans%rowtype;
  v_today date;
begin
  select * into v_child from public.children where id = p_child_id;
  if not found or not public.menu_can_edit(v_child.nursery_id) then
    raise exception 'menu_forbidden' using errcode = '42501';
  end if;
  v_today := public.nursery_today(v_child.nursery_id);
  if p_meal_plan_id is not null then
    select * into v_plan from public.nursery_meal_plans where id = p_meal_plan_id and nursery_id = v_child.nursery_id;
    if not found or not v_plan.active then
      raise exception 'meal_plan_not_found' using errcode = 'P0001';
    end if;
  end if;

  select * into v_current from public.child_meal_plans where child_id = p_child_id and ended_on is null for update;
  if found then
    if v_current.meal_plan_id is not distinct from p_meal_plan_id and v_current.charged = coalesce(p_charged, true) then
      return public.get_meal_plans(v_child.nursery_id);
    end if;
    if v_current.started_on >= v_today then
      delete from public.child_meal_plans where id = v_current.id;
    else
      update public.child_meal_plans set ended_on = v_today - 1 where id = v_current.id;
    end if;
  end if;

  if p_meal_plan_id is not null then
    insert into public.child_meal_plans (nursery_id, child_id, meal_plan_id, plan_name_ar, plan_name_en, meals, monthly_price, charged, started_on, created_by)
    values (v_child.nursery_id, p_child_id, v_plan.id, v_plan.name_ar, v_plan.name_en, v_plan.meals, v_plan.monthly_price,
            coalesce(p_charged, true), v_today, auth.uid());
  end if;
  return public.get_meal_plans(v_child.nursery_id);
end;
$$;

-- The tuition invoice, now with the child's charged meal plan for the same months.
create or replace function public._generate_tuition_invoice(p_subscription_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.child_tuition_subscriptions%rowtype;
  v_meal public.child_meal_plans%rowtype;
  v_due_days integer := 7;
  v_invoice_id uuid;
  v_items jsonb;
  v_meal_total numeric := 0;
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

  v_items := jsonb_build_array(
    jsonb_build_object(
      'kind', 'tuition',
      'name_ar', nullif(v_sub.tuition_package_name_ar, ''),
      'name_en', nullif(v_sub.tuition_package_name_en, ''),
      'description', coalesce(nullif(v_sub.tuition_package_name_en, ''), nullif(v_sub.tuition_package_name_ar, '')),
      'quantity', v_sub.duration_months,
      'unitPrice', round(v_sub.locked_price / greatest(v_sub.duration_months, 1), 2),
      'unit_price', round(v_sub.locked_price / greatest(v_sub.duration_months, 1), 2),
      'total', v_sub.locked_price
    )
  );

  select * into v_meal
  from public.child_meal_plans
  where child_id = v_sub.child_id and ended_on is null and charged and started_on <= current_date and monthly_price > 0;
  if found then
    v_meal_total := round(v_meal.monthly_price * greatest(v_sub.duration_months, 1), 2);
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind', 'meal_plan',
      'child_meal_plan_id', v_meal.id,
      'name_ar', v_meal.plan_name_ar,
      'name_en', v_meal.plan_name_en,
      'description', v_meal.plan_name_en,
      'meals', to_jsonb(v_meal.meals),
      'quantity', greatest(v_sub.duration_months, 1),
      'unitPrice', v_meal.monthly_price,
      'unit_price', v_meal.monthly_price,
      'total', v_meal_total
    ));
  end if;

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
    'items', v_items
  );

  insert into public.invoices (
    nursery_id, parent_id, amount, due_date, status, invoice_type, line_items_json
  )
  values (
    v_sub.nursery_id,
    v_sub.billed_parent_id,
    v_sub.locked_price + v_meal_total,
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

revoke execute on function public._generate_tuition_invoice(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------------------------
-- Kitchen stock
alter table public.inventory
  add column if not exists expires_on date;

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  nursery_id uuid not null references public.nurseries (id) on delete cascade,
  item_id uuid not null references public.inventory (id) on delete cascade,
  kind text not null check (kind in ('restocked', 'used', 'spoiled', 'counted')),
  change numeric(12, 2) not null,
  quantity_after numeric(12, 2) not null check (quantity_after >= 0),
  note text check (note is null or char_length(note) <= 300),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_movements_item on public.inventory_movements (item_id, created_at desc);
create index if not exists idx_inventory_movements_nursery on public.inventory_movements (nursery_id, created_at desc);
alter table public.inventory_movements enable row level security;
drop policy if exists inventory_movements_read on public.inventory_movements;
create policy inventory_movements_read on public.inventory_movements for select to authenticated
  using (public.menu_viewer_kind(nursery_id) = 'staff');

-- The kitchen's items (food, drinks, kitchen supplies) and their latest changes.
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
               'last_restocked', i.last_restocked, 'updated_at', i.updated_at)
             order by i.item_name)
        from public.inventory i
       where i.nursery_id = p_nursery_id and i.category in ('food', 'drinks', 'kitchen_supplies')
    ), '[]'::jsonb),
    'movements', coalesce((
      select jsonb_agg(m.row order by m.at desc)
        from (
          select jsonb_build_object('id', mv.id, 'item_id', mv.item_id, 'item_name', i.item_name, 'unit', i.unit, 'kind', mv.kind,
                                    'change', mv.change, 'quantity_after', mv.quantity_after, 'note', mv.note,
                                    'by_ar', u.name_ar, 'by_en', u.name_en, 'at', mv.created_at) as row,
                 mv.created_at as at
            from public.inventory_movements mv
            join public.inventory i on i.id = mv.item_id
            left join public.users u on u.id = mv.created_by
           where mv.nursery_id = p_nursery_id
           order by mv.created_at desc
           limit 40
        ) m
    ), '[]'::jsonb)
  );
end;
$$;

-- Adds a kitchen item (at quantity 0, restocked separately) or changes its details.
create or replace function public.save_kitchen_item(
  p_nursery_id uuid, p_id uuid, p_name text, p_category text, p_unit text, p_low_stock_level numeric, p_expires_on date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.menu_can_edit(p_nursery_id) then
    raise exception 'menu_forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 80
     or coalesce(p_category, '') not in ('food', 'drinks', 'kitchen_supplies')
     or char_length(btrim(coalesce(p_unit, ''))) not between 1 and 20
     or p_low_stock_level is null or p_low_stock_level < 0 then
    raise exception 'kitchen_item_invalid' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.inventory (nursery_id, item_name, category, quantity, unit, low_stock_threshold, reorder_level, expires_on)
    values (p_nursery_id, btrim(p_name), p_category, 0, btrim(p_unit), p_low_stock_level, p_low_stock_level, p_expires_on);
  else
    update public.inventory
       set item_name = btrim(p_name), category = p_category, unit = btrim(p_unit),
           low_stock_threshold = p_low_stock_level, reorder_level = p_low_stock_level, expires_on = p_expires_on, updated_at = now()
     where id = p_id and nursery_id = p_nursery_id and category in ('food', 'drinks', 'kitchen_supplies');
    if not found then
      raise exception 'kitchen_item_not_found' using errcode = 'P0001';
    end if;
  end if;
  return public.get_kitchen_stock(p_nursery_id);
end;
$$;

-- Records a change: restocked and used/spoiled add or take p_quantity; counted sets it to p_quantity.
-- Taking more than is there is refused (detail: what is there).
create or replace function public.record_kitchen_movement(p_item_id uuid, p_kind text, p_quantity numeric, p_expires_on date default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory%rowtype;
  v_after numeric;
begin
  select * into v_item from public.inventory where id = p_item_id for update;
  if not found or v_item.category not in ('food', 'drinks', 'kitchen_supplies') then
    raise exception 'kitchen_item_not_found' using errcode = 'P0001';
  end if;
  if not public.menu_can_edit(v_item.nursery_id) then
    raise exception 'menu_forbidden' using errcode = '42501';
  end if;
  if coalesce(p_kind, '') not in ('restocked', 'used', 'spoiled', 'counted') or p_quantity is null or p_quantity < 0
     or (p_kind <> 'counted' and p_quantity = 0) or p_quantity > 1000000 then
    raise exception 'kitchen_invalid_quantity' using errcode = '22023';
  end if;
  if p_note is not null and char_length(btrim(p_note)) > 300 then
    raise exception 'kitchen_invalid_quantity' using errcode = '22023';
  end if;
  v_after := case p_kind
               when 'restocked' then coalesce(v_item.quantity, 0) + p_quantity
               when 'counted' then p_quantity
               else coalesce(v_item.quantity, 0) - p_quantity
             end;
  if v_after < 0 then
    raise exception 'kitchen_not_enough' using errcode = 'P0001', detail = coalesce(v_item.quantity, 0)::text;
  end if;
  update public.inventory
     set quantity = v_after,
         last_restocked = case when p_kind = 'restocked' then public.nursery_today(v_item.nursery_id) else last_restocked end,
         expires_on = case when p_kind = 'restocked' and p_expires_on is not null then p_expires_on else expires_on end,
         updated_at = now()
   where id = v_item.id;
  insert into public.inventory_movements (nursery_id, item_id, kind, change, quantity_after, note, created_by)
  values (v_item.nursery_id, v_item.id, p_kind, v_after - coalesce(v_item.quantity, 0), v_after, nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
  return public.get_kitchen_stock(v_item.nursery_id);
end;
$$;

-- Removes a kitchen item and its history.
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
  if not found or v_item.category not in ('food', 'drinks', 'kitchen_supplies') then
    raise exception 'kitchen_item_not_found' using errcode = 'P0001';
  end if;
  if not public.menu_can_edit(v_item.nursery_id) then
    raise exception 'menu_forbidden' using errcode = '42501';
  end if;
  delete from public.inventory where id = v_item.id;
  return public.get_kitchen_stock(v_item.nursery_id);
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- The package report: the meal plan line is not tuition.
create or replace function public.get_package_subscriptions(p_nursery_id uuid, p_from date default null, p_to date default null)
returns table (
  kind text,                 -- tuition | extra_hours
  subscription_id uuid,
  package_id uuid,
  package_name_ar text,
  package_name_en text,
  child_id uuid,
  child_name_ar text,
  child_name_en text,
  class_name_ar text,
  class_name_en text,
  parent_id uuid,
  parent_name_ar text,
  parent_name_en text,
  parent_phone text,
  billing_period text,       -- fixed packages: monthly | quarterly | half_annual | annual
  duration_months integer,
  price numeric,             -- fixed: the price locked for each billing period; extra hours: the package price
  included_hours integer,    -- extra hours: the hours a quota package holds (null: unlimited)
  hours_used numeric,
  status text,               -- active | cancelled | expired
  started_on date,
  ended_on date,
  invoiced boolean,          -- has any invoice at all (whatever the period)
  invoices integer,          -- invoices counted for the period
  billed numeric,
  paid numeric,
  awaiting numeric,
  unpaid numeric,
  overdue numeric,
  next_due_date date         -- the earliest due date still unpaid
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_tz text;
  v_today date;
begin
  perform public.payment_staff_guard(p_nursery_id);
  if (p_from is null) <> (p_to is null) or p_from > p_to or p_to - p_from + 1 > 366 then
    raise exception 'package_stats_invalid_range' using errcode = '22023';
  end if;
  select coalesce(ns.timezone, 'Africa/Cairo') into v_tz from public.nursery_settings ns where ns.nursery_id = p_nursery_id;
  v_tz := coalesce(v_tz, 'Africa/Cairo');
  v_today := (now() at time zone v_tz)::date;

  return query
  with subs as (
    select
      'tuition'::text as kind,
      s.id as subscription_id,
      s.tuition_package_id as package_id,
      coalesce(nullif(s.tuition_package_name_ar, ''), tp.name_ar) as package_name_ar,
      coalesce(nullif(s.tuition_package_name_en, ''), tp.name_en) as package_name_en,
      s.child_id,
      s.billed_parent_id as parent_id,
      s.billing_period,
      s.duration_months,
      s.locked_price as price,
      null::integer as included_hours,
      null::numeric as hours_used,
      case when s.status = 'active' then 'active' else 'cancelled' end as status,
      s.started_at as started_on,
      case when s.status <> 'active'
        then coalesce((s.cancelled_at at time zone v_tz)::date, (s.updated_at at time zone v_tz)::date) end as ended_on,
      s.source_application_id as application_id
    from public.child_tuition_subscriptions s
    left join public.tuition_packages tp on tp.id = s.tuition_package_id
    where s.nursery_id = p_nursery_id
    union all
    select
      'extra_hours',
      cp.id,
      cp.package_id,
      p.name_ar,
      p.name_en,
      cp.child_id,
      -- The parent billed when the nursery assigned it (none for one chosen in the application).
      (select i.parent_id from public.invoices i
        where i.nursery_id = p_nursery_id and i.line_items_json ->> 'child_package_id' = cp.id::text
        order by i.created_at limit 1),
      null,
      null,
      p.price,
      p.included_hours,
      coalesce(cp.hours_used, 0),
      case
        when cp.status <> 'active' then 'cancelled'
        when cp.expires_at is not null and cp.expires_at < now() then 'expired'
        else 'active'
      end,
      (coalesce(cp.assigned_at, cp.created_at) at time zone v_tz)::date,
      case
        when cp.status <> 'active' then (cp.updated_at at time zone v_tz)::date
        when cp.expires_at is not null and cp.expires_at < now() then (cp.expires_at at time zone v_tz)::date
      end,
      -- The application that chose this package; only the child's first assignment of it came from there.
      case when row_number() over (partition by cp.child_id, cp.package_id order by coalesce(cp.assigned_at, cp.created_at), cp.id) = 1
        then app.id end
    from public.child_packages cp
    join public.packages p on p.id = cp.package_id
    join public.children c on c.id = cp.child_id
    left join lateral (
      select a.id
      from public.applications a
      where a.extra_hours_package_id = cp.package_id
        and (a.id = nullif(c.enrollment_extended_json ->> 'source_application_id', '')::uuid
             or (a.child_id = cp.child_id and a.status = 'approved'))
      order by a.reviewed_at desc nulls last
      limit 1
    ) app on true
    where cp.nursery_id = p_nursery_id
  ),
  -- Each admission invoice's lines: the extra-hours part and the whole.
  admission_parts as (
    select
      i.id,
      coalesce(sum(coalesce(nullif(it ->> 'total', ''), nullif(it ->> 'amount', ''))::numeric)
        filter (where it ->> 'kind' = 'extra_hours_package' or it ->> 'scope' = 'extra_hours'), 0) as extra_total,
      coalesce(sum(coalesce(nullif(it ->> 'total', ''), nullif(it ->> 'amount', ''))::numeric), 0) as all_total
    from public.invoices i
    cross join lateral jsonb_array_elements(
      case jsonb_typeof(i.line_items_json)
        when 'array' then i.line_items_json
        when 'object' then case when jsonb_typeof(i.line_items_json -> 'items') = 'array' then i.line_items_json -> 'items' else '[]'::jsonb end
        else '[]'::jsonb
      end
    ) it
    where i.nursery_id = p_nursery_id
      and i.line_items_json ->> 'application_id' is not null
      and jsonb_typeof(it) = 'object'
    group by i.id
  ),
  -- Each recurring package invoice's lines: the meal plan part and the whole.
  recurring_parts as (
    select
      i.id,
      coalesce(sum(coalesce(nullif(it ->> 'total', ''), nullif(it ->> 'amount', ''))::numeric)
        filter (where it ->> 'kind' = 'meal_plan'), 0) as meal_total,
      coalesce(sum(coalesce(nullif(it ->> 'total', ''), nullif(it ->> 'amount', ''))::numeric), 0) as all_total
    from public.invoices i
    cross join lateral jsonb_array_elements(
      case jsonb_typeof(i.line_items_json)
        when 'array' then i.line_items_json
        when 'object' then case when jsonb_typeof(i.line_items_json -> 'items') = 'array' then i.line_items_json -> 'items' else '[]'::jsonb end
        else '[]'::jsonb
      end
    ) it
    where i.nursery_id = p_nursery_id
      and i.line_items_json ->> 'subscription_id' is not null
      and jsonb_typeof(it) = 'object'
    group by i.id
  ),
  links as (
    -- A fixed package's recurring invoices, less the child's meal plan line when there is one.
    select s.subscription_id, i.id as invoice_id,
      case when rp.all_total > 0 then (rp.all_total - rp.meal_total) / rp.all_total else 1 end as share
    from subs s
    join public.invoices i on i.nursery_id = p_nursery_id
      and i.line_items_json ->> 'subscription_id' = s.subscription_id::text
    left join recurring_parts rp on rp.id = i.id
    where s.kind = 'tuition'
    union all
    -- The admission invoice: the package lines to the fixed package, the extra-hours lines to the extra-hours package.
    select s.subscription_id, i.id,
      case
        when s.kind = 'tuition' then case when ap.all_total > 0 then (ap.all_total - ap.extra_total) / ap.all_total else 1 end
        else case when ap.all_total > 0 then ap.extra_total / ap.all_total else 0 end
      end
    from subs s
    join public.invoices i on i.nursery_id = p_nursery_id
      and i.line_items_json ->> 'application_id' = s.application_id::text
    left join admission_parts ap on ap.id = i.id
    where s.application_id is not null
    union all
    -- An extra-hours package the nursery assigned: the invoice made for it, whole.
    select s.subscription_id, i.id, 1::numeric
    from subs s
    join public.invoices i on i.nursery_id = p_nursery_id
      and i.line_items_json ->> 'child_package_id' = s.subscription_id::text
    where s.kind = 'extra_hours'
  ),
  invoice_money as (
    select i.id, i.amount, i.due_date, (i.created_at at time zone v_tz)::date as issued_on,
      case when i.status = 'paid' then i.amount
           else least(i.amount, coalesce((select sum(pm.amount) from public.payments pm
                                          where pm.invoice_id = i.id and pm.status = 'completed'), 0))
      end as paid
    from public.invoices i
    where i.id in (select l.invoice_id from links l) and i.status <> 'cancelled'
  ),
  invoice_split as (
    select m.*,
      greatest(least(m.amount - m.paid, coalesce((select sum(pa.amount) from public.payment_attempts pa
                                                  where pa.invoice_id = m.id and pa.status = 'pending_confirmation'), 0)), 0) as awaiting
    from invoice_money m
  ),
  link_money as (
    select l.subscription_id, m.issued_on, m.due_date,
      round(m.amount * l.share, 2) as billed,
      round(m.paid * l.share, 2) as paid,
      round(m.awaiting * l.share, 2) as awaiting
    from links l
    join invoice_split m on m.id = l.invoice_id
    where l.share > 0
  ),
  money as (
    select lm.subscription_id,
      count(*)::integer as invoices,
      sum(lm.billed) as billed,
      sum(lm.paid) as paid,
      sum(lm.awaiting) as awaiting,
      sum(lm.billed - lm.paid - lm.awaiting) as unpaid,
      coalesce(sum(lm.billed - lm.paid - lm.awaiting) filter (where lm.due_date < v_today), 0) as overdue,
      min(lm.due_date) filter (where lm.billed - lm.paid - lm.awaiting > 0) as next_due_date
    from link_money lm
    where p_from is null or lm.issued_on between p_from and p_to
    group by lm.subscription_id
  ),
  ever as (
    select distinct lm.subscription_id from link_money lm
  )
  select
    s.kind,
    s.subscription_id,
    s.package_id,
    s.package_name_ar,
    s.package_name_en,
    s.child_id,
    c.full_name_ar,
    c.full_name_en,
    cl.name_ar,
    cl.name_en,
    coalesce(s.parent_id, par.parent_id),
    coalesce(bp.name_ar, par.name_ar),
    coalesce(bp.name_en, par.name_en),
    coalesce(bp.phone, par.phone),
    s.billing_period,
    s.duration_months,
    s.price,
    s.included_hours,
    s.hours_used,
    s.status,
    s.started_on,
    s.ended_on,
    e.subscription_id is not null,
    coalesce(mo.invoices, 0),
    coalesce(mo.billed, 0),
    coalesce(mo.paid, 0),
    coalesce(mo.awaiting, 0),
    coalesce(mo.unpaid, 0),
    coalesce(mo.overdue, 0),
    mo.next_due_date
  from subs s
  join public.children c on c.id = s.child_id
  left join public.classes cl on cl.id = c.class_id
  left join public.users bp on bp.id = s.parent_id
  left join lateral (
    select pc.parent_id, u.name_ar, u.name_en, u.phone
    from public.parent_children pc
    join public.users u on u.id = pc.parent_id
    where pc.child_id = s.child_id
    order by pc.is_primary desc nulls last, pc.created_at
    limit 1
  ) par on s.parent_id is null
  left join money mo on mo.subscription_id = s.subscription_id
  left join ever e on e.subscription_id = s.subscription_id
  where p_from is null
     or (s.started_on <= p_to and (s.ended_on is null or s.ended_on >= p_from))
     or mo.subscription_id is not null
  order by s.kind desc, s.package_name_en, c.full_name_en, s.started_on;
end;
$$;
revoke execute on function public.nursery_today(uuid) from public, anon;
grant execute on function public.nursery_today(uuid) to authenticated, service_role;
revoke execute on function public.get_meal_plans(uuid) from public, anon;
grant execute on function public.get_meal_plans(uuid) to authenticated, service_role;
revoke execute on function public.save_nursery_meal_plan(uuid, uuid, text, text, text[], numeric, boolean) from public, anon;
grant execute on function public.save_nursery_meal_plan(uuid, uuid, text, text, text[], numeric, boolean) to authenticated, service_role;
revoke execute on function public.set_child_meal_plan(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_child_meal_plan(uuid, uuid, boolean) to authenticated, service_role;
revoke execute on function public.get_kitchen_stock(uuid) from public, anon;
grant execute on function public.get_kitchen_stock(uuid) to authenticated, service_role;
revoke execute on function public.save_kitchen_item(uuid, uuid, text, text, text, numeric, date) from public, anon;
grant execute on function public.save_kitchen_item(uuid, uuid, text, text, text, numeric, date) to authenticated, service_role;
revoke execute on function public.record_kitchen_movement(uuid, text, numeric, date, text) from public, anon;
grant execute on function public.record_kitchen_movement(uuid, text, numeric, date, text) to authenticated, service_role;
revoke execute on function public.delete_kitchen_item(uuid) from public, anon;
grant execute on function public.delete_kitchen_item(uuid) to authenticated, service_role;

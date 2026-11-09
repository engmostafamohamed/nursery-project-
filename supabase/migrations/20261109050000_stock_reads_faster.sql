-- Faster stock reads: every stock change returns the stock with its latest movements, and the
-- warehouse's pages read them, so these run often.
--   * The latest movements are picked first (by the nursery's created_at index), then their names
--     and charges are looked up; before, every movement of the nursery was joined, then 40 kept.
--   * A charge is found from its movement by an index.
--   * A month's movements are found by a range on created_at (its index) instead of a date cast.
-- Same results as before.

create index if not exists idx_kitchen_charges_movement on public.kitchen_charges (movement_id) where movement_id is not null;

create or replace function public.stock_movement_rows(p_nursery_id uuid, p_scope text, p_from date, p_to date, p_limit integer)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with mv as (
    select mv.*, i.item_name, i.unit, i.category
      from public.inventory_movements mv
      join public.inventory i on i.id = mv.item_id
     where mv.nursery_id = p_nursery_id
       and (p_scope = 'all' or public.stock_scope(i.category) = p_scope)
       and (p_from is null or mv.created_at >= (p_from::timestamp at time zone 'Africa/Cairo'))
       and (p_to is null or mv.created_at < ((p_to + 1)::timestamp at time zone 'Africa/Cairo'))
     order by mv.created_at desc
     limit p_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', mv.id, 'item_id', mv.item_id, 'item_name', mv.item_name, 'unit', mv.unit, 'category', mv.category,
           'kind', mv.kind, 'change', mv.change, 'quantity_after', mv.quantity_after, 'note', mv.note,
           'by_ar', u.name_ar, 'by_en', u.name_en, 'at', mv.created_at,
           'for_ar', coalesce(ch.full_name_ar, su.name_ar), 'for_en', coalesce(ch.full_name_en, su.name_en),
           'class_id', mv.class_id, 'class_ar', cl.name_ar, 'class_en', cl.name_en,
           'taken_by_ar', tb.name_ar, 'taken_by_en', tb.name_en,
           'supplier', mv.supplier, 'unit_cost', mv.unit_cost,
           'value', case when mv.unit_cost is null then null else round(abs(mv.change) * mv.unit_cost, 2) end)
         order by mv.created_at desc), '[]'::jsonb)
    from mv
    left join public.users u on u.id = mv.created_by
    left join public.kitchen_charges kc on kc.movement_id = mv.id
    left join public.children ch on ch.id = kc.child_id
    left join public.users su on su.id = kc.staff_user_id
    left join public.classes cl on cl.id = mv.class_id
    left join public.users tb on tb.id = mv.taken_by
$$;

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
       and mv.created_at >= (p_from::timestamp at time zone 'Africa/Cairo') and mv.created_at < ((p_to + 1)::timestamp at time zone 'Africa/Cairo')
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
             and mv.created_at >= (v_from::timestamp at time zone 'Africa/Cairo') and mv.created_at < ((v_to + 1)::timestamp at time zone 'Africa/Cairo')
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
             and mv.created_at >= (v_from::timestamp at time zone 'Africa/Cairo') and mv.created_at < ((v_to + 1)::timestamp at time zone 'Africa/Cairo')
           group by i.category
        ) x
    ), '[]'::jsonb)
  );
end;
$$;


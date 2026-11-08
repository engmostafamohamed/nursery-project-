-- The menu editor warns while a dish is being tagged, before it is saved: get_menu_week now also
-- gives staff the active children with each food allergy (only the children they may see). Parents
-- never get it. Everything else is as in 20261108010000_food_and_beverage.

create or replace function public.get_menu_week(p_nursery_id uuid, p_week_start date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kind text := public.menu_viewer_kind(p_nursery_id);
  v_start date := public.menu_week_start(p_week_start);
  v_week public.menu_weeks%rowtype;
  v_visible boolean;
begin
  if v_kind is null then
    raise exception 'menu_forbidden' using errcode = '42501';
  end if;
  select * into v_week from public.menu_weeks where nursery_id = p_nursery_id and week_start = v_start;
  v_visible := found and (v_kind = 'staff' or v_week.status = 'published');
  return jsonb_build_object(
    'week_start', v_start,
    'working_days', coalesce((select n.working_days from public.nurseries n where n.id = p_nursery_id), '[]'::jsonb),
    'can_edit', public.menu_can_edit(p_nursery_id),
    'week', case when v_visible then jsonb_build_object(
      'id', v_week.id, 'status', v_week.status, 'notes', v_week.notes,
      'file_path', v_week.file_path, 'file_name', v_week.file_name, 'file_type', v_week.file_type, 'file_size', v_week.file_size,
      'published_at', v_week.published_at, 'updated_at', v_week.updated_at
    ) end,
    'dishes', case when v_visible then coalesce((
      with conflicts as (select c from public.menu_visible_conflicts(p_nursery_id, v_start, v_start + 6) c)
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'day', d.day, 'meal', d.meal, 'name', d.name, 'allergens', to_jsonb(d.allergens), 'sort_order', d.sort_order,
               'conflicts', coalesce((select jsonb_agg(k.c) from conflicts k where (k.c ->> 'dish_id')::uuid = d.id), '[]'::jsonb))
             order by d.day, array_position(array['breakfast', 'lunch', 'snacks'], d.meal), d.sort_order, d.name)
        from public.menu_dishes d where d.week_id = v_week.id
    ), '[]'::jsonb) else '[]'::jsonb end,
    -- For staff: each food allergen with the children who have it, worst reaction first.
    'allergy_index', case when v_kind = 'staff' then coalesce((
      select jsonb_object_agg(x.allergen, x.children)
        from (
          select f.allergen,
                 jsonb_agg(jsonb_build_object(
                   'child_id', c.id, 'child_name_ar', c.full_name_ar, 'child_name_en', c.full_name_en,
                   'severity', a.severity, 'eats_nursery_meals', coalesce(dp.eats_nursery_meals, true))
                   order by array_position(array['life_threatening', 'severe', 'moderate', 'mild'], a.severity) nulls last, c.full_name_en) as children
            from public.child_allergies a
            join public.children c on c.id = a.child_id and c.status = 'active' and c.nursery_id = p_nursery_id
            left join public.child_dietary_preferences dp on dp.child_id = c.id
           cross join lateral unnest(a.food_allergens) as f(allergen)
           where public.rls_staff_can_access_child(c.id)
           group by f.allergen
        ) x
    ), '{}'::jsonb) else '{}'::jsonb end
  );
end;
$$;

revoke execute on function public.get_menu_week(uuid, date) from public, anon;
grant execute on function public.get_menu_week(uuid, date) to authenticated, service_role;

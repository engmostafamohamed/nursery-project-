-- The menu is a week or a month, as the nursery chooses (one setting, kept on the nursery's row like
-- the rest of its data).
--
-- 1. nurseries.menu_period: 'week' (Saturday to Friday, as before) or 'month' (a calendar month).
--    The menu's editors set it (set_menu_period_kind). Menus of the other kind are kept but hidden:
--    not shown and not checked against allergies until the nursery switches back.
-- 2. menu_weeks holds both kinds: `period` says which, and week_start is the period's first day (a
--    Saturday, or the 1st of the month). One menu per nursery, kind and start.
-- 3. The *_menu_week functions become *_menu_period. Each takes any day of the period and works on
--    the nursery's kind. A month holds up to 500 dishes, a week 100. Copying a month puts each dish
--    on the same weekday of the same week of the month (the 2nd Monday on the 2nd Monday).
-- 4. The first publish of a month tells the parents with its own template (menu_published_month).
-- Error codes no longer name the week: menu_empty, menu_not_empty.

-- -----------------------------------------------------------------------------------------------
-- 1. The nursery's kind of menu
alter table public.nurseries add column if not exists menu_period text not null default 'week';
alter table public.nurseries drop constraint if exists nurseries_menu_period_check;
alter table public.nurseries add constraint nurseries_menu_period_check check (menu_period in ('week', 'month'));

-- -----------------------------------------------------------------------------------------------
-- 2. A menu is a week or a month
alter table public.menu_weeks add column if not exists period text not null default 'week';
alter table public.menu_weeks drop constraint if exists menu_weeks_period_check;
alter table public.menu_weeks add constraint menu_weeks_period_check check (period in ('week', 'month'));
alter table public.menu_weeks drop constraint if exists menu_weeks_starts_saturday;
alter table public.menu_weeks drop constraint if exists menu_weeks_period_start;
alter table public.menu_weeks add constraint menu_weeks_period_start check (
  (period = 'week' and extract(dow from week_start) = 6) or (period = 'month' and extract(day from week_start) = 1)
);
alter table public.menu_weeks drop constraint if exists menu_weeks_nursery_week_uniq;
alter table public.menu_weeks drop constraint if exists menu_weeks_nursery_period_uniq;
alter table public.menu_weeks add constraint menu_weeks_nursery_period_uniq unique (nursery_id, period, week_start);

-- The nursery's kind of menu, and the first and last day of the period a day falls in.
create or replace function public.menu_period_of(p_nursery_id uuid, p_day date)
returns table (period text, starts_on date, ends_on date)
language sql
stable
security definer
set search_path = public
as $$
  select k.period,
         case k.period when 'month' then date_trunc('month', p_day)::date else public.menu_week_start(p_day) end,
         case k.period when 'month' then (date_trunc('month', p_day) + interval '1 month - 1 day')::date else public.menu_week_start(p_day) + 6 end
    from (select coalesce((select n.menu_period from public.nurseries n where n.id = p_nursery_id), 'week') as period) k
$$;

revoke execute on function public.menu_period_of(uuid, date) from public, anon, authenticated;

-- -----------------------------------------------------------------------------------------------
-- Allergy conflicts count only the menus of the nursery's current kind.
create or replace function public.menu_allergy_conflicts(p_nursery_id uuid, p_from date, p_to date)
returns table (
  dish_id uuid, day date, meal text, dish_name text, week_status text,
  child_id uuid, child_name_ar text, child_name_en text, class_name_ar text, class_name_en text,
  allergen text, allergy_name text, severity text, reaction text, treatment text, eats_nursery_meals boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.day, d.meal, d.name, w.status,
         c.id, c.full_name_ar, c.full_name_en, cl.name_ar, cl.name_en,
         x.allergen, a.allergen_name, a.severity, a.reaction_type, a.treatment_protocol,
         coalesce(dp.eats_nursery_meals, true)
    from public.menu_dishes d
    join public.menu_weeks w on w.id = d.week_id
    join public.nurseries n on n.id = d.nursery_id and n.menu_period = w.period
    join public.children c on c.nursery_id = d.nursery_id and c.status = 'active'
    join public.child_allergies a on a.child_id = c.id
    cross join lateral unnest(a.food_allergens) as x(allergen)
    left join public.classes cl on cl.id = c.class_id
    left join public.child_dietary_preferences dp on dp.child_id = c.id
   where d.nursery_id = p_nursery_id
     and d.day between p_from and p_to
     and x.allergen = any (d.allergens)
$$;

revoke execute on function public.menu_allergy_conflicts(uuid, date, date) from public, anon, authenticated;

-- -----------------------------------------------------------------------------------------------
-- 3. Reading and changing a period's menu

-- The period a day falls in, as the caller may see it: its dishes with the children each is not
-- safe for, and for staff each food allergen's children. Null menu when there is none (or, for a
-- parent, when it is not published yet).
create or replace function public.get_menu_period(p_nursery_id uuid, p_day date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kind text := public.menu_viewer_kind(p_nursery_id);
  v_period record;
  v_menu public.menu_weeks%rowtype;
  v_visible boolean;
begin
  if v_kind is null then
    raise exception 'menu_forbidden' using errcode = '42501';
  end if;
  if p_day is null then
    raise exception 'menu_invalid_day' using errcode = '22023';
  end if;
  select * into v_period from public.menu_period_of(p_nursery_id, p_day);
  select * into v_menu from public.menu_weeks
   where nursery_id = p_nursery_id and period = v_period.period and week_start = v_period.starts_on;
  v_visible := found and (v_kind = 'staff' or v_menu.status = 'published');
  return jsonb_build_object(
    'period', v_period.period,
    'starts_on', v_period.starts_on,
    'ends_on', v_period.ends_on,
    'working_days', coalesce((select n.working_days from public.nurseries n where n.id = p_nursery_id), '[]'::jsonb),
    'can_edit', public.menu_can_edit(p_nursery_id),
    'menu', case when v_visible then jsonb_build_object(
      'id', v_menu.id, 'status', v_menu.status, 'notes', v_menu.notes,
      'file_path', v_menu.file_path, 'file_name', v_menu.file_name, 'file_type', v_menu.file_type, 'file_size', v_menu.file_size,
      'published_at', v_menu.published_at, 'updated_at', v_menu.updated_at
    ) end,
    'dishes', case when v_visible then coalesce((
      with conflicts as (select c from public.menu_visible_conflicts(p_nursery_id, v_period.starts_on, v_period.ends_on) c)
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'day', d.day, 'meal', d.meal, 'name', d.name, 'allergens', to_jsonb(d.allergens), 'sort_order', d.sort_order,
               'conflicts', coalesce((select jsonb_agg(k.c) from conflicts k where (k.c ->> 'dish_id')::uuid = d.id), '[]'::jsonb))
             order by d.day, array_position(array['breakfast', 'lunch', 'snacks'], d.meal), d.sort_order, d.name)
        from public.menu_dishes d where d.week_id = v_menu.id
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

-- Saves a period's dishes and note in one go (replacing what was there); the menu keeps its status.
-- p_dishes: [{ "day": "YYYY-MM-DD", "meal": "lunch", "name": "...", "allergens": ["milk"] }, ...]
create or replace function public.save_menu_period(p_nursery_id uuid, p_day date, p_notes text, p_dishes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period record;
  v_menu_id uuid;
  v_dish jsonb;
  v_index integer := 0;
  v_day date;
  v_allergens text[];
begin
  if not public.menu_can_edit(p_nursery_id) then
    raise exception 'menu_forbidden' using errcode = '42501';
  end if;
  if p_day is null then
    raise exception 'menu_invalid_day' using errcode = '22023';
  end if;
  select * into v_period from public.menu_period_of(p_nursery_id, p_day);
  if jsonb_typeof(coalesce(p_dishes, '[]'::jsonb)) <> 'array'
     -- In parentheses: inside IF, a bare CASE's own THEN would end the condition.
     or jsonb_array_length(coalesce(p_dishes, '[]'::jsonb)) > (case v_period.period when 'month' then 500 else 100 end) then
    raise exception 'menu_invalid_dishes' using errcode = '22023';
  end if;
  if p_notes is not null and char_length(btrim(p_notes)) > 1000 then
    raise exception 'menu_notes_too_long' using errcode = '22023';
  end if;

  insert into public.menu_weeks (nursery_id, period, week_start, notes, created_by)
  values (p_nursery_id, v_period.period, v_period.starts_on, nullif(btrim(coalesce(p_notes, '')), ''), auth.uid())
  on conflict (nursery_id, period, week_start) do update set notes = excluded.notes, updated_at = now()
  returning id into v_menu_id;

  delete from public.menu_dishes where week_id = v_menu_id;

  for v_dish in select value from jsonb_array_elements(coalesce(p_dishes, '[]'::jsonb)) loop
    v_index := v_index + 1;
    begin
      v_day := (v_dish ->> 'day')::date;
    exception when others then
      raise exception 'menu_invalid_dish' using errcode = '22023', detail = v_index::text;
    end;
    if v_day is null or v_day < v_period.starts_on or v_day > v_period.ends_on
       or coalesce(v_dish ->> 'meal', '') not in ('breakfast', 'lunch', 'snacks')
       or char_length(btrim(coalesce(v_dish ->> 'name', ''))) not between 1 and 120 then
      raise exception 'menu_invalid_dish' using errcode = '22023', detail = v_index::text;
    end if;
    select coalesce(array_agg(distinct a order by a), '{}') into v_allergens
      from jsonb_array_elements_text(case when jsonb_typeof(v_dish -> 'allergens') = 'array' then v_dish -> 'allergens' else '[]'::jsonb end) a;
    if exists (select 1 from unnest(v_allergens) a where a not in (select code from public.food_allergens)) then
      raise exception 'menu_invalid_allergen' using errcode = '22023', detail = v_index::text;
    end if;
    insert into public.menu_dishes (week_id, nursery_id, day, meal, name, allergens, sort_order)
    values (v_menu_id, p_nursery_id, v_day, v_dish ->> 'meal', btrim(v_dish ->> 'name'), v_allergens, v_index);
  end loop;

  update public.menu_weeks set updated_at = now() where id = v_menu_id;
  return public.get_menu_period(p_nursery_id, v_period.starts_on);
end;
$$;

-- Publishes a period's menu for the parents, or takes it back to draft. The first publish tells the
-- parents of the nursery's active children (a week and a month have their own template).
create or replace function public.set_menu_period_published(p_nursery_id uuid, p_day date, p_published boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period record;
  v_menu public.menu_weeks%rowtype;
begin
  if not public.menu_can_edit(p_nursery_id) then
    raise exception 'menu_forbidden' using errcode = '42501';
  end if;
  if p_day is null then
    raise exception 'menu_invalid_day' using errcode = '22023';
  end if;
  select * into v_period from public.menu_period_of(p_nursery_id, p_day);
  select * into v_menu from public.menu_weeks
   where nursery_id = p_nursery_id and period = v_period.period and week_start = v_period.starts_on
   for update;
  if not found then
    raise exception 'menu_empty' using errcode = 'P0001';
  end if;
  if p_published then
    if v_menu.file_path is null and not exists (select 1 from public.menu_dishes where week_id = v_menu.id) then
      raise exception 'menu_empty' using errcode = 'P0001';
    end if;
    update public.menu_weeks
       set status = 'published', published_at = coalesce(published_at, now()), published_by = coalesce(published_by, auth.uid())
     where id = v_menu.id;
    if v_menu.published_at is null then
      perform public.notify_users(
        array(
          select distinct pc.parent_id
            from public.parent_children pc
            join public.children c on c.id = pc.child_id
           where c.nursery_id = p_nursery_id and c.status = 'active'
        ),
        p_nursery_id,
        'menu_published',
        case v_period.period when 'month' then 'menu_published_month' else 'menu_published' end,
        case v_period.period
          when 'month' then jsonb_build_object('month', to_char(v_period.starts_on, 'YYYY-MM'))
          else jsonb_build_object('week_start', v_period.starts_on)
        end,
        '/parent/meals?day=' || v_period.starts_on::text
      );
    end if;
  else
    update public.menu_weeks set status = 'draft' where id = v_menu.id;
  end if;
  return public.get_menu_period(p_nursery_id, v_period.starts_on);
end;
$$;

-- Copies one period's dishes into another, empty, period of the same kind, as a draft. A week moves
-- each dish by whole weeks; a month puts it on the same weekday of the same week of the month (a
-- dish on a 5th weekday the target month does not have is left out).
create or replace function public.copy_menu_period(p_nursery_id uuid, p_from_day date, p_to_day date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from record;
  v_to record;
  v_source uuid;
  v_target uuid;
begin
  if not public.menu_can_edit(p_nursery_id) then
    raise exception 'menu_forbidden' using errcode = '42501';
  end if;
  if p_from_day is null or p_to_day is null then
    raise exception 'menu_invalid_day' using errcode = '22023';
  end if;
  select * into v_from from public.menu_period_of(p_nursery_id, p_from_day);
  select * into v_to from public.menu_period_of(p_nursery_id, p_to_day);
  select id into v_source from public.menu_weeks
   where nursery_id = p_nursery_id and period = v_from.period and week_start = v_from.starts_on;
  if v_source is null or not exists (select 1 from public.menu_dishes where week_id = v_source) or v_from.starts_on = v_to.starts_on then
    raise exception 'menu_copy_source_empty' using errcode = 'P0001';
  end if;
  insert into public.menu_weeks (nursery_id, period, week_start, created_by)
  values (p_nursery_id, v_to.period, v_to.starts_on, auth.uid())
  on conflict (nursery_id, period, week_start) do nothing;
  select id into v_target from public.menu_weeks
   where nursery_id = p_nursery_id and period = v_to.period and week_start = v_to.starts_on;
  if exists (select 1 from public.menu_dishes where week_id = v_target) then
    raise exception 'menu_not_empty' using errcode = 'P0001';
  end if;
  insert into public.menu_dishes (week_id, nursery_id, day, meal, name, allergens, sort_order)
  select v_target, p_nursery_id, x.day, x.meal, x.name, x.allergens, x.sort_order
    from (
      select case v_to.period
               when 'week' then d.day + (v_to.starts_on - v_from.starts_on)
               -- The first such weekday of the target month, then as many weeks on as in the source.
               else v_to.starts_on
                    + ((extract(dow from d.day)::int - extract(dow from v_to.starts_on)::int + 7) % 7)
                    + 7 * ((extract(day from d.day)::int - 1) / 7)
             end as day,
             d.meal, d.name, d.allergens, d.sort_order
        from public.menu_dishes d
       where d.week_id = v_source
    ) x
   where x.day <= v_to.ends_on;
  update public.menu_weeks set updated_at = now() where id = v_target;
  return public.get_menu_period(p_nursery_id, v_to.starts_on);
end;
$$;

-- Sets (or with a null path, removes) a period's menu file after it was uploaded to menu-files.
-- Returns the menu and the previous file's path, which the app then deletes from storage.
create or replace function public.set_menu_period_file(
  p_nursery_id uuid, p_day date, p_path text, p_name text, p_type text, p_size integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period record;
  v_previous text;
begin
  if not public.menu_can_edit(p_nursery_id) then
    raise exception 'menu_forbidden' using errcode = '42501';
  end if;
  if p_day is null then
    raise exception 'menu_invalid_day' using errcode = '22023';
  end if;
  if p_path is not null and (
       split_part(p_path, '/', 1) <> p_nursery_id::text
       or coalesce(p_type, '') not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
       or p_size is null or p_size <= 0 or p_size > 5242880
     ) then
    raise exception 'menu_invalid_file' using errcode = '22023';
  end if;
  select * into v_period from public.menu_period_of(p_nursery_id, p_day);
  insert into public.menu_weeks (nursery_id, period, week_start, created_by)
  values (p_nursery_id, v_period.period, v_period.starts_on, auth.uid())
  on conflict (nursery_id, period, week_start) do nothing;
  select file_path into v_previous from public.menu_weeks
   where nursery_id = p_nursery_id and period = v_period.period and week_start = v_period.starts_on
   for update;
  update public.menu_weeks
     set file_path = p_path,
         file_name = case when p_path is null then null else left(coalesce(nullif(btrim(p_name), ''), 'menu'), 200) end,
         file_type = case when p_path is null then null else p_type end,
         file_size = case when p_path is null then null else p_size end
   where nursery_id = p_nursery_id and period = v_period.period and week_start = v_period.starts_on;
  return jsonb_build_object(
    'previous_path', nullif(v_previous, p_path),
    'menu', public.get_menu_period(p_nursery_id, v_period.starts_on)
  );
end;
$$;

-- The nursery's kind of menu, set by its menu editors. Returns the kind now in force.
create or replace function public.set_menu_period_kind(p_nursery_id uuid, p_period text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.menu_can_edit(p_nursery_id) then
    raise exception 'menu_forbidden' using errcode = '42501';
  end if;
  if coalesce(p_period, '') not in ('week', 'month') then
    raise exception 'menu_invalid_period' using errcode = '22023';
  end if;
  update public.nurseries set menu_period = p_period where id = p_nursery_id;
  return p_period;
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- The week-only functions are replaced by the ones above.
drop function if exists public.get_menu_week(uuid, date);
drop function if exists public.save_menu_week(uuid, date, text, jsonb);
drop function if exists public.set_menu_week_published(uuid, date, boolean);
drop function if exists public.copy_menu_week(uuid, date, date);
drop function if exists public.set_menu_week_file(uuid, date, text, text, text, integer);

revoke execute on function public.get_menu_period(uuid, date) from public, anon;
grant execute on function public.get_menu_period(uuid, date) to authenticated, service_role;
revoke execute on function public.save_menu_period(uuid, date, text, jsonb) from public, anon;
grant execute on function public.save_menu_period(uuid, date, text, jsonb) to authenticated, service_role;
revoke execute on function public.set_menu_period_published(uuid, date, boolean) from public, anon;
grant execute on function public.set_menu_period_published(uuid, date, boolean) to authenticated, service_role;
revoke execute on function public.copy_menu_period(uuid, date, date) from public, anon;
grant execute on function public.copy_menu_period(uuid, date, date) to authenticated, service_role;
revoke execute on function public.set_menu_period_file(uuid, date, text, text, text, integer) from public, anon;
grant execute on function public.set_menu_period_file(uuid, date, text, text, text, integer) to authenticated, service_role;
revoke execute on function public.set_menu_period_kind(uuid, text) from public, anon;
grant execute on function public.set_menu_period_kind(uuid, text) to authenticated, service_role;

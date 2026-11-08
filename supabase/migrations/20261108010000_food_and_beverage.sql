-- F&B (food and beverage): the nursery's weekly menu and the food allergy alerts that come from it.
--
-- 1. food_allergens: the food allergens dishes are tagged with (codes; their names live in the
--    locale files). Each has keywords, in Arabic and English, used to recognise a child's typed
--    allergy ("Cow's milk", "حساسية لبن").
-- 2. child_allergies.food_allergens: the codes a child's allergy matches, kept up to date by a
--    trigger. An allergy that is not a food (penicillin, dust mites) matches none and is never
--    checked against the menu; the alerts screen lists those so the nursery knows.
-- 3. menu_weeks / menu_dishes: a week (Saturday to Friday) of dishes per day and meal (breakfast,
--    lunch, snacks: the same meals as the daily report), each with its allergens, an optional menu
--    file (photo or PDF, private bucket menu-files), a note, and draft or published. Parents see a
--    week once it is published; staff always. Publishing the first time tells the parents.
-- 4. Alerts: a dish whose allergens meet an active child's food allergy. Staff see the children
--    they may see (teachers their classes), a parent only their own. A child who does not eat the
--    nursery's meals (child_dietary_preferences.eats_nursery_meals = false) is still listed, marked.
-- Everything is read and written through the functions below; the tables allow no direct writes.

-- -----------------------------------------------------------------------------------------------
-- 1. Food allergens
create table if not exists public.food_allergens (
  code text primary key,
  keywords text[] not null default '{}',
  sort_order integer not null default 0
);

alter table public.food_allergens enable row level security;
drop policy if exists food_allergens_read on public.food_allergens;
create policy food_allergens_read on public.food_allergens for select to authenticated using (true);

-- Peanuts come before tree nuts so "peanuts" is not read as nuts.
insert into public.food_allergens (code, keywords, sort_order) values
  ('milk', array['milk', 'dairy', 'lactose', 'cheese', 'yogurt', 'yoghurt', 'butter', 'cream', 'حليب', 'لبن', 'ألبان', 'البان', 'جبن', 'زبادي', 'لاكتوز', 'زبدة', 'قشطة'], 1),
  ('eggs', array['egg', 'بيض'], 2),
  ('peanuts', array['peanut', 'فول سوداني', 'سوداني'], 3),
  ('tree_nuts', array['tree nut', 'nuts', 'almond', 'cashew', 'walnut', 'hazelnut', 'pistachio', 'pecan', 'مكسرات', 'لوز', 'كاجو', 'عين جمل', 'بندق', 'فستق'], 4),
  ('gluten', array['gluten', 'wheat', 'flour', 'barley', 'جلوتين', 'جلوتين', 'قمح', 'دقيق', 'شعير'], 5),
  ('soy', array['soy', 'soya', 'صويا'], 6),
  ('fish', array['fish', 'tuna', 'salmon', 'sardine', 'سمك', 'أسماك', 'اسماك', 'تونة', 'سلمون', 'سردين'], 7),
  ('shellfish', array['shellfish', 'shrimp', 'prawn', 'crab', 'lobster', 'seafood', 'جمبري', 'روبيان', 'قشريات', 'كابوريا', 'مأكولات بحرية'], 8),
  ('sesame', array['sesame', 'tahini', 'سمسم', 'طحينة', 'طحينه'], 9),
  ('strawberry', array['strawberr', 'فراولة', 'فراوله'], 10),
  ('citrus', array['citrus', 'orange', 'lemon', 'mandarin', 'grapefruit', 'حمضيات', 'موالح', 'برتقال', 'ليمون', 'يوسفي', 'جريب فروت'], 11)
on conflict (code) do update set keywords = excluded.keywords, sort_order = excluded.sort_order;

-- The food allergens a typed allergy names (lower-cased, spaces and apostrophes ignored, so
-- "Cow'smilk" and "cow's milk" both read as milk). A text naming two foods gets both. Words that
-- contain another allergen's keyword but are not it are taken out first: peanut is not a tree nut,
-- eggplant is not egg, peanut butter and coconut milk are not dairy, coconut and nutmeg not nuts.
create or replace function public.food_allergens_for(p_text text)
returns text[]
language sql
stable
set search_path = public
as $$
  with t as (select regexp_replace(lower(coalesce(p_text, '')), '[\s''’`-]+', '', 'g') as v),
  not_it (code, word) as (
    values ('tree_nuts', 'peanut'), ('tree_nuts', 'فولسوداني'), ('tree_nuts', 'coconut'), ('tree_nuts', 'nutmeg'),
           ('tree_nuts', 'جوزالهند'), ('eggs', 'eggplant'), ('milk', 'peanutbutter'), ('milk', 'coconutmilk'),
           ('milk', 'حليبجوزالهند'), ('milk', 'cocoabutter')
  )
  select coalesce(array_agg(fa.code order by fa.sort_order), '{}')
    from public.food_allergens fa
   cross join t
   -- The stop words are plain letters, so they join into a pattern as they are.
   cross join lateral (
     select coalesce((select string_agg(n.word, '|') from not_it n where n.code = fa.code), '') as pattern
   ) stop
   where exists (
     select 1 from unnest(fa.keywords) k
      where (case when stop.pattern = '' then t.v else regexp_replace(t.v, stop.pattern, '', 'g') end)
            like '%' || regexp_replace(lower(k), '[\s''’`-]+', '', 'g') || '%'
   )
$$;

-- -----------------------------------------------------------------------------------------------
-- 2. The food allergens of each child's allergy
alter table public.child_allergies add column if not exists food_allergens text[] not null default '{}';

create or replace function public.child_allergy_food_allergens()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.food_allergens := public.food_allergens_for(new.allergen_name);
  return new;
end;
$$;

drop trigger if exists trg_child_allergy_food_allergens on public.child_allergies;
create trigger trg_child_allergy_food_allergens
  before insert or update of allergen_name on public.child_allergies
  for each row execute function public.child_allergy_food_allergens();

update public.child_allergies set food_allergens = public.food_allergens_for(allergen_name);

-- -----------------------------------------------------------------------------------------------
-- 3. The weekly menu
create table if not exists public.menu_weeks (
  id uuid primary key default gen_random_uuid(),
  nursery_id uuid not null references public.nurseries (id) on delete cascade,
  week_start date not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  notes text,
  file_path text,
  file_name text,
  file_type text check (file_type is null or file_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  file_size integer check (file_size is null or (file_size > 0 and file_size <= 5242880)),
  published_at timestamptz,
  published_by uuid references public.users (id) on delete set null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_weeks_nursery_week_uniq unique (nursery_id, week_start),
  -- Weeks run Saturday to Friday.
  constraint menu_weeks_starts_saturday check (extract(dow from week_start) = 6),
  constraint menu_weeks_notes_length check (notes is null or char_length(notes) <= 1000)
);

create table if not exists public.menu_dishes (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.menu_weeks (id) on delete cascade,
  nursery_id uuid not null references public.nurseries (id) on delete cascade,
  day date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'snacks')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  allergens text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_menu_dishes_week on public.menu_dishes (week_id, day, meal, sort_order);
create index if not exists idx_menu_dishes_nursery_day on public.menu_dishes (nursery_id, day);

drop trigger if exists trg_menu_weeks_updated_at on public.menu_weeks;
create trigger trg_menu_weeks_updated_at before update on public.menu_weeks
  for each row execute function public.set_updated_at();

-- The Saturday a day's week starts on.
create or replace function public.menu_week_start(p_day date)
returns date
language sql
immutable
as $$
  select p_day - ((extract(dow from p_day)::int + 1) % 7)
$$;

-- Who may change a nursery's menu: its admins, and staff whose role may update meals.
create or replace function public.menu_can_edit(p_nursery_id uuid)
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
    return v_nursery is not distinct from p_nursery_id and public.user_can('meals', 'update');
  end if;
  return false;
end;
$$;

-- Who may read a nursery's menu: its staff (drafts too) and the parents of its children (published only).
create or replace function public.menu_viewer_kind(p_nursery_id uuid)
returns text
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
    return null;
  end if;
  if public.is_xo_super_admin() then
    return 'staff';
  end if;
  select u.role, u.nursery_id, u.chain_id into v_role, v_nursery, v_chain from public.users u where u.id = auth.uid();
  if v_role = 'chain_super_admin' then
    return case when v_chain is not null and exists (select 1 from public.nurseries n where n.id = p_nursery_id and n.chain_id = v_chain) then 'staff' end;
  elsif v_role in ('branch_admin', 'manager', 'teacher') then
    return case when v_nursery is not distinct from p_nursery_id then 'staff' end;
  elsif v_role = 'parent' then
    return case when exists (
      select 1 from public.parent_children pc join public.children c on c.id = pc.child_id
       where pc.parent_id = auth.uid() and c.nursery_id = p_nursery_id
    ) or v_nursery is not distinct from p_nursery_id then 'parent' end;
  end if;
  return null;
end;
$$;

alter table public.menu_weeks enable row level security;
alter table public.menu_dishes enable row level security;

drop policy if exists menu_weeks_read on public.menu_weeks;
create policy menu_weeks_read on public.menu_weeks for select to authenticated
  using (
    public.menu_viewer_kind(nursery_id) = 'staff'
    or (public.menu_viewer_kind(nursery_id) = 'parent' and status = 'published')
  );

drop policy if exists menu_dishes_read on public.menu_dishes;
create policy menu_dishes_read on public.menu_dishes for select to authenticated
  using (exists (select 1 from public.menu_weeks w where w.id = menu_dishes.week_id));

-- The menu files: <nursery_id>/<week_start>/<file>, private.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-files', 'menu-files', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Menu editors upload menu files" on storage.objects;
create policy "Menu editors upload menu files" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'menu-files'
    and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
    and public.menu_can_edit(split_part(name, '/', 1)::uuid)
  );

drop policy if exists "Menu editors delete menu files" on storage.objects;
create policy "Menu editors delete menu files" on storage.objects for delete to authenticated
  using (
    bucket_id = 'menu-files'
    and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
    and public.menu_can_edit(split_part(name, '/', 1)::uuid)
  );

-- Staff read every file of their nursery; a parent only the file of a published week.
drop policy if exists "Nursery families read menu files" on storage.objects;
create policy "Nursery families read menu files" on storage.objects for select to authenticated
  using (
    bucket_id = 'menu-files'
    and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
    and (
      public.menu_viewer_kind(split_part(name, '/', 1)::uuid) = 'staff'
      or (
        public.menu_viewer_kind(split_part(name, '/', 1)::uuid) = 'parent'
        and exists (select 1 from public.menu_weeks w where w.file_path = name and w.status = 'published')
      )
    )
  );

-- -----------------------------------------------------------------------------------------------
-- 4. Allergy conflicts: every active child of the nursery whose food allergy meets a dish.
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

-- The conflicts the caller may see: staff the children they may see, a parent their own children.
create or replace function public.menu_visible_conflicts(p_nursery_id uuid, p_from date, p_to date)
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'dish_id', m.dish_id, 'day', m.day, 'meal', m.meal, 'dish_name', m.dish_name, 'week_status', m.week_status,
           'child_id', m.child_id, 'child_name_ar', m.child_name_ar, 'child_name_en', m.child_name_en,
           'class_name_ar', m.class_name_ar, 'class_name_en', m.class_name_en,
           'allergen', m.allergen, 'allergy_name', m.allergy_name, 'severity', m.severity,
           'reaction', m.reaction, 'treatment', m.treatment, 'eats_nursery_meals', m.eats_nursery_meals)
    from public.menu_allergy_conflicts(p_nursery_id, p_from, p_to) m
   where case public.menu_viewer_kind(p_nursery_id)
           when 'staff' then public.rls_staff_can_access_child(m.child_id)
           when 'parent' then m.week_status = 'published' and public.parent_can_access_child(m.child_id)
           else false
         end
   order by m.day, array_position(array['breakfast', 'lunch', 'snacks'], m.meal), m.dish_name,
            array_position(array['life_threatening', 'severe', 'moderate', 'mild'], m.severity) nulls last, m.child_name_en
$$;

revoke execute on function public.menu_visible_conflicts(uuid, date, date) from public, anon, authenticated;

-- One week of the menu as the caller may see it. Null week when there is none (or, for a parent,
-- when it is not published yet).
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
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

-- Saves a week's dishes and note in one go (replacing what was there); the week keeps its status.
-- p_dishes: [{ "day": "YYYY-MM-DD", "meal": "lunch", "name": "...", "allergens": ["milk"] }, ...]
create or replace function public.save_menu_week(p_nursery_id uuid, p_week_start date, p_notes text, p_dishes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date := public.menu_week_start(p_week_start);
  v_week_id uuid;
  v_dish jsonb;
  v_index integer := 0;
  v_day date;
  v_allergens text[];
begin
  if not public.menu_can_edit(p_nursery_id) then
    raise exception 'menu_forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_dishes, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_dishes, '[]'::jsonb)) > 100 then
    raise exception 'menu_invalid_dishes' using errcode = '22023';
  end if;
  if p_notes is not null and char_length(btrim(p_notes)) > 1000 then
    raise exception 'menu_notes_too_long' using errcode = '22023';
  end if;

  insert into public.menu_weeks (nursery_id, week_start, notes, created_by)
  values (p_nursery_id, v_start, nullif(btrim(coalesce(p_notes, '')), ''), auth.uid())
  on conflict (nursery_id, week_start) do update set notes = excluded.notes, updated_at = now()
  returning id into v_week_id;

  delete from public.menu_dishes where week_id = v_week_id;

  for v_dish in select value from jsonb_array_elements(coalesce(p_dishes, '[]'::jsonb)) loop
    v_index := v_index + 1;
    begin
      v_day := (v_dish ->> 'day')::date;
    exception when others then
      raise exception 'menu_invalid_dish' using errcode = '22023', detail = v_index::text;
    end;
    if v_day is null or v_day < v_start or v_day > v_start + 6
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
    values (v_week_id, p_nursery_id, v_day, v_dish ->> 'meal', btrim(v_dish ->> 'name'), v_allergens, v_index);
  end loop;

  update public.menu_weeks set updated_at = now() where id = v_week_id;
  return public.get_menu_week(p_nursery_id, v_start);
end;
$$;

-- Publishes a week for the parents, or takes it back to draft. The first publish of a week tells
-- the parents of the nursery's active children.
create or replace function public.set_menu_week_published(p_nursery_id uuid, p_week_start date, p_published boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date := public.menu_week_start(p_week_start);
  v_week public.menu_weeks%rowtype;
begin
  if not public.menu_can_edit(p_nursery_id) then
    raise exception 'menu_forbidden' using errcode = '42501';
  end if;
  select * into v_week from public.menu_weeks where nursery_id = p_nursery_id and week_start = v_start for update;
  if not found then
    raise exception 'menu_week_empty' using errcode = 'P0001';
  end if;
  if p_published then
    if v_week.file_path is null and not exists (select 1 from public.menu_dishes where week_id = v_week.id) then
      raise exception 'menu_week_empty' using errcode = 'P0001';
    end if;
    update public.menu_weeks
       set status = 'published', published_at = coalesce(published_at, now()), published_by = coalesce(published_by, auth.uid())
     where id = v_week.id;
    if v_week.published_at is null then
      perform public.notify_users(
        array(
          select distinct pc.parent_id
            from public.parent_children pc
            join public.children c on c.id = pc.child_id
           where c.nursery_id = p_nursery_id and c.status = 'active'
        ),
        p_nursery_id,
        'menu_published',
        'menu_published',
        jsonb_build_object('week_start', v_start),
        '/parent/meals?week=' || v_start::text
      );
    end if;
  else
    update public.menu_weeks set status = 'draft' where id = v_week.id;
  end if;
  return public.get_menu_week(p_nursery_id, v_start);
end;
$$;

-- Copies one week's dishes into another, empty, week (same weekdays); the copy is a draft.
create or replace function public.copy_menu_week(p_nursery_id uuid, p_from_week date, p_to_week date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from date := public.menu_week_start(p_from_week);
  v_to date := public.menu_week_start(p_to_week);
  v_source uuid;
  v_target uuid;
begin
  if not public.menu_can_edit(p_nursery_id) then
    raise exception 'menu_forbidden' using errcode = '42501';
  end if;
  select id into v_source from public.menu_weeks where nursery_id = p_nursery_id and week_start = v_from;
  if v_source is null or not exists (select 1 from public.menu_dishes where week_id = v_source) or v_from = v_to then
    raise exception 'menu_copy_source_empty' using errcode = 'P0001';
  end if;
  insert into public.menu_weeks (nursery_id, week_start, created_by)
  values (p_nursery_id, v_to, auth.uid())
  on conflict (nursery_id, week_start) do nothing;
  select id into v_target from public.menu_weeks where nursery_id = p_nursery_id and week_start = v_to;
  if exists (select 1 from public.menu_dishes where week_id = v_target) then
    raise exception 'menu_week_not_empty' using errcode = 'P0001';
  end if;
  insert into public.menu_dishes (week_id, nursery_id, day, meal, name, allergens, sort_order)
  select v_target, p_nursery_id, d.day + (v_to - v_from), d.meal, d.name, d.allergens, d.sort_order
    from public.menu_dishes d where d.week_id = v_source;
  update public.menu_weeks set updated_at = now() where id = v_target;
  return public.get_menu_week(p_nursery_id, v_to);
end;
$$;

-- Sets (or with a null path, removes) a week's menu file after it was uploaded to menu-files.
-- Returns the week and the previous file's path, which the app then deletes from storage.
create or replace function public.set_menu_week_file(
  p_nursery_id uuid, p_week_start date, p_path text, p_name text, p_type text, p_size integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date := public.menu_week_start(p_week_start);
  v_previous text;
begin
  if not public.menu_can_edit(p_nursery_id) then
    raise exception 'menu_forbidden' using errcode = '42501';
  end if;
  if p_path is not null and (
       split_part(p_path, '/', 1) <> p_nursery_id::text
       or coalesce(p_type, '') not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
       or p_size is null or p_size <= 0 or p_size > 5242880
     ) then
    raise exception 'menu_invalid_file' using errcode = '22023';
  end if;
  insert into public.menu_weeks (nursery_id, week_start, created_by)
  values (p_nursery_id, v_start, auth.uid())
  on conflict (nursery_id, week_start) do nothing;
  select file_path into v_previous from public.menu_weeks where nursery_id = p_nursery_id and week_start = v_start for update;
  update public.menu_weeks
     set file_path = p_path,
         file_name = case when p_path is null then null else left(coalesce(nullif(btrim(p_name), ''), 'menu'), 200) end,
         file_type = case when p_path is null then null else p_type end,
         file_size = case when p_path is null then null else p_size end
   where nursery_id = p_nursery_id and week_start = v_start;
  return jsonb_build_object(
    'previous_path', nullif(v_previous, p_path),
    'menu', public.get_menu_week(p_nursery_id, v_start)
  );
end;
$$;

-- The food allergy alerts of a period (drafts included, marked), for staff: each child who may not
-- eat a dish; optionally one child (the daily report). Also the children's allergies that name no
-- food allergen, which the menu is not checked against.
create or replace function public.get_food_allergy_alerts(p_nursery_id uuid, p_from date, p_to date, p_child_id uuid default null)
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
  if p_to < p_from or p_to - p_from > 62 then
    raise exception 'menu_invalid_range' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'conflicts', coalesce((
      select jsonb_agg(c) from public.menu_visible_conflicts(p_nursery_id, p_from, p_to) c
       where p_child_id is null or (c ->> 'child_id')::uuid = p_child_id
    ), '[]'::jsonb),
    'unmatched', coalesce((
      select jsonb_agg(jsonb_build_object(
               'child_id', ch.id, 'child_name_ar', ch.full_name_ar, 'child_name_en', ch.full_name_en,
               'allergy_name', a.allergen_name, 'severity', a.severity)
             order by ch.full_name_en, a.allergen_name)
        from public.child_allergies a
        join public.children ch on ch.id = a.child_id and ch.status = 'active' and ch.nursery_id = p_nursery_id
       where cardinality(a.food_allergens) = 0
         and public.rls_staff_can_access_child(ch.id)
         and (p_child_id is null or ch.id = p_child_id)
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.food_allergens_for(text) from public, anon;
grant execute on function public.food_allergens_for(text) to authenticated, service_role;
revoke execute on function public.menu_can_edit(uuid) from public, anon;
grant execute on function public.menu_can_edit(uuid) to authenticated, service_role;
revoke execute on function public.menu_viewer_kind(uuid) from public, anon;
grant execute on function public.menu_viewer_kind(uuid) to authenticated, service_role;
revoke execute on function public.get_menu_week(uuid, date) from public, anon;
grant execute on function public.get_menu_week(uuid, date) to authenticated, service_role;
revoke execute on function public.save_menu_week(uuid, date, text, jsonb) from public, anon;
grant execute on function public.save_menu_week(uuid, date, text, jsonb) to authenticated, service_role;
revoke execute on function public.set_menu_week_published(uuid, date, boolean) from public, anon;
grant execute on function public.set_menu_week_published(uuid, date, boolean) to authenticated, service_role;
revoke execute on function public.copy_menu_week(uuid, date, date) from public, anon;
grant execute on function public.copy_menu_week(uuid, date, date) to authenticated, service_role;
revoke execute on function public.set_menu_week_file(uuid, date, text, text, text, integer) from public, anon;
grant execute on function public.set_menu_week_file(uuid, date, text, text, text, integer) to authenticated, service_role;
revoke execute on function public.get_food_allergy_alerts(uuid, date, date, uuid) from public, anon;
grant execute on function public.get_food_allergy_alerts(uuid, date, date, uuid) to authenticated, service_role;

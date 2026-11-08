-- Database test · F&B: typed allergies read as food allergens; only menu editors save a week, and
-- every dish is checked; a parent sees a week only once published, and only their own child's
-- alerts; the first publish tells the parents once; staff alerts follow what they may see (a teacher
-- their classes), with the allergies the menu is not checked against; copying a week; the menu
-- file's path and the previous file to delete. Dates are relative to today. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(20);

select is(
  (select string_agg(format('%s=%s', x.t, public.food_allergens_for(x.t)), ' | ' order by x.n)
     from (values (1, 'Cow''smilk'), (2, 'Peanuts'), (3, 'Mixed nuts and milk'), (4, 'Penicillin'), (5, 'حساسية من اللبن والبيض'),
                  (6, 'eggplant'), (7, 'Peanut butter'), (8, 'Strawberries'), (9, 'Coconut'), (10, 'Shrimp, sesame')) as x(n, t)),
  'Cow''smilk={milk} | Peanuts={peanuts} | Mixed nuts and milk={milk,tree_nuts} | Penicillin={} | حساسية من اللبن والبيض={milk,eggs} | '
  || 'eggplant={} | Peanut butter={peanuts} | Strawberries={strawberry} | Coconut={} | Shrimp, sesame={shellfish,sesame}',
  'typed allergies read as the food allergens they name, and nothing else'
);

insert into public.nurseries (id, name_ar, name_en) values ('00000000-0000-4000-9300-00000000000a', 'حضانة الطعام', 'Food Nursery');

insert into auth.users (id, email) values
  ('00000000-0000-4000-9300-000000000a01', 'fnb.admin@test.local'),
  ('00000000-0000-4000-9300-000000000a02', 'fnb.teacher1@test.local'),
  ('00000000-0000-4000-9300-000000000a03', 'fnb.teacher2@test.local'),
  ('00000000-0000-4000-9300-000000000a04', 'fnb.parent@test.local'),
  ('00000000-0000-4000-9300-000000000a05', 'fnb.parent2@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = '00000000-0000-4000-9300-00000000000a', name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9300-000000000a01', 'branch_admin', 'Admin'),
    ('00000000-0000-4000-9300-000000000a02', 'teacher', 'Teacher One'),
    ('00000000-0000-4000-9300-000000000a03', 'teacher', 'Teacher Two'),
    ('00000000-0000-4000-9300-000000000a04', 'parent', 'Mona'),
    ('00000000-0000-4000-9300-000000000a05', 'parent', 'Karim')
  ) as v(id, role, name_en)
 where u.id = v.id::uuid;

insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-9300-0000000000b1', '00000000-0000-4000-9300-00000000000a', 'الفراشات', 'Butterflies'),
  ('00000000-0000-4000-9300-0000000000b2', '00000000-0000-4000-9300-00000000000a', 'النحل', 'Bees');
insert into public.class_staff (class_id, user_id, role) values
  ('00000000-0000-4000-9300-0000000000b1', '00000000-0000-4000-9300-000000000a02', 'lead'),
  ('00000000-0000-4000-9300-0000000000b2', '00000000-0000-4000-9300-000000000a03', 'lead');

insert into public.children (id, nursery_id, class_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-9300-0000000000c1', '00000000-0000-4000-9300-00000000000a', '00000000-0000-4000-9300-0000000000b1', 'ليلى', 'Laila', '2023-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9300-0000000000c2', '00000000-0000-4000-9300-00000000000a', '00000000-0000-4000-9300-0000000000b2', 'آدم', 'Adam', '2023-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9300-0000000000c3', '00000000-0000-4000-9300-00000000000a', '00000000-0000-4000-9300-0000000000b1', 'عمر', 'Omar', '2023-01-01', 'withdrawn', '2026-01-01'),
  ('00000000-0000-4000-9300-0000000000c4', '00000000-0000-4000-9300-00000000000a', '00000000-0000-4000-9300-0000000000b1', 'سارة', 'Sara', '2023-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9300-0000000000c5', '00000000-0000-4000-9300-00000000000a', '00000000-0000-4000-9300-0000000000b1', 'نور', 'Nour', '2023-01-01', 'active', '2026-01-01');
insert into public.parent_children (parent_id, child_id, is_primary) values
  ('00000000-0000-4000-9300-000000000a04', '00000000-0000-4000-9300-0000000000c1', true),
  ('00000000-0000-4000-9300-000000000a05', '00000000-0000-4000-9300-0000000000c2', true);

insert into public.child_allergies (child_id, nursery_id, allergen_name, severity) values
  ('00000000-0000-4000-9300-0000000000c1', '00000000-0000-4000-9300-00000000000a', 'Cow''s milk', 'severe'),
  ('00000000-0000-4000-9300-0000000000c2', '00000000-0000-4000-9300-00000000000a', 'Peanuts', 'life_threatening'),
  ('00000000-0000-4000-9300-0000000000c3', '00000000-0000-4000-9300-00000000000a', 'Milk', 'mild'),
  ('00000000-0000-4000-9300-0000000000c4', '00000000-0000-4000-9300-00000000000a', 'Penicillin', 'moderate'),
  ('00000000-0000-4000-9300-0000000000c5', '00000000-0000-4000-9300-00000000000a', 'بيض', 'mild');
insert into public.child_dietary_preferences (child_id, eats_nursery_meals) values ('00000000-0000-4000-9300-0000000000c5', false);

select is(
  (select food_allergens from public.child_allergies where child_id = '00000000-0000-4000-9300-0000000000c1'),
  array['milk'],
  'a child''s allergy keeps the food allergens it names'
);

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

-- This week's Saturday, and the three dishes of the week.
create function pg_temp.week() returns date language sql as $$ select public.menu_week_start((now() at time zone 'Africa/Cairo')::date) $$;
create function pg_temp.dishes() returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('day', pg_temp.week() + 1, 'meal', 'lunch', 'name', 'Rice pudding', 'allergens', jsonb_build_array('milk')),
    jsonb_build_object('day', pg_temp.week() + 1, 'meal', 'snacks', 'name', 'Peanut cookies', 'allergens', jsonb_build_array('peanuts', 'gluten')),
    jsonb_build_object('day', pg_temp.week() + 2, 'meal', 'breakfast', 'name', 'Omelette', 'allergens', jsonb_build_array('eggs'))
  )
$$;
-- A week's dishes as "dish: children", for comparing.
create function pg_temp.conflicts(p_menu jsonb) returns text language sql as $$
  select string_agg(format('%s: %s', d ->> 'name',
           coalesce((select string_agg(format('%s%s', c ->> 'child_name_en', case when (c ->> 'eats_nursery_meals')::boolean then '' else ' (own food)' end), ', ')
                       from jsonb_array_elements(d -> 'conflicts') c), '-')), ' | ')
    from jsonb_array_elements(p_menu -> 'dishes') d
$$;

-- ---------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-9300-000000000a02');
select throws_ok(
  format($$ select public.save_menu_week('00000000-0000-4000-9300-00000000000a', %L, null, '[]') $$, pg_temp.week()),
  '42501', 'menu_forbidden', 'a teacher without the meals permission cannot change the menu'
);
select pg_temp.act_as('00000000-0000-4000-9300-000000000a04');
select throws_ok(
  format($$ select public.save_menu_week('00000000-0000-4000-9300-00000000000a', %L, null, '[]') $$, pg_temp.week()),
  '42501', 'menu_forbidden', 'nor a parent'
);

select pg_temp.act_as('00000000-0000-4000-9300-000000000a01');
select throws_ok(
  format($$ select public.save_menu_week('00000000-0000-4000-9300-00000000000a', %L, null,
            jsonb_build_array(jsonb_build_object('day', %L::date + 9, 'meal', 'lunch', 'name', 'Soup'))) $$, pg_temp.week(), pg_temp.week()),
  '22023', 'menu_invalid_dish', 'a dish outside the week is refused'
);
select throws_ok(
  format($$ select public.save_menu_week('00000000-0000-4000-9300-00000000000a', %L, null,
            jsonb_build_array(jsonb_build_object('day', %L, 'meal', 'lunch', 'name', 'Soup', 'allergens', jsonb_build_array('chocolate')))) $$, pg_temp.week(), pg_temp.week()),
  '22023', 'menu_invalid_allergen', 'an allergen that is not in the list is refused'
);
select set_config('fnb.saved', public.save_menu_week('00000000-0000-4000-9300-00000000000a', pg_temp.week() + 3, ' Fresh fruit daily ', pg_temp.dishes())::text, true);

select is(
  pg_temp.conflicts(current_setting('fnb.saved')::jsonb) || ' / ' || (current_setting('fnb.saved')::jsonb -> 'week' ->> 'status')
    || ' / ' || (current_setting('fnb.saved')::jsonb -> 'week' ->> 'notes') || ' / ' || (current_setting('fnb.saved')::jsonb ->> 'week_start'),
  format('Rice pudding: Laila | Peanut cookies: Adam | Omelette: Nour (own food) / draft / Fresh fruit daily / %s', pg_temp.week()),
  'the admin saves the week (any day of it): each dish lists the active children allergic to it'
);

select is(
  (select format('milk=%s eggs=%s peanuts=%s',
                 (select string_agg(c ->> 'child_name_en', ',') from jsonb_array_elements(j -> 'allergy_index' -> 'milk') c),
                 (select string_agg(format('%s/%s', c ->> 'child_name_en', c ->> 'eats_nursery_meals'), ',') from jsonb_array_elements(j -> 'allergy_index' -> 'eggs') c),
                 (select string_agg(c ->> 'child_name_en', ',') from jsonb_array_elements(j -> 'allergy_index' -> 'peanuts') c))
     from (select public.get_menu_week('00000000-0000-4000-9300-00000000000a', pg_temp.week()) j) x),
  'milk=Laila eggs=Nour/false peanuts=Adam',
  'staff get which active children have each food allergy, to warn while tagging a dish'
);

select pg_temp.act_as('00000000-0000-4000-9300-000000000a04');
select is(
  (public.get_menu_week('00000000-0000-4000-9300-00000000000a', pg_temp.week()) -> 'allergy_index')::text,
  '{}',
  'a parent never gets the other children''s allergies'
);
select is(
  (select format('week=%s dishes=%s', j -> 'week', jsonb_array_length(j -> 'dishes'))
     from (select public.get_menu_week('00000000-0000-4000-9300-00000000000a', pg_temp.week()) j) x),
  'week=null dishes=0',
  'a parent does not see a draft'
);

select pg_temp.act_as('00000000-0000-4000-9300-000000000a01');
select throws_ok(
  format($$ select public.set_menu_week_published('00000000-0000-4000-9300-00000000000a', %L::date + 14, true) $$, pg_temp.week()),
  'P0001', 'menu_week_empty', 'an empty week cannot be published'
);
-- Published, back to draft, published again (set_config keeps each call out of the test output).
select set_config('fnb.p1', public.set_menu_week_published('00000000-0000-4000-9300-00000000000a', pg_temp.week(), true)::text, true);
select set_config('fnb.p2', public.set_menu_week_published('00000000-0000-4000-9300-00000000000a', pg_temp.week(), false)::text, true);
select set_config('fnb.p3', public.set_menu_week_published('00000000-0000-4000-9300-00000000000a', pg_temp.week(), true)::text, true);
reset role;

select is(
  (select string_agg(format('%s:%s', u.name_en, n.template_params ->> 'week_start'), ',' order by u.name_en)
     from public.notifications n join public.users u on u.id = n.user_id
    where n.type = 'menu_published' and n.nursery_id = '00000000-0000-4000-9300-00000000000a'),
  format('Karim:%s,Mona:%s', pg_temp.week(), pg_temp.week()),
  'the first publish tells each parent once; publishing again does not'
);

select pg_temp.act_as('00000000-0000-4000-9300-000000000a04');
select is(
  pg_temp.conflicts(public.get_menu_week('00000000-0000-4000-9300-00000000000a', pg_temp.week())),
  'Rice pudding: Laila | Peanut cookies: - | Omelette: -',
  'once published, a parent sees the menu with only their own child''s alerts'
);

select pg_temp.act_as('00000000-0000-4000-9300-000000000a02');
select is(
  (select format('conflicts=%s unmatched=%s',
                 (select string_agg(c ->> 'child_name_en', ',' order by c ->> 'child_name_en') from jsonb_array_elements(j -> 'conflicts') c),
                 (select string_agg(format('%s/%s', u ->> 'child_name_en', u ->> 'allergy_name'), ',') from jsonb_array_elements(j -> 'unmatched') u))
     from (select public.get_food_allergy_alerts('00000000-0000-4000-9300-00000000000a', pg_temp.week(), pg_temp.week() + 6) j) x),
  'conflicts=Laila,Nour unmatched=Sara/Penicillin',
  'a teacher sees the alerts of their class only, and the allergies the menu is not checked against'
);
select is(
  (select jsonb_array_length(public.get_food_allergy_alerts('00000000-0000-4000-9300-00000000000a', pg_temp.week(), pg_temp.week() + 6,
                                                             '00000000-0000-4000-9300-0000000000c1') -> 'conflicts')),
  1,
  'the alerts of one child (for the daily report)'
);

select pg_temp.act_as('00000000-0000-4000-9300-000000000a01');
select is(
  (select format('%s %s', j -> 'week' ->> 'status', (select string_agg(d ->> 'day', ',') from jsonb_array_elements(j -> 'dishes') d))
     from (select public.copy_menu_week('00000000-0000-4000-9300-00000000000a', pg_temp.week(), pg_temp.week() + 7) j) x),
  format('draft %s,%s,%s', pg_temp.week() + 8, pg_temp.week() + 8, pg_temp.week() + 9),
  'a week copies into the next one, on the same weekdays, as a draft'
);
select throws_ok(
  format($$ select public.copy_menu_week('00000000-0000-4000-9300-00000000000a', %L, %L::date + 7) $$, pg_temp.week(), pg_temp.week()),
  'P0001', 'menu_week_not_empty', 'a week that has dishes is not overwritten'
);

select throws_ok(
  format($$ select public.set_menu_week_file('00000000-0000-4000-9300-00000000000a', %L, 'another-nursery/menu.pdf', 'menu.pdf', 'application/pdf', 1000) $$, pg_temp.week()),
  '22023', 'menu_invalid_file', 'a file outside the nursery''s folder is refused'
);
select set_config('fnb.f1', public.set_menu_week_file('00000000-0000-4000-9300-00000000000a', pg_temp.week(),
  '00000000-0000-4000-9300-00000000000a/first.pdf', 'menu.pdf', 'application/pdf', 1000)::text, true);
select is(
  (public.set_menu_week_file('00000000-0000-4000-9300-00000000000a', pg_temp.week(),
     '00000000-0000-4000-9300-00000000000a/second.jpg', 'menu.jpg', 'image/jpeg', 2000) ->> 'previous_path'),
  '00000000-0000-4000-9300-00000000000a/first.pdf',
  'replacing the menu file names the previous one, to delete'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.get_menu_week(uuid, date)', 'execute')
  and not has_function_privilege('anon', 'public.save_menu_week(uuid, date, text, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.menu_allergy_conflicts(uuid, date, date)', 'execute'),
  'signed-out visitors cannot read or change menus, and the inner conflicts list is not callable'
);

select * from finish();
rollback;

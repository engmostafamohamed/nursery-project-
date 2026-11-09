-- Database test · the child's health profile: only the child's managers and parents read it, and only
-- the branch's admins change it; it gathers the blood type kept on the child, the parents, the
-- emergency contacts and medical pickups, and what the parents wrote at enrollment; reading creates
-- nothing; saving checks the phones, the contact and the blood type, and keeps the blood type on the
-- child; an allergy keeps the menu foods chosen for it and reads them from its name otherwise. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

insert into public.nurseries (id, name_ar, name_en) values
  ('00000000-0000-4000-9500-00000000000a', 'حضانة الصحة', 'Health Nursery'),
  ('00000000-0000-4000-9500-00000000000b', 'حضانة أخرى', 'Other Nursery');

insert into auth.users (id, email) values
  ('00000000-0000-4000-9500-000000000a01', 'health.admin@test.local'),
  ('00000000-0000-4000-9500-000000000a02', 'health.teacher@test.local'),
  ('00000000-0000-4000-9500-000000000a03', 'health.parent@test.local'),
  ('00000000-0000-4000-9500-000000000a04', 'health.other.parent@test.local'),
  ('00000000-0000-4000-9500-000000000a05', 'health.manager@test.local'),
  ('00000000-0000-4000-9500-000000000a06', 'health.other.admin@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = v.nursery::uuid, name_ar = v.name_ar, name_en = v.name_en, phone = v.phone, status = 'active'
  from (values
    ('00000000-0000-4000-9500-000000000a01', 'branch_admin', '00000000-0000-4000-9500-00000000000a', 'مدير', 'Admin', null),
    ('00000000-0000-4000-9500-000000000a02', 'teacher', '00000000-0000-4000-9500-00000000000a', 'معلمة', 'Teacher', null),
    ('00000000-0000-4000-9500-000000000a03', 'parent', '00000000-0000-4000-9500-00000000000a', 'منى', 'Mona', '+201000000001'),
    ('00000000-0000-4000-9500-000000000a04', 'parent', '00000000-0000-4000-9500-00000000000a', 'هالة', 'Hala', '+201000000002'),
    ('00000000-0000-4000-9500-000000000a05', 'manager', '00000000-0000-4000-9500-00000000000a', 'مديرة', 'Manager', null),
    ('00000000-0000-4000-9500-000000000a06', 'branch_admin', '00000000-0000-4000-9500-00000000000b', 'مدير آخر', 'Other admin', null)
  ) as v(id, role, nursery, name_ar, name_en, phone)
 where u.id = v.id::uuid;

insert into public.children (id, nursery_id, full_name_ar, full_name_en, dob, status, enrollment_date, blood_type, emergency_contacts, daily_care_preferences) values
  ('00000000-0000-4000-9500-0000000000c1', '00000000-0000-4000-9500-00000000000a', 'ليلى', 'Laila', '2023-01-01', 'active', '2026-01-01', 'B+',
   '[{"name": "Mona", "phone": "+201000000001", "relationship": "mother"}, {"full_name": "Aunt Sara", "mobile": "+201000000009", "relation": "aunt"}, "junk"]',
   '{"food_allergies": "Strawberries and chocolate", "emergency_medications": ["Paracetamol"], "medical_condition_details": "Mild asthma"}'),
  ('00000000-0000-4000-9500-0000000000c2', '00000000-0000-4000-9500-00000000000a', 'آدم', 'Adam', '2023-01-01', 'active', '2026-01-01', null, null, null);
insert into public.parent_children (parent_id, child_id, is_primary, is_emergency_contact, relationship) values
  ('00000000-0000-4000-9500-000000000a03', '00000000-0000-4000-9500-0000000000c1', true, true, 'mother'),
  ('00000000-0000-4000-9500-000000000a04', '00000000-0000-4000-9500-0000000000c2', true, true, 'mother');
insert into public.authorized_pickups (child_id, name, phone, relation, active, can_authorize_medical, valid_until) values
  ('00000000-0000-4000-9500-0000000000c1', 'Grandma', '+201000000005', 'grandmother', true, true, null),
  ('00000000-0000-4000-9500-0000000000c1', 'Driver', '+201000000006', 'driver', true, false, null),
  ('00000000-0000-4000-9500-0000000000c1', 'Old nanny', '+201000000007', 'nanny', true, true, current_date - 10);

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.profile() returns jsonb language sql as $$
  select public.get_child_health_profile('00000000-0000-4000-9500-0000000000c1')
$$;
create function pg_temp.foods(p_name text) returns text language sql as $$
  select array_to_string(food_allergens, ',') from public.child_allergies
   where child_id = '00000000-0000-4000-9500-0000000000c1' and allergen_name = p_name
$$;

-- ---------------------------------------------------------------------------------------------
-- Who may read
select pg_temp.act_as('00000000-0000-4000-9500-000000000a02');
select throws_ok($$ select pg_temp.profile() $$, '42501', 'health_forbidden', 'a teacher cannot read the health profile');
select pg_temp.act_as('00000000-0000-4000-9500-000000000a04');
select throws_ok($$ select pg_temp.profile() $$, '42501', 'health_forbidden', 'another child’s parent cannot read it');
select pg_temp.act_as('00000000-0000-4000-9500-000000000a06');
select throws_ok($$ select pg_temp.profile() $$, '42501', 'health_forbidden', 'another branch’s admin cannot read it');

select pg_temp.act_as('00000000-0000-4000-9500-000000000a03');
select is(pg_temp.profile() ->> 'viewer', 'parent', 'the child’s parent reads it as a parent');
select is((pg_temp.profile() ->> 'can_edit')::boolean, false, 'a parent cannot change it');
select pg_temp.act_as('00000000-0000-4000-9500-000000000a05');
select is((pg_temp.profile() ->> 'can_edit')::boolean, false, 'a manager reads it but cannot change it');

-- What it gathers
select pg_temp.act_as('00000000-0000-4000-9500-000000000a01');
select is(
  (select format('%s %s %s', p ->> 'viewer', p ->> 'can_edit', p -> 'child' ->> 'blood_type') from pg_temp.profile() p),
  'staff true B+', 'the branch admin reads and may change it, with the blood type kept on the child'
);
select is(
  (select string_agg(format('%s %s %s', e ->> 'name', e ->> 'phone', e ->> 'relationship'), ' | ') from jsonb_array_elements(pg_temp.profile() -> 'emergency_contacts') e),
  'Mona +201000000001 mother | Aunt Sara +201000000009 aunt', 'the enrollment’s emergency contacts are read whichever names their fields use'
);
select is(
  (select string_agg(format('%s %s %s', e ->> 'name_en', e ->> 'phone', e ->> 'is_emergency_contact'), ' | ') from jsonb_array_elements(pg_temp.profile() -> 'parents') e),
  'Mona +201000000001 true', 'the parents come with their phones'
);
select is(
  (select string_agg(e ->> 'name', ',') from jsonb_array_elements(pg_temp.profile() -> 'medical_pickups') e),
  'Grandma', 'only active pickups still valid who may authorise medical care are listed'
);
select is(
  (select format('%s / %s / %s', p -> 'enrollment' ->> 'food_allergies', p -> 'enrollment' ->> 'medical_condition_details', p -> 'enrollment' -> 'medication_consents' ->> 0) from pg_temp.profile() p),
  'Strawberries and chocolate / Mild asthma / Paracetamol', 'what the parents wrote at enrollment is shown'
);
select is((select count(*)::int from public.child_health_records where child_id = '00000000-0000-4000-9500-0000000000c1'), 0, 'reading the profile creates no health record');

-- Saving the overview
select throws_ok(
  $$ select public.save_child_health_overview('00000000-0000-4000-9500-0000000000c1', '{"pediatrician_phone": "0100 123"}') $$,
  '22023', 'health_phone_invalid', 'a phone must be a full number'
);
select throws_ok(
  $$ select public.save_child_health_overview('00000000-0000-4000-9500-0000000000c1', '{"emergency_contact_name": "Uncle"}') $$,
  '22023', 'health_contact_incomplete', 'an emergency contact needs a name and a phone'
);
select throws_ok(
  $$ select public.save_child_health_overview('00000000-0000-4000-9500-0000000000c1', '{"blood_type": "C+"}') $$,
  '22023', 'health_blood_type_invalid', 'only real blood types are kept'
);
select set_config('t.saved', public.save_child_health_overview('00000000-0000-4000-9500-0000000000c1',
  '{"blood_type": "O+", "pediatrician_name": " Dr. Hany ", "pediatrician_phone": "+20223456789", "emergency_contact_name": "Uncle Ali", "emergency_contact_phone": "+201000000008", "insurance_provider": "AXA"}')::text, true);
select is(
  (select format('%s %s %s %s', p -> 'child' ->> 'blood_type', p -> 'record' ->> 'pediatrician_name', p -> 'record' ->> 'emergency_contact_phone', p -> 'record' ->> 'insurance_provider') from pg_temp.profile() p),
  'O+ Dr. Hany +201000000008 AXA', 'the overview is saved, trimmed'
);
select is((select blood_type from public.children where id = '00000000-0000-4000-9500-0000000000c1'), 'O+', 'the blood type is kept on the child');
select set_config('t.cleared', public.save_child_health_overview('00000000-0000-4000-9500-0000000000c1', '{"blood_type": "", "pediatrician_name": "Dr. Hany"}')::text, true);
select is(
  (select format('%s|%s|%s', coalesce(p -> 'child' ->> 'blood_type', '-'), p -> 'record' ->> 'pediatrician_name', coalesce(p -> 'record' ->> 'insurance_provider', '-')) from pg_temp.profile() p),
  '-|Dr. Hany|-', 'saving again replaces the overview, emptied fields included'
);

select pg_temp.act_as('00000000-0000-4000-9500-000000000a05');
select throws_ok(
  $$ select public.save_child_health_overview('00000000-0000-4000-9500-0000000000c1', '{}') $$,
  '42501', 'health_forbidden', 'a manager cannot change the overview'
);

-- The menu foods of an allergy
select pg_temp.act_as('00000000-0000-4000-9500-000000000a01');
insert into public.child_allergies (child_id, nursery_id, allergen_name, severity) values
  ('00000000-0000-4000-9500-0000000000c1', '00000000-0000-4000-9500-00000000000a', 'Peanut butter cookies', 'severe');
insert into public.child_allergies (child_id, nursery_id, allergen_name, severity, food_allergens) values
  ('00000000-0000-4000-9500-0000000000c1', '00000000-0000-4000-9500-00000000000a', 'Chocolate', 'mild', array['milk']);
select is(pg_temp.foods('Peanut butter cookies') || ' / ' || pg_temp.foods('Chocolate'), 'peanuts / milk', 'a new allergy reads its foods from its name unless they are chosen');

update public.child_allergies set food_allergens = array['eggs', 'bogus', 'milk', 'eggs'] where allergen_name = 'Chocolate';
select is(pg_temp.foods('Chocolate'), 'milk,eggs', 'chosen foods are kept: known ones, once each, in the menu’s order');

update public.child_allergies set allergen_name = 'Fish fingers' where allergen_name = 'Chocolate';
select is(pg_temp.foods('Fish fingers'), 'fish', 'renaming an allergy without choosing its foods reads them from the new name');

update public.child_allergies set allergen_name = 'Cake', food_allergens = array['gluten', 'eggs'] where allergen_name = 'Fish fingers';
select is(pg_temp.foods('Cake'), 'eggs,gluten', 'renaming it and choosing its foods keeps the chosen foods');

select is(
  (select string_agg(format('%s:%s', a ->> 'allergen_name', a -> 'food_allergens'), ' | ') from jsonb_array_elements(pg_temp.profile() -> 'allergies') a),
  'Peanut butter cookies:["peanuts"] | Cake:["eggs", "gluten"]', 'the profile lists the allergies, the worst first, with their foods'
);

select * from finish();
rollback;

-- Database test · adding a child from the admin's side: a teacher without the permission cannot
-- search or enrol; the family is found by the father's or mother's name, a mobile (any spelling) or
-- the username, with the details their last application holds; the child is saved like an approved
-- application (names, gender, daily care, emergency contacts, address, class), linked to both
-- parents (the picked one first, each on their side), with the pickups, the documents and the
-- allergies the menu reads; the family is told; a wrong child id, document, parent or date is
-- refused. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(20);

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
-- Who a search finds, as "username, username".
create function pg_temp.found(p_term text) returns text language sql as $$
  select coalesce(string_agg(f ->> 'username', ', ' order by f ->> 'username'), '-')
    from jsonb_array_elements(public.enrollment_family_search('00000000-0000-4000-9f10-00000000000a', p_term)) f
$$;

-- A nursery with its admin, a teacher, a class, and a family with two accounts (Hany the father,
-- Mona the mother) who already have a child, Hany's last application naming them both.
insert into public.nurseries (id, name_ar, name_en) values ('00000000-0000-4000-9f10-00000000000a', 'حضانة', 'Enrol Nursery');
update public.nursery_settings set timezone = 'Africa/Cairo' where nursery_id = '00000000-0000-4000-9f10-00000000000a';
insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-9f10-0000000000b1', '00000000-0000-4000-9f10-00000000000a', 'العصافير', 'Birds');
insert into auth.users (id, email) values
  ('00000000-0000-4000-9f10-000000000a01', 'enrol.admin@test.local'),
  ('00000000-0000-4000-9f10-000000000a02', 'enrol.teacher@test.local'),
  ('00000000-0000-4000-9f10-000000000a03', 'enrol.hany@test.local'),
  ('00000000-0000-4000-9f10-000000000a04', 'enrol.mona@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = '00000000-0000-4000-9f10-00000000000a', name_en = v.name_en, name_ar = v.name_en,
       username = v.username, phone = v.phone, status = 'active'
  from (values
    ('00000000-0000-4000-9f10-000000000a01', 'branch_admin', 'Admin', null, null),
    ('00000000-0000-4000-9f10-000000000a02', 'teacher', 'Teacher', null, null),
    ('00000000-0000-4000-9f10-000000000a03', 'parent', 'Hany Adel', 'hany.adel', '+201001234567'),
    ('00000000-0000-4000-9f10-000000000a04', 'parent', 'Mona Samir', 'mona.samir', '+201117654321')
  ) as v(id, role, name_en, username, phone)
 where u.id = v.id::uuid;
insert into public.children (id, nursery_id, full_name_ar, full_name_en, dob, status, enrollment_date, home_address, emergency_contacts) values
  ('00000000-0000-4000-9f10-0000000000c1', '00000000-0000-4000-9f10-00000000000a', 'آدم', 'Adam', '2022-01-01', 'active', '2025-09-01',
   '5 Nile St', '[{"name": "Grandma", "phone": "01012341234", "relationship": "grandmother"}]');
insert into public.parent_children (parent_id, child_id, is_primary, parent_type, relationship, national_id) values
  ('00000000-0000-4000-9f10-000000000a03', '00000000-0000-4000-9f10-0000000000c1', true, 'father', 'father', '29001011234567'),
  ('00000000-0000-4000-9f10-000000000a04', '00000000-0000-4000-9f10-0000000000c1', false, 'mother', 'mother', null);
insert into public.applications (nursery_id, parent_id, status, parent_info_json) values
  ('00000000-0000-4000-9f10-00000000000a', '00000000-0000-4000-9f10-000000000a03', 'approved',
   '{"full_name": "Hany Adel", "father": {"full_name": "Hany Adel", "mobile": "01001234567"}, "mother": {"full_name": "Mona Samir Fahmy", "mobile": "01117654321"}, "family": {"address": "5 Nile St", "marital_status": "married"}}');

-- Who may
select pg_temp.act_as('00000000-0000-4000-9f10-000000000a02');
select throws_ok($$ select public.enrollment_family_search('00000000-0000-4000-9f10-00000000000a', 'Hany') $$,
  '42501', 'enrollment_forbidden', 'a teacher without the enrolment permission cannot search the families');
reset role;

-- Finding the family
select pg_temp.act_as('00000000-0000-4000-9f10-000000000a01');
select is(pg_temp.found('hany'), 'hany.adel, mona.samir', 'by the father''s name: his account, and the mother''s through their child');
select is(pg_temp.found('Fahmy'), 'hany.adel', 'by the mother''s name as the family wrote it in the application');
select is(pg_temp.found('01117654321'), 'hany.adel, mona.samir', 'by a mobile written with the leading 0 (stored as +20…)');
select is(pg_temp.found('mona.s'), 'mona.samir', 'by the username');
select is(pg_temp.found('x'), '-', 'one letter finds nothing');
select is((select f #>> '{parent_info,mother,full_name}' from jsonb_array_elements(public.enrollment_family_search('00000000-0000-4000-9f10-00000000000a', 'hany.adel')) f),
  'Mona Samir Fahmy', 'the family''s details come from their last application');
select is((select f #>> '{parent_info,father,full_name}' from jsonb_array_elements(public.enrollment_family_search('00000000-0000-4000-9f10-00000000000a', 'mona.samir')) f),
  'Hany Adel', 'or, with no application of their own, from the accounts of the family');

-- Saving the child
select public.staff_enroll_child(
  '00000000-0000-4000-9f10-00000000000a', '00000000-0000-4000-9f10-000000000a03', '00000000-0000-4000-9f10-0000000000c2',
  '{"full_name": "Hany Adel", "address": "5 Nile St", "family": {"address": "5 Nile St"},
    "pickups": [{"name": "Uncle Sami", "phone": "01055551234", "relation": "uncle", "authorization": "scheduled"}]}',
  '{"first_name": "Laila", "middle_name": "Hany", "last_name": "Adel", "nickname": "Lulu", "dob": "2024-03-01", "gender": "female",
    "nationality": "EG", "has_siblings": true, "sibling_ages": "4",
    "daily_care_preferences": {"has_allergy": true, "allergy_types": ["peanuts", "other"], "allergy_other_details": "Kiwi", "nap_time_preference": "Yes"},
    "emergency_contacts": [{"name": "Grandma", "phone": "01012341234", "relationship": "grandmother"}]}',
  '{"birth_certificate": "00000000-0000-4000-9f10-00000000000a/00000000-0000-4000-9f10-0000000000c2/birth_certificate.pdf",
    "parent_id": "00000000-0000-4000-9f10-00000000000a/00000000-0000-4000-9f10-0000000000c2/parent_id.jpg"}',
  '00000000-0000-4000-9f10-0000000000b1');
reset role;
select is((select concat_ws(' | ', full_name_en, gender, nationality, class_id::text, home_address, status, birth_certificate_url is not null, emergency_contacts -> 0 ->> 'name', daily_care_preferences ->> 'nap_time_preference')
             from public.children where id = '00000000-0000-4000-9f10-0000000000c2'),
  'Laila Hany Adel | female | EG | 00000000-0000-4000-9f10-0000000000b1 | 5 Nile St | active | t | Grandma | Yes',
  'the child is saved as an approved application saves it, in the chosen class');
select is((select string_agg(u.username || ':' || coalesce(pc.parent_type, '-') || ':' || pc.is_primary, ', ' order by u.username)
             from public.parent_children pc join public.users u on u.id = pc.parent_id where pc.child_id = '00000000-0000-4000-9f10-0000000000c2'),
  'hany.adel:father:true, mona.samir:mother:false', 'both parents are linked, the picked one first, each on their side');
select is((select name || ' ' || authorization_level || ' ' || verification_status from public.authorized_pickups where child_id = '00000000-0000-4000-9f10-0000000000c2'),
  'Uncle Sami scheduled verified', 'the pickups the family gave');
select is((select string_agg(document_type || coalesce(':' || notes, ''), ', ' order by document_type) from public.child_documents where child_id = '00000000-0000-4000-9f10-0000000000c2'),
  'birth_certificate, other:parent_id', 'the documents are on the child''s record');
select is((select string_agg(allergen_name, ', ' order by allergen_name) from public.child_allergies where child_id = '00000000-0000-4000-9f10-0000000000c2'),
  'Kiwi, Peanuts', 'the allergies picked become the child''s allergy records');
select ok((select 'peanuts' = any (food_allergens) from public.child_allergies where child_id = '00000000-0000-4000-9f10-0000000000c2' and allergen_name = 'Peanuts'),
  'which the menu reads (peanuts)');
select is((select count(*)::int from public.notifications where template_key = 'child_enrolled'
            and user_id in ('00000000-0000-4000-9f10-000000000a03', '00000000-0000-4000-9f10-000000000a04')), 2, 'both parents are told');

-- Refused
select pg_temp.act_as('00000000-0000-4000-9f10-000000000a01');
select throws_ok($$ select public.staff_enroll_child('00000000-0000-4000-9f10-00000000000a', '00000000-0000-4000-9f10-000000000a03',
    '00000000-0000-4000-9f10-0000000000c2', '{}', '{"first_name": "A", "last_name": "B", "dob": "2024-01-01"}') $$,
  '23505', 'enrollment_child_exists', 'a child id used already');
select throws_ok($$ select public.staff_enroll_child('00000000-0000-4000-9f10-00000000000a', '00000000-0000-4000-9f10-000000000a03',
    '00000000-0000-4000-9f10-0000000000c3', '{}', '{"first_name": "A", "last_name": "B", "dob": "2024-01-01"}',
    '{"birth_certificate": "another-nursery/x/birth.pdf"}') $$,
  '22023', 'enrollment_document_invalid', 'a document outside the child''s folder');
select throws_ok($$ select public.staff_enroll_child('00000000-0000-4000-9f10-00000000000a', '00000000-0000-4000-9f10-000000000a02',
    '00000000-0000-4000-9f10-0000000000c3', '{}', '{"first_name": "A", "last_name": "B", "dob": "2024-01-01"}') $$,
  '22023', 'enrollment_family_not_found', 'a member of staff is not a family');
select throws_ok($$ select public.staff_enroll_child('00000000-0000-4000-9f10-00000000000a', '00000000-0000-4000-9f10-000000000a03',
    '00000000-0000-4000-9f10-0000000000c3', '{}', format('{"first_name": "A", "last_name": "B", "dob": "%s"}', current_date + 3)::jsonb) $$,
  '22023', 'enrollment_dob_invalid', 'a birth date to come');
reset role;
select pg_temp.act_as('00000000-0000-4000-9f10-000000000a02');
select throws_ok($$ select public.staff_enroll_child('00000000-0000-4000-9f10-00000000000a', '00000000-0000-4000-9f10-000000000a03',
    '00000000-0000-4000-9f10-0000000000c3', '{}', '{"first_name": "A", "last_name": "B", "dob": "2024-01-01"}') $$,
  '42501', 'enrollment_forbidden', 'a teacher without the permission cannot enrol');
reset role;

select * from finish();
rollback;

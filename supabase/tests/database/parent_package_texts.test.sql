-- Database test · The nursery's own texts above the packages parents choose from: who may save
-- them, that blanks mean "standard text", and that parents of the nursery can read them.
-- Everything runs in one transaction that is rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

insert into public.nurseries (id, name_ar, name_en) values
  ('00000000-0000-4000-a000-00000000000a', 'حضانة أ', 'Nursery A'),
  ('00000000-0000-4000-a000-00000000000b', 'حضانة ب', 'Nursery B');

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000a01', 'texts.admin@test.local'),
  ('00000000-0000-4000-a000-000000000a02', 'texts.finance@test.local'),
  ('00000000-0000-4000-a000-000000000a03', 'texts.hr@test.local'),
  ('00000000-0000-4000-a000-000000000a06', 'texts.parent@test.local'),
  ('00000000-0000-4000-a000-000000000b01', 'texts.admin.b@test.local');

update public.users u
   set role = v.role::public.user_role,
       nursery_id = v.nursery_id::uuid,
       department = v.department::public.user_department,
       status = 'active'
  from (values
    ('00000000-0000-4000-a000-000000000a01', 'branch_admin', '00000000-0000-4000-a000-00000000000a', null),
    ('00000000-0000-4000-a000-000000000a02', 'manager',      '00000000-0000-4000-a000-00000000000a', 'finance'),
    ('00000000-0000-4000-a000-000000000a03', 'manager',      '00000000-0000-4000-a000-00000000000a', 'hr'),
    ('00000000-0000-4000-a000-000000000a06', 'parent',       '00000000-0000-4000-a000-00000000000a', null),
    ('00000000-0000-4000-a000-000000000b01', 'branch_admin', '00000000-0000-4000-a000-00000000000b', null)
  ) as v(id, role, nursery_id, department)
 where u.id = v.id::uuid;

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

-- ---------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-a000-000000000a01');

select lives_ok(
  $$ select public.set_parent_package_texts('00000000-0000-4000-a000-00000000000a',
       '  ادفع رسوم الباقة مرة واحدة  ', 'Pay the package once', 'اختر الخطة', '', 'باقات التأخير', null) $$,
  'the branch admin saves the texts'
);

reset role;
select is(
  (select (parent_payment_intro_ar, parent_payment_intro_en, parent_tuition_intro_en, parent_extra_hours_intro_en)::text
     from public.nursery_settings where nursery_id = '00000000-0000-4000-a000-00000000000a'),
  '("ادفع رسوم الباقة مرة واحدة","Pay the package once",,)',
  'texts are trimmed and a blank box is stored as empty (standard text)'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000a02');
select lives_ok(
  $$ select public.set_parent_package_texts('00000000-0000-4000-a000-00000000000a',
       null, null, 'اختر الخطة المناسبة', 'Choose the plan that suits you', 'باقات التأخير', 'Late pickup packs') $$,
  'the finance manager, who manages packages, saves the texts'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000a03');
select throws_ok(
  $$ select public.set_parent_package_texts('00000000-0000-4000-a000-00000000000a', 'x', 'x', 'x', 'x', 'x', 'x') $$,
  '42501', 'parent_texts_forbidden',
  'an HR manager cannot change them'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000a06');
select throws_ok(
  $$ select public.set_parent_package_texts('00000000-0000-4000-a000-00000000000a', 'x', 'x', 'x', 'x', 'x', 'x') $$,
  '42501', 'parent_texts_forbidden',
  'a parent cannot change them'
);

select is(
  (select (parent_tuition_intro_en, parent_extra_hours_intro_ar)::text
     from public.nursery_settings where nursery_id = '00000000-0000-4000-a000-00000000000a'),
  '("Choose the plan that suits you","باقات التأخير")',
  'a parent of the nursery reads the texts'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000b01');
select throws_ok(
  $$ select public.set_parent_package_texts('00000000-0000-4000-a000-00000000000a', 'x', 'x', 'x', 'x', 'x', 'x') $$,
  '42501', 'parent_texts_forbidden',
  'an admin of another nursery cannot change them'
);

select is(
  (select count(*)::int from public.nursery_settings where nursery_id = '00000000-0000-4000-a000-00000000000a'),
  0,
  'an admin of another nursery cannot read them'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000a01');
select throws_ok(
  $$ select public.set_parent_package_texts('00000000-0000-4000-a000-00000000000a',
       repeat('ا', 501), null, null, null, null, null) $$,
  '23514', null,
  'a text longer than 500 characters is refused'
);

select throws_ok(
  $$ select public.set_parent_package_texts(null, 'x', 'x', 'x', 'x', 'x', 'x') $$,
  '42501', 'parent_texts_forbidden',
  'a nursery must be named'
);

reset role;
select * from finish();
rollback;

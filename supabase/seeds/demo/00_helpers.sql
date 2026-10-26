-- Demo seed · 00 · Helpers
--
-- A `seed` schema the other files use, dropped again by 99_finish.sql:
--   * seed.rnd(key) and friends: "random" values that are the same on every run, so re-running the
--     seed gives the same data (and the same ids, from seed.uid).
--   * seed.names: Egyptian first and family names, in Arabic and English.
--   * seed.branches, seed.class_plan: the chain's 20 branches and the 10 classes every branch has.
--   * seed.config: the shared values (the demo password, the main branch, the days the seed covers).

create schema if not exists seed;

-- A number in [0, 1): the same key always gives the same number.
create or replace function seed.rnd(p_key text) returns double precision
language sql immutable
as $$ select ((('x' || substr(md5(p_key), 1, 8))::bit(32)::bigint) & 2147483647)::double precision / 2147483648 $$;

create or replace function seed.int_between(p_lo integer, p_hi integer, p_key text) returns integer
language sql immutable
as $$ select p_lo + floor(seed.rnd(p_key) * (p_hi - p_lo + 1))::integer $$;

create or replace function seed.chance(p_percent numeric, p_key text) returns boolean
language sql immutable
as $$ select seed.rnd(p_key) * 100 < p_percent $$;

create or replace function seed.pick(p_items text[], p_key text) returns text
language sql immutable
as $$ select p_items[1 + floor(seed.rnd(p_key) * cardinality(p_items))::integer] $$;

-- p_items[i] with weight p_weights[i].
create or replace function seed.pick_weighted(p_items text[], p_weights integer[], p_key text) returns text
language plpgsql immutable
as $$
declare
  v_total integer := (select sum(w) from unnest(p_weights) w);
  v_target double precision := seed.rnd(p_key) * v_total;
  v_acc integer := 0;
begin
  for i in 1 .. cardinality(p_items) loop
    v_acc := v_acc + p_weights[i];
    if v_target < v_acc then
      return p_items[i];
    end if;
  end loop;
  return p_items[cardinality(p_items)];
end;
$$;

-- A stable id per key: a seeded row keeps its id from one run to the next.
create or replace function seed.uid(p_key text) returns uuid
language sql immutable
as $$ select md5('xo-demo-seed:' || p_key)::uuid $$;

-- An Egyptian mobile number (010/011/012/015 and eight digits).
create or replace function seed.phone(p_key text) returns text
language sql immutable
as $$ select '+20' || seed.pick(array['10', '11', '12', '15'], p_key || ':op') || lpad(seed.int_between(0, 99999999, p_key || ':no')::text, 8, '0') $$;

-- A 14-digit Egyptian national id for someone born on p_born.
create or replace function seed.national_id(p_born date, p_key text) returns text
language sql immutable
as $$
  select (case when extract(year from p_born) >= 2000 then '3' else '2' end)
         || to_char(p_born, 'YYMMDD')
         || lpad(seed.int_between(1, 35, p_key || ':gov')::text, 2, '0')
         || lpad(seed.int_between(0, 99999, p_key || ':serial')::text, 5, '0')
$$;

-- -----------------------------------------------------------------------------------------------
-- Names
create table if not exists seed.names (kind text not null, n integer not null, ar text not null, en text not null, primary key (kind, n));
truncate seed.names;

insert into seed.names (kind, n, ar, en)
select 'boy', row_number() over (), ar, en from (values
  ('محمد', 'Mohamed'), ('أحمد', 'Ahmed'), ('محمود', 'Mahmoud'), ('مصطفى', 'Mostafa'), ('عمر', 'Omar'), ('يوسف', 'Youssef'),
  ('آدم', 'Adam'), ('علي', 'Ali'), ('حسن', 'Hassan'), ('حسين', 'Hussein'), ('خالد', 'Khaled'), ('كريم', 'Karim'),
  ('زياد', 'Ziad'), ('مالك', 'Malek'), ('سليم', 'Selim'), ('ياسين', 'Yassin'), ('إياد', 'Eyad'), ('حمزة', 'Hamza'),
  ('مازن', 'Mazen'), ('تيم', 'Teim'), ('نوح', 'Noah'), ('عبدالله', 'Abdallah'), ('إبراهيم', 'Ibrahim'), ('طارق', 'Tarek'),
  ('شريف', 'Sherif'), ('هشام', 'Hesham'), ('وليد', 'Walid'), ('أيمن', 'Ayman'), ('سامح', 'Sameh'), ('عمرو', 'Amr'),
  ('رامي', 'Ramy'), ('باسم', 'Bassem'), ('تامر', 'Tamer'), ('هاني', 'Hany'), ('ماجد', 'Maged'), ('نادر', 'Nader'),
  ('فارس', 'Fares'), ('مراد', 'Mourad'), ('سيف', 'Seif'), ('أنس', 'Anas'), ('معاذ', 'Moaz'), ('بلال', 'Belal'),
  ('عادل', 'Adel'), ('جمال', 'Gamal'), ('سامي', 'Samy'), ('شادي', 'Shady'), ('أدهم', 'Adham'), ('رضا', 'Reda')
) v(ar, en);

insert into seed.names (kind, n, ar, en)
select 'girl', row_number() over (), ar, en from (values
  ('فاطمة', 'Fatma'), ('مريم', 'Mariam'), ('ليلى', 'Laila'), ('سلمى', 'Salma'), ('نور', 'Nour'), ('جنى', 'Jana'),
  ('حبيبة', 'Habiba'), ('فريدة', 'Farida'), ('ملك', 'Malak'), ('رقية', 'Roqaya'), ('هنا', 'Hana'), ('تالية', 'Talia'),
  ('ليان', 'Layan'), ('جودي', 'Joudy'), ('سارة', 'Sara'), ('ياسمين', 'Yasmin'), ('رنا', 'Rana'), ('دينا', 'Dina'),
  ('منى', 'Mona'), ('هبة', 'Heba'), ('نهى', 'Noha'), ('إيمان', 'Eman'), ('أسماء', 'Asmaa'), ('رحاب', 'Rehab'),
  ('شيماء', 'Shaimaa'), ('مروة', 'Marwa'), ('دعاء', 'Doaa'), ('آية', 'Aya'), ('نسمة', 'Nesma'), ('ريم', 'Reem'),
  ('هالة', 'Hala'), ('سمر', 'Samar'), ('غادة', 'Ghada'), ('نادية', 'Nadia'), ('عزة', 'Azza'), ('ميار', 'Mayar'),
  ('لجين', 'Logain'), ('روان', 'Rawan'), ('كنزي', 'Kenzy'), ('تقى', 'Toqa'), ('جميلة', 'Gamila'), ('زينب', 'Zeinab'),
  ('بسمة', 'Basma'), ('سهى', 'Soha'), ('علياء', 'Alyaa'), ('ندى', 'Nada'), ('رضوى', 'Radwa'), ('أميرة', 'Amira')
) v(ar, en);

-- Family names (a grandfather's or family name, as Egyptian full names end).
insert into seed.names (kind, n, ar, en)
select 'family', row_number() over (), ar, en from (values
  ('حسن', 'Hassan'), ('عبدالرحمن', 'Abdelrahman'), ('السيد', 'El Sayed'), ('إبراهيم', 'Ibrahim'), ('مصطفى', 'Mostafa'),
  ('عبدالله', 'Abdallah'), ('الشريف', 'El Sherif'), ('النجار', 'El Naggar'), ('الشافعي', 'El Shafei'), ('سليمان', 'Soliman'),
  ('فهمي', 'Fahmy'), ('رشدي', 'Roshdy'), ('شاكر', 'Shaker'), ('عثمان', 'Osman'), ('زكي', 'Zaki'), ('منصور', 'Mansour'),
  ('بدوي', 'Badawy'), ('حافظ', 'Hafez'), ('عبدالعزيز', 'Abdelaziz'), ('الدسوقي', 'El Desouky'), ('القاضي', 'El Kady'),
  ('الجمال', 'El Gamal'), ('سالم', 'Salem'), ('نصار', 'Nassar'), ('درويش', 'Darwish'), ('عاشور', 'Ashour'), ('رمضان', 'Ramadan'),
  ('شعبان', 'Shaaban'), ('توفيق', 'Tawfik'), ('يوسف', 'Youssef'), ('عبدالحميد', 'Abdelhamid'), ('الحسيني', 'El Husseiny'),
  ('مرسي', 'Morsy'), ('خليل', 'Khalil'), ('جاد', 'Gad'), ('صبري', 'Sabry'), ('فؤاد', 'Fouad'), ('كامل', 'Kamel'),
  ('الشناوي', 'El Shenawy'), ('البنا', 'El Banna'), ('عيسى', 'Eissa'), ('ماهر', 'Maher'), ('غنيم', 'Ghoneim'), ('حمدي', 'Hamdy')
) v(ar, en);

-- Jobs for the parents' profiles.
insert into seed.names (kind, n, ar, en)
select 'job', row_number() over (), ar, en from (values
  ('مهندس برمجيات', 'Software engineer'), ('طبيب', 'Doctor'), ('محاسب', 'Accountant'), ('معلم', 'Teacher'), ('صيدلي', 'Pharmacist'),
  ('محامي', 'Lawyer'), ('مهندس مدني', 'Civil engineer'), ('مدير مبيعات', 'Sales manager'), ('مصمم جرافيك', 'Graphic designer'),
  ('موظف بنك', 'Banker'), ('رائد أعمال', 'Entrepreneur'), ('طبيب أسنان', 'Dentist'), ('مدير مشروعات', 'Project manager'),
  ('مهندس كهرباء', 'Electrical engineer'), ('مترجم', 'Translator'), ('صحفي', 'Journalist')
) v(ar, en);

create or replace function seed.name_ar(p_kind text, p_key text) returns text
language sql stable
as $$ select ar from seed.names where kind = p_kind and n = 1 + floor(seed.rnd(p_key) * (select count(*) from seed.names where kind = p_kind))::integer $$;

create or replace function seed.name_en(p_kind text, p_key text) returns text
language sql stable
as $$ select en from seed.names where kind = p_kind and n = 1 + floor(seed.rnd(p_key) * (select count(*) from seed.names where kind = p_kind))::integer $$;

-- -----------------------------------------------------------------------------------------------
-- The chain's branches: 1 is the existing main branch (Cherries, with the demo accounts).
create table if not exists seed.branches (
  n integer primary key, name_ar text not null, name_en text not null, city_ar text not null, city_en text not null,
  address_ar text not null, address_en text not null
);
truncate seed.branches;
insert into seed.branches values
  (1, 'شيريز', 'Cherries', 'الشيخ زايد', 'Sheikh Zayed', 'الحي الثامن، المجاورة الأولى، الشيخ زايد', 'District 8, 1st Neighbourhood, Sheikh Zayed'),
  (2, 'شيريز المعادي', 'Cherries Maadi', 'المعادي', 'Maadi', 'شارع 9، المعادي', '9th Street, Maadi'),
  (3, 'شيريز مصر الجديدة', 'Cherries Heliopolis', 'مصر الجديدة', 'Heliopolis', 'شارع الميرغني، مصر الجديدة', 'El Merghany Street, Heliopolis'),
  (4, 'شيريز مدينة نصر', 'Cherries Nasr City', 'مدينة نصر', 'Nasr City', 'شارع عباس العقاد، مدينة نصر', 'Abbas El Akkad Street, Nasr City'),
  (5, 'شيريز التجمع الخامس', 'Cherries Fifth Settlement', 'القاهرة الجديدة', 'New Cairo', 'شارع التسعين، التجمع الخامس', 'North 90th Street, Fifth Settlement'),
  (6, 'شيريز الرحاب', 'Cherries Rehab', 'الرحاب', 'Rehab City', 'المرحلة الخامسة، الرحاب', 'Phase 5, Rehab City'),
  (7, 'شيريز مدينتي', 'Cherries Madinaty', 'مدينتي', 'Madinaty', 'المجموعة B6، مدينتي', 'Group B6, Madinaty'),
  (8, 'شيريز الشروق', 'Cherries El Shorouk', 'الشروق', 'El Shorouk', 'الحي الأول، الشروق', '1st District, El Shorouk'),
  (9, 'شيريز الزمالك', 'Cherries Zamalek', 'الزمالك', 'Zamalek', 'شارع 26 يوليو، الزمالك', '26th of July Street, Zamalek'),
  (10, 'شيريز المهندسين', 'Cherries Mohandessin', 'المهندسين', 'Mohandessin', 'شارع شهاب، المهندسين', 'Shehab Street, Mohandessin'),
  (11, 'شيريز الدقي', 'Cherries Dokki', 'الدقي', 'Dokki', 'شارع التحرير، الدقي', 'Tahrir Street, Dokki'),
  (12, 'شيريز 6 أكتوبر', 'Cherries 6th of October', '6 أكتوبر', '6th of October', 'الحي المتميز، 6 أكتوبر', 'Distinguished District, 6th of October'),
  (13, 'شيريز الهرم', 'Cherries Haram', 'الهرم', 'Haram', 'شارع الهرم، الجيزة', 'Haram Street, Giza'),
  (14, 'شيريز سموحة', 'Cherries Smouha', 'الإسكندرية', 'Alexandria', 'شارع فوزي معاذ، سموحة', 'Fawzy Moaz Street, Smouha'),
  (15, 'شيريز سيدي جابر', 'Cherries Sidi Gaber', 'الإسكندرية', 'Alexandria', 'شارع أبو قير، سيدي جابر', 'Abu Qir Street, Sidi Gaber'),
  (16, 'شيريز المنصورة', 'Cherries Mansoura', 'المنصورة', 'Mansoura', 'شارع الجمهورية، المنصورة', 'El Gomhoreya Street, Mansoura'),
  (17, 'شيريز طنطا', 'Cherries Tanta', 'طنطا', 'Tanta', 'شارع البحر، طنطا', 'El Bahr Street, Tanta'),
  (18, 'شيريز الإسماعيلية', 'Cherries Ismailia', 'الإسماعيلية', 'Ismailia', 'شارع محمد علي، الإسماعيلية', 'Mohamed Ali Street, Ismailia'),
  (19, 'شيريز العبور', 'Cherries El Obour', 'العبور', 'El Obour', 'الحي الثالث، العبور', '3rd District, El Obour'),
  (20, 'شيريز الغردقة', 'Cherries Hurghada', 'الغردقة', 'Hurghada', 'منطقة الأحياء، الغردقة', 'El Ahyaa, Hurghada');

-- Every branch's 10 classes, 25 children each, by age (in months at the start of the school year).
create table if not exists seed.class_plan (
  slot integer primary key, name_ar text not null, name_en text not null, grade_level text not null,
  age_from_months integer not null, age_to_months integer not null
);
truncate seed.class_plan;
insert into seed.class_plan values
  (1, 'الحملان الصغيرة', 'Little Lambs', 'Babies (6-12m)', 6, 12),
  (2, 'عباد الشمس', 'Sunflowers', 'Infants (1-2y)', 12, 24),
  (3, 'الدعسوقات', 'Ladybugs', 'Infants (1-2y)', 12, 24),
  (4, 'الفراشات', 'Butterflies', 'Toddlers (2-3y)', 24, 36),
  (5, 'النحلات', 'Bumblebees', 'Toddlers (2-3y)', 24, 36),
  (6, 'قوس قزح', 'Rainbows', 'Preschool (3-4y)', 36, 48),
  (7, 'الدلافين', 'Dolphins', 'Preschool (3-4y)', 36, 48),
  (8, 'النجوم', 'Stars', 'Pre-K (4-5y)', 48, 60),
  (9, 'البوم', 'Owls', 'Pre-K (4-5y)', 48, 60),
  (10, 'الأقمار', 'Moons', 'KG (5-6y)', 60, 72);

-- -----------------------------------------------------------------------------------------------
create table if not exists seed.config (key text primary key, value text not null);
truncate seed.config;
insert into seed.config values
  ('main_branch_id', '8d4bdad1-6d33-4e54-8bdc-b7074fd47ade'),
  ('children_per_class', '25'),
  -- Every seeded account signs in with the demo accounts' password.
  ('password_hash', extensions.crypt('Demo2026!', extensions.gen_salt('bf', 10))),
  ('staff_domain', 'staff.cherries.example'),
  ('parent_domain', 'parents.cherries.example'),
  ('today', ((now() at time zone 'Africa/Cairo')::date)::text);

create or replace function seed.config(p_key text) returns text
language sql stable
as $$ select value from seed.config where key = p_key $$;

-- The branch's id: the main branch keeps its own, the others get a stable one.
create or replace function seed.branch_id(p_n integer) returns uuid
language sql stable
as $$ select case when p_n = 1 then seed.config('main_branch_id')::uuid else seed.uid('branch:' || p_n) end $$;

-- The last p_count school days before today at a branch (most recent first).
create or replace function seed.school_days(p_branch uuid, p_count integer) returns table (day date, nth integer)
language sql stable
as $$
  select d::date, (row_number() over (order by d desc))::integer
  from generate_series(seed.config('today')::date - (p_count * 2 + 14), seed.config('today')::date - 1, interval '1 day') d
  where public.attendance_is_school_day(p_branch, d::date)
  order by d desc
  limit p_count
$$;

-- An account that signs in with the demo password; the trigger on auth.users makes its users row.
create or replace function seed.account(p_id uuid, p_email text, p_name_ar text, p_name_en text, p_phone text) returns uuid
language plpgsql
as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, phone_change,
    phone_change_token, email_change_token_current, reauthentication_token
  )
  values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email, seed.config('password_hash'), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('name_ar', p_name_ar, 'name_en', p_name_en, 'language_pref', 'ar'),
    now(), now(), '', '', '', '', '', '', '', ''
  )
  on conflict (id) do nothing;
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (p_id, p_id, p_id::text, 'email', jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true), now(), now(), now())
  on conflict do nothing;
  update public.users set phone = p_phone where id = p_id;
  return p_id;
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- Families: the family of a branch's p_child-th child. One child in five has an older brother or
-- sister in the branch: the 6th and 8th child of every ten belong to the family of the 2nd and 4th.
create or replace function seed.family_of(p_child integer) returns integer
language sql immutable
as $$ select case when p_child % 10 in (6, 8) then p_child - 4 else p_child end $$;

-- -----------------------------------------------------------------------------------------------
-- Staff: each role's file (branch admins, managers, teacher managers, teachers, assistants) plans its
-- people here, then seed.hire(kind) gives them an account, their role at their branch and an HR record.
create table if not exists seed.staff (
  branch integer not null,
  key text not null,
  kind text not null,
  user_id uuid not null,
  role public.user_role not null,
  department public.user_department,
  role_key text not null,
  position_en text not null,
  staff_department text not null,
  salary numeric not null,
  female boolean not null,
  primary key (branch, key)
);
truncate seed.staff;

-- Hires the planned staff of one kind: an account that signs in with the demo password
-- (<key>.b<branch>@staff.cherries.example), their role at their branch (the branch's own role, such
-- as head of teachers, else the global one), and an HR record. People who already have an account
-- (the demo accounts, the main branch's leads) keep it and their role. Returns how many there are.
create or replace function seed.hire(p_kind text) returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  perform seed.account(
    s.user_id,
    s.key || '.b' || s.branch || '@' || seed.config('staff_domain'),
    case when s.female then seed.name_ar('girl', 'staff-first:' || s.user_id) else seed.name_ar('boy', 'staff-first:' || s.user_id) end
      || ' ' || seed.name_ar('family', 'staff-family:' || s.user_id),
    case when s.female then seed.name_en('girl', 'staff-first:' || s.user_id) else seed.name_en('boy', 'staff-first:' || s.user_id) end
      || ' ' || seed.name_en('family', 'staff-family:' || s.user_id),
    seed.phone('staff:' || s.user_id)
  )
  from seed.staff s
  where s.kind = p_kind and not exists (select 1 from public.users u where u.id = s.user_id);

  update public.users u
     set role = s.role,
         department = s.department,
         nursery_id = seed.branch_id(s.branch),
         role_id = coalesce(
           (select r.id from public.roles r where r.nursery_id = seed.branch_id(s.branch) and r.key = s.role_key),
           (select r.id from public.roles r where r.nursery_id is null and r.key = s.role_key)
         ),
         status = 'active',
         language_pref = 'ar',
         onboarding_completed = true
    from seed.staff s
   where s.kind = p_kind and u.id = s.user_id and u.email like '%@' || seed.config('staff_domain');

  insert into public.staff_profiles (
    user_id, nursery_id, employee_id, department, position, hire_date, contract_type, salary_amount, base_salary,
    transport_allowance, emergency_contact_name, emergency_contact_phone, address, national_id, work_start_time,
    work_end_time, working_days, weekly_hours, annual_leave_balance, criminal_record_status, reference_check_completed,
    child_protection_training_date, child_protection_training_expiry
  )
  select
    s.user_id, seed.branch_id(s.branch), 'CH' || lpad(s.branch::text, 2, '0') || '-' || upper(s.key), s.staff_department, s.position_en,
    date '2019-09-01' + seed.int_between(0, 2200, 'hired:' || s.user_id),
    case when s.kind = 'assistant' and seed.chance(25, 'part-time:' || s.user_id) then 'part_time' else 'full_time' end,
    s.salary, s.salary, 500,
    seed.name_en('family', 'staff-emergency:' || s.user_id) || ' family',
    seed.phone('staff-emergency:' || s.user_id),
    b.address_en,
    seed.national_id(date '1985-01-01' + seed.int_between(0, 5000, 'staff-born:' || s.user_id), 'staff-id:' || s.user_id),
    n.opens_at - interval '30 minutes', n.closes_at + interval '30 minutes', array['sun', 'mon', 'tue', 'wed', 'thu'], 45, 21,
    'clear', true,
    date '2026-02-01' + seed.int_between(0, 180, 'training:' || s.user_id),
    date '2027-02-01' + seed.int_between(0, 180, 'training:' || s.user_id)
  from seed.staff s
  join seed.branches b on b.n = s.branch
  join public.nurseries n on n.id = seed.branch_id(s.branch)
  where s.kind = p_kind
  on conflict (user_id) do nothing;

  select count(*) into v_count from seed.staff where kind = p_kind;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- Removing what a reset replaces (01_reset_branches, 02_reset_leftovers).

-- Accounts and everything of theirs: first the rows that would block the delete (no cascade on
-- them) and their applications, then their users rows (invoices, notifications… cascade), then
-- their sign-in.
create or replace function seed.remove_users(p_ids uuid[]) returns integer
language plpgsql
as $$
begin
  delete from public.child_documents where uploaded_by = any(p_ids);
  delete from public.import_jobs where initiated_by = any(p_ids);
  delete from public.parental_consents where parent_id = any(p_ids);
  delete from public.temporary_pickup_codes where created_by = any(p_ids) or used_by = any(p_ids);
  delete from public.user_role_changes where changed_by = any(p_ids);
  delete from public.pickup_incidents where reported_by = any(p_ids);
  delete from public.tenant_export_jobs where requested_by = any(p_ids);
  delete from public.applications where parent_id = any(p_ids);
  delete from public.users where id = any(p_ids);
  delete from auth.identities where user_id = any(p_ids);
  delete from auth.users where id = any(p_ids);
  return cardinality(p_ids);
end;
$$;

-- Nurseries and everything of theirs (classes, packages, events, roles… cascade). An account left in
-- one keeps its sign-in but loses the nursery's role.
create or replace function seed.remove_nurseries(p_ids uuid[]) returns integer
language plpgsql
as $$
begin
  delete from public.applications where nursery_id = any(p_ids);
  update public.users set role_id = null where role_id in (select r.id from public.roles r where r.nursery_id = any(p_ids));
  delete from public.nurseries where id = any(p_ids);
  return cardinality(p_ids);
end;
$$;

-- The parents (all but demo-parent) and the seed's staff, of the given nurseries (null: of any).
create or replace function seed.replaced_users(p_nurseries uuid[]) returns uuid[]
language sql stable
as $$
  select coalesce(array_agg(u.id), '{}')
  from public.users u
  where (p_nurseries is null or u.nursery_id = any(p_nurseries))
    and ((u.role = 'parent' and u.email is distinct from 'demo-parent@xonursery.com')
         or u.email like '%@' || seed.config('staff_domain')
         or u.email like '%@' || seed.config('parent_domain'))
$$;

-- Guards meant for people using the app, not for a reset (with nobody signed in, the first takes the
-- database for a parent): a parent may not delete chat messages, a registration template in use may
-- not change. Paused inside a reset's transaction, switched back on at its end.
create or replace function seed.pause_app_guards(p_on boolean) returns void
language plpgsql
as $$
begin
  if p_on then
    alter table public.messages disable trigger trg_prevent_parent_message_edit_delete;
    alter table public.parent_registration_templates disable trigger trg_prevent_used_parent_registration_template_changes;
  else
    alter table public.messages enable trigger trg_prevent_parent_message_edit_delete;
    alter table public.parent_registration_templates enable trigger trg_prevent_used_parent_registration_template_changes;
  end if;
end;
$$;

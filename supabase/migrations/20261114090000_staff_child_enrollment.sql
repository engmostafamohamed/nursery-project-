-- Adding a child from the admin's side, the same way a family applies.
--
-- Before: the admin's add-child form asked other questions than the family's application, created
-- parent accounts nobody could sign in with, kept most answers (allergies, gender, nationality,
-- custody, documents) only in a JSON column, and a manager allowed to enrol children was refused at
-- the end. Now the admin first picks the family (an existing parent account), then answers the
-- application's own steps; the child is saved the way an approved application saves it.
--
--   1. child_enrollment_can_create: who may add a child (the page's own rule: the nursery's admins,
--      or a manager or teacher whose role may create enrolments).
--   2. enrollment_family_search: the nursery's parent accounts found by the father's or mother's
--      name, the username or either parent's mobile, with what the form copies from them (the
--      family's details from their last application, else from the accounts) and their children.
--   3. staff_enroll_child: one transaction — the child (the same columns as an approved application),
--      the family linked (the picked parent first, and the other parent of their children), the
--      authorised pickups, the documents, the class (its teachers are told by the existing trigger),
--      and a notice to the family.
--   4. A child's allergies picked in an application become the child's allergy records (the menu,
--      the food alerts and the health page read those), for approved applications too.

-- -----------------------------------------------------------------------------------------------
-- 1. Who may add a child

create or replace function public.child_enrollment_can_create(p_nursery_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_xo_super_admin()
    or (public.current_user_role() = 'branch_admin' and p_nursery_id = public.current_user_nursery_id())
    or (public.current_user_role() = 'chain_super_admin' and p_nursery_id in (select public.nursery_ids_for_chain_admin()))
    or (public.current_user_role() in ('manager', 'teacher') and p_nursery_id = public.current_user_nursery_id()
        and public.user_can('child_enrollment', 'create')),
    false
  );
$$;

-- -----------------------------------------------------------------------------------------------
-- 2. Finding the family

-- The family's details as an application holds them (parent_info_json): from the parent's last
-- application, else put together from the parent's account and the other parent of their children.
create or replace function public.enrollment_family_parent_info(p_parent_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with app as (
    select a.parent_info_json from public.applications a
     where a.parent_id = p_parent_id and jsonb_typeof(a.parent_info_json) = 'object'
     order by a.updated_at desc nulls last limit 1
  ),
  people as (
    -- the parent and the other parents of their children, each with the side they are on
    select u.id, coalesce(nullif(u.name_ar, ''), u.name_en) as name, u.phone, u.email,
           (select pc.parent_type from public.parent_children pc where pc.parent_id = u.id and pc.parent_type is not null order by pc.created_at desc limit 1) as side,
           (select pc.national_id from public.parent_children pc where pc.parent_id = u.id and pc.national_id is not null order by pc.created_at desc limit 1) as national_id,
           (select pc.occupation from public.parent_children pc where pc.parent_id = u.id and pc.occupation is not null order by pc.created_at desc limit 1) as job
      from public.users u
     where u.id = p_parent_id
        or u.id in (select other.parent_id from public.parent_children mine
                      join public.parent_children other on other.child_id = mine.child_id and other.parent_id <> mine.parent_id
                     where mine.parent_id = p_parent_id)
  ),
  side_of as (
    select p.*, coalesce(p.side, case when p.id = p_parent_id then 'father' else 'mother' end) as role_side from people p
  ),
  last_child as (
    select c.home_address from public.children c join public.parent_children pc on pc.child_id = c.id
     where pc.parent_id = p_parent_id order by c.created_at desc limit 1
  )
  select coalesce((select parent_info_json from app), (
    select jsonb_strip_nulls(jsonb_build_object(
      'full_name', (select name from side_of where id = p_parent_id),
      'email', (select email from side_of where id = p_parent_id),
      'phone', (select phone from side_of where id = p_parent_id),
      'father', (select jsonb_build_object('full_name', name, 'mobile', phone, 'email', email, 'national_id', national_id, 'job', job)
                   from side_of where role_side = 'father' order by (id = p_parent_id) desc limit 1),
      'mother', (select jsonb_build_object('full_name', name, 'mobile', phone, 'email', email, 'national_id', national_id, 'job', job)
                   from side_of where role_side = 'mother' order by (id = p_parent_id) desc limit 1),
      'family', jsonb_build_object('address', (select home_address from last_child))
    ))
  ));
$$;

-- The nursery's parent accounts matching a name (the account's, the father's or the mother's), a
-- username, an email or a mobile (with or without the country code). At most 20, with the details
-- the form copies and the children they already have.
create or replace function public.enrollment_family_search(p_nursery_id uuid, p_term text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_term text := lower(btrim(coalesce(p_term, '')));
  v_digits text := regexp_replace(coalesce(p_term, ''), '\D', '', 'g');
begin
  if not public.child_enrollment_can_create(p_nursery_id) then
    raise exception 'enrollment_forbidden' using errcode = '42501';
  end if;
  if char_length(v_term) < 2 then
    return '[]'::jsonb;
  end if;
  -- a mobile matches on its last digits, so 010…, +2010… and 2010… all find it
  v_digits := case when char_length(v_digits) >= 4 then right(ltrim(v_digits, '0'), 10) else null end;

  return coalesce((
    select jsonb_agg(row_to_json(r)::jsonb order by r.name_en)
      from (
        select u.id, u.name_ar, u.name_en, u.username, u.phone, u.email,
               coalesce((
                 select jsonb_agg(jsonb_build_object('id', c.id, 'name_ar', c.full_name_ar, 'name_en', c.full_name_en, 'status', c.status) order by c.dob)
                   from public.parent_children pc join public.children c on c.id = pc.child_id
                  where pc.parent_id = u.id and c.nursery_id = p_nursery_id
               ), '[]'::jsonb) as children,
               public.enrollment_family_parent_info(u.id) as parent_info,
               coalesce((
                 select c.emergency_contacts from public.parent_children pc join public.children c on c.id = pc.child_id
                  where pc.parent_id = u.id and jsonb_typeof(c.emergency_contacts) = 'array'
                  order by c.created_at desc limit 1
               ), '[]'::jsonb) as emergency_contacts
          from public.users u
         where u.role = 'parent' and u.nursery_id = p_nursery_id and coalesce(u.status, 'active') = 'active'
           and (
             lower(coalesce(u.name_ar, '')) like '%' || v_term || '%'
             or lower(coalesce(u.name_en, '')) like '%' || v_term || '%'
             or lower(coalesce(u.username, '')) like '%' || v_term || '%'
             or lower(coalesce(u.email, '')) like '%' || v_term || '%'
             or (v_digits is not null and regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') like '%' || v_digits || '%')
             -- the father's or mother's name or mobile as the family gave them in an application
             or exists (
               select 1 from public.applications a
                cross join lateral (values (a.parent_info_json -> 'father'), (a.parent_info_json -> 'mother')) p(person)
                where a.parent_id = u.id and jsonb_typeof(p.person) = 'object'
                  and (lower(coalesce(p.person ->> 'full_name', '')) like '%' || v_term || '%'
                       or (v_digits is not null and regexp_replace(coalesce(p.person ->> 'mobile', ''), '\D', '', 'g') like '%' || v_digits || '%'))
             )
             -- or the other parent of their children (a family with two accounts)
             or exists (
               select 1 from public.parent_children mine
                 join public.parent_children other on other.child_id = mine.child_id and other.parent_id <> mine.parent_id
                 join public.users o on o.id = other.parent_id
                where mine.parent_id = u.id
                  and (lower(coalesce(o.name_ar, '')) like '%' || v_term || '%'
                       or lower(coalesce(o.name_en, '')) like '%' || v_term || '%'
                       or (v_digits is not null and regexp_replace(coalesce(o.phone, ''), '\D', '', 'g') like '%' || v_digits || '%'))
             )
           )
         order by u.name_en
         limit 20
      ) r
  ), '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- 4. Allergies picked in an application become the child's allergy records

create or replace function public.children_allergies_from_enrollment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_care jsonb := case when jsonb_typeof(new.daily_care_preferences) = 'object' then new.daily_care_preferences end;
begin
  if v_care is null or jsonb_typeof(v_care -> 'allergy_types') is distinct from 'array'
     or exists (select 1 from public.child_allergies a where a.child_id = new.id) then
    return null;
  end if;
  insert into public.child_allergies (child_id, nursery_id, allergen_name)
  select new.id, new.nursery_id, name
    from (
      select case t.v
               when 'favism' then 'Favism'
               when 'dairy' then 'Milk / Dairy products'
               when 'lactose_intolerance' then 'Lactose intolerance'
               when 'strawberries' then 'Strawberries'
               when 'bananas' then 'Bananas'
               when 'citrus' then 'Orange / Citrus'
               when 'eggs' then 'Eggs'
               when 'peanuts' then 'Peanuts'
               when 'nuts' then 'Nuts (almond, cashew, pistachio, walnut, hazelnut)'
               when 'fish' then 'Fish'
               when 'wheat' then 'Wheat'
               when 'soy' then 'Soy'
               when 'sesame' then 'Sesame'
               when 'honey' then 'Honey'
               when 'other' then nullif(btrim(v_care ->> 'allergy_other_details'), '')
             end as name
        from jsonb_array_elements_text(v_care -> 'allergy_types') t(v)
    ) x
   where name is not null;
  return null;
end;
$$;
drop trigger if exists trg_children_allergies_from_enrollment on public.children;
create trigger trg_children_allergies_from_enrollment
  after insert on public.children
  for each row execute function public.children_allergies_from_enrollment();

-- -----------------------------------------------------------------------------------------------
-- 3. Saving the child

create or replace function public.staff_enroll_child(
  p_nursery_id uuid,
  p_parent_id uuid,
  p_child_id uuid,
  p_parent_info jsonb,
  p_child_info jsonb,
  p_documents jsonb default '{}'::jsonb,
  p_class_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := public.nursery_today(p_nursery_id);
  v_child jsonb := coalesce(p_child_info, '{}'::jsonb);
  v_parent jsonb := coalesce(p_parent_info, '{}'::jsonb);
  v_docs jsonb := coalesce(p_documents, '{}'::jsonb);
  v_first text := nullif(btrim(v_child ->> 'first_name'), '');
  v_last text := nullif(btrim(v_child ->> 'last_name'), '');
  v_name text;
  v_dob date;
  v_gender text := nullif(v_child ->> 'gender', '');
  v_school text := nullif(v_child ->> 'school_preference', '');
  v_doc record;
  v_parents uuid[];
begin
  if not public.child_enrollment_can_create(p_nursery_id) then
    raise exception 'enrollment_forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.users u
     where u.id = p_parent_id and u.role = 'parent' and u.nursery_id = p_nursery_id and coalesce(u.status, 'active') = 'active'
  ) then
    raise exception 'enrollment_family_not_found' using errcode = '22023';
  end if;
  if p_child_id is null or exists (select 1 from public.children where id = p_child_id) then
    raise exception 'enrollment_child_exists' using errcode = '23505';
  end if;
  if p_class_id is not null and not exists (
    select 1 from public.classes c where c.id = p_class_id and c.nursery_id = p_nursery_id and c.deleted_at is null
  ) then
    raise exception 'enrollment_class_not_found' using errcode = '22023';
  end if;
  if v_first is null or v_last is null then
    raise exception 'enrollment_name_required' using errcode = '22023';
  end if;
  begin
    v_dob := (v_child ->> 'dob')::date;
  exception when others then
    v_dob := null;
  end;
  if v_dob is null or v_dob > v_today or v_dob < v_today - interval '8 years' then
    raise exception 'enrollment_dob_invalid' using errcode = '22023';
  end if;
  if v_gender not in ('male', 'female') then
    v_gender := null;
  end if;
  if v_school not in ('british', 'american', 'national', 'ib', 'french', 'canadian', 'other') then
    v_school := null;
  end if;
  -- The documents sit in the child's own folder (nursery/child/…), uploaded just before.
  if exists (
    select 1 from jsonb_each_text(v_docs) d
     where d.key not in ('birth_certificate', 'vaccination_card', 'parent_id', 'proof_of_address', 'medical_report', 'other')
        or d.value not like p_nursery_id::text || '/' || p_child_id::text || '/%'
  ) or (nullif(v_child ->> 'avatar_url', '') is not null and v_child ->> 'avatar_url' not like '%/' || p_nursery_id::text || '/' || p_child_id::text || '/%') then
    raise exception 'enrollment_document_invalid' using errcode = '22023';
  end if;

  v_name := coalesce(nullif(btrim(v_child ->> 'full_name'), ''), concat_ws(' ', v_first, nullif(btrim(v_child ->> 'middle_name'), ''), v_last));

  insert into public.children (
    id, nursery_id, class_id, full_name_ar, full_name_en, first_name, middle_name, last_name, nickname, dob, gender,
    nationality, enrollment_department, school_preference, school_admissions_plan, academic_year, has_siblings,
    sibling_ages, daily_care_preferences, emergency_contacts, home_address, enrollment_date, status,
    photo_privacy_restricted, avatar_url, birth_certificate_url, vaccination_card_url, enrollment_extended_json
  ) values (
    p_child_id, p_nursery_id, p_class_id, v_name, v_name, v_first, nullif(btrim(v_child ->> 'middle_name'), ''), v_last,
    nullif(btrim(v_child ->> 'nickname'), ''), v_dob, v_gender,
    nullif(btrim(v_child ->> 'nationality'), ''), nullif(btrim(v_child ->> 'department'), ''), v_school,
    nullif(btrim(v_child ->> 'school_admissions_plan'), ''), nullif(btrim(v_child ->> 'academic_year'), ''),
    case when v_child ->> 'has_siblings' in ('true', 'false') then (v_child ->> 'has_siblings')::boolean end,
    nullif(btrim(v_child ->> 'sibling_ages'), ''),
    case when jsonb_typeof(v_child -> 'daily_care_preferences') = 'object' then v_child -> 'daily_care_preferences' end,
    case when jsonb_typeof(v_child -> 'emergency_contacts') = 'array' then v_child -> 'emergency_contacts' end,
    coalesce(nullif(btrim(v_parent ->> 'address'), ''), nullif(btrim(v_parent #>> '{family,address}'), '')),
    v_today, 'active',
    lower(coalesce(v_child ->> 'photo_privacy', 'false')) in ('true', '1', 'yes'),
    nullif(v_child ->> 'avatar_url', ''),
    v_docs ->> 'birth_certificate', v_docs ->> 'vaccination_card',
    jsonb_build_object(
      'family', coalesce(v_parent -> 'family', '{}'::jsonb),
      'parents', jsonb_build_object('father', v_parent -> 'father', 'mother', v_parent -> 'mother'),
      'source', 'staff',
      'entered_by', auth.uid(),
      'special_needs', nullif(btrim(v_child ->> 'special_needs'), '')
    )
  );

  -- The family: the picked parent (the account that pays and is told first) and the other parent of
  -- their children, each on the side they already have.
  v_parents := array(
    select p_parent_id
    union
    select other.parent_id from public.parent_children mine
      join public.parent_children other on other.child_id = mine.child_id and other.parent_id <> mine.parent_id
      join public.users o on o.id = other.parent_id and o.role = 'parent' and coalesce(o.status, 'active') = 'active'
     where mine.parent_id = p_parent_id
  );
  insert into public.parent_children (parent_id, child_id, is_primary, parent_type, relationship, national_id, occupation)
  select pid, p_child_id, pid = p_parent_id, prev.parent_type, prev.relationship, prev.national_id, prev.occupation
    from unnest(v_parents) pid
    left join lateral (
      select pc.parent_type, pc.relationship, pc.national_id, pc.occupation from public.parent_children pc
       where pc.parent_id = pid order by pc.created_at desc limit 1
    ) prev on true
  on conflict (parent_id, child_id) do nothing;

  -- The people allowed to collect the child, as the family gave them.
  insert into public.authorized_pickups (child_id, name, phone, relation, authorization_level, can_pickup, can_dropoff, verification_status, active)
  select p_child_id, btrim(p ->> 'name'), btrim(coalesce(p ->> 'phone', '')), nullif(btrim(p ->> 'relation'), ''),
         coalesce(nullif(p ->> 'authorization', ''), 'anytime'), true, true, 'verified', true
    from jsonb_array_elements(case when jsonb_typeof(v_parent -> 'pickups') = 'array' then v_parent -> 'pickups' else '[]'::jsonb end) p
   where nullif(btrim(p ->> 'name'), '') is not null;

  -- The documents, on the child's record.
  for v_doc in select key, value from jsonb_each_text(v_docs) loop
    insert into public.child_documents (child_id, document_type, file_url, uploaded_by, notes)
    values (p_child_id,
            case when v_doc.key in ('birth_certificate', 'vaccination_card', 'medical_report') then v_doc.key else 'other' end,
            v_doc.value, auth.uid(),
            case when v_doc.key in ('parent_id', 'proof_of_address') then v_doc.key end);
  end loop;

  perform public.notify_users(v_parents, p_nursery_id, 'child_enrolled', 'child_enrolled',
    jsonb_build_object('child', public.i18n_names(v_name, v_name)), '/parent', 'normal');

  return p_child_id;
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- Grants

revoke execute on function public.child_enrollment_can_create(uuid) from public, anon;
grant execute on function public.child_enrollment_can_create(uuid) to authenticated;
revoke execute on function public.enrollment_family_parent_info(uuid) from public, anon, authenticated;
revoke execute on function public.enrollment_family_search(uuid, text) from public, anon;
grant execute on function public.enrollment_family_search(uuid, text) to authenticated;
revoke execute on function public.children_allergies_from_enrollment() from public, anon, authenticated;
revoke execute on function public.staff_enroll_child(uuid, uuid, uuid, jsonb, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.staff_enroll_child(uuid, uuid, uuid, jsonb, jsonb, jsonb, uuid) to authenticated;

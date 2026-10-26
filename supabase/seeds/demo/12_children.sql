-- Demo seed · 12 · Children ({{branches}}: a few branches per run)
--
-- 250 children per branch, 25 per class, each in a family of 11_parents.sql (seed.family_of: the 6th
-- and 8th child of every ten are the younger brother or sister of the 2nd and 4th). Each child has a
-- full profile, both parents linked (the mother first, the main contact), emergency contacts and who
-- else may pick them up. demo-parent@xonursery.com's children are in Butterflies (demo-teacher's
-- class) and Stars at the main branch.

create table if not exists seed.kids (
  branch integer not null, slot integer not null, child_id uuid not null, class_slot integer not null, family_slot integer not null,
  girl boolean not null, primary key (branch, slot)
);
delete from seed.kids where branch = any({{branches}});

-- The children's places: class by position, family by the sibling rule.
insert into seed.kids (branch, slot, child_id, class_slot, family_slot, girl)
select b.n, s, seed.uid('child:' || b.n || ':' || s), ((s - 1) % 10) + 1, seed.family_of(s), seed.chance(50, 'girl:' || b.n || ':' || s)
from seed.branches b
cross join generate_series(1, 10 * seed.config('children_per_class')::integer) s
where b.n = any({{branches}});

-- The children: named after their father and family, aged for their class, with a full profile.
insert into public.children (
  id, nursery_id, class_id, full_name_ar, full_name_en, first_name, middle_name, last_name, dob, gender, enrollment_date,
  status, enrollment_status, enrollment_type, academic_year, nationality, blood_type, custody_status, religious_denomination,
  language_spoken_at_home, language_proficiency, toilet_training_status, nap_preference, sleep_nap_duration, temperament,
  separation_anxiety, comfort_items, referral_source, home_address, birth_certificate_no, has_siblings, school_preference,
  emergency_contacts, daily_care_preferences, enrollment_extended_json
)
select
  k.child_id,
  seed.branch_id(k.branch),
  x.class_id,
  first_ar || ' ' || coalesce(f.father_first_ar, seed.name_ar('boy', 'late-father:' || k.child_id)) || ' ' || f.family_ar,
  first_en || ' ' || coalesce(f.father_first_en, seed.name_en('boy', 'late-father:' || k.child_id)) || ' ' || f.family_en,
  first_en,
  coalesce(f.father_first_en, seed.name_en('boy', 'late-father:' || k.child_id)),
  f.family_en,
  dob,
  case when k.girl then 'female' else 'male' end,
  greatest(date '2024-09-01', least(date '2026-09-01', (date_trunc('month', dob + interval '7 months') + interval '1 month')::date))
    + (case when seed.chance(20, 'mid-year:' || k.child_id) then seed.int_between(10, 50, 'joined:' || k.child_id) else 0 end),
  'active',
  'active',
  case when tuition = 'half' then 'half_day' else 'full_day' end,
  '2026/2027',
  case when seed.chance(95, 'egyptian:' || k.child_id) then 'Egyptian' else seed.pick(array['Sudanese', 'Syrian', 'Jordanian', 'Saudi'], 'nation:' || k.child_id) end,
  seed.pick_weighted(array['O+', 'A+', 'B+', 'AB+', 'O-', 'A-', 'B-', 'AB-'], array[36, 30, 15, 5, 6, 4, 3, 1], 'blood:' || k.child_id),
  case when f.mother_only then 'mother' else 'both_parents' end,
  case when seed.chance(9, 'christian:' || f.family_slot || ':' || k.branch) then 'Christian' else 'Muslim' end,
  case when seed.chance(20, 'english-home:' || k.child_id) then 'Arabic, English' else 'Arabic' end,
  seed.pick(array['beginner', 'intermediate', 'fluent'], 'proficiency:' || k.child_id),
  case when age_months < 24 then 'not_started' when age_months < 36 then 'in_progress' else 'completed' end,
  case when age_months >= 60 and seed.chance(30, 'no-nap:' || k.child_id) then 'no_nap' else 'same_as_nursery' end,
  case when age_months < 24 then 120 when age_months < 48 then 90 else 60 end,
  seed.pick(array['calm', 'active', 'curious', 'shy', 'social', 'cheerful'], 'temperament:' || k.child_id),
  age_months < 30 and seed.chance(35, 'anxiety:' || k.child_id),
  case when age_months < 36 then seed.pick(array['Teddy bear', 'Blanket', 'Pacifier', 'Bunny toy'], 'comfort:' || k.child_id) end,
  case when k.family_slot <> k.slot then 'sibling_at_nursery'
       else seed.pick_weighted(array['friend_family', 'social_media', 'website', 'walk_in', 'referral'], array[40, 30, 12, 10, 8], 'referral:' || k.child_id) end,
  seed.int_between(1, 120, 'building:' || k.child_id) || ' ' || b.address_en,
  seed.national_id(dob, 'birth-cert:' || k.child_id),
  k.slot % 10 in (2, 4, 6, 8),
  case when age_months >= 54 then seed.pick(array['british', 'american', 'national', 'ib', 'french', 'bilingual'], 'school:' || k.child_id) end,
  jsonb_build_array(
    jsonb_build_object('name', f.mother_en, 'phone', seed.phone('mother-phone:' || k.branch || ':' || k.family_slot), 'relationship', 'mother'),
    case when f.father_id is null
         then jsonb_build_object('name', seed.name_en('girl', 'aunt:' || k.child_id) || ' ' || f.family_en, 'phone', seed.phone('aunt:' || k.child_id), 'relationship', 'aunt')
         else jsonb_build_object('name', f.father_en, 'phone', seed.phone('father-phone:' || k.branch || ':' || k.family_slot), 'relationship', 'father') end
  ),
  jsonb_build_object(
    'eats_nursery_meals', true,
    'accepts_extra_snacks', seed.chance(80, 'snacks:' || k.child_id),
    'takes_breakfast_at_home', seed.chance(40, 'home-breakfast:' || k.child_id),
    'nap_time_preference', case when age_months >= 60 then 'Optional' else 'Yes' end,
    'arrival_time', seed.pick(array['07:30', '08:00', '08:30', '09:00'], 'arrival:' || k.child_id),
    'emergency_medications', jsonb_build_array('Paracetamol (Cetal)', 'Antiseptic cream'),
    'toilet_training_status', case when age_months < 24 then 'not_started' when age_months < 36 then 'in_progress' else 'completed' end,
    'daily_diaper_count', case when age_months < 36 then seed.int_between(3, 6, 'diapers:' || k.child_id) else 0 end
  ),
  jsonb_build_object(
    'family', jsonb_build_object(
      'address', seed.int_between(1, 120, 'building:' || k.child_id) || ' ' || b.address_en,
      'marital_status', case when f.mother_only then 'divorced' else 'married' end,
      'referral_source', case when k.family_slot <> k.slot then 'sibling_at_nursery' else 'friend_family' end
    ),
    'parents', jsonb_build_object(
      'father', case when f.father_id is null then null else jsonb_build_object(
        'full_name', f.father_en, 'mobile', seed.phone('father-phone:' || k.branch || ':' || k.family_slot),
        'email', 'father.b' || k.branch || '.f' || k.family_slot || '@' || seed.config('parent_domain'),
        'job', seed.name_en('job', 'job:' || f.father_id),
        'national_id', seed.national_id(date '1982-01-01' + seed.int_between(0, 4000, 'father-born:' || f.father_id), 'father-id:' || f.father_id)) end,
      'mother', jsonb_build_object(
        'full_name', f.mother_en, 'mobile', seed.phone('mother-phone:' || k.branch || ':' || k.family_slot),
        'job', seed.name_en('job', 'job:' || f.mother_id),
        'national_id', seed.national_id(date '1985-01-01' + seed.int_between(0, 4000, 'mother-born:' || f.mother_id), 'mother-id:' || f.mother_id))
    )
  )
from seed.kids k
join seed.families f on f.branch = k.branch and f.family_slot = k.family_slot
join seed.classes x on x.branch = k.branch and x.slot = k.class_slot
join seed.class_plan c on c.slot = k.class_slot
join seed.branches b on b.n = k.branch
cross join lateral (
  select
    case when k.girl then seed.name_ar('girl', 'child:' || k.child_id) else seed.name_ar('boy', 'child:' || k.child_id) end as first_ar,
    case when k.girl then seed.name_en('girl', 'child:' || k.child_id) else seed.name_en('boy', 'child:' || k.child_id) end as first_en,
    c.age_from_months + seed.int_between(0, c.age_to_months - c.age_from_months - 1, 'age:' || k.child_id) as age_months,
    seed.pick_weighted(array['half', 'full', 'extended'], array[20, 65, 15], 'tuition:' || k.child_id) as tuition
) p
cross join lateral (select (seed.config('today')::date - make_interval(months => p.age_months))::date - seed.int_between(0, 27, 'dob-day:' || k.child_id) as dob) d
where k.branch = any({{branches}})
on conflict (id) do nothing;

-- Each child's parents: the mother first (the main contact), the father, both emergency contacts.
insert into public.parent_children (parent_id, child_id, parent_type, relationship, is_primary, is_emergency_contact, occupation, workplace, national_id, marital_status)
select p.parent_id, k.child_id, p.kind, p.kind, p.kind = 'mother', true,
       seed.name_en('job', 'job:' || p.parent_id),
       seed.pick(array['Vodafone Egypt', 'CIB Bank', 'Cairo University Hospital', 'Orange Egypt', 'Banque Misr', 'Self-employed', 'Ministry of Education', 'Talaat Moustafa Group', 'Fawry', 'Elsewedy Electric'], 'work:' || p.parent_id),
       seed.national_id(date '1983-01-01' + seed.int_between(0, 4000, 'born:' || p.parent_id), 'id:' || p.parent_id),
       case when f.mother_only then 'divorced' else 'married' end
from seed.kids k
join seed.families f on f.branch = k.branch and f.family_slot = k.family_slot
cross join lateral (values ('mother', f.mother_id), ('father', f.father_id)) p(kind, parent_id)
where k.branch = any({{branches}}) and p.parent_id is not null
on conflict (parent_id, child_id) do nothing;

-- Who else may pick the child up: a grandmother for everyone, a driver for some.
insert into public.authorized_pickups (child_id, name, phone, mobile_phone, relation, national_id, active, verification_status, can_pickup, can_dropoff, authorization_level)
select k.child_id, g.name, g.phone, g.phone, g.relation, seed.national_id(g.born, 'pickup-id:' || k.child_id || g.key), true, 'verified', true, true,
       case when g.key = 'driver' then 'scheduled' else 'anytime' end
from seed.kids k
join seed.families f on f.branch = k.branch and f.family_slot = k.family_slot
cross join lateral (values
  ('grandmother', seed.name_en('girl', 'grandmother:' || f.branch || ':' || f.family_slot) || ' ' || f.family_en,
   seed.phone('grandmother:' || f.branch || ':' || f.family_slot), 'Grandmother', date '1958-01-01' + seed.int_between(0, 3000, 'gm-born:' || k.child_id)),
  ('driver', seed.name_en('boy', 'driver:' || f.branch || ':' || f.family_slot) || ' ' || seed.name_en('family', 'driver-family:' || f.branch || ':' || f.family_slot),
   seed.phone('driver:' || f.branch || ':' || f.family_slot), 'Family driver', date '1980-01-01' + seed.int_between(0, 5000, 'driver-born:' || k.child_id))
) g(key, name, phone, relation, born)
where k.branch = any({{branches}})
  and (g.key = 'grandmother' or seed.chance(25, 'has-driver:' || f.branch || ':' || f.family_slot))
  and not exists (select 1 from public.authorized_pickups x where x.child_id = k.child_id and x.relation = g.relation);

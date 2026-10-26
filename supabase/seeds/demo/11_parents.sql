-- Demo seed · 11 · Parents ({{branches}}: a few branches per run)
--
-- A branch's 250 children come from 200 families (seed.family_of: brothers and sisters share one).
-- Most families have both parents, each with an account, a job and a national id; some children
-- are raised by their mother alone. demo-parent@xonursery.com is the mother of the main branch's 4th
-- family. Their children come with 12_children.sql.
--
-- Parent accounts sign in with the demo password: father.b<branch>.f<family>@parents.cherries.example
-- (or mother.…), for example mother.b1.f14@parents.cherries.example.

create table if not exists seed.families (
  branch integer not null, family_slot integer not null, father_id uuid, mother_id uuid not null,
  father_ar text, father_en text, mother_ar text not null, mother_en text not null, family_ar text not null, family_en text not null,
  father_first_ar text, father_first_en text, mother_only boolean not null, primary key (branch, family_slot)
);
delete from seed.families where branch = any({{branches}});

-- The families, with their parents' names.
insert into seed.families (
  branch, family_slot, father_id, mother_id, father_ar, father_en, mother_ar, mother_en, family_ar, family_en,
  father_first_ar, father_first_en, mother_only
)
select
  f.branch, f.family_slot,
  case when mother_only then null else seed.uid('father:' || f.branch || ':' || f.family_slot) end,
  seed.uid('mother:' || f.branch || ':' || f.family_slot),
  case when mother_only then null else ff_ar || ' ' || seed.name_ar('boy', 'grandfather:' || key) || ' ' || fam_ar end,
  case when mother_only then null else ff_en || ' ' || seed.name_en('boy', 'grandfather:' || key) || ' ' || fam_en end,
  seed.name_ar('girl', 'mother:' || key) || ' ' || seed.name_ar('boy', 'mother-father:' || key) || ' ' || seed.name_ar('family', 'mother-family:' || key),
  seed.name_en('girl', 'mother:' || key) || ' ' || seed.name_en('boy', 'mother-father:' || key) || ' ' || seed.name_en('family', 'mother-family:' || key),
  fam_ar, fam_en, ff_ar, ff_en, mother_only
from (
  select distinct b.n as branch, seed.family_of(s) as family_slot, 'family:' || b.n || ':' || seed.family_of(s) as key
  from seed.branches b
  cross join generate_series(1, 10 * seed.config('children_per_class')::integer) s
  where b.n = any({{branches}})
) f
cross join lateral (
  select seed.name_ar('boy', 'father:' || f.key) as ff_ar, seed.name_en('boy', 'father:' || f.key) as ff_en,
         seed.name_ar('family', 'family:' || f.key) as fam_ar, seed.name_en('family', 'family:' || f.key) as fam_en,
         seed.chance(7, 'mother-only:' || f.key) and not (f.branch = 1 and f.family_slot = 4) as mother_only
) n;

-- demo-parent is the main branch's 4th family's mother.
update seed.families set mother_id = (select id from public.users where email = 'demo-parent@xonursery.com')
 where branch = 1 and family_slot = 4 and 1 = any({{branches}});

-- The parents' accounts.
select seed.account(f.father_id, 'father.b' || f.branch || '.f' || f.family_slot || '@' || seed.config('parent_domain'),
                    f.father_ar, f.father_en, seed.phone('father-phone:' || f.branch || ':' || f.family_slot))
from seed.families f
where f.branch = any({{branches}}) and f.father_id is not null and not exists (select 1 from public.users u where u.id = f.father_id);

select seed.account(f.mother_id, 'mother.b' || f.branch || '.f' || f.family_slot || '@' || seed.config('parent_domain'),
                    f.mother_ar, f.mother_en, seed.phone('mother-phone:' || f.branch || ':' || f.family_slot))
from seed.families f
where f.branch = any({{branches}}) and not exists (select 1 from public.users u where u.id = f.mother_id);

update public.users u
   set nursery_id = seed.branch_id(f.branch),
       role_id = (select id from public.roles where nursery_id is null and key = 'parent'),
       occupation = seed.name_en('job', 'job:' || u.id),
       language_pref = case when seed.chance(15, 'lang:' || u.id) then 'en' else 'ar' end,
       onboarding_completed = true
  from seed.families f
 where f.branch = any({{branches}})
   and u.id in (f.father_id, f.mother_id)
   and u.email like '%@' || seed.config('parent_domain');

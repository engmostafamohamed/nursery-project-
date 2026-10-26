-- Demo seed · 06 · Classes
--
-- Every branch has the 10 classes of seed.class_plan, from Little Lambs (6–12 months) to Moons
-- (5–6 years), 25 places each. The main branch keeps the classes it has under those names. Their
-- teachers come with 08_teachers.sql and 09_assistant_teachers.sql.

drop table if exists seed.classes;
create table seed.classes (branch integer not null, slot integer not null, class_id uuid not null, primary key (branch, slot));

-- The main branch's existing classes, by name.
insert into seed.classes (branch, slot, class_id)
select 1, c.slot, cl.id
from seed.class_plan c
join public.classes cl on cl.nursery_id = seed.config('main_branch_id')::uuid and cl.name_en = c.name_en and cl.deleted_at is null;

-- The ones still missing, everywhere.
insert into seed.classes (branch, slot, class_id)
select b.n, c.slot, seed.uid('class:' || b.n || ':' || c.slot)
from seed.branches b
cross join seed.class_plan c
where not exists (select 1 from seed.classes x where x.branch = b.n and x.slot = c.slot);

insert into public.classes (id, nursery_id, name_ar, name_en, grade_level, capacity, room_number)
select x.class_id, seed.branch_id(x.branch), c.name_ar, c.name_en, c.grade_level, seed.config('children_per_class')::integer,
       (case when c.slot <= 5 then 'G' else '1' end) || lpad(c.slot::text, 2, '0')
from seed.classes x
join seed.class_plan c on c.slot = x.slot
on conflict (id) do nothing;

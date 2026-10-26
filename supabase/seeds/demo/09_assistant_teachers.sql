-- Demo seed · 09 · Assistant teachers
--
-- Each class has an assistant teacher beside its lead: asst<class>.b<branch>@staff.cherries.example,
-- for example asst4.b2@staff.cherries.example in branch 2's Butterflies. A quarter of them work part
-- time.

insert into seed.staff (branch, key, kind, user_id, role, department, role_key, position_en, staff_department, salary, female)
select b.n, 'asst' || c.slot, 'assistant', seed.uid('staff:' || b.n || ':asst' || c.slot), 'teacher', null, 'teacher', 'Assistant teacher', 'teaching',
       7000 + seed.int_between(0, 15, 'pay:' || b.n || ':asst' || c.slot) * 100,
       seed.chance(92, 'female:' || b.n || 'asst' || c.slot)
from seed.branches b
cross join seed.class_plan c
on conflict (branch, key) do nothing;

select seed.hire('assistant');

insert into public.class_staff (class_id, user_id, role)
select x.class_id, s.user_id, 'assistant'
from seed.classes x
join seed.staff s on s.branch = x.branch and s.key = 'asst' || x.slot
on conflict (class_id, user_id) do nothing;

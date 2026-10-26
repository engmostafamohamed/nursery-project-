-- Demo seed · 08 · Teachers (lead teachers)
--
-- Each class has a lead teacher: lead<class>.b<branch>@staff.cherries.example, for example
-- lead4.b2@staff.cherries.example leads the 4th class (Butterflies) of branch 2. The lead writes and
-- sends the class's daily reports. At the main branch the classes keep the leads they have:
-- demo-teacher@xonursery.com leads Butterflies and Sunflowers, demo-manager-teacher@xonursery.com
-- leads Stars.

insert into seed.staff (branch, key, kind, user_id, role, department, role_key, position_en, staff_department, salary, female)
select b.n, 'lead' || c.slot, 'teacher',
       -- A main-branch class that has a lead keeps it.
       coalesce(
         (select cs.user_id from seed.classes x join public.class_staff cs on cs.class_id = x.class_id and cs.role = 'lead'
           where b.n = 1 and x.branch = 1 and x.slot = c.slot limit 1),
         seed.uid('staff:' || b.n || ':lead' || c.slot)
       ),
       'teacher', null, 'teacher', 'Lead teacher', 'teaching',
       11000 + seed.int_between(0, 30, 'pay:' || b.n || ':lead' || c.slot) * 100,
       seed.chance(92, 'female:' || b.n || 'lead' || c.slot)
from seed.branches b
cross join seed.class_plan c
on conflict (branch, key) do nothing;

select seed.hire('teacher');

-- Each class's lead (a class that has one keeps it).
insert into public.class_staff (class_id, user_id, role)
select x.class_id, s.user_id, 'lead'
from seed.classes x
join seed.staff s on s.branch = x.branch and s.key = 'lead' || x.slot
where not exists (select 1 from public.class_staff cs where cs.class_id = x.class_id and cs.role = 'lead')
on conflict (class_id, user_id) do nothing;

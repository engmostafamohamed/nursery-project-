-- Demo seed · 07 · Teacher managers (heads of teachers)
--
-- Each branch has a head of teachers (head.b<branch>@staff.cherries.example): the branch's own
-- "Head of teachers" role, which may manage the class teams and see every class's report send rate.
-- (The main branch's demo-manager-teacher@xonursery.com, a teacher with management features, stays
-- as it is and leads Stars.)

insert into seed.staff (branch, key, kind, user_id, role, department, role_key, position_en, staff_department, salary, female)
select b.n, 'head', 'teacher_manager', seed.uid('staff:' || b.n || ':head'), 'teacher', null, 'head_teacher', 'Head of teachers', 'teaching',
       16000, seed.chance(92, 'female:' || b.n || 'head')
from seed.branches b
on conflict (branch, key) do nothing;

select seed.hire('teacher_manager');

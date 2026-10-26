-- Demo seed · 05 · Managers
--
-- Each branch has a finance manager (invoices and payments) and an HR manager (staff and payroll):
-- finance.b<branch>@ and hr.b<branch>@staff.cherries.example. At the main branch they are the demo
-- accounts demo-manager@xonursery.com (finance) and demo-manager-hr@xonursery.com.

insert into seed.staff (branch, key, kind, user_id, role, department, role_key, position_en, staff_department, salary, female)
select b.n, m.key, 'manager',
       case when b.n = 1 then (select id from public.users where email = m.demo_email) else seed.uid('staff:' || b.n || ':' || m.key) end,
       'manager', m.department::public.user_department, m.role_key, m.position_en, 'admin', m.salary, seed.chance(55, 'female:' || b.n || m.key)
from seed.branches b
cross join (values
  ('finance', 'finance', 'manager_finance', 'Finance manager', 18000, 'demo-manager@xonursery.com'),
  ('hr', 'hr', 'manager_hr', 'HR manager', 17000, 'demo-manager-hr@xonursery.com')
) m(key, department, role_key, position_en, salary, demo_email)
on conflict (branch, key) do nothing;

select seed.hire('manager');

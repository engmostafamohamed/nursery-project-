-- Demo seed · 04 · Branch admins and the chain admin
--
-- One admin runs each branch (admin.b<branch>@staff.cherries.example); the main branch's is the demo
-- account demo-branch-admin@xonursery.com. One chain admin oversees the 20 branches:
-- chain.admin@staff.cherries.example. All sign in with the demo password.

insert into seed.staff (branch, key, kind, user_id, role, department, role_key, position_en, staff_department, salary, female)
select b.n, 'admin', 'admin',
       case when b.n = 1 then (select id from public.users where email = 'demo-branch-admin@xonursery.com') else seed.uid('staff:' || b.n || ':admin') end,
       'branch_admin', null, 'branch_admin', 'Branch manager', 'admin', 22000, seed.chance(55, 'female:' || b.n || 'admin')
from seed.branches b
on conflict (branch, key) do nothing;

select seed.hire('admin');

-- The chain admin.
select seed.account(seed.uid('staff:chain-admin'), 'chain.admin@' || seed.config('staff_domain'), 'هالة الشريف', 'Hala El Sherif', seed.phone('chain-admin'))
where not exists (select 1 from public.users where id = seed.uid('staff:chain-admin'));

update public.users
   set role = 'chain_super_admin', chain_id = seed.uid('chain'), nursery_id = seed.config('main_branch_id')::uuid,
       role_id = (select id from public.roles where nursery_id is null and key = 'chain_admin'), status = 'active', onboarding_completed = true
 where id = seed.uid('staff:chain-admin');

update public.chains set owner_id = seed.uid('staff:chain-admin') where id = seed.uid('chain');

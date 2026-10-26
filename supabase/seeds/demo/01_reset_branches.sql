-- Demo seed · 01 · Reset, branch by branch ({{branches}})
--
-- Clears each branch before it is seeded again: its children (with their attendance, reports,
-- health, pickups…), its parents (all but demo-parent@xonursery.com, which the seed links to new
-- children) with their invoices and payments, the seed's staff, and the branch itself when the seed
-- made it. A few branches per run: all at once passes the database's two-minute limit.
-- The main branch, its settings, the demo accounts and real staff stay.

select seed.pause_app_guards(true);

create temp table batch_branches on commit drop as
select b.n, seed.branch_id(b.n) as id
from unnest({{branches}}) b(n)
where exists (select 1 from public.nurseries x where x.id = seed.branch_id(b.n));

delete from public.children where nursery_id in (select id from batch_branches);
select seed.remove_users(seed.replaced_users(array(select id from batch_branches)));
select seed.remove_nurseries(array(select id from batch_branches where n > 1));

select seed.pause_app_guards(false);

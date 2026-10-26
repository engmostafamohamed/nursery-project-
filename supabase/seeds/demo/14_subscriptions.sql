-- Demo seed · 14 · Tuition subscriptions and extra hours ({{branches}})
--
-- Every child is subscribed to the tuition package their enrolment says (half day, full day or
-- extended day; the same pick as 12_children), most paying monthly, some by the term or the year,
-- billed to their mother (or father). The next monthly invoice is November's, so the billing job does
-- not bill again what 17_invoices_and_payments has. About one child in eight has an extra-hours pack.

insert into public.child_tuition_subscriptions (
  id, nursery_id, child_id, tuition_package_id, tuition_package_name_ar, tuition_package_name_en, billing_period, duration_months,
  locked_price, billed_parent_id, status, started_at, next_invoice_date, created_by
)
select
  seed.uid('subscription:' || k.child_id),
  seed.branch_id(k.branch),
  k.child_id,
  t.id,
  t.name_ar,
  t.name_en,
  p.period,
  p.months,
  bp.price,
  coalesce(f.mother_id, f.father_id),
  'active',
  greatest(ch.enrollment_date, date '2026-08-01'),
  case p.period when 'monthly' then date '2026-11-01' when 'quarterly' then date '2026-12-01' else date '2027-09-01' end,
  (select s.user_id from seed.staff s where s.branch = k.branch and s.key = 'finance')
from seed.kids k
join public.children ch on ch.id = k.child_id
join seed.families f on f.branch = k.branch and f.family_slot = k.family_slot
join seed.tuition t on t.branch = k.branch
  and t.kind = seed.pick_weighted(array['half', 'full', 'extended'], array[20, 65, 15], 'tuition:' || k.child_id)
cross join lateral (
  select * from (values ('monthly', 1), ('quarterly', 3), ('annual', 12)) v(period, months)
  where v.period = seed.pick_weighted(array['monthly', 'quarterly', 'annual'], array[80, 15, 5], 'billing:' || k.child_id)
) p
join public.tuition_package_billing_periods bp on bp.tuition_package_id = t.id and bp.billing_period = p.period
where k.branch = any({{branches}})
on conflict (id) do nothing;

-- Extra hours for some (packs bought in October; part of the hours used).
insert into public.child_packages (id, package_id, child_id, nursery_id, status, hours_used, assigned_at)
select seed.uid('child-package:' || k.child_id), pk.id, k.child_id, seed.branch_id(k.branch), 'active',
       case when pk.included_hours is null then seed.int_between(2, 15, 'hours-used:' || k.child_id)
            else seed.int_between(0, pk.included_hours, 'hours-used:' || k.child_id) end,
       timestamp '2026-10-01 09:00' + make_interval(days => seed.int_between(0, 20, 'pack-day:' || k.child_id))
from seed.kids k
cross join lateral (
  select p.id, p.included_hours from public.packages p
  where p.nursery_id = seed.branch_id(k.branch) and p.active
  order by p.price offset seed.int_between(0, 2, 'pack:' || k.child_id) limit 1
) pk
where k.branch = any({{branches}}) and seed.chance(12, 'has-pack:' || k.child_id)
on conflict (id) do nothing;

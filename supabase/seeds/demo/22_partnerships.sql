-- Demo seed · 22 · Partnerships ({{branches}})
--
-- The chain's partners, whose families get a discount: Vodafone Egypt (15% on tuition and extra
-- hours, proof needed), the National Bank of Egypt (10% on tuition, proof needed, its agreement ends
-- in 20 days), Nile International School (EGP 500 off tuition, no proof), Orange Egypt (paused) and
-- the Ministry of Health's staff (ended last month); and the main branch's own, the Engineers
-- Syndicate. At every branch, families in each state: some given the discount by the nursery two
-- months ago, some who asked with their proof and wait for the nursery (one of them at the main
-- branch is demo-parent's family's neighbour; demo-parent's own family has Vodafone's), one rejected
-- with its reason and one whose discount ended. Inserted as they are (nobody is notified), replaced
-- on every run. A family's proof is the demo letter the app serves (/demo/partner-proof.svg).
-- The sibling discount is switched on at the main branch (10% / 15%), with the cap at 30%.

-- The partners (the chain's once; the main branch's own when it runs).
insert into public.discount_partners (
  id, nursery_id, chain_id, kind, name_ar, name_en, aliases, offer_details_ar, offer_details_en, discount_type, discount_value,
  applies_to, starts_on, ends_on, requires_proof, proof_note_ar, proof_note_en, max_families, contact_name, contact_phone,
  contact_email, agreement_ref, active, created_by, created_at
)
select
  seed.uid('partner:' || v.k),
  case when v.branch_only then seed.branch_id(1) end,
  case when v.branch_only then null else seed.uid('chain') end,
  v.kind, v.name_ar, v.name_en, v.aliases, v.offer_ar, v.offer_en, v.dtype, v.dvalue, v.applies,
  seed.config('today')::date + v.starts, seed.config('today')::date + v.ends, v.proof, v.proof_ar, v.proof_en, v.max_families,
  v.contact, v.phone, v.email, v.ref, v.active,
  (select u.id from public.users u where u.role = 'chain_super_admin' and u.chain_id = seed.uid('chain') order by u.created_at limit 1),
  now() + make_interval(days => v.starts)
from (values
  -- key, branch only, kind, names, other names, offer, type, value, applies to, starts, ends (days from today), proof (+ what),
  -- most families, contact, phone, email, agreement, running
  ('vodafone', false, 'company', 'فودافون مصر', 'Vodafone Egypt', array['vodafone', 'فودافون', 'vodafone egypt'],
   'خصم 15% على المصروفات والساعات الإضافية لأبناء العاملين بفودافون مصر طوال مدة الاتفاقية.',
   '15% off tuition and extra hours for the children of Vodafone Egypt staff, for as long as the agreement runs.',
   'percentage', 15.00, array['tuition', 'extra_hours'], -120, 245, true,
   'كارنيه العمل أو خطاب من الموارد البشرية من هذا العام', 'A staff ID card or an HR letter from this year', 400,
   'Mona Fathy', '01001234567', 'family.benefits@vodafone.example', 'CH-VF-2026', true),
  ('nbe', false, 'company', 'البنك الأهلي المصري', 'National Bank of Egypt', array['nbe', 'البنك الاهلي', 'البنك الأهلي'],
   'خصم 10% على المصروفات لأبناء موظفي البنك.', '10% off tuition for the children of the bank''s employees.',
   'percentage', 10.00, array['tuition'], -330, 20, true,
   'خطاب من البنك بالمسمى الوظيفي', 'A letter from the bank with the job title', null,
   'Hany Saber', '0227701234', 'staff.welfare@nbe.example', 'CH-NBE-2025', true),
  ('nile-school', false, 'school', 'مدرسة النيل الدولية', 'Nile International School', array['nile school', 'مدرسة النيل'],
   'خصم 500 جنيه شهريًا على المصروفات لأبناء معلمي وموظفي المدرسة.', 'EGP 500 off each month''s tuition for the children of the school''s teachers and staff.',
   'fixed_amount', 500.00, array['tuition'], -60, null, false, null, null, 60,
   'Sara Adel', '0233456789', 'hr@nileschool.example', 'CH-NIS-2026', true),
  ('orange', false, 'company', 'أورنج مصر', 'Orange Egypt', array['orange', 'أورنج'],
   'الاتفاقية متوقفة لحين التجديد.', 'On hold until the agreement is renewed.',
   'percentage', 12.00, array['tuition'], -200, 160, true, null, null, null,
   null, null, null, 'CH-OR-2026', false),
  ('moh', false, 'organization', 'العاملون بوزارة الصحة', 'Ministry of Health staff', array['ministry of health', 'وزارة الصحة'],
   'خصم 8% على المصروفات للأطقم الطبية.', '8% off tuition for medical staff.',
   'percentage', 8.00, array['tuition'], -400, -30, true, null, null, null,
   null, null, null, 'CH-MOH-2025', true),
  ('b1:engineers', true, 'organization', 'نقابة المهندسين', 'Engineers Syndicate', array['engineer', 'مهندس', 'نقابة المهندسين'],
   'خصم 7% على المصروفات لأعضاء النقابة المقيدين.', '7% off tuition for registered members of the syndicate.',
   'percentage', 7.00, array['tuition'], -90, 275, true,
   'كارنيه النقابة ساري', 'A valid syndicate membership card', 50,
   'Eng. Tarek Nabil', '0225789012', 'members@engineers.example', 'B1-ENG-2026', true)
) v(k, branch_only, kind, name_ar, name_en, aliases, offer_ar, offer_en, dtype, dvalue, applies, starts, ends, proof, proof_ar, proof_en,
    max_families, contact, phone, email, ref, active)
where not v.branch_only or 1 = any({{branches}})
on conflict (id) do update
  set nursery_id = excluded.nursery_id, chain_id = excluded.chain_id, kind = excluded.kind, name_ar = excluded.name_ar, name_en = excluded.name_en,
      aliases = excluded.aliases, offer_details_ar = excluded.offer_details_ar, offer_details_en = excluded.offer_details_en,
      discount_type = excluded.discount_type, discount_value = excluded.discount_value, applies_to = excluded.applies_to,
      starts_on = excluded.starts_on, ends_on = excluded.ends_on, requires_proof = excluded.requires_proof,
      proof_note_ar = excluded.proof_note_ar, proof_note_en = excluded.proof_note_en, max_families = excluded.max_families,
      contact_name = excluded.contact_name, contact_phone = excluded.contact_phone, contact_email = excluded.contact_email,
      agreement_ref = excluded.agreement_ref, active = excluded.active, ending_alert_sent_on = null;

-- The main branch counts brothers and sisters, within the cap.
update public.nursery_settings
   set sibling_discount_enabled = true, sibling_discount_2nd_child_percentage = 10, sibling_discount_3rd_child_percentage = 15,
       max_total_discount_percentage = 30
 where nursery_id = seed.branch_id(1) and 1 = any({{branches}});

-- The families, by their family number at the branch (its mother's account, who is billed). Brothers
-- and sisters share a family, so some numbers (6, 8, 16, 18) have no family: these all exist.
create temp table seed_partner_families on commit drop as
select
  seed.uid('beneficiary:' || b.n || ':' || v.k) as id,
  seed.uid('partner:' || v.partner) as partner_id,
  n.id as nursery_id,
  parent.id as parent_id,
  v.status,
  seed.config('today')::date + v.from_day as valid_from,
  case when v.to_day is null then null else seed.config('today')::date + v.to_day end as valid_to,
  case when v.by_family and v.partner <> 'nile-school' then '/demo/partner-proof.svg' end as proof_path,
  case when v.by_family and v.partner <> 'nile-school' then 'hr-letter.svg' end as proof_name,
  now() + make_interval(days => v.asked_day) as claimed_at,
  case when v.by_family then parent.id else adm.id end as claimed_by,
  case when v.status <> 'pending' then adm.id end as decided_by,
  case when v.status <> 'pending' then now() + make_interval(days => v.asked_day + 1) end as decided_at,
  v.note,
  case when v.status = 'ended' then now() + make_interval(days => coalesce(v.to_day, 0) + 1) end as ended_notified_at
from unnest({{branches}}) b(n)
join public.nurseries n on n.id = seed.branch_id(b.n)
left join lateral (select a.id from public.users a where a.nursery_id = n.id and a.role = 'branch_admin' order by a.created_at limit 1) adm on true
cross join (values
  -- key, partner, family, status, from, to (days from today), asked (days from today), asked by the family, decision note
  ('vf-1',  'vodafone',    3,  'active',   -60, null, -61, false, null),
  ('vf-2',  'vodafone',    4,  'active',   -45, null, -46, true,  'تمت مراجعة خطاب الموارد البشرية.'),
  ('vf-3',  'vodafone',    5,  'active',   -30, null, -31, true,  null),
  ('vf-4',  'vodafone',    7,  'active',   -20, null, -20, false, 'كارنيه العمل اتشاف في المكتب.'),
  ('vf-5',  'vodafone',    9,  'ended',    -90, -15,  -91, true,  null),
  ('vf-6',  'vodafone',    10, 'rejected', -10, null, -10, true,  'الخطاب المرفق من سنة 2024، برجاء إرسال خطاب حديث.'),
  ('vf-7',  'vodafone',    11, 'pending',  -2,  null, -2,  true,  null),
  ('vf-8',  'vodafone',    12, 'pending',  0,   null, 0,   true,  null),
  ('nbe-1', 'nbe',         13, 'active',   -120, null, -121, false, null),
  ('nbe-2', 'nbe',         14, 'active',   -75, null, -76, true,  null),
  ('nbe-3', 'nbe',         15, 'pending',  -1,  null, -1,  true,  null),
  ('nis-1', 'nile-school', 17, 'active',   -40, null, -40, true,  null),
  ('nis-2', 'nile-school', 19, 'active',   -12, null, -12, true,  null),
  ('or-1',  'orange',      20, 'active',   -100, null, -101, false, null),
  ('moh-1', 'moh',         21, 'ended',    -300, -31, -301, false, null)
) v(k, partner, family, status, from_day, to_day, asked_day, by_family, note)
join lateral (
  select u.id from public.users u
   where u.email = case when b.n = 1 and v.family = 4 then 'demo-parent@xonursery.com'
                        else 'mother.b' || b.n || '.f' || v.family || '@' || seed.config('parent_domain') end
) parent on true;

-- The main branch's engineers.
insert into seed_partner_families
select
  seed.uid('beneficiary:1:' || v.k), seed.uid('partner:b1:engineers'), seed.branch_id(1), parent.id, v.status,
  seed.config('today')::date + v.from_day, null, '/demo/partner-proof.svg', 'syndicate-card.svg', now() + make_interval(days => v.from_day),
  parent.id, case when v.status <> 'pending' then adm.id end, case when v.status <> 'pending' then now() + make_interval(days => v.from_day + 1) end,
  null, null
from (values ('eng-1', 22, 'active', -50), ('eng-2', 23, 'pending', -3)) v(k, family, status, from_day)
join lateral (select u.id from public.users u where u.email = 'mother.b1.f' || v.family || '@' || seed.config('parent_domain')) parent on true
left join lateral (select a.id from public.users a where a.nursery_id = seed.branch_id(1) and a.role = 'branch_admin' order by a.created_at limit 1) adm on true
where 1 = any({{branches}});

-- Replaced on every run.
delete from public.partner_beneficiaries pb
 where pb.nursery_id in (select seed.branch_id(b) from unnest({{branches}}) b)
   and pb.partner_id in (select seed.uid('partner:' || k) from unnest(array['vodafone', 'nbe', 'nile-school', 'orange', 'moh', 'b1:engineers']) k);

insert into public.partner_beneficiaries (
  id, partner_id, nursery_id, parent_id, status, valid_from, valid_to, proof_path, proof_name, claimed_by, claimed_at,
  decided_by, decided_at, decision_note, ended_notified_at
)
select id, partner_id, nursery_id, parent_id, status, valid_from, valid_to, proof_path, proof_name, claimed_by, claimed_at,
       decided_by, decided_at, note, ended_notified_at
from seed_partner_families;

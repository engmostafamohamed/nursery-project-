-- Demo seed · 03 · The chain and its 20 branches
--
-- "Cherries Nurseries": the existing main branch (with the demo accounts) and 19 more across Cairo,
-- Giza, Alexandria and the governorates. A new branch gets its roles and default settings from the
-- nurseries triggers; this file then sets its hours, payment details and the like.

insert into public.chains (id, name, billing_email)
values (seed.uid('chain'), 'Cherries Nurseries', 'finance@cherries.example')
on conflict (id) do nothing;

-- The main branch joins the chain; its own name, hours and settings stay.
update public.nurseries
   set chain_id = seed.uid('chain'),
       branch_count = (select count(*) from seed.branches),
       address_ar = coalesce(address_ar, (select address_ar from seed.branches where n = 1)),
       address_en = coalesce(address_en, (select address_en from seed.branches where n = 1))
 where id = seed.config('main_branch_id')::uuid;

-- The other branches: the main branch's plan and pricing, their own place and hours.
insert into public.nurseries (
  id, chain_id, name_ar, name_en, city, address_ar, address_en, phone, opens_at, closes_at, working_days, language_pref,
  subscription_plan, subscription_status, pricing_model, base_fee, per_child_fee, branch_count,
  contact_phones, contact_emails, about_ar, about_en
)
select
  seed.branch_id(b.n),
  seed.uid('chain'),
  b.name_ar,
  b.name_en,
  b.city_en,
  b.address_ar,
  b.address_en,
  seed.phone('branch-phone:' || b.n),
  seed.pick(array['07:00', '07:30', '08:00'], 'opens:' || b.n)::time,
  seed.pick(array['15:30', '16:00', '17:00'], 'closes:' || b.n)::time,
  '["sun","mon","tue","wed","thu"]'::jsonb,
  'ar',
  m.subscription_plan,
  m.subscription_status,
  m.pricing_model,
  m.base_fee,
  m.per_child_fee,
  (select count(*) from seed.branches),
  jsonb_build_array(seed.phone('branch-phone:' || b.n)),
  jsonb_build_array(lower(replace(b.name_en, ' ', '.')) || '@cherries.example'),
  'حضانة ' || b.name_ar || ' في ' || b.city_ar || ': رعاية يومية وتعليم مبكر للأطفال من 6 شهور حتى 6 سنوات.',
  b.name_en || ' in ' || b.city_en || ': day care and early learning for children from 6 months to 6 years.'
from seed.branches b
cross join public.nurseries m
where b.n > 1 and m.id = seed.config('main_branch_id')::uuid
on conflict (id) do nothing;

-- Their day (in Cairo time), and how families pay them. The main branch keeps its own settings.
update public.nursery_settings s
   set standard_start_time = n.opens_at,
       standard_end_time = n.closes_at,
       end_of_day_checklist_time = n.closes_at - interval '30 minutes',
       timezone = 'Africa/Cairo',
       currency = 'EGP',
       default_language = 'ar',
       invoice_due_days = 5,
       sibling_discount_2nd_child_percentage = 10,
       sibling_discount_3rd_child_percentage = 15,
       instapay_account_name = n.name_en,
       instapay_account_number = lower(replace(n.name_en, ' ', '')) || '@instapay',
       vodafone_cash_account_number = '010' || lpad(seed.int_between(0, 99999999, 'vodafone:' || n.id)::text, 8, '0'),
       payment_instructions = 'ادفعوا عن طريق إنستاباي أو فودافون كاش أو نقدًا في مكتب الحضانة، واكتبوا اسم الطفل في الملاحظات.'
  from public.nurseries n
 where s.nursery_id = n.id
   and n.chain_id = seed.uid('chain')
   and n.id <> seed.config('main_branch_id')::uuid;

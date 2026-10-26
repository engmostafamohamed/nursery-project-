-- Demo seed · 10 · Packages
--
-- Tuition: half day, full day and extended day at every branch, priced by area (central Cairo and
-- the new cities above the governorates), each with a monthly, quarterly, half-year and annual price.
-- Extra hours: a 5-hour and a 10-hour pack and a month of unlimited hours (the main branch keeps the
-- ones it has).

drop table if exists seed.tuition;
create table seed.tuition (
  branch integer not null, kind text not null, id uuid not null, name_ar text not null, name_en text not null,
  daily_hours numeric not null, monthly_price numeric not null, primary key (branch, kind)
);

insert into seed.tuition (branch, kind, id, name_ar, name_en, daily_hours, monthly_price)
select b.n, k.kind, seed.uid('tuition:' || b.n || ':' || k.kind), k.name_ar, k.name_en, k.hours,
       round(k.base * (case when b.n in (1, 2, 3, 5, 9, 10) then 1.25 when b.n >= 14 then 0.8 else 1.0 end) / 50) * 50
from seed.branches b
cross join (values
  ('half', 'نصف يوم', 'Half day', 4.0, 3000),
  ('full', 'اليوم الكامل', 'Full day', 8.0, 4800),
  ('extended', 'اليوم الممتد', 'Extended day', 10.0, 6000)
) k(kind, name_ar, name_en, hours, base);

insert into public.tuition_packages (id, nursery_id, name_ar, name_en, description_ar, description_en, daily_hours, features_json, price, active)
select
  t.id,
  seed.branch_id(t.branch),
  t.name_ar,
  t.name_en,
  case t.kind
    when 'half' then 'من بداية اليوم حتى الظهر، مع وجبة الإفطار والأنشطة الصباحية.'
    when 'full' then 'اليوم كاملًا: وجبتان ووجبة خفيفة، القيلولة، الأنشطة والتقرير اليومي.'
    else 'اليوم الكامل وساعتان بعد مواعيد الحضانة، للأهالي العاملين.'
  end,
  case t.kind
    when 'half' then 'From opening until noon, with breakfast and the morning activities.'
    when 'full' then 'The whole day: two meals and a snack, nap time, activities and the daily report.'
    else 'The full day plus two hours after closing, for working parents.'
  end,
  t.daily_hours,
  case t.kind
    when 'half' then '[{"ar":"وجبة الإفطار","en":"Breakfast"},{"ar":"الأنشطة الصباحية","en":"Morning activities"},{"ar":"التقرير اليومي","en":"Daily report"}]'::jsonb
    when 'full' then '[{"ar":"الإفطار والغداء ووجبة خفيفة","en":"Breakfast, lunch and a snack"},{"ar":"القيلولة","en":"Nap time"},{"ar":"كل الأنشطة","en":"All activities"},{"ar":"التقرير اليومي","en":"Daily report"}]'::jsonb
    else '[{"ar":"كل مميزات اليوم الكامل","en":"Everything in the full day"},{"ar":"ساعتان إضافيتان يوميًا","en":"Two extra hours a day"},{"ar":"وجبة خفيفة إضافية","en":"An extra snack"}]'::jsonb
  end,
  t.monthly_price,
  true
from seed.tuition t
on conflict (id) do nothing;

-- Paying for longer costs less a month.
insert into public.tuition_package_billing_periods (nursery_id, tuition_package_id, billing_period, duration_months, price, active)
select seed.branch_id(t.branch), t.id, p.period, p.months, round(t.monthly_price * p.months * p.factor), true
from seed.tuition t
cross join (values ('monthly', 1, 1.0), ('quarterly', 3, 0.95), ('half_annual', 6, 0.9), ('annual', 12, 0.85)) p(period, months, factor)
on conflict (tuition_package_id, billing_period) do nothing;

-- Extra hours.
insert into public.packages (id, nursery_id, name_ar, name_en, description_ar, description_en, coverage_type, included_hours, price, active, validity_value, validity_unit)
select seed.uid('hours:' || b.n || ':' || k.kind), seed.branch_id(b.n), k.name_ar, k.name_en, k.desc_ar, k.desc_en, k.coverage, k.hours, k.price, true, k.validity, k.unit
from seed.branches b
cross join (values
  ('5h', 'باقة البداية 5 ساعات', '5-Hour Starter Pack', '5 ساعات إضافية بعد مواعيد الحضانة.', '5 extra hours after closing time.', 'hours_quota', 5, 250, 3, 'months'),
  ('10h', 'باقة 10 ساعات', '10-Hour Pack', '10 ساعات إضافية بسعر أقل للساعة.', '10 extra hours at a lower hourly price.', 'hours_quota', 10, 450, 3, 'months'),
  ('unlimited', 'ساعات إضافية غير محدودة', 'Unlimited Extra Hours', 'ساعات إضافية بلا حد لمدة شهر.', 'Unlimited extra hours for a month.', 'unlimited', null, 800, 1, 'months')
) k(kind, name_ar, name_en, desc_ar, desc_en, coverage, hours, price, validity, unit)
where b.n > 1
on conflict (id) do nothing;

-- Demo seed · 20 · Kitchen, warehouse and meals ({{branches}})
-- batch: 2 (each branch makes about 1,500 calls to the app's functions: 20–30 seconds)
--
-- Four weeks of each branch's stock and food, made by the app's own functions as the people who
-- would do it (signed in as them for the call: the branch admin, the class's lead teacher, a member
-- of staff, a parent), so every rule runs: prices, discounts, allergies, stock that never goes below
-- zero, invoices. Then each change is dated back to when it happened.
--
--   * The warehouse: 20 kitchen items (water, juice, milk, yogurt, sandwiches, rice, chicken…) and
--     20 store items (crayons, paper, diapers, wipes, cleaning, first aid, toys, chairs, uniforms),
--     with prices, packs (a carton of 12) and where they are kept.
--   * Every school day: deliveries from the supplier (with what a unit cost and its expiry date), the
--     kitchen's use, supplies issued to classes (taken by the class's teacher), staff taking a
--     coffee or a sandwich (charged to them, with the staff discount), children's extras (a teacher
--     gives one: served at once with the parents' consent, otherwise the parent says yes or no; a
--     parent orders one), diapers and uniforms charged to a child, things thrown away or broken, a
--     stock count at the start of the month, and a couple of charges cancelled (stock comes back).
--   * Every child's charge is on the family's monthly extras invoice, one line per charge, with its
--     discount: last month's invoices are issued on the 1st and mostly paid, this month's are open.
--   * Today: extras still waiting for the parent, parents' orders for the coming days, an item out of
--     stock, some running low, one expired and one about to.
--   * Meals: three meal plans (breakfast, lunch, the full day), most children on one (on this month's
--     unpaid tuition invoice, as the billing job adds it), and the weekly menu for the last two
--     weeks, this week and next week's draft.
-- A branch's kitchen, warehouse and meal data is replaced on every run. The last block checks the
-- result (stock = its movements, every child's charge on an invoice line, the invoices' totals…).

-- -----------------------------------------------------------------------------------------------
-- Helpers (dropped with the seed schema)

-- Calls a function as this user (auth.uid()); null: as nobody.
create or replace function seed.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when p_user is null then '' else json_build_object('sub', p_user, 'role', 'authenticated')::text end, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
end;
$$;

-- When something happened: p_time on p_day at the branch (Cairo). Today's events are spread between
-- 07:30 and a few minutes ago, in the same order.
create or replace function seed.kt_at(p_day date, p_time time) returns timestamptz
language sql stable as $$
  select case
    when p_day < seed.config('today')::date then (p_day + p_time) at time zone 'Africa/Cairo'
    else ((p_day + time '07:30') at time zone 'Africa/Cairo')
         + greatest(now() - ((p_day + time '07:30') at time zone 'Africa/Cairo') - interval '10 minutes', interval '0')
           * (greatest(extract(epoch from (p_time - time '07:30')), 0) / extract(epoch from interval '9 hours 30 minutes'))
  end
$$;

-- Dates back what the last calls made: the stock movements and charges made since p_mark, and the
-- notifications sent in this run that are not dated yet.
create or replace function seed.kt_stamp(p_nursery uuid, p_mark timestamptz, p_at timestamptz) returns void
language plpgsql as $$
begin
  update public.inventory_movements set created_at = p_at + (created_at - p_mark)
   where nursery_id = p_nursery and created_at >= p_mark;
  update public.kitchen_charges set created_at = p_at + (created_at - p_mark), charged_on = (p_at at time zone 'Africa/Cairo')::date
   where nursery_id = p_nursery and created_at >= p_mark;
  update public.notifications
     set sent_at = p_at, created_at = p_at, updated_at = p_at,
         read = p_at < now() - interval '2 days'
   where nursery_id = p_nursery and sent_at = now();
end;
$$;

-- The items: what they are, how they are sold, and how the four weeks use them.
--   open_qty: the first delivery; restock_every/restock_qty: a delivery every n school days;
--   use_every/use_qty: the kitchen's (or the cleaners') use; issue_every/issue_qty: issued to a class;
--   staff_daily: how many members of staff take one on a day.
create table if not exists seed.stock_items (
  key text primary key, n integer not null, name text not null, category text not null, unit text not null,
  low numeric not null, cost numeric, child_price numeric, staff_price numeric, pack_size numeric, pack_unit text,
  extra_kind text, allergens text[] not null default '{}', location text, shelf_days integer, supplier text,
  open_qty numeric not null, restock_every integer, restock_qty numeric,
  use_every integer, use_qty numeric, issue_every integer, issue_qty numeric, staff_daily integer not null default 0
);
truncate seed.stock_items;
insert into seed.stock_items values
  -- The kitchen
  ('water',      1, 'مياه معدنية 600 مل',      'drinks', 'زجاجة', 24, 4, 6, 5, 12, 'كرتونة', 'drink', '{}', 'مخزن المطبخ', 365, 'شركة النيل للمياه', 144, 5, 96, 1, 14, null, null, 2),
  ('juice',      2, 'عصير برتقال 200 مل',      'drinks', 'علبة', 24, 6, 10, 8, 24, 'كرتونة', 'drink', '{citrus}', 'ثلاجة المطبخ', 120, 'جهينة', 96, 10, 24, null, null, null, null, 1),
  ('milk',       3, 'لبن كامل الدسم 1 لتر',     'drinks', 'لتر', 10, 38, null, null, 12, 'كرتونة', null, '{milk}', 'ثلاجة المطبخ', 6, 'جهينة', 24, 3, 12, 1, 3, null, null, 0),
  ('milk_box',   4, 'لبن صغير 200 مل',         'drinks', 'علبة', 24, 8, 12, null, 24, 'كرتونة', 'drink', '{milk}', 'ثلاجة المطبخ', 30, 'جهينة', 48, 10, 24, null, null, null, null, 0),
  ('yogurt',     5, 'زبادي 105 جم',            'food', 'علبة', 20, 7, 10, null, 24, 'كرتونة', 'snack', '{milk}', 'ثلاجة المطبخ', 10, 'جهينة', 48, 5, 48, 1, 6, null, null, 0),
  ('biscuits',   6, 'بسكويت شاي',              'food', 'باكو', 20, 5, 8, 7, 24, 'كرتونة', 'snack', '{gluten,eggs,milk}', 'مخزن المطبخ', 120, 'بسكو مصر', 72, 10, 48, 1, 4, null, null, 1),
  ('fruit',      7, 'طبق فاكهة موسمية',        'food', 'طبق', 5, 12, 20, 18, null, null, 'snack', '{}', 'ثلاجة المطبخ', 3, 'سوق العبور', 15, 2, 12, 1, 4, null, null, 1),
  ('sandwich',   8, 'ساندوتش جبنة رومي',       'food', 'ساندوتش', 8, 15, 25, 22, null, null, 'meal', '{gluten,milk}', 'ثلاجة المطبخ', 4, 'مخبز الحضانة', 12, 2, 6, null, null, null, null, 1),
  ('hot_meal',   9, 'وجبة غداء إضافية',        'food', 'وجبة', 8, 35, 60, 50, null, null, 'meal', '{}', 'المطبخ', null, 'مطبخ الحضانة', 10, 2, 5, null, null, null, null, 1),
  ('rice',      10, 'أرز مصري',                'food', 'كجم', 10, 32, null, null, 5, 'شيكارة', null, '{}', 'مخزن المطبخ', 365, 'جملة الأرز', 30, 10, 25, 1, 2.5, null, null, 0),
  ('chicken',   11, 'صدور دجاج',               'food', 'كجم', 5, 190, null, null, null, null, null, '{}', 'الفريزر', 60, 'دواجن الوادي', 15, 5, 12, 1, 2.5, null, null, 0),
  ('vegetables',12, 'خضار مشكل مجمد',          'food', 'كجم', 5, 60, null, null, 2, 'كيس', null, '{}', 'الفريزر', 180, 'فريش فودز', 10, 5, 8, 1, 1.5, null, null, 0),
  ('bread',     13, 'عيش بلدي',                'food', 'رغيف', 40, 1.5, null, null, 10, 'كيس', null, '{gluten}', 'المطبخ', 2, 'مخبز الحضانة', 60, 1, 50, 1, 48, null, null, 0),
  ('eggs',      14, 'بيض',                     'food', 'بيضة', 30, 5, null, null, 30, 'كرتونة', null, '{eggs}', 'ثلاجة المطبخ', 21, 'مزرعة الخير', 90, 5, 60, 1, 12, null, null, 0),
  ('cheese',    15, 'جبنة بيضاء',              'food', 'كجم', 3, 120, null, null, null, null, null, '{milk}', 'ثلاجة المطبخ', 14, 'دومتي', 5, 5, 4, 1, 0.8, null, null, 0),
  ('cream',     16, 'قشطة',                    'food', 'علبة', 2, 30, null, null, 12, 'كرتونة', null, '{milk}', 'ثلاجة المطبخ', 22, 'جهينة', 6, null, null, null, null, null, null, 0),
  ('coffee',    17, 'قهوة سريعة التحضير',      'drinks', 'كيس', 20, 6, null, 10, 24, 'علبة', null, '{}', 'غرفة المعلمين', 365, 'نسكافيه', 48, 12, 48, null, null, null, null, 3),
  ('tea',       18, 'شاي فتلة',                'drinks', 'فتلة', 50, 1.2, null, 3, 100, 'علبة', null, '{}', 'غرفة المعلمين', 365, 'العروسة', 200, 15, 100, null, null, null, null, 4),
  ('dish_soap', 19, 'سائل غسيل أطباق',         'kitchen_supplies', 'زجاجة', 3, 45, null, null, 6, 'كرتونة', null, '{}', 'مخزن المطبخ', null, 'بريل', 8, 12, 6, 3, 1, null, null, 0),
  ('foil',      20, 'ورق فويل',                'kitchen_supplies', 'لفة', 2, 85, null, null, null, null, null, '{}', 'مخزن المطبخ', null, 'فاين', 4, null, null, 7, 1, null, null, 0),
  -- The store
  ('crayons',   21, 'ألوان شمع 12 لون',        'supplies', 'علبة', 15, 35, null, null, 12, 'كرتونة', null, '{}', 'مخزن الأدوات · رف 1', null, 'مكتبة النور', 48, 12, 24, null, null, 3, 6, 0),
  ('paper',     22, 'ورق A4',                  'supplies', 'رزمة', 5, 220, null, null, 5, 'كرتونة', null, '{}', 'مخزن الأدوات · رف 1', null, 'مكتبة النور', 10, 10, 5, null, null, 2, 1, 0),
  ('playdough', 23, 'صلصال أطفال',             'supplies', 'علبة', 10, 45, null, null, 12, 'كرتونة', null, '{}', 'مخزن الأدوات · رف 2', null, 'مكتبة النور', 24, 15, 12, null, null, 4, 4, 0),
  ('glue',      24, 'صمغ أطفال',               'supplies', 'أنبوبة', 10, 15, null, null, 24, 'كرتونة', null, '{}', 'مخزن الأدوات · رف 2', null, 'مكتبة النور', 24, null, null, null, null, 4, 6, 0),
  ('books',     25, 'قصص مصورة',               'supplies', 'كتاب', 5, 60, null, null, null, null, null, '{}', 'المكتبة', null, 'دار الشروق', 30, null, null, null, null, 10, 3, 0),
  ('diapers',   26, 'حفاضات مقاس 4',           'hygiene', 'حفاضة', 100, 4.5, 7, null, 50, 'باكو', null, '{}', 'غرفة التغيير', null, 'موزع بامبرز', 400, 5, 200, null, null, 1, 40, 0),
  ('wipes',     27, 'مناديل مبللة',            'hygiene', 'باكو', 10, 25, 40, null, 12, 'كرتونة', null, '{}', 'غرفة التغيير', null, 'موزع بامبرز', 36, 10, 12, null, null, 1, 2, 0),
  ('tissues',   28, 'مناديل ورقية',            'hygiene', 'علبة', 20, 18, null, null, 10, 'شدة', null, '{}', 'غرفة التغيير', null, 'فاين', 60, 10, 40, null, null, 2, 4, 0),
  ('hand_soap', 29, 'صابون يد سائل',           'cleaning', 'زجاجة', 6, 55, null, null, 12, 'كرتونة', null, '{}', 'مخزن النظافة', null, 'ديتول', 24, 15, 12, 3, 2, null, null, 0),
  ('disinfect', 30, 'مطهر أرضيات',             'cleaning', 'جالون', 3, 140, null, null, 4, 'كرتونة', null, '{}', 'مخزن النظافة', null, 'ديتول', 8, 10, 4, 3, 1, null, null, 0),
  ('gloves',    31, 'جوانتي طبي',              'cleaning', 'علبة', 4, 120, null, null, null, null, null, '{}', 'مخزن النظافة', null, 'المتحدة للمستلزمات', 10, 15, 6, 4, 1, null, null, 0),
  ('first_aid', 32, 'شاش وقطن ولاصق',          'medical', 'علبة', 3, 75, null, null, null, null, null, '{}', 'غرفة الإسعافات', null, 'صيدلية الشفاء', 6, null, null, 10, 1, null, null, 0),
  ('plasters',  33, 'بلاستر جروح',             'medical', 'علبة', 4, 40, null, null, null, null, null, '{}', 'غرفة الإسعافات', null, 'صيدلية الشفاء', 10, 20, 6, null, null, 5, 1, 0),
  ('thermo',    34, 'أغطية ترمومتر',           'medical', 'علبة', 2, 90, null, null, null, null, null, '{}', 'غرفة الإسعافات', null, 'صيدلية الشفاء', 4, null, null, 12, 1, null, null, 0),
  ('blocks',    35, 'مكعبات بناء',             'toys', 'طقم', 2, 650, null, null, null, null, null, '{}', 'غرفة الألعاب', null, 'عالم الألعاب', 6, null, null, null, null, 15, 1, 0),
  ('puzzles',   36, 'بازل خشبي',               'toys', 'قطعة', 4, 120, null, null, null, null, null, '{}', 'غرفة الألعاب', null, 'عالم الألعاب', 20, null, null, null, null, 10, 2, 0),
  ('chairs',    37, 'كرسي أطفال بلاستيك',      'furniture', 'كرسي', 5, 350, null, null, null, null, null, '{}', 'المخزن الرئيسي', null, 'بلاستيك مصر', 30, null, null, null, null, null, null, 0),
  ('mattress',  38, 'مرتبة نوم',               'furniture', 'مرتبة', 3, 900, null, null, null, null, null, '{}', 'المخزن الرئيسي', null, 'مفروشات النيل', 12, null, null, null, null, null, null, 0),
  ('uniform',   39, 'تيشيرت الحضانة',          'other', 'قطعة', 10, 120, 180, 150, null, null, null, '{}', 'المخزن الرئيسي', null, 'مصنع الزي', 60, null, null, null, null, null, null, 0),
  ('bag',       40, 'شنطة الحضانة',            'other', 'قطعة', 5, 200, 300, null, null, null, null, '{}', 'المخزن الرئيسي', null, 'مصنع الزي', 40, null, null, null, null, null, null, 0);

-- The menu's dishes, by meal, with what they contain.
create table if not exists seed.dishes (meal text not null, n integer not null, name text not null, allergens text[] not null, primary key (meal, n));
truncate seed.dishes;
insert into seed.dishes values
  ('breakfast', 1, 'فول بالزيت والليمون مع عيش', '{gluten}'),
  ('breakfast', 2, 'ساندوتش جبنة بيضاء وخيار', '{milk,gluten}'),
  ('breakfast', 3, 'بيض مسلوق مع توست', '{eggs,gluten}'),
  ('breakfast', 4, 'شوفان باللبن والعسل', '{milk,gluten}'),
  ('breakfast', 5, 'لبنة مع عيش شامي وزيتون', '{milk,gluten}'),
  ('breakfast', 6, 'بليلة باللبن', '{milk}'),
  ('breakfast', 7, 'فطيرة جبنة', '{gluten,milk,eggs}'),
  ('lunch', 1, 'أرز بالخضار مع فراخ مشوية', '{}'),
  ('lunch', 2, 'مكرونة بالبشاميل', '{gluten,milk,eggs}'),
  ('lunch', 3, 'ملوخية مع أرز وفراخ', '{}'),
  ('lunch', 4, 'سمك فيليه مع بطاطس مهروسة', '{fish,milk}'),
  ('lunch', 5, 'كشري للأطفال', '{gluten}'),
  ('lunch', 6, 'شوربة عدس مع عيش محمص', '{gluten}'),
  ('lunch', 7, 'كفتة بالأرز وسلطة', '{}'),
  ('lunch', 8, 'بطاطس بالفرن مع لحمة مفرومة', '{}'),
  ('lunch_side', 1, 'سلطة خضراء', '{}'),
  ('lunch_side', 2, 'زبادي', '{milk}'),
  ('lunch_side', 3, 'شوربة خضار', '{}'),
  ('lunch_side', 4, 'سلطة طحينة', '{sesame}'),
  ('snacks', 1, 'طبق فاكهة موسمية', '{}'),
  ('snacks', 2, 'زبادي بالعسل', '{milk}'),
  ('snacks', 3, 'بسكويت ولبن', '{gluten,milk,eggs}'),
  ('snacks', 4, 'موز وتمر', '{}'),
  ('snacks', 5, 'جزر وخيار مع حمص', '{sesame}'),
  ('snacks', 6, 'كيكة برتقال', '{gluten,eggs,milk,citrus}'),
  ('snacks', 7, 'فراولة', '{strawberry}');

-- -----------------------------------------------------------------------------------------------
do $kitchen$
declare
  v_b integer;
  v_n uuid;
  v_today date := seed.config('today')::date;
  v_start date := seed.config('today')::date - 28;
  v_month date := date_trunc('month', seed.config('today')::date)::date;
  v_admin uuid;
  v_finance uuid;
  v_staff uuid[];
  v_kids uuid[];
  v_babies uuid[];
  v_classes uuid[];
  v_days date[];
  v_d date;
  v_i integer;
  v_k integer;
  v_j integer;
  v_s seed.stock_items%rowtype;
  v_item uuid;
  v_qty numeric;
  v_now_qty numeric;
  v_mark timestamptz;
  v_at timestamptz;
  v_key text;
  v_child uuid;
  v_class uuid;
  v_teacher uuid;
  v_parent uuid;
  v_person uuid;
  v_result jsonb;
  v_request uuid;
  v_charge uuid;
  v_items jsonb := '{}';
  v_count integer;
  v_skipped integer;
  v_inv record;
  v_c public.kitchen_charges%rowtype;
  v_plan_breakfast uuid;
  v_plan_lunch uuid;
  v_plan_full uuid;
  v_ws date;
  v_week uuid;
  v_due_days integer;
begin
  foreach v_b in array {{branches}} loop
    v_n := seed.branch_id(v_b);
    v_skipped := 0;
    perform seed.act_as(null);
    select u.id into v_admin from public.users u
     where u.nursery_id = v_n and u.role = 'branch_admin' and coalesce(u.status, 'active') = 'active'
     order by u.created_at limit 1;
    if v_admin is null then
      raise notice 'branch % has no admin: skipped', v_b;
      continue;
    end if;
    select u.id into v_finance from public.users u
     where u.nursery_id = v_n and u.role = 'manager' and (u.email like 'finance.%' or u.email like 'demo-manager@%')
     order by u.created_at limit 1;
    v_finance := coalesce(v_finance, v_admin);
    v_staff := array(select u.id from public.users u where u.nursery_id = v_n and u.role in ('teacher', 'manager', 'branch_admin')
                       and coalesce(u.status, 'active') = 'active' order by u.id);
    v_kids := array(select c.id from public.children c where c.nursery_id = v_n and c.status = 'active' and c.class_id is not null
                      and exists (select 1 from public.parent_children pc where pc.child_id = c.id) order by c.id);
    v_babies := array(select c.id from public.children c where c.nursery_id = v_n and c.status = 'active' and c.class_id is not null
                        and c.dob > v_today - interval '30 months' and exists (select 1 from public.parent_children pc where pc.child_id = c.id) order by c.id);
    if cardinality(v_babies) = 0 then v_babies := v_kids; end if;
    -- Classes, youngest first (diapers go to them).
    v_classes := array(select cl.id from public.classes cl where cl.nursery_id = v_n and cl.deleted_at is null
                         order by (select max(c.dob) from public.children c where c.class_id = cl.id) desc nulls last, cl.id);
    if cardinality(v_kids) = 0 or cardinality(v_classes) = 0 or cardinality(v_staff) = 0 then
      raise notice 'branch % has no children, classes or staff: skipped', v_b;
      continue;
    end if;
    v_days := array(select d::date from generate_series(v_start, v_today, interval '1 day') d
                     where public.attendance_is_school_day(v_n, d::date) order by d);
    select coalesce(ns.invoice_due_days, 7) into v_due_days from public.nursery_settings ns where ns.nursery_id = v_n;
    v_due_days := coalesce(v_due_days, 7);

    -- ---------------------------------------------------------------------------------------
    -- What an earlier run left
    update public.invoices iv
       set amount = iv.amount - coalesce((select sum((it ->> 'total')::numeric) from jsonb_array_elements(iv.line_items_json -> 'items') it where it ->> 'kind' = 'meal_plan'), 0),
           line_items_json = jsonb_set(iv.line_items_json, '{items}',
             coalesce((select jsonb_agg(it) from jsonb_array_elements(iv.line_items_json -> 'items') it where it ->> 'kind' is distinct from 'meal_plan'), '[]'::jsonb))
     where iv.nursery_id = v_n and iv.invoice_type = 'monthly' and iv.status in ('pending', 'overdue')
       and exists (select 1 from jsonb_array_elements(iv.line_items_json -> 'items') it where it ->> 'kind' = 'meal_plan')
       and not exists (select 1 from public.payment_attempts pa where pa.invoice_id = iv.id);
    delete from public.payment_attempts pa using public.invoices iv
     where pa.invoice_id = iv.id and iv.nursery_id = v_n and iv.invoice_type = 'food_extras';
    delete from public.invoices where nursery_id = v_n and invoice_type = 'food_extras';
    delete from public.child_extra_requests where nursery_id = v_n;
    delete from public.kitchen_charges where nursery_id = v_n;
    delete from public.kitchen_discounts where nursery_id = v_n;
    delete from public.inventory where nursery_id = v_n;
    delete from public.notifications where nursery_id = v_n and (type like 'extra\_%' or type like 'stock\_%');
    delete from public.child_meal_plans where nursery_id = v_n;
    delete from public.nursery_meal_plans where nursery_id = v_n;
    delete from public.menu_weeks where nursery_id = v_n;

    -- ---------------------------------------------------------------------------------------
    -- The items, added by the branch admin
    perform seed.act_as(v_admin);
    v_items := '{}';
    for v_s in select * from seed.stock_items order by n loop
      perform public.save_kitchen_item(v_n, null, v_s.name, v_s.category, v_s.unit, v_s.low, null,
        v_s.cost, v_s.child_price, v_s.staff_price, v_s.pack_size, v_s.pack_unit, v_s.extra_kind, v_s.allergens, v_s.location);
      select id into v_item from public.inventory where nursery_id = v_n and item_name = v_s.name;
      v_items := v_items || jsonb_build_object(v_s.key, v_item);
    end loop;
    update public.inventory set created_at = seed.kt_at(v_start, time '07:45'), updated_at = seed.kt_at(v_start, time '07:45') where nursery_id = v_n;

    -- The discounts
    perform public.save_kitchen_discount(v_n, null, 'خصم الموظفين', 'Staff discount', 'all_staff', null, null, 20, null, null, true);
    perform public.save_kitchen_discount(v_n, null, 'مياه الموظفين', 'Staff water', 'all_staff', null, (v_items ->> 'water')::uuid, 50, null, null, true);
    perform public.save_kitchen_discount(v_n, null, 'عرض العودة للمدارس', 'Back to school offer', 'all_children', null, null, 10, v_start - 60, v_start - 30, false);
    for v_child in
      select pc.child_id from public.parent_children pc
       where pc.child_id = any (v_kids)
         and (select count(*) from public.parent_children o where o.parent_id = pc.parent_id and o.child_id = any (v_kids)) > 1
       order by pc.child_id limit 4
    loop
      perform public.save_kitchen_discount(v_n, null, 'خصم الإخوة', 'Siblings discount', 'child', v_child, null, 10, null, null, true);
    end loop;
    update public.kitchen_discounts set created_at = seed.kt_at(v_start, time '07:50'), updated_at = seed.kt_at(v_start, time '07:50') where nursery_id = v_n;

    -- ---------------------------------------------------------------------------------------
    -- Day by day
    for v_i in 1 .. cardinality(v_days) loop
      v_d := v_days[v_i];

      -- 08:00 Deliveries: everything on the first day, then each item every few school days.
      v_k := 0;
      perform seed.act_as(v_admin);
      for v_s in select * from seed.stock_items order by n loop
        v_qty := case when v_i = 1 then v_s.open_qty
                      when v_s.restock_every is not null and (v_i - 1) % v_s.restock_every = 0 then v_s.restock_qty end;
        continue when v_qty is null;
        v_k := v_k + 1;
        v_item := (v_items ->> v_s.key)::uuid;
        v_at := seed.kt_at(v_d, time '08:00' + v_k * interval '2 minutes');
        v_mark := clock_timestamp();
        begin
          perform public.record_kitchen_movement(
            v_item, 'restocked', v_qty,
            case when v_s.shelf_days is not null then v_d + v_s.shelf_days end,
            case when v_s.pack_size is not null then format('%s %s', trim_scale(round(v_qty / v_s.pack_size, 1)), v_s.pack_unit) end,
            null, null,
            round(v_s.cost * (0.95 + 0.1 * seed.rnd('cost:' || v_b || v_s.key || v_i))::numeric, 2),
            v_s.supplier);
          update public.inventory set last_restocked = v_d where id = v_item;
          perform seed.kt_stamp(v_n, v_mark, v_at);
        exception when others then v_skipped := v_skipped + 1;
        end;
      end loop;

      -- 09:00 Supplies issued to the classes, taken by their lead teacher.
      v_k := 0;
      for v_s in select * from seed.stock_items where issue_every is not null order by n loop
        continue when v_i % v_s.issue_every <> 0;
        v_k := v_k + 1;
        v_item := (v_items ->> v_s.key)::uuid;
        select quantity into v_now_qty from public.inventory where id = v_item;
        v_qty := least(v_s.issue_qty, v_now_qty);
        continue when v_qty <= 0;
        v_class := case when v_s.key in ('diapers', 'wipes') then v_classes[1 + (v_i + v_k) % least(3, cardinality(v_classes))]
                        else v_classes[1 + (v_i * 3 + v_k) % cardinality(v_classes)] end;
        select cs.user_id into v_teacher from public.class_staff cs where cs.class_id = v_class and cs.role = 'lead' limit 1;
        v_at := seed.kt_at(v_d, time '09:00' + v_k * interval '3 minutes');
        v_mark := clock_timestamp();
        begin
          perform public.record_kitchen_movement(v_item, 'issued', v_qty, null,
            case when v_s.category = 'supplies' then seed.pick(array['نشاط الرسم', 'ركن الفنون', 'نشاط الأسبوع', null], 'note:' || v_b || v_i || v_k) end,
            v_class, v_teacher);
          perform seed.kt_stamp(v_n, v_mark, v_at);
        exception when others then v_skipped := v_skipped + 1;
        end;
      end loop;

      -- 09:30–14:00 Staff take a drink, a snack or lunch: charged to them (the staff discount applies).
      v_k := 0;
      for v_s in select * from seed.stock_items where staff_daily > 0 order by n loop
        for v_j in 1 .. v_s.staff_daily loop
          continue when not seed.chance(80, 'staff-take:' || v_b || v_s.key || v_i || ':' || v_j);
          v_k := v_k + 1;
          v_person := v_staff[1 + floor(seed.rnd('staff:' || v_b || v_s.key || v_i || ':' || v_j) * cardinality(v_staff))::integer];
          v_at := seed.kt_at(v_d, time '09:30' + (v_k * 7) * interval '1 minute');
          v_mark := clock_timestamp();
          begin
            -- Half of them record it themselves on their phone, the rest the kitchen records for them.
            if seed.chance(50, 'self:' || v_b || v_s.key || v_i || v_j) then
              perform seed.act_as(v_person);
              perform public.charge_staff_kitchen_item((v_items ->> v_s.key)::uuid, case when v_s.key = 'water' then 2 else 1 end, null, null,
                seed.uid('staff-charge:' || v_b || ':' || v_s.key || ':' || v_d || ':' || v_j));
            else
              perform seed.act_as(v_admin);
              perform public.charge_staff_kitchen_item((v_items ->> v_s.key)::uuid, case when v_s.key = 'water' then 2 else 1 end, v_person, null,
                seed.uid('staff-charge:' || v_b || ':' || v_s.key || ':' || v_d || ':' || v_j));
            end if;
            perform seed.kt_stamp(v_n, v_mark, v_at);
          exception when others then v_skipped := v_skipped + 1;
          end;
        end loop;
      end loop;

      -- 10:00 Teachers give children a snack or a drink: served at once with the parents' consent,
      -- otherwise the parent says yes (mostly) or no, then it is served.
      for v_j in 1 .. 3 loop
        v_key := seed.pick(case when v_j = 3 then array['sandwich', 'hot_meal'] else array['juice', 'yogurt', 'biscuits', 'milk_box', 'fruit', 'water'] end,
                           'extra-item:' || v_b || v_i || v_j);
        continue when v_j = 3 and v_i % 2 = 0;
        v_child := v_kids[1 + floor(seed.rnd('extra-child:' || v_b || v_i || v_j) * cardinality(v_kids))::integer];
        continue when cardinality(public.kitchen_item_allergy_conflicts((v_items ->> v_key)::uuid, v_child)) > 0;
        select cs.user_id into v_teacher from public.class_staff cs join public.children c on c.class_id = cs.class_id
         where c.id = v_child and cs.role = 'lead' limit 1;
        select pc.parent_id into v_parent from public.parent_children pc join public.users u on u.id = pc.parent_id and u.role = 'parent'
         where pc.child_id = v_child order by pc.is_primary desc nulls last limit 1;
        v_at := seed.kt_at(v_d, time '10:00' + v_j * interval '20 minutes');
        begin
          perform seed.act_as(coalesce(v_teacher, v_admin));
          v_mark := clock_timestamp();
          v_result := public.give_child_extra(v_child, (v_items ->> v_key)::uuid, 1,
            seed.pick(array['طلب زيادة', 'لم يفطر في البيت', null, null], 'extra-note:' || v_b || v_i || v_j), seed.uid('give:' || v_b || ':' || v_d || ':' || v_j));
          v_request := (v_result ->> 'request_id')::uuid;
          perform seed.kt_stamp(v_n, v_mark, v_at);
          update public.child_extra_requests set created_at = v_at, updated_at = v_at, served_at = case when served_at is not null then v_at end where id = v_request;
          -- Waiting for the parent: today some still wait; otherwise the parent answers within the hour.
          if v_result ->> 'status' = 'waiting_parent' and v_parent is not null and not (v_d = v_today and v_j <> 2) then
            perform seed.act_as(v_parent);
            v_mark := clock_timestamp();
            perform public.decide_child_extra(v_request, seed.chance(85, 'yes:' || v_b || v_i || v_j));
            perform seed.kt_stamp(v_n, v_mark, v_at + interval '35 minutes');
            update public.child_extra_requests set decided_at = v_at + interval '35 minutes', updated_at = v_at + interval '35 minutes' where id = v_request;
            if (select status from public.child_extra_requests where id = v_request) = 'approved' then
              perform seed.act_as(coalesce(v_teacher, v_admin));
              v_mark := clock_timestamp();
              perform public.serve_child_extra(v_request, seed.uid('serve:' || v_request));
              perform seed.kt_stamp(v_n, v_mark, v_at + interval '60 minutes');
              update public.child_extra_requests set served_at = v_at + interval '60 minutes', updated_at = v_at + interval '60 minutes' where id = v_request;
            end if;
          end if;
          update public.child_extra_requests set for_date = v_d where id = v_request;
        exception when others then v_skipped := v_skipped + 1;
        end;
      end loop;

      -- 07:00 A parent orders an extra for the day in the app; the teacher serves it at noon (today:
      -- not yet). Today parents also order for the coming days.
      for v_j in 1 .. case when v_d = v_today then 4 else 1 end loop
        v_key := seed.pick(array['juice', 'yogurt', 'sandwich', 'fruit', 'milk_box'], 'order-item:' || v_b || v_i || v_j);
        v_child := v_kids[1 + floor(seed.rnd('order-child:' || v_b || v_i || v_j) * cardinality(v_kids))::integer];
        continue when cardinality(public.kitchen_item_allergy_conflicts((v_items ->> v_key)::uuid, v_child)) > 0;
        select pc.parent_id into v_parent from public.parent_children pc join public.users u on u.id = pc.parent_id and u.role = 'parent'
         where pc.child_id = v_child order by pc.is_primary desc nulls last limit 1;
        continue when v_parent is null;
        select cs.user_id into v_teacher from public.class_staff cs join public.children c on c.class_id = cs.class_id
         where c.id = v_child and cs.role = 'lead' limit 1;
        v_at := seed.kt_at(v_d, time '07:40' + v_j * interval '5 minutes');
        begin
          perform seed.act_as(v_parent);
          v_mark := clock_timestamp();
          perform public.order_child_extra(v_child, (v_items ->> v_key)::uuid, 1,
            case when v_j = 1 then array[v_today]
                 else array(select d::date from generate_series(v_today + 1, v_today + 10, interval '1 day') d
                             where public.attendance_is_school_day(v_n, d::date) order by d limit v_j - 1) end,
            seed.pick(array['مع الغداء من فضلك', null, null], 'order-note:' || v_b || v_i || v_j));
          perform seed.kt_stamp(v_n, v_mark, v_at);
          update public.child_extra_requests set created_at = v_at, updated_at = v_at, decided_at = v_at
           where child_id = v_child and source = 'parent' and created_at = now();
          if v_j = 1 then
            select id into v_request from public.child_extra_requests where child_id = v_child and source = 'parent' and for_date = v_today and status = 'approved'
             order by created_at desc limit 1;
            if v_d < v_today or seed.chance(50, 'serve-now:' || v_b) then
              perform seed.act_as(coalesce(v_teacher, v_admin));
              v_mark := clock_timestamp();
              perform public.serve_child_extra(v_request, seed.uid('serve:' || v_request));
              perform seed.kt_stamp(v_n, v_mark, seed.kt_at(v_d, time '12:00'));
              update public.child_extra_requests set served_at = seed.kt_at(v_d, time '12:00'), updated_at = seed.kt_at(v_d, time '12:00') where id = v_request;
            end if;
            update public.child_extra_requests set for_date = v_d where id = v_request;
          end if;
        exception when others then v_skipped := v_skipped + 1;
        end;
      end loop;

      -- 11:00 The kitchen's use (cooking, snack time, water for the classes) and the cleaners'.
      perform seed.act_as(v_admin);
      v_k := 0;
      for v_s in select * from seed.stock_items where use_every is not null order by n loop
        continue when v_i % v_s.use_every <> 0;
        v_k := v_k + 1;
        v_item := (v_items ->> v_s.key)::uuid;
        select quantity into v_now_qty from public.inventory where id = v_item;
        -- Weighed things in tenths (2.4 kg), counted things whole.
        v_qty := least(case when v_s.unit in ('كجم', 'لتر') then round(v_s.use_qty * (0.8 + 0.4 * seed.rnd('use:' || v_b || v_s.key || v_i))::numeric, 1)
                            else greatest(round(v_s.use_qty * (0.8 + 0.4 * seed.rnd('use:' || v_b || v_s.key || v_i))::numeric), 1) end, v_now_qty);
        continue when v_qty <= 0;
        v_mark := clock_timestamp();
        begin
          perform public.record_kitchen_movement(v_item, 'used', v_qty, null,
            case when v_s.key = 'water' then 'توزيع على الفصول' when v_s.category = 'cleaning' then 'تنظيف يومي' end);
          perform seed.kt_stamp(v_n, v_mark, seed.kt_at(v_d, time '11:00' + v_k * interval '2 minutes'));
        exception when others then v_skipped := v_skipped + 1;
        end;
      end loop;

      -- 12:30 The store charges children: diapers when the family's ran out, wipes, a uniform, a bag.
      v_k := 0;
      foreach v_key in array array['diapers', 'wipes', 'uniform', 'bag'] loop
        continue when (v_key = 'wipes' and v_i % 3 <> 0) or (v_key = 'uniform' and v_i % 2 <> 0) or (v_key = 'bag' and v_i % 4 <> 1);
        v_k := v_k + 1;
        v_child := case when v_key in ('diapers', 'wipes') then v_babies[1 + floor(seed.rnd('store-child:' || v_b || v_key || v_i) * cardinality(v_babies))::integer]
                        else v_kids[1 + floor(seed.rnd('store-child:' || v_b || v_key || v_i) * cardinality(v_kids))::integer] end;
        v_mark := clock_timestamp();
        begin
          perform seed.act_as(v_admin);
          v_charge := public.charge_child_stock_item(v_child, (v_items ->> v_key)::uuid,
            case v_key when 'diapers' then seed.pick(array['5', '10'], 'diapers:' || v_b || v_i)::numeric else 1 end,
            case v_key when 'diapers' then 'خلصت حفاضات الطفل' when 'uniform' then 'مقاس 4 سنوات' end,
            seed.uid('store-charge:' || v_b || ':' || v_key || ':' || v_d));
          perform seed.kt_stamp(v_n, v_mark, seed.kt_at(v_d, time '12:30' + v_k * interval '10 minutes'));
          -- A couple of this month's are cancelled: the parents brought their own.
          if v_key = 'diapers' and v_d >= v_month and v_i % 6 = 0 then
            v_mark := clock_timestamp();
            perform public.cancel_kitchen_charge(v_charge, 'أحضر الوالدان الحفاضات');
            perform seed.kt_stamp(v_n, v_mark, seed.kt_at(v_d, time '14:30'));
          end if;
        exception when others then v_skipped := v_skipped + 1;
        end;
      end loop;

      -- 15:30 Thrown away or broken.
      perform seed.act_as(v_admin);
      v_k := 0;
      foreach v_key in array array['fruit', 'bread', 'sandwich', 'yogurt', 'puzzles', 'chairs'] loop
        continue when (v_key = 'fruit' and v_i % 4 <> 0) or (v_key = 'bread' and v_i % 3 <> 0) or (v_key = 'sandwich' and v_i % 5 <> 2)
                   or (v_key = 'yogurt' and v_i <> 9) or (v_key = 'puzzles' and v_i <> 7) or (v_key = 'chairs' and v_i <> 12);
        v_k := v_k + 1;
        v_item := (v_items ->> v_key)::uuid;
        select quantity into v_now_qty from public.inventory where id = v_item;
        v_qty := least(case v_key when 'bread' then 5 when 'yogurt' then 4 when 'fruit' then 1 else 1 end, v_now_qty);
        continue when v_qty <= 0;
        v_mark := clock_timestamp();
        begin
          perform public.record_kitchen_movement(v_item, 'spoiled', v_qty, null,
            case v_key when 'puzzles' then 'قطع ناقصة' when 'chairs' then 'رجل الكرسي مكسورة' when 'yogurt' then 'الثلاجة فصلت ليلًا' else 'انتهت صلاحيته' end);
          perform seed.kt_stamp(v_n, v_mark, seed.kt_at(v_d, time '15:30' + v_k * interval '5 minutes'));
        exception when others then v_skipped := v_skipped + 1;
        end;
      end loop;

      -- 16:00 The month's first school day: the store is counted, and what is really there recorded.
      if v_d >= v_month and (v_i = 1 or v_days[v_i - 1] < v_month) then
        v_k := 0;
        foreach v_key in array array['crayons', 'tissues', 'wipes', 'paper', 'hand_soap', 'tea'] loop
          v_k := v_k + 1;
          v_item := (v_items ->> v_key)::uuid;
          select quantity into v_now_qty from public.inventory where id = v_item;
          v_mark := clock_timestamp();
          begin
            perform public.record_kitchen_movement(v_item, 'counted',
              greatest(v_now_qty - case v_key when 'tissues' then 2 when 'tea' then 6 when 'paper' then 0 else 1 end, 0), null, 'جرد أول الشهر');
            perform seed.kt_stamp(v_n, v_mark, seed.kt_at(v_d, time '16:00' + v_k * interval '3 minutes'));
          exception when others then v_skipped := v_skipped + 1;
          end;
        end loop;
      end if;
    end loop;

    -- A staff charge recorded by mistake this month, cancelled by the admin.
    perform seed.act_as(v_admin);
    select id into v_charge from public.kitchen_charges
     where nursery_id = v_n and consumer = 'staff' and cancelled_at is null and charged_on >= v_month order by created_at limit 1;
    if v_charge is not null then
      v_at := (select created_at + interval '20 minutes' from public.kitchen_charges where id = v_charge);
      v_mark := clock_timestamp();
      perform public.cancel_kitchen_charge(v_charge, 'سُجِّلت بالخطأ مرتين');
      perform seed.kt_stamp(v_n, v_mark, v_at);
    end if;

    -- ---------------------------------------------------------------------------------------
    -- The families' extras invoices, month by month as the billing function writes them: last
    -- month's issued on the 1st and mostly paid, this month's open.
    perform seed.act_as(null);
    delete from public.invoices where nursery_id = v_n and invoice_type = 'food_extras';
    for v_c in
      select * from public.kitchen_charges
       where nursery_id = v_n and consumer = 'child' and cancelled_at is null
       order by charged_on, created_at
    loop
      update public.kitchen_charges set invoice_id = public.kitchen_bill_child_charge(v_c) where id = v_c.id;
    end loop;
    -- Each line carries its own day.
    update public.invoices iv
       set line_items_json = jsonb_set(iv.line_items_json, '{items}', (
             select jsonb_agg(it || jsonb_build_object('date', kc.charged_on) order by kc.charged_on, kc.created_at)
               from jsonb_array_elements(iv.line_items_json -> 'items') it
               join public.kitchen_charges kc on kc.id = (it ->> 'charge_id')::uuid))
     where iv.nursery_id = v_n and iv.invoice_type = 'food_extras';
    for v_inv in
      select iv.id, iv.parent_id, iv.amount, to_date(iv.line_items_json ->> 'billing_month' || '-01', 'YYYY-MM-DD') as month,
             (select min(kc.created_at) from public.kitchen_charges kc where kc.invoice_id = iv.id) as first_at
        from public.invoices iv where iv.nursery_id = v_n and iv.invoice_type = 'food_extras'
    loop
      if v_inv.month < v_month then
        update public.invoices
           set created_at = (v_month + time '06:00') at time zone 'Africa/Cairo', updated_at = (v_month + time '06:00') at time zone 'Africa/Cairo',
               due_date = v_month + v_due_days,
               status = case when v_month + v_due_days < v_today then 'overdue' else 'pending' end
         where id = v_inv.id;
        if seed.chance(80, 'extras-paid:' || v_inv.id) then
          v_at := ((v_month + seed.int_between(0, least(v_due_days, greatest(v_today - v_month - 1, 0)), 'extras-paid-day:' || v_inv.id) + time '10:00')
                   at time zone 'Africa/Cairo') + make_interval(mins => seed.int_between(0, 420, 'extras-paid-time:' || v_inv.id));
          insert into public.payment_attempts (invoice_id, parent_id, nursery_id, amount, payment_method, status, created_at, confirmed_at, confirmed_by, reference)
          values (v_inv.id, v_inv.parent_id, v_n, v_inv.amount,
                  seed.pick(array['instapay', 'cash', 'vodafone_cash'], 'extras-method:' || v_inv.id), 'confirmed',
                  v_at - interval '15 minutes', v_at, v_finance, 'EXT-' || lpad(seed.int_between(0, 999999, 'extras-ref:' || v_inv.id)::text, 6, '0'));
          update public.invoices set status = 'paid', paid_at = v_at,
                 payment_method = (select payment_method from public.payment_attempts where invoice_id = v_inv.id limit 1)
           where id = v_inv.id;
        end if;
      else
        update public.invoices
           set created_at = coalesce(v_inv.first_at, now()), updated_at = now(),
               due_date = (v_month + interval '1 month')::date + v_due_days
         where id = v_inv.id;
      end if;
    end loop;

    -- The cream's only delivery ran past its date two days ago and is still on the shelf.
    update public.inventory set expires_on = v_today - 2 where id = (v_items ->> 'cream')::uuid;

    -- ---------------------------------------------------------------------------------------
    -- Meals: the plans (by the admin), the children on them, and this month's unpaid tuition
    -- invoices carrying the plan as the billing job adds it.
    perform seed.act_as(v_admin);
    perform public.save_nursery_meal_plan(v_n, null, 'فطار فقط', 'Breakfast only', array['breakfast'], 350, true);
    perform public.save_nursery_meal_plan(v_n, null, 'غداء فقط', 'Lunch only', array['lunch'], 600, true);
    perform public.save_nursery_meal_plan(v_n, null, 'اليوم الكامل', 'Full day', array['breakfast', 'lunch', 'snacks'], 950, true);
    perform public.save_nursery_meal_plan(v_n, null, 'وجبات رمضان', 'Ramadan meals', array['lunch'], 500, false);
    perform seed.act_as(null);
    select id into v_plan_breakfast from public.nursery_meal_plans where nursery_id = v_n and name_en = 'Breakfast only';
    select id into v_plan_lunch from public.nursery_meal_plans where nursery_id = v_n and name_en = 'Lunch only';
    select id into v_plan_full from public.nursery_meal_plans where nursery_id = v_n and name_en = 'Full day';
    update public.nursery_meal_plans set created_at = seed.kt_at(v_start, time '07:40'), updated_at = seed.kt_at(v_start, time '07:40') where nursery_id = v_n;

    insert into public.child_meal_plans (nursery_id, child_id, meal_plan_id, plan_name_ar, plan_name_en, meals, monthly_price, charged, started_on, created_by, created_at)
    select v_n, c.id, p.id, p.name_ar, p.name_en, p.meals, p.monthly_price,
           not seed.chance(6, 'meal-free:' || c.id),
           greatest(c.enrollment_date, date '2026-09-01'), v_admin, (greatest(c.enrollment_date, date '2026-09-01') + time '09:00') at time zone 'Africa/Cairo'
      from public.children c
      cross join lateral (select seed.pick_weighted(array['full', 'lunch', 'breakfast', 'none'], array[45, 20, 10, 25], 'meal-plan:' || c.id) as pick) x
      join public.nursery_meal_plans p on p.id = case x.pick when 'full' then v_plan_full when 'lunch' then v_plan_lunch when 'breakfast' then v_plan_breakfast end
     where c.nursery_id = v_n and c.status = 'active';

    update public.invoices iv
       set line_items_json = jsonb_set(iv.line_items_json, '{items}', coalesce(iv.line_items_json -> 'items', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
             'kind', 'meal_plan', 'child_meal_plan_id', m.id, 'name_ar', m.plan_name_ar, 'name_en', m.plan_name_en, 'description', m.plan_name_en,
             'meals', to_jsonb(m.meals), 'quantity', 1, 'unitPrice', m.monthly_price, 'unit_price', m.monthly_price, 'total', m.monthly_price))),
           amount = iv.amount + m.monthly_price
      from public.child_meal_plans m
     where iv.nursery_id = v_n and iv.invoice_type = 'monthly' and iv.status in ('pending', 'overdue')
       and iv.due_date >= v_month and coalesce((iv.line_items_json ->> 'billing_months')::integer, 1) = 1
       and m.child_id = (iv.line_items_json ->> 'child_id')::uuid and m.ended_on is null and m.charged and m.monthly_price > 0
       and not exists (select 1 from public.payment_attempts pa where pa.invoice_id = iv.id)
       and not exists (select 1 from jsonb_array_elements(iv.line_items_json -> 'items') it where it ->> 'kind' = 'meal_plan');

    -- The weekly menu: the last two weeks and this one published, next week's a draft.
    for v_k in -2 .. 1 loop
      v_ws := public.menu_week_start(v_today) + v_k * 7;
      v_week := seed.uid('menu-week:' || v_n || ':' || v_ws);
      insert into public.menu_weeks (id, nursery_id, week_start, status, notes, published_at, published_by, created_by, created_at, updated_at)
      values (v_week, v_n, v_ws, case when v_k < 1 then 'published' else 'draft' end,
              case when v_k = 0 then 'الفاكهة حسب الموسم. أي تغيير يُبلَّغ في نفس اليوم.' end,
              case when v_k < 1 then ((v_ws - 1) + time '14:00') at time zone 'Africa/Cairo' end,
              case when v_k < 1 then v_admin end, v_admin,
              ((v_ws - 2) + time '13:00') at time zone 'Africa/Cairo', ((v_ws - 1) + time '14:00') at time zone 'Africa/Cairo');
      insert into public.menu_dishes (week_id, nursery_id, day, meal, name, allergens, sort_order)
      select v_week, v_n, d.day, x.meal, ds.name, ds.allergens, x.sort_order
        from (select (v_ws + g)::date as day, g from generate_series(0, 6) g) d
        cross join (values ('breakfast', 'breakfast', 0), ('lunch', 'lunch', 0), ('lunch', 'lunch_side', 1), ('snacks', 'snacks', 0)) as x(meal, kind, sort_order)
        join seed.dishes ds on ds.meal = x.kind
         and ds.n = 1 + ((d.g + v_k * 3 + v_b + x.sort_order + 70) % (select count(*) from seed.dishes s2 where s2.meal = x.kind))::integer
       where public.attendance_is_school_day(v_n, d.day);
    end loop;

    perform seed.act_as(null);
    raise notice 'branch %: % items, % movements, % charges, % extras invoices, % meal plans (% calls skipped)', v_b,
      (select count(*) from public.inventory where nursery_id = v_n),
      (select count(*) from public.inventory_movements where nursery_id = v_n),
      (select count(*) from public.kitchen_charges where nursery_id = v_n),
      (select count(*) from public.invoices where nursery_id = v_n and invoice_type = 'food_extras'),
      (select count(*) from public.child_meal_plans where nursery_id = v_n),
      v_skipped;
  end loop;
end
$kitchen$;

-- -----------------------------------------------------------------------------------------------
-- Checks: a run that leaves anything inconsistent fails (and changes nothing).
do $check$
declare
  v_branches uuid[] := array(select seed.branch_id(b) from unnest({{branches}}) b);
  v_bad text;
begin
  -- Every item's stock is what its movements add up to, never below zero.
  select string_agg(format('%s: %s vs %s', i.item_name, i.quantity, m.total), '; ') into v_bad
    from public.inventory i
    left join lateral (select coalesce(sum(change), 0) as total from public.inventory_movements mv where mv.item_id = i.id) m on true
   where i.nursery_id = any (v_branches) and (i.quantity <> m.total or i.quantity < 0);
  if v_bad is not null then raise exception 'stock does not match its movements: %', v_bad; end if;

  -- Every taking left the stock (a charged movement of its quantity), at its price less its discount.
  select string_agg(kc.id::text, ', ') into v_bad
    from public.kitchen_charges kc
    left join public.inventory_movements mv on mv.id = kc.movement_id
   where kc.nursery_id = any (v_branches)
     and (mv.id is null or mv.kind <> 'charged' or mv.change <> -kc.quantity
          or kc.gross <> round(kc.unit_price * kc.quantity, 2) or kc.net <> kc.gross - kc.discount_amount);
  if v_bad is not null then raise exception 'charges without their stock movement or with a wrong amount: %', v_bad; end if;

  -- A cancelled charge came back to stock.
  select string_agg(kc.id::text, ', ') into v_bad
    from public.kitchen_charges kc
   where kc.nursery_id = any (v_branches) and kc.cancelled_at is not null
     and not exists (select 1 from public.inventory_movements mv where mv.item_id = kc.item_id and mv.kind = 'returned' and mv.change = kc.quantity);
  if v_bad is not null then raise exception 'cancelled charges not returned to stock: %', v_bad; end if;

  -- Every child's charge is one line on one invoice of its family; no cancelled one is.
  select string_agg(kc.id::text, ', ') into v_bad
    from public.kitchen_charges kc
   where kc.nursery_id = any (v_branches) and kc.consumer = 'child'
     and (case when kc.cancelled_at is null then 1 else 0 end) <> (
       select count(*) from public.invoices iv, jsonb_array_elements(iv.line_items_json -> 'items') it
        where iv.invoice_type = 'food_extras' and iv.nursery_id = kc.nursery_id and it ->> 'charge_id' = kc.id::text
          and (kc.cancelled_at is not null or iv.id = kc.invoice_id));
  if v_bad is not null then raise exception 'child charges missing from (or left on) the invoices: %', v_bad; end if;

  -- An invoice's amount is its lines.
  select string_agg(format('%s: %s vs %s', iv.id, iv.amount, l.total), '; ') into v_bad
    from public.invoices iv
    cross join lateral (select coalesce(sum((it ->> 'total')::numeric), 0) as total from jsonb_array_elements(iv.line_items_json -> 'items') it) l
   where iv.nursery_id = any (v_branches) and iv.invoice_type = 'food_extras' and iv.amount <> l.total;
  if v_bad is not null then raise exception 'extras invoices whose amount is not their lines: %', v_bad; end if;

  -- A served extra has its charge; a waiting or declined one has none.
  select string_agg(r.id::text, ', ') into v_bad
    from public.child_extra_requests r
   where r.nursery_id = any (v_branches)
     and ((r.status = 'served' and r.charge_id is null) or (r.status in ('waiting_parent', 'approved', 'declined') and r.charge_id is not null));
  if v_bad is not null then raise exception 'extras whose charge does not match their state: %', v_bad; end if;

  -- Each branch has its stock, sales, invoices, plans and menus.
  select string_agg(n::text, ', ') into v_bad
    from unnest(v_branches) n
   where (select count(*) from public.inventory where nursery_id = n) < 40
      or (select count(*) from public.kitchen_charges where nursery_id = n and consumer = 'staff') = 0
      or (select count(*) from public.kitchen_charges where nursery_id = n and consumer = 'child') = 0
      or (select count(*) from public.invoices where nursery_id = n and invoice_type = 'food_extras') = 0
      or (select count(*) from public.child_meal_plans where nursery_id = n) = 0
      or (select count(*) from public.menu_dishes where nursery_id = n) = 0;
  if v_bad is not null then raise exception 'branches left without kitchen data: %', v_bad; end if;
end
$check$;

-- Demo seed · 16 · Daily reports ({{branches}})
--
-- A sent report for every child who came on each of the last 10 school days, written and sent by
-- the class's lead teacher near closing time: meals in quarters of the plate, the nap (younger
-- children sleep longer), mood, toilet visits, two to four activities, and now and then a note to the
-- family. Each keeps the child's class and code and the sender, as send_daily_reports does. The babies'
-- reports also have their bottles. Today's reports are left for the teachers (the morning job
-- prepares them); a past day the job prepared but nobody touched gets its sent report.

-- Each branch's last 10 school days, worked out once.
create temp table report_days on commit drop as
select seed.branch_id(b.n) as nursery_id, d.day
from unnest({{branches}}) b(n)
cross join lateral seed.school_days(seed.branch_id(b.n), 10) d;

insert into public.daily_reports (
  child_id, report_date, nursery_id, status, teacher_id, submitted_by, published_at, last_saved_at, last_saved_by,
  meals_json, nap_json, mood_json, toilet_json, activities_json, feeding_json, special_notes,
  child_code, class_id, class_name_ar, class_name_en,
  sender_name_ar, sender_name_en, sender_role, sender_role_title_ar, sender_role_title_en, sender_department, sender_class_role
)
select
  ar.child_id,
  ar.attendance_date,
  ch.nursery_id,
  'published',
  lead.id,
  lead.id,
  sent_at,
  sent_at - interval '6 minutes',
  lead.id,
  jsonb_build_object(
    'breakfast', jsonb_build_object('amount', seed.pick_weighted(amounts, weights, 'breakfast:' || p.rkey), 'notes', null),
    'lunch', jsonb_build_object('amount', seed.pick_weighted(amounts, weights, 'lunch:' || p.rkey),
                                'notes', case when seed.chance(12, 'lunch-note:' || p.rkey) then seed.pick(array['أكل الخضار كلها', 'طلب طبق تاني', 'ما حبش الفراخ النهارده', 'أكل الرز والعدس'], 'lunch-text:' || p.rkey) end),
    'snacks', jsonb_build_object('amount', seed.pick_weighted(amounts, weights, 'snack:' || p.rkey), 'notes', null)
  ),
  case when napped then jsonb_build_object(
         'napped', true,
         'duration_minutes', 15 * seed.int_between(case when k.class_slot <= 5 then 5 else 2 end, case when k.class_slot <= 5 then 10 else 6 end, 'nap:' || p.rkey),
         'quality', seed.pick_weighted(array['good', 'ok', 'restless'], array[62, 28, 10], 'nap-quality:' || p.rkey),
         'notes', null)
       else jsonb_build_object('napped', false, 'duration_minutes', null, 'quality', null, 'notes', null) end,
  jsonb_build_object('mood', seed.pick_weighted(array['happy', 'content', 'fussy', 'cranky'], array[52, 30, 12, 6], 'mood:' || p.rkey),
                     'notes', case when seed.chance(10, 'mood-note:' || p.rkey) then seed.pick(array['كان مبسوط جدًا في وقت اللعب', 'افتقد ماما شوية الصبح', 'لعب كتير مع أصحابه'], 'mood-text:' || p.rkey) end),
  jsonb_build_object('change_count', seed.int_between(case when k.class_slot <= 5 then 3 else 1 end, case when k.class_slot <= 5 then 6 else 4 end, 'toilet:' || p.rkey), 'notes', null),
  jsonb_build_object(
    'tags', (select jsonb_agg(tag) from (
               select tag from unnest(array['art', 'outdoor', 'reading', 'music', 'circle_time', 'story_time', 'sensory_play', 'free_play']) tag
               order by seed.rnd('tag:' || p.rkey || tag)
               limit seed.int_between(2, 4, 'tag-count:' || p.rkey)) picked),
    'free_text', null, 'notes', null),
  case when k.class_slot = 1 then jsonb_build_object(
         'bottle_sessions', jsonb_build_array(
           jsonb_build_object('time', '09:30', 'amount_ml', 30 * seed.int_between(4, 6, 'bottle1:' || p.rkey)),
           jsonb_build_object('time', '12:30', 'amount_ml', 30 * seed.int_between(4, 6, 'bottle2:' || p.rkey))),
         'bottle_feeds_count', 2, 'nursing_count', 0, 'nursing_duration_minutes', 0, 'solid_foods', true, 'notes', null)
       else '{}'::jsonb end,
  case when seed.chance(18, 'family-note:' || p.rkey) then seed.pick(array[
    'من فضلكم ابعتوا طقم غيار زيادة بكره.',
    'الحفاضات قربت تخلص، محتاجين علبة جديدة.',
    'شارك النهارده في نشاط الرسم وعمل لوحة جميلة.',
    'بكره عندنا يوم الرياضة، ياريت يلبس جزمة رياضية.',
    'نسي الزمزمية في الفصل، هتكون معاه بكره.',
    'كان عنده كحة خفيفة، ياريت تطمنونا عليه.'
  ], 'family-text:' || p.rkey) end,
  ch.child_id_number,
  x.class_id,
  cl.name_ar,
  cl.name_en,
  lead.name_ar,
  lead.name_en,
  lead.role,
  role_title.name_ar,
  role_title.name_en,
  lead.department,
  'lead'
from public.attendance_records ar
join seed.kids k on k.child_id = ar.child_id
join public.children ch on ch.id = ar.child_id
join report_days rd on rd.nursery_id = ch.nursery_id and rd.day = ar.attendance_date
join seed.classes x on x.branch = k.branch and x.slot = k.class_slot
join public.classes cl on cl.id = x.class_id
join public.nurseries n on n.id = ch.nursery_id
join lateral (
  select u.* from public.class_staff cs join public.users u on u.id = cs.user_id
  where cs.class_id = x.class_id and cs.role = 'lead' limit 1
) lead on true
left join public.roles role_title on role_title.id = lead.role_id
cross join lateral (
  select ar.child_id || ':' || ar.attendance_date as rkey,
         array['all', 'three_quarters', 'half', 'quarter', 'none'] as amounts,
         array[38, 24, 20, 11, 7] as weights,
         seed.chance(case when k.class_slot <= 7 then 93 else 60 end, 'napped:' || ar.child_id || ':' || ar.attendance_date) as napped,
         ((ar.attendance_date + n.closes_at - make_interval(mins => seed.int_between(10, 55, 'sent:' || ar.child_id || ':' || ar.attendance_date)))
           at time zone 'Africa/Cairo') as sent_at
) p
where k.branch = any({{branches}})
-- A report the morning job prepared and nobody touched is the one sent; one a teacher worked on stays.
on conflict (child_id, report_date) do update
   set nursery_id = excluded.nursery_id,
       status = excluded.status,
       teacher_id = excluded.teacher_id,
       submitted_by = excluded.submitted_by,
       published_at = excluded.published_at,
       last_saved_at = excluded.last_saved_at,
       last_saved_by = excluded.last_saved_by,
       meals_json = excluded.meals_json,
       nap_json = excluded.nap_json,
       mood_json = excluded.mood_json,
       toilet_json = excluded.toilet_json,
       activities_json = excluded.activities_json,
       feeding_json = excluded.feeding_json,
       special_notes = excluded.special_notes,
       child_code = excluded.child_code,
       class_id = excluded.class_id,
       class_name_ar = excluded.class_name_ar,
       class_name_en = excluded.class_name_en,
       sender_name_ar = excluded.sender_name_ar,
       sender_name_en = excluded.sender_name_en,
       sender_role = excluded.sender_role,
       sender_role_title_ar = excluded.sender_role_title_ar,
       sender_role_title_en = excluded.sender_role_title_en,
       sender_department = excluded.sender_department,
       sender_class_role = excluded.sender_class_role
 where public.daily_report_untouched(public.daily_reports.status, public.daily_reports.prepared_at, public.daily_reports.last_saved_at);

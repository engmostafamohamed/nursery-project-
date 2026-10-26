-- Demo seed · 19 · Courses ({{branches}})
--
-- Four after-school courses at each new branch (the main branch keeps its own), taught by the
-- branch's teachers, for the children of three and up: swimming, art, music and English, each with
-- a dozen or two of them enrolled.

insert into public.courses (
  id, nursery_id, title_ar, title_en, description_ar, description_en, category, price_per_month, max_students,
  schedule_days, schedule_time_start, schedule_time_end, starts_on, ends_on, status, teacher_user_id
)
select
  seed.uid('course:' || b.n || ':' || c.key),
  seed.branch_id(b.n),
  c.title_ar, c.title_en, c.desc_ar, c.desc_en, c.category, c.price, 20, c.days, c.starts, c.ends,
  date '2026-09-06', date '2027-06-30', 'active',
  (select s.user_id from seed.staff s where s.branch = b.n and s.key = c.teacher)
from seed.branches b
cross join (values
  ('swimming', 'حصة سباحة', 'Swimming Class', 'تعلم السباحة بأمان مع مدرب معتمد.', 'Learn to swim safely with a certified coach.', 'sport', 900, array['sun', 'tue'], '15:00', '16:00', 'lead8'),
  ('art', 'الفنون والأشغال', 'Art & Craft', 'رسم وتلوين وأشغال يدوية.', 'Drawing, painting and handicrafts.', 'art', 500, array['mon'], '14:30', '15:30', 'lead6'),
  ('music', 'الموسيقى والحركة', 'Music & Movement', 'أغاني وإيقاع وحركة للأطفال.', 'Songs, rhythm and movement for children.', 'music', 450, array['wed'], '14:30', '15:15', 'lead7'),
  ('english', 'اللغويون الصغار (إنجليزي)', 'Little Linguists (English)', 'إنجليزي بالقصص والأغاني.', 'English through stories and songs.', 'language', 600, array['sun', 'thu'], '14:30', '15:15', 'lead9')
) c(key, title_ar, title_en, desc_ar, desc_en, category, price, days, starts, ends, teacher)
where b.n = any({{branches}}) and b.n > 1
on conflict (id) do nothing;

-- Enrolments: children of three and up, a different mix per course.
insert into public.course_enrollments (course_id, child_id, enrolled_by_user_id, status, enrolled_at)
select co.id, k.child_id, coalesce(f.mother_id, f.father_id), 'active',
       (date '2026-09-06' + seed.int_between(0, 30, 'enrolled:' || co.id || k.child_id) + time '12:00') at time zone 'Africa/Cairo'
from public.courses co
join seed.kids k on seed.branch_id(k.branch) = co.nursery_id
join seed.families f on f.branch = k.branch and f.family_slot = k.family_slot
where k.branch = any({{branches}})
  and co.status = 'active'
  and k.class_slot >= 6
  and seed.chance(14, 'course:' || co.id || k.child_id)
on conflict (course_id, child_id) do nothing;

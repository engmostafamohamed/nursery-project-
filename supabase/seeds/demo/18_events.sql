-- Demo seed · 18 · Events ({{branches}})
--
-- Each branch's calendar: three events of the past weeks and three coming up (a trip, celebrations,
-- the dentist's visit, photo day). Publishing an event asks every family concerned for permission
-- (the events trigger does it); for past events most families have answered, for coming ones some
-- still have to.

insert into public.events (
  id, nursery_id, title_ar, title_en, description_ar, description_en, starts_at, ends_at, location, category,
  is_paid, price, target_scope, target_class_id, status, permission_deadline
)
select
  seed.uid('event:' || b.n || ':' || e.key),
  seed.branch_id(b.n),
  e.title_ar, e.title_en, e.desc_ar, e.desc_en,
  ((seed.config('today')::date + e.offset_days + e.at) at time zone 'Africa/Cairo'),
  ((seed.config('today')::date + e.offset_days + e.at + e.length) at time zone 'Africa/Cairo'),
  e.location, e.category, e.price > 0, nullif(e.price, 0),
  case when e.class_slot is null then 'all' else 'class' end,
  (select x.class_id from seed.classes x where x.branch = b.n and x.slot = e.class_slot),
  'active',
  ((seed.config('today')::date + e.offset_days - 3 + time '18:00') at time zone 'Africa/Cairo')
from seed.branches b
cross join (values
  ('picnic', 'نزهة بداية العام', 'Back-to-school picnic', 'يوم في الحديقة للتعارف بين الأطفال والأهالي.', 'A day in the park for the children and families to meet.',
   -32, time '10:00', interval '4 hours', 'حديقة الأزهر', 'activity', 0, null::integer),
  ('dentist', 'زيارة طبيب الأسنان', 'Dental check-up', 'كشف أسنان مجاني لكل الأطفال مع طبيب أسنان أطفال.', 'A free dental check-up for every child with a paediatric dentist.',
   -18, time '10:30', interval '3 hours', 'الحضانة', 'doctor_visit', 0, null),
  ('photo', 'يوم التصوير', 'Photo day', 'صور فردية وجماعية لكل فصل.', 'Individual and class photos.',
   -6, time '09:30', interval '5 hours', 'الحضانة', 'service', 150, null),
  ('zoo', 'رحلة حديقة الحيوان', 'Trip to Giza Zoo', 'رحلة لأطفال النجوم لمشاهدة الحيوانات، مع الغداء والمواصلات.', 'A trip for the Stars class to see the animals, with lunch and transport.',
   10, time '09:00', interval '5 hours', 'حديقة حيوان الجيزة', 'trip', 350, 8),
  ('childrens-day', 'احتفال يوم الطفل', 'Children''s Day celebration', 'عرض مسرحي وألعاب وهدايا للأطفال.', 'A puppet show, games and presents for the children.',
   24, time '11:00', interval '3 hours', 'الحضانة', 'activity', 0, null),
  ('winter', 'كرنفال الشتاء', 'Winter carnival', 'ألعاب ومسابقات ورسم على الوجه مع الأهالي.', 'Games, contests and face painting with the families.',
   52, time '10:00', interval '4 hours', 'الحضانة', 'activity', 200, null)
) e(key, title_ar, title_en, desc_ar, desc_en, offset_days, at, length, location, category, price, class_slot)
where b.n = any({{branches}})
on conflict (id) do nothing;

-- The families' answers: most have answered for past events, half still have to for coming ones.
create temp table answers on commit drop as
select p.id, e.starts_at,
       case when e.starts_at < now()
            then seed.pick_weighted(array['granted', 'denied', 'pending'], array[86, 6, 8], 'permission:' || p.id)
            else seed.pick_weighted(array['granted', 'denied', 'pending'], array[45, 5, 50], 'permission:' || p.id) end as status
from public.permissions p
join public.events e on e.id = p.event_id
where e.id in (select seed.uid('event:' || n || ':' || k) from unnest({{branches}}) n, unnest(array['picnic', 'dentist', 'photo', 'zoo', 'childrens-day', 'winter']) k)
  and p.status = 'pending';

update public.permissions p
   set status = a.status,
       responded_at = case when a.status <> 'pending' then a.starts_at - make_interval(days => seed.int_between(2, 9, 'answered:' || p.id)) end,
       parent_note = case when a.status = 'denied' then 'مش هيقدر يحضر اليوم ده' end
  from answers a
 where p.id = a.id and a.status <> 'pending';

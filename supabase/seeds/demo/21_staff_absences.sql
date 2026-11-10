-- Demo seed · 21 · Staff absences ({{branches}})
--
-- A handful of absences at every branch, around today: a lead teacher off sick today and tomorrow
-- (their class has no backup, so it is left with nobody on duty: the absences page says so and links
-- to its team), a nanny away today for a family matter (recorded by the admin), a lead teacher's
-- coming holiday and an assistant's training day, and the past month's: a sick lead teacher, an
-- assistant and a nanny away, and one absence cancelled. Each is reported by the person or recorded
-- by the branch admin. Inserted as they are (nobody is notified about them), replaced on every run,
-- and the staff clocking on those days is removed: nobody clocks in on a day they were away.

create temp table seed_absences on commit drop as
select
  seed.uid('absence:' || b.n || ':' || v.k) as id,
  n.id as nursery_id,
  cs.user_id,
  (seed.config('today')::date + v.from_day) as starts_on,
  (seed.config('today')::date + v.to_day) as ends_on,
  v.reason,
  v.note,
  case when v.by_admin then adm.id else cs.user_id end as reported_by,
  (now() + make_interval(days => least(v.from_day, 0) - 3)) as created_at,
  case when v.cancelled then now() + make_interval(days => v.from_day - 1) end as cancelled_at,
  case when v.cancelled then cs.user_id end as cancelled_by
from unnest({{branches}}) b(n)
join public.nurseries n on n.id = seed.branch_id(b.n)
left join lateral (select a.id from public.users a where a.nursery_id = n.id and a.role = 'branch_admin' order by a.created_at limit 1) adm on true
cross join (values
  -- key, class slot, place, from, to (days from today), reason, note, recorded by the admin, cancelled
  ('lead-sick',       3, 'lead',      0,   1,  'sick',     'دور برد وحرارة، راجعة بعد بكرة إن شاء الله.', false, false),
  ('nanny-today',     6, 'nanny',     0,   0,  'personal', 'ظرف عائلي، اتصلت الصبح.',                      true,  false),
  ('lead-holiday',    8, 'lead',      7,   9,  'vacation', 'إجازة سنوية متفق عليها.',                      false, false),
  ('asst-training',   2, 'assistant', 3,   3,  'training', 'دورة إسعافات أولية للأطفال.',                  true,  false),
  ('lead-past',       5, 'lead',     -12, -11, 'sick',     'نزلة معوية.',                                  false, false),
  ('asst-past',       9, 'assistant', -20, -20, 'personal', null,                                           false, false),
  ('nanny-past',      1, 'nanny',    -35, -33, 'vacation', 'إجازة قصيرة.',                                 true,  false),
  ('lead-cancelled',  7, 'lead',     -5,  -5,  'personal', 'موعد في المصلحة، اتلغى.',                      false, true)
) v(k, slot, place, from_day, to_day, reason, note, by_admin, cancelled)
-- The class of that slot (by its name in the class plan, as 06 made it), and who holds that place.
join seed.class_plan p on p.slot = v.slot
join public.classes k on k.nursery_id = n.id and k.name_en = p.name_en and k.deleted_at is null
join lateral (
  select c.user_id from public.class_staff c where c.class_id = k.id and c.role::text = v.place order by c.created_at limit 1
) cs on true;

-- Replaced on every run: an earlier run's absences of these branches go first.
delete from public.staff_absences a
using unnest({{branches}}) b(n)
where a.nursery_id = seed.branch_id(b.n)
  and a.id in (select seed.uid('absence:' || b.n || ':' || k) from unnest(array[
    'lead-sick', 'nanny-today', 'lead-holiday', 'asst-training', 'lead-past', 'asst-past', 'nanny-past', 'lead-cancelled'
  ]) k);

insert into public.staff_absences (id, nursery_id, user_id, starts_on, ends_on, reason, note, reported_by, created_at, cancelled_at, cancelled_by)
select id, nursery_id, user_id, starts_on, ends_on, reason, note, reported_by, created_at, cancelled_at, cancelled_by
from seed_absences
on conflict (id) do nothing;

-- Nobody clocks in on a day they were away.
delete from public.staff_attendance sa
using seed_absences a
where a.cancelled_at is null
  and sa.user_id = a.user_id
  and sa.work_date between a.starts_on and a.ends_on;

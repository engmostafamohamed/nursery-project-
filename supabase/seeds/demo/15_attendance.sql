-- Demo seed · 15 · Attendance ({{branches}})
--
-- The last 20 school days at each branch (the branch's own working days and holidays): most
-- children come, around their usual time, and go home before closing (half-day children around
-- noon); a few are picked up late. About one day in fourteen a child stays home, and the family
-- reports most of those absences (ill, travelling, a family matter). Today counts too once the
-- branch has opened. The QR-hours guard and the absence notifications are paused while the history
-- is written, so nobody is notified about the past.

alter table public.attendance_records disable trigger attendance_qr_working_hours_guard;
alter table public.attendance_absence_reports disable trigger trg_absence_reports_before_insert;
alter table public.attendance_absence_reports disable trigger trg_absence_reports_after_insert;

-- Each branch's days, worked out once: its last 20 school days, and today once it has opened.
create temp table branch_days on commit drop as
select b.n as branch, d.day
from unnest({{branches}}) b(n)
cross join lateral seed.school_days(seed.branch_id(b.n), 20) d
union all
select b.n, seed.config('today')::date
from unnest({{branches}}) b(n)
join public.nurseries n on n.id = seed.branch_id(b.n)
where public.attendance_is_school_day(n.id, seed.config('today')::date)
  and (now() at time zone 'Africa/Cairo')::time > n.opens_at + interval '30 minutes';

create temp table days_attended on commit drop as
select k.branch, k.child_id, k.class_slot, ch.enrollment_type, d.day, n.opens_at, n.closes_at,
       not seed.chance(case when k.class_slot <= 3 then 9 else 6 end, 'absent:' || k.child_id || ':' || d.day) as came
from seed.kids k
join public.children ch on ch.id = k.child_id
join public.nurseries n on n.id = seed.branch_id(k.branch)
join branch_days d on d.branch = k.branch
where k.branch = any({{branches}}) and d.day >= ch.enrollment_date;

insert into public.attendance_records (
  child_id, attendance_date, check_in, check_out, check_in_method, check_out_method, check_in_by, check_out_by,
  pickup_person_name, pickup_relationship, late_minutes, late_charge_status
)
select
  a.child_id,
  a.day,
  t.check_in,
  -- Today, children go home only once their time has come.
  case when t.check_out <= now() then t.check_out end,
  case when seed.chance(75, 'qr-in:' || a.child_id || a.day) then 'qr_parent' else 'manual' end,
  case when t.check_out <= now() then case when seed.chance(70, 'qr-out:' || a.child_id || a.day) then 'qr_parent' else 'manual' end end,
  lead.user_id,
  case when t.check_out <= now() then lead.user_id end,
  case when t.check_out <= now() then case when seed.chance(70, 'by-mother:' || a.child_id || a.day) then f.mother_en else coalesce(f.father_en, f.mother_en) end end,
  case when t.check_out <= now() then case when seed.chance(70, 'by-mother:' || a.child_id || a.day) then 'mother' else 'father' end end,
  greatest(0, extract(epoch from (t.check_out - ((a.day + a.closes_at) at time zone 'Africa/Cairo'))) / 60)::integer,
  'none'
from days_attended a
join seed.kids k on k.child_id = a.child_id
join seed.families f on f.branch = k.branch and f.family_slot = k.family_slot
join seed.classes x on x.branch = k.branch and x.slot = k.class_slot
left join lateral (select cs.user_id from public.class_staff cs where cs.class_id = x.class_id and cs.role = 'lead' limit 1) lead on true
cross join lateral (
  select
    ((a.day + a.opens_at + make_interval(mins => seed.int_between(-10, 70, 'in:' || a.child_id || a.day))) at time zone 'Africa/Cairo') as check_in,
    ((a.day + case when a.enrollment_type = 'half_day' then a.opens_at + interval '4 hours' else a.closes_at end
       + make_interval(mins => case when seed.chance(5, 'late:' || a.child_id || a.day)
                                    then seed.int_between(10, 50, 'late-by:' || a.child_id || a.day)
                                    else seed.int_between(-75, 0, 'out:' || a.child_id || a.day) end)) at time zone 'Africa/Cairo') as check_out
) t
where a.came
on conflict (child_id, attendance_date) do nothing;

insert into public.attendance_absence_reports (nursery_id, child_id, absence_date, reason, note, reported_by, created_at)
select seed.branch_id(k.branch), a.child_id, a.day, r.reason, r.note, coalesce(f.mother_id, f.father_id),
       ((a.day - 1) + time '20:00' + make_interval(mins => seed.int_between(0, 180, 'reported:' || a.child_id || a.day))) at time zone 'Africa/Cairo'
from days_attended a
join seed.kids k on k.child_id = a.child_id
join seed.families f on f.branch = k.branch and f.family_slot = k.family_slot
cross join lateral (
  select * from (values
    ('sick', 'عنده سخونية خفيفة، هنطمنكم أول ما يتحسن.'),
    ('sick', 'دور برد، الدكتور نصح بالراحة يومين.'),
    ('travel', 'مسافرين عند الجدة في الإسكندرية.'),
    ('family', 'مناسبة عائلية.'),
    ('other', 'موعد عند دكتور الأسنان.')
  ) v(reason, note)
  offset seed.int_between(0, 4, 'reason:' || a.child_id || a.day) limit 1
) r
where not a.came and seed.chance(65, 'reported:' || a.child_id || a.day)
on conflict (child_id, absence_date) do nothing;

alter table public.attendance_records enable trigger attendance_qr_working_hours_guard;
alter table public.attendance_absence_reports enable trigger trg_absence_reports_before_insert;
alter table public.attendance_absence_reports enable trigger trg_absence_reports_after_insert;

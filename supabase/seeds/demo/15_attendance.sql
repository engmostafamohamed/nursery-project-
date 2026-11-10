-- Demo seed · 15 · Attendance ({{branches}})
--
-- The last 20 school days at each branch (the branch's own working days and holidays): most
-- children come, around their usual time, and go home before closing (half-day children around
-- noon); a few are picked up late. About one day in fourteen a child stays home, and the family
-- reports most of those absences (ill, travelling, a family matter). Today counts too once the
-- branch has opened. The staff clock in and out on the same days: most a little before opening, a
-- few late; nobody on a recorded absence; a few days recorded by the admin (a forgotten phone). The QR-hours guard and the absence notifications are paused while the history
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

-- The staff: everyone working at the branch (teachers, nannies, managers, its admins).
insert into public.staff_attendance (
  user_id, nursery_id, work_date, clock_in, check_in_at, clock_out, check_out_at, status, late_minutes, work_hours,
  source, check_in_by, check_out_by, notes, staff_id
)
select
  u.id, n.id, d.day, t.check_in, t.check_in,
  case when t.check_out <= now() then t.check_out end, case when t.check_out <= now() then t.check_out end,
  case when t.late > 5 then 'late' else 'present' end, t.late,
  case when t.check_out <= now() then round((extract(epoch from (t.check_out - t.check_in)) / 3600.0)::numeric, 2) end,
  case when t.by_admin then 'admin' else 'self' end,
  case when t.by_admin then adm.id else u.id end,
  case when t.check_out <= now() then case when t.by_admin then adm.id else u.id end end,
  case when t.by_admin then 'نسي تسجيل الحضور من الهاتف' end,
  (select sp.id from public.staff_profiles sp where sp.user_id = u.id order by sp.created_at limit 1)
from branch_days d
join public.nurseries n on n.id = seed.branch_id(d.branch)
join public.users u on u.nursery_id = n.id and u.role in ('teacher', 'manager', 'branch_admin') and coalesce(u.status, 'active') = 'active'
left join lateral (select a.id from public.users a where a.nursery_id = n.id and a.role = 'branch_admin' order by a.created_at limit 1) adm on true
cross join lateral (
  select
    ((d.day + n.opens_at + make_interval(mins => case when seed.chance(9, 'staff-late:' || u.id || d.day)
                                                       then seed.int_between(6, 35, 'staff-late-by:' || u.id || d.day)
                                                       else seed.int_between(-40, 3, 'staff-in:' || u.id || d.day) end)) at time zone 'Africa/Cairo') as check_in,
    ((d.day + n.closes_at + make_interval(mins => seed.int_between(-10, 45, 'staff-out:' || u.id || d.day))) at time zone 'Africa/Cairo') as check_out,
    seed.chance(4, 'staff-admin:' || u.id || d.day) as by_admin
) t0
cross join lateral (
  select t0.*, greatest(0, floor(extract(epoch from (t0.check_in - ((d.day + n.opens_at) at time zone 'Africa/Cairo'))) / 60)::integer) as late
) t
where d.branch = any({{branches}})
  and t.check_in <= now()
  and not public.staff_is_absent(u.id, d.day)
on conflict (user_id, work_date) do nothing;

alter table public.attendance_records enable trigger attendance_qr_working_hours_guard;
alter table public.attendance_absence_reports enable trigger trg_absence_reports_before_insert;
alter table public.attendance_absence_reports enable trigger trg_absence_reports_after_insert;

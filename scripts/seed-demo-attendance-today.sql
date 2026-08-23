-- Run in Supabase Dashboard -> SQL Editor (postgres role bypasses RLS).
-- Replace nursery UUID below if you want a different nursery. Defaults to the
-- Cherries demo nursery used by other seed scripts.
--
-- Seeds today's attendance for up to 9 active children, mixing the three
-- buckets the admin attendance page surfaces:
--   1) Left on time     (3 rows: check-out before nursery close)
--   2) Left late        (3 rows: check-out after close + grace, with extra_hours
--                         and qr_scan_log populated to mirror what
--                         teacherAttendanceToggle would write on a real scan)
--   3) Still in nursery (3 rows: check-in only)
--
-- attendance_records has NO nursery_id column; nursery is on children.
-- All times are anchored to Africa/Cairo to match the admin attendance page,
-- which derives `today` from the nursery calendar timezone.

WITH params AS (
  SELECT
    '908fa1eb-e857-456c-a603-78c28c604c90'::uuid AS nursery_id,
    ((now() AT TIME ZONE 'Africa/Cairo')::date)   AS d
),
nursery_window AS (
  SELECT
    p.d,
    p.nursery_id,
    COALESCE(s.standard_end_time, '17:00'::time)        AS end_time,
    COALESCE(s.late_pickup_grace_minutes, 15)           AS grace_minutes,
    COALESCE(s.late_pickup_fee_per_hour, 50.00)::numeric AS fee_per_hour
  FROM params p
  LEFT JOIN public.nursery_settings s ON s.nursery_id = p.nursery_id
),
ranked_children AS (
  SELECT
    c.id,
    ROW_NUMBER() OVER (ORDER BY c.full_name_en NULLS LAST, c.id) AS rn
  FROM public.children c, params p
  WHERE c.nursery_id = p.nursery_id
    AND c.status = 'active'
  LIMIT 9
)
INSERT INTO public.attendance_records
  (child_id, attendance_date, check_in, check_out, extra_hours, qr_scan_log)
SELECT
  rc.id,
  nw.d,
  -- Arrival: 07:30..09:30 staggered, anchored in Cairo.
  ((nw.d::timestamp + TIME '07:30' + (rc.rn - 1) * INTERVAL '15 minutes')
    AT TIME ZONE 'Africa/Cairo'),
  CASE
    -- 1) Left on time: depart 30 min before close (Cairo time).
    WHEN rc.rn BETWEEN 1 AND 3 THEN
      ((nw.d::timestamp + nw.end_time - INTERVAL '30 minutes')
        AT TIME ZONE 'Africa/Cairo')
    -- 2) Left late: depart 1.5h / 2.5h / 3.5h after close+grace (Cairo time).
    WHEN rc.rn BETWEEN 4 AND 6 THEN
      ((nw.d::timestamp + nw.end_time + (nw.grace_minutes || ' minutes')::interval
        + ((rc.rn - 3) * 60 + 30) * INTERVAL '1 minute')
        AT TIME ZONE 'Africa/Cairo')
    -- 3) Still in nursery: NULL.
    ELSE NULL
  END,
  CASE
    WHEN rc.rn BETWEEN 4 AND 6 THEN CEIL((rc.rn - 3) + 0.5)::numeric
    ELSE 0
  END,
  CASE
    WHEN rc.rn BETWEEN 4 AND 6 THEN
      jsonb_build_object(
        'late_pickup', true,
        'late_minutes', ((rc.rn - 3) * 60 + 30) + nw.grace_minutes,
        'extra_hours', CEIL((rc.rn - 3) + 0.5)::int,
        'extra_fee',  (CEIL((rc.rn - 3) + 0.5)::numeric * nw.fee_per_hour)::numeric(10,2),
        'end_time',   to_char(nw.end_time, 'HH24:MI'),
        'grace_minutes', nw.grace_minutes,
        'fee_per_hour',  nw.fee_per_hour,
        'seeded', true
      )
    WHEN rc.rn BETWEEN 1 AND 3 THEN
      jsonb_build_object('late_pickup', false, 'seeded', true)
    ELSE jsonb_build_object('seeded', true)
  END
FROM ranked_children rc, nursery_window nw
ON CONFLICT (child_id, attendance_date) DO UPDATE SET
  check_in    = EXCLUDED.check_in,
  check_out   = EXCLUDED.check_out,
  extra_hours = EXCLUDED.extra_hours,
  qr_scan_log = EXCLUDED.qr_scan_log,
  updated_at  = now();

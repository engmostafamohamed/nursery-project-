-- Migration 035: Disable RLS on attendance_records (temporary, same as 034)
-- Present Today stat is being blocked by RLS recursion on this table

ALTER TABLE public.attendance_records DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.attendance_records IS 'TEMPORARY: RLS disabled due to infinite recursion bug - migration 035';;

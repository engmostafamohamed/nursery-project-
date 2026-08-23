-- EMERGENCY FIX: Disable RLS on children table completely
-- This allows the app to work while we rebuild RLS properly

-- Disable RLS on children table
ALTER TABLE children DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS children_staff_all ON children;
DROP POLICY IF EXISTS children_parents_select ON children;
DROP POLICY IF EXISTS children_service_all ON children;

-- Add comment explaining temporary state
COMMENT ON TABLE children IS 'RLS TEMPORARILY DISABLED - App-level security only';

-- Also disable RLS on related tables that depend on children
ALTER TABLE media DISABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS media_staff_all ON media;
DROP POLICY IF EXISTS media_parents_select ON media;
DROP POLICY IF EXISTS daily_reports_staff_all ON daily_reports;
DROP POLICY IF EXISTS daily_reports_parents_select ON daily_reports;
DROP POLICY IF EXISTS attendance_staff_all ON attendance_records;
DROP POLICY IF EXISTS attendance_parents_select ON attendance_records;;

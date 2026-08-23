-- Migration 017: CRITICAL SECURITY FIX - Enable RLS on core tables
-- Addresses Supabase linter ERROR: Policy Exists RLS Disabled
-- Without this, ALL multi-tenant isolation is broken

-- Enable RLS on attendance_records
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

-- Enable RLS on children (CRITICAL - core multi-tenant table)
ALTER TABLE children ENABLE ROW LEVEL SECURITY;

-- Enable RLS on daily_reports
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;

-- Enable RLS on media
ALTER TABLE media ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE attendance_records IS 'RLS ENABLED - Multi-tenant isolation via nursery_id';
COMMENT ON TABLE children IS 'RLS ENABLED - Multi-tenant isolation via nursery_id';
COMMENT ON TABLE daily_reports IS 'RLS ENABLED - Multi-tenant isolation via nursery_id';
COMMENT ON TABLE media IS 'RLS ENABLED - Multi-tenant isolation via nursery_id';
;

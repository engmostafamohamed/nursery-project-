-- Migration 016: Fix Critical Gaps from Deep Analysis
-- Fixes: 1) Home address duplication, 2) Emergency medications, 3) Nationality field

-- FIX #1: Move home_address to children table (family-level address)
ALTER TABLE children
  ADD COLUMN IF NOT EXISTS home_address TEXT;

COMMENT ON COLUMN children.home_address IS 'Family home address - shared across siblings in same household';

-- FIX #2: Add emergency medications consent to applications
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS emergency_medications_approved_json JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN applications.emergency_medications_approved_json IS 'List of medications parent approved for emergency use: ["Cetal", "Brufen", "Mebo", etc]';

-- FIX #3: Ensure nationality is properly set (already exists, just verify)
-- children.nationality already exists from previous migrations

-- OPTIONAL: Add workplace address to parent_children for complete parent records
ALTER TABLE parent_children
  ADD COLUMN IF NOT EXISTS work_address TEXT;

COMMENT ON COLUMN parent_children.work_address IS 'Parent workplace address for emergency contact purposes';
;

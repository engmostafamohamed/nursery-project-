-- Migration 011: Child Extended Profile
-- Adds nickname, school preferences, nap preferences, and sibling details
-- Purpose: Support standard Egyptian nursery enrollment Excel format

-- Add child profile extensions
ALTER TABLE children 
  ADD COLUMN IF NOT EXISTS nickname TEXT,
  ADD COLUMN IF NOT EXISTS school_preference TEXT CHECK (school_preference IN ('international', 'national', 'bilingual')),
  ADD COLUMN IF NOT EXISTS school_admission_plan TEXT,
  ADD COLUMN IF NOT EXISTS nap_preference TEXT CHECK (nap_preference IN ('same_as_nursery', 'custom', 'no_nap')),
  ADD COLUMN IF NOT EXISTS max_nap_duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS siblings_info_json JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN children.nickname IS 'Child''s preferred nickname used by teachers daily';
COMMENT ON COLUMN children.school_preference IS 'Parent preference for future schooling: international, national, or bilingual';
COMMENT ON COLUMN children.school_admission_plan IS 'Target grade level for school admission (KG1, KG2, Preschool, etc)';
COMMENT ON COLUMN children.nap_preference IS 'Parent preference for nap time scheduling';
COMMENT ON COLUMN children.max_nap_duration_minutes IS 'Maximum nap duration if parent wants to override nursery schedule';
COMMENT ON COLUMN children.siblings_info_json IS 'Array of sibling information: [{"name": "Ahmed", "age": 4, "relationship": "brother"}]';
;

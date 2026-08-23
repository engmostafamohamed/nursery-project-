-- Migration 018: Remove duplicate home_address column
-- Keep home_address in children table (family-level)
-- Remove from parent_children (per-parent duplication)

-- First, migrate any existing data from parent_children.home_address to children.home_address
-- Only update children records where home_address is NULL
UPDATE children c
SET home_address = pc.home_address
FROM parent_children pc
WHERE pc.child_id = c.id
  AND c.home_address IS NULL
  AND pc.home_address IS NOT NULL;

-- Now drop the duplicate column
ALTER TABLE parent_children DROP COLUMN IF EXISTS home_address;

COMMENT ON COLUMN children.home_address IS 'Family home address - single source of truth, shared across siblings';
;

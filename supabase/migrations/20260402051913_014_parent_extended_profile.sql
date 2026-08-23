-- Migration 014: Parent Extended Profile
-- Adds ID photos, workplace address, marital status, home address
-- Critical for complete parent records and emergency contact

-- Add parent profile extensions to parent_children junction table
ALTER TABLE parent_children
  ADD COLUMN IF NOT EXISTS parent_id_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS home_address TEXT,
  ADD COLUMN IF NOT EXISTS marital_status TEXT CHECK (marital_status IN ('married', 'divorced', 'separated', 'widowed', 'single'));

COMMENT ON COLUMN parent_children.parent_id_photo_url IS 'URL to parent national ID photo for verification';
COMMENT ON COLUMN parent_children.home_address IS 'Home address (family-level, stored per parent-child relationship)';
COMMENT ON COLUMN parent_children.marital_status IS 'Marital status of parents - affects custody and emergency contact';
;

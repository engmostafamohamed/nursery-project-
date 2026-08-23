-- Migration 013: Child Diaper & Toileting Care
-- Tracks diaper supply, change frequency, rash cream usage
-- Critical for daily baby/toddler care operations

CREATE TABLE IF NOT EXISTS child_diaper_care (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID REFERENCES children(id) ON DELETE CASCADE NOT NULL UNIQUE,
  
  -- Diaper Supply Method
  diaper_supply_method TEXT CHECK (diaper_supply_method IN ('stock', 'daily_sent', 'not_applicable')),
  diapers_per_day INTEGER,
  
  -- Rash Cream
  rash_cream_usage TEXT CHECK (rash_cream_usage IN ('every_change', 'if_rash', 'never')),
  
  -- Change Schedule
  change_schedule TEXT CHECK (change_schedule IN ('regular_times', 'as_needed')),
  change_frequency_hours INTEGER,
  
  -- Notes
  notes TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE child_diaper_care IS 'Diaper and toileting care preferences - standard for Egyptian baby/toddler classes';
COMMENT ON COLUMN child_diaper_care.diaper_supply_method IS 'How diapers are provided: parent maintains stock, sends daily, or child does not use diapers';
COMMENT ON COLUMN child_diaper_care.diapers_per_day IS 'Number of diapers parent sends daily (if daily_sent method)';
COMMENT ON COLUMN child_diaper_care.rash_cream_usage IS 'When to apply diaper rash cream';
COMMENT ON COLUMN child_diaper_care.change_schedule IS 'Whether to change on fixed schedule or only when needed';
COMMENT ON COLUMN child_diaper_care.change_frequency_hours IS 'How often to change if on regular schedule (e.g., every 2 hours, every 3 hours)';

-- Enable RLS
ALTER TABLE child_diaper_care ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Parents can view own children diaper care"
  ON child_diaper_care FOR SELECT
  USING (
    child_id IN (
      SELECT pc.child_id 
      FROM parent_children pc 
      WHERE pc.parent_id = auth.uid()
    )
  );

CREATE POLICY "Staff can view nursery children diaper care"
  ON child_diaper_care FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM children c
      JOIN users u ON u.nursery_id = c.nursery_id
      WHERE c.id = child_diaper_care.child_id
        AND u.id = auth.uid()
        AND u.role IN ('branch_admin', 'teacher')
    )
  );

CREATE POLICY "Admins can manage diaper care"
  ON child_diaper_care FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM children c
      JOIN users u ON u.nursery_id = c.nursery_id
      WHERE c.id = child_diaper_care.child_id
        AND u.id = auth.uid()
        AND u.role = 'branch_admin'
    )
  );
;

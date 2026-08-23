-- Migration: Add nursery management fields for XO Super Admin
-- Date: 2026-03-31

-- 1. Add multiple contact support to nurseries table
ALTER TABLE nurseries 
ADD COLUMN IF NOT EXISTS contact_phones jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS contact_emails jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
ADD COLUMN IF NOT EXISTS suspension_reason text,
ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN nurseries.contact_phones IS 'Array of phone numbers: [{"number": "+20...", "label": "Main", "is_primary": true}]';
COMMENT ON COLUMN nurseries.contact_emails IS 'Array of emails: [{"email": "admin@...", "label": "Admin", "is_primary": true}]';
COMMENT ON COLUMN nurseries.suspended_at IS 'Timestamp when nursery was suspended by XO Super Admin';
COMMENT ON COLUMN nurseries.suspension_reason IS 'Reason for suspension (payment, violation, etc.)';
COMMENT ON COLUMN nurseries.deleted_at IS 'Soft delete timestamp - nursery marked for deletion';

-- 2. Create table for AI-powered import jobs
CREATE TABLE IF NOT EXISTS import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid REFERENCES nurseries(id) ON DELETE CASCADE,
  initiated_by uuid REFERENCES users(id),
  
  -- Import metadata
  import_type text NOT NULL CHECK (import_type IN ('children', 'staff', 'parents', 'classes', 'mixed')),
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size_bytes bigint,
  
  -- AI processing
  ai_detected_format jsonb, -- AI-detected column mappings
  ai_confidence_score numeric(3, 2), -- 0.00 to 1.00
  user_confirmed_mapping jsonb, -- User-approved final mapping
  
  -- Status tracking
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'mapping_review', 'importing', 'completed', 'failed', 'cancelled')),
  total_rows integer,
  processed_rows integer DEFAULT 0,
  successful_rows integer DEFAULT 0,
  failed_rows integer DEFAULT 0,
  error_log jsonb DEFAULT '[]'::jsonb,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  
  -- Results
  imported_data_summary jsonb -- Summary of imported records
);

COMMENT ON TABLE import_jobs IS 'AI-powered Excel/CSV import jobs - each nursery can have custom formats';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_import_jobs_nursery ON import_jobs(nursery_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status);

-- 3. Enable RLS on import_jobs
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;

-- XO Super Admin can see all imports
CREATE POLICY "xo_super_admin_import_jobs_all" ON import_jobs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'xo_super_admin'
    )
  );

-- Branch admins can only see their nursery's imports
CREATE POLICY "branch_admin_import_jobs_own_nursery" ON import_jobs
  FOR ALL
  USING (
    nursery_id IN (
      SELECT nursery_id FROM users WHERE id = auth.uid() AND role = 'branch_admin'
    )
  );

-- 4. Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_nurseries_suspended ON nurseries(suspended_at) WHERE suspended_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nurseries_deleted ON nurseries(deleted_at) WHERE deleted_at IS NOT NULL;;

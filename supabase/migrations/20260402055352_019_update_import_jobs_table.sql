-- Migration 019: Update import_jobs table for AI import feature
-- Add missing columns and enable RLS with correct role names

-- Add file_data column if it doesn't exist (stores parsed Excel rows)
ALTER TABLE import_jobs 
  ADD COLUMN IF NOT EXISTS file_data JSONB;

-- Make nursery_id NOT NULL for proper multi-tenant isolation
ALTER TABLE import_jobs 
  ALTER COLUMN nursery_id SET NOT NULL;

-- Enable RLS
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "import_jobs_branch_admin" ON import_jobs;
DROP POLICY IF EXISTS "import_jobs_chain_super_admin" ON import_jobs;
DROP POLICY IF EXISTS "import_jobs_xo_admin" ON import_jobs;

-- RLS Policy: Branch Admins can only see their nursery's imports
CREATE POLICY "import_jobs_branch_admin"
  ON import_jobs FOR ALL
  USING (
    nursery_id IN (
      SELECT u.nursery_id 
      FROM users u 
      WHERE u.id = auth.uid()
        AND u.role = 'branch_admin'
    )
  );

-- RLS Policy: Chain Super Admins can see imports from their chain's nurseries
CREATE POLICY "import_jobs_chain_super_admin"
  ON import_jobs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM nurseries n
      JOIN users u ON u.id = auth.uid()
      WHERE n.id = import_jobs.nursery_id
        AND n.chain_id = u.chain_id
        AND u.role = 'chain_super_admin'
    )
  );

-- RLS Policy: XO Super Admins can see all imports
CREATE POLICY "import_jobs_xo_admin"
  ON import_jobs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'xo_super_admin'
    )
  );

COMMENT ON COLUMN import_jobs.file_data IS 'Parsed Excel rows stored as JSONB for import processing';
COMMENT ON COLUMN import_jobs.nursery_id IS 'Which nursery this import belongs to - enforces multi-tenant isolation (NOT NULL)';
;

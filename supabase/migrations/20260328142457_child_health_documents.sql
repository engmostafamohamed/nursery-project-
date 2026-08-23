-- Migration 052: Child Health Documents
-- Allows parents to upload medical documents

CREATE TABLE IF NOT EXISTS child_health_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid REFERENCES children(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES users(id),
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  document_type text CHECK (document_type IN ('medical_report', 'lab_result', 'prescription', 'vaccination_card', 'other')),
  notes text,
  uploaded_at timestamptz DEFAULT now()
);

ALTER TABLE child_health_documents ENABLE ROW LEVEL SECURITY;

-- Parents can upload documents for their children
CREATE POLICY "parents_upload_own_children_health_docs"
ON child_health_documents FOR INSERT
TO authenticated
WITH CHECK (
  child_id IN (
    SELECT child_id FROM parent_children WHERE parent_id = auth.uid()
  )
);

-- Parents can read their own uploads
CREATE POLICY "parents_read_own_children_health_docs"
ON child_health_documents FOR SELECT
TO authenticated
USING (
  child_id IN (
    SELECT child_id FROM parent_children WHERE parent_id = auth.uid()
  )
);

-- Staff can read all documents for their nursery
CREATE POLICY "staff_read_nursery_health_docs"
ON child_health_documents FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM children c
    JOIN users u ON u.nursery_id = c.nursery_id
    WHERE c.id = child_health_documents.child_id
      AND u.id = auth.uid()
      AND u.role IN ('teacher', 'branch_admin', 'chain_super_admin')
  )
);

CREATE INDEX IF NOT EXISTS idx_child_health_documents_child_id ON child_health_documents(child_id);;

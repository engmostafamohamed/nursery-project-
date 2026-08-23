-- Migration 053: Allow parents to create initial health record
-- This enables the parent health page to auto-create the record if missing

CREATE POLICY "parents_insert_own_children_health_record"
ON child_health_records FOR INSERT
TO authenticated
WITH CHECK (
  child_id IN (
    SELECT child_id FROM parent_children WHERE parent_id = auth.uid()
  )
);;

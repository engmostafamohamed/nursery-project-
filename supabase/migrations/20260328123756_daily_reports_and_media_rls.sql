-- RLS policies for daily_reports
-- Teachers can create/update reports for their nursery
-- Parents can read published reports for their children

-- Teachers can insert reports for their nursery
CREATE POLICY "teachers_can_insert_reports_for_their_nursery"
ON daily_reports
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role = 'teacher'
      AND users.nursery_id = daily_reports.nursery_id
  )
);

-- Teachers can update reports they created or for their nursery
CREATE POLICY "teachers_can_update_reports_for_their_nursery"
ON daily_reports
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('teacher', 'branch_admin', 'chain_super_admin')
      AND users.nursery_id = daily_reports.nursery_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('teacher', 'branch_admin', 'chain_super_admin')
      AND users.nursery_id = daily_reports.nursery_id
  )
);

-- Parents can read published reports for their children
CREATE POLICY "parents_can_read_published_reports_for_their_children"
ON daily_reports
FOR SELECT
TO authenticated
USING (
  status = 'published' AND
  EXISTS (
    SELECT 1 FROM parent_children pc
    WHERE pc.parent_id = auth.uid()
      AND pc.child_id = daily_reports.child_id
  )
);

-- Staff can read all reports for their nursery
CREATE POLICY "staff_can_read_reports_for_their_nursery"
ON daily_reports
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('teacher', 'branch_admin', 'chain_super_admin')
      AND users.nursery_id = daily_reports.nursery_id
  )
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_reports_child_date 
ON daily_reports(child_id, report_date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_reports_nursery_status 
ON daily_reports(nursery_id, status);;

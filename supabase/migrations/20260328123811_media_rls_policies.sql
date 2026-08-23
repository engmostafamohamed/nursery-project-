-- RLS policies for media table
-- Teachers can upload media for their nursery
-- Admins can approve/reject media
-- Parents can view approved media for their children

-- Teachers can insert media for their nursery
CREATE POLICY "teachers_can_upload_media_for_their_nursery"
ON media
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('teacher', 'branch_admin', 'chain_super_admin')
      AND users.nursery_id = media.nursery_id
  )
);

-- Admins can update media for their nursery (approve/reject)
CREATE POLICY "admins_can_update_media_for_their_nursery"
ON media
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('branch_admin', 'chain_super_admin')
      AND users.nursery_id = media.nursery_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('branch_admin', 'chain_super_admin')
      AND users.nursery_id = media.nursery_id
  )
);

-- Staff can read all media for their nursery
CREATE POLICY "staff_can_read_media_for_their_nursery"
ON media
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
      AND users.role IN ('teacher', 'branch_admin', 'chain_super_admin')
      AND users.nursery_id = media.nursery_id
  )
);

-- Parents can read approved media for their children
CREATE POLICY "parents_can_read_approved_media_for_their_children"
ON media
FOR SELECT
TO authenticated
USING (
  status = 'approved' AND
  (
    -- Media tagged with their children
    EXISTS (
      SELECT 1 FROM media_children mc
      JOIN parent_children pc ON pc.child_id = mc.child_id
      WHERE mc.media_id = media.id
        AND pc.parent_id = auth.uid()
    )
    OR
    -- Class-wide media for classes their children are in
    (visibility = 'all_class' AND class_id IN (
      SELECT c.class_id FROM children c
      JOIN parent_children pc ON pc.child_id = c.id
      WHERE pc.parent_id = auth.uid()
    ))
  )
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_media_nursery_status 
ON media(nursery_id, status);

CREATE INDEX IF NOT EXISTS idx_media_class_visibility 
ON media(class_id, visibility) WHERE status = 'approved';;

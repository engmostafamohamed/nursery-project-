-- Remove duplicate (child_id, event_id) rows in permissions table
-- Keep only the oldest row for each duplicate
WITH duplicates AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY child_id, event_id 
      ORDER BY created_at ASC
    ) as rn
  FROM permissions
  WHERE event_id IS NOT NULL
)
DELETE FROM permissions
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Add partial unique index to prevent future duplicates
-- Only applies when event_id IS NOT NULL (allows other permission types)
CREATE UNIQUE INDEX IF NOT EXISTS permissions_child_event_unique_idx 
ON permissions (child_id, event_id) 
WHERE event_id IS NOT NULL;

-- Rewrite create_event_permissions function to use NOT EXISTS instead of ON CONFLICT
-- This is more robust and doesn't rely on fragile conflict resolution
CREATE OR REPLACE FUNCTION create_event_permissions(
  p_event_id UUID,
  p_nursery_id UUID,
  p_target_scope TEXT,
  p_target_class_id UUID DEFAULT NULL,
  p_target_child_ids UUID[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- For 'all' scope: create permissions for all active children in the nursery
  IF p_target_scope = 'all' THEN
    INSERT INTO permissions (child_id, event_id, permission_type, status)
    SELECT 
      c.id,
      p_event_id,
      'event',
      'pending'
    FROM children c
    WHERE c.nursery_id = p_nursery_id
      AND c.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM permissions p
        WHERE p.child_id = c.id
          AND p.event_id = p_event_id
      );
  
  -- For 'class' scope: create permissions for children in the target class
  ELSIF p_target_scope = 'class' AND p_target_class_id IS NOT NULL THEN
    INSERT INTO permissions (child_id, event_id, permission_type, status)
    SELECT 
      c.id,
      p_event_id,
      'event',
      'pending'
    FROM children c
    WHERE c.class_id = p_target_class_id
      AND c.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM permissions p
        WHERE p.child_id = c.id
          AND p.event_id = p_event_id
      );
  
  -- For 'individual' scope: create permissions for specific children
  ELSIF p_target_scope = 'individual' AND p_target_child_ids IS NOT NULL THEN
    INSERT INTO permissions (child_id, event_id, permission_type, status)
    SELECT 
      child_id,
      p_event_id,
      'event',
      'pending'
    FROM UNNEST(p_target_child_ids) AS child_id
    WHERE NOT EXISTS (
      SELECT 1 FROM permissions p
      WHERE p.child_id = child_id
        AND p.event_id = p_event_id
    );
  END IF;
END;
$$;;

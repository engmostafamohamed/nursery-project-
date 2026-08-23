-- Migration: Auto-create permissions when event is published (status = 'active')
-- This ensures parents get permission requests when events are published

-- Function to create permissions for an event
CREATE OR REPLACE FUNCTION create_event_permissions()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_child_id UUID;
BEGIN
  -- Only proceed if event is being set to 'active' status
  -- (either INSERT with active or UPDATE from non-active to active)
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status != 'active') THEN
    
    -- Determine which children need permissions based on target_scope
    IF NEW.target_scope = 'all' THEN
      -- Create permissions for ALL children in the nursery
      INSERT INTO permissions (child_id, event_id, permission_type, status)
      SELECT 
        c.id,
        NEW.id,
        'event',
        'pending'
      FROM children c
      WHERE c.nursery_id = NEW.nursery_id
        AND c.status = 'active'
      ON CONFLICT DO NOTHING;
      
    ELSIF NEW.target_scope = 'class' AND NEW.target_class_id IS NOT NULL THEN
      -- Create permissions for children in the target class
      INSERT INTO permissions (child_id, event_id, permission_type, status)
      SELECT 
        c.id,
        NEW.id,
        'event',
        'pending'
      FROM children c
      WHERE c.class_id = NEW.target_class_id
        AND c.status = 'active'
      ON CONFLICT DO NOTHING;
      
    -- Note: For 'individual' scope, permissions must be created manually
    -- via event details page (not implemented yet)
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger on events table
DROP TRIGGER IF EXISTS trigger_create_event_permissions ON events;
CREATE TRIGGER trigger_create_event_permissions
  AFTER INSERT OR UPDATE OF status ON events
  FOR EACH ROW
  EXECUTE FUNCTION create_event_permissions();

-- Add comment for documentation
COMMENT ON FUNCTION create_event_permissions() IS 
'Automatically creates permission records when an event is published (status set to active). 
For target_scope=all: creates permissions for all active children in nursery.
For target_scope=class: creates permissions for all active children in target_class_id.
For target_scope=individual: permissions must be created manually via event management UI.';
;

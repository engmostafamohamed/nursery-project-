-- Deduplicate event-linked permissions (same child + event), then enforce uniqueness.
-- Updates create_event_permissions trigger to avoid duplicate rows without relying on ON CONFLICT inference.

DELETE FROM public.permissions a
  USING public.permissions b
 WHERE a.event_id IS NOT NULL
   AND b.event_id IS NOT NULL
   AND a.child_id = b.child_id
   AND a.event_id = b.event_id
   AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_permissions_child_event_unique
  ON public.permissions (child_id, event_id)
  WHERE event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_event_permissions()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN

    IF NEW.target_scope = 'all' THEN
      INSERT INTO public.permissions (child_id, event_id, permission_type, status)
      SELECT c.id, NEW.id, 'event', 'pending'
      FROM public.children c
      WHERE c.nursery_id = NEW.nursery_id
        AND c.status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM public.permissions p
          WHERE p.child_id = c.id
            AND p.event_id = NEW.id
        );

    ELSIF NEW.target_scope = 'class' AND NEW.target_class_id IS NOT NULL THEN
      INSERT INTO public.permissions (child_id, event_id, permission_type, status)
      SELECT c.id, NEW.id, 'event', 'pending'
      FROM public.children c
      WHERE c.class_id = NEW.target_class_id
        AND c.status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM public.permissions p
          WHERE p.child_id = c.id
            AND p.event_id = NEW.id
        );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.create_event_permissions() IS
'Creates permission rows when an event becomes active. all/class: inserts for matching active children. individual: rows are created by the admin app before publish.';

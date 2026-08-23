-- Allow parents to create the single child_health_records row for their child (empty profile until admin fills it).

BEGIN;

CREATE POLICY child_health_records_parent_insert
  ON public.child_health_records FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'parent'
    AND public.parent_can_access_child(child_id)
    AND EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.id = child_id AND c.nursery_id = nursery_id
    )
  );

COMMIT;

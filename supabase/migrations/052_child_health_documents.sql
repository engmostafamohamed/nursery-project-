-- Parent-uploaded medical document metadata (files in child-documents bucket).

BEGIN;

CREATE TABLE public.child_health_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  label_ar text NOT NULL,
  label_en text NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_child_health_documents_nursery_id ON public.child_health_documents (nursery_id);
CREATE INDEX idx_child_health_documents_child_id ON public.child_health_documents (child_id);

CREATE TRIGGER trg_child_health_documents_updated_at
BEFORE UPDATE ON public.child_health_documents
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.child_health_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY child_health_docs_xo_all
  ON public.child_health_documents FOR ALL TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

CREATE POLICY child_health_docs_chain_all
  ON public.child_health_documents FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  )
  WITH CHECK (
    public.current_user_role() = 'chain_super_admin'
    AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
  );

CREATE POLICY child_health_docs_branch_all
  ON public.child_health_documents FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'branch_admin'
    AND nursery_id = public.current_user_nursery_id()
  );

CREATE POLICY child_health_docs_parent_insert
  ON public.child_health_documents FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'parent'
    AND uploaded_by = auth.uid()
    AND public.parent_can_access_child(child_id)
    AND EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.id = child_id AND c.nursery_id = child_health_documents.nursery_id
    )
  );

CREATE POLICY child_health_docs_parent_select
  ON public.child_health_documents FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND public.parent_can_access_child(child_id)
  );

CREATE POLICY child_health_docs_teacher_select
  ON public.child_health_documents FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1 FROM public.children c
      JOIN public.classes cl ON cl.id = c.class_id
      WHERE c.id = child_health_documents.child_id
        AND cl.teacher_id = auth.uid()
    )
  );

COMMIT;

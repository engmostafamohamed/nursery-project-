-- Lock reviewed admission applications and direct chat messages for parents.
--
-- UI already hides editing after review, but these policies/triggers make the
-- same rule true for direct API access:
-- - parents can edit application data only while draft
-- - parents can upload documents while draft or documents_pending
-- - parents can resubmit from documents_pending, but cannot change reviewed data
-- - parents can read/send/mark-read direct messages, but cannot edit/delete them

CREATE OR REPLACE FUNCTION public.prevent_parent_reviewed_application_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() <> 'parent' THEN
    RETURN NEW;
  END IF;

  IF OLD.parent_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Parents may only edit their own application';
  END IF;

  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'documents_pending' THEN
    IF (to_jsonb(NEW) - 'status' - 'submitted_at' - 'updated_at') IS DISTINCT FROM
       (to_jsonb(OLD) - 'status' - 'submitted_at' - 'updated_at') THEN
      RAISE EXCEPTION 'Reviewed application data is locked';
    END IF;

    IF NEW.status NOT IN ('documents_pending', 'submitted') THEN
      RAISE EXCEPTION 'Parents can only resubmit requested documents';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Reviewed application data is locked';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_parent_reviewed_application_edit ON public.applications;
CREATE TRIGGER trg_prevent_parent_reviewed_application_edit
BEFORE UPDATE ON public.applications
FOR EACH ROW
EXECUTE FUNCTION public.prevent_parent_reviewed_application_edit();

DROP POLICY IF EXISTS applications_parent_own ON public.applications;
DROP POLICY IF EXISTS applications_parent_select ON public.applications;
CREATE POLICY applications_parent_select
  ON public.applications FOR SELECT TO authenticated
  USING (parent_id = auth.uid());

DROP POLICY IF EXISTS applications_parent_insert ON public.applications;
CREATE POLICY applications_parent_insert
  ON public.applications FOR INSERT TO authenticated
  WITH CHECK (parent_id = auth.uid() AND status = 'draft');

DROP POLICY IF EXISTS applications_parent_update_before_review ON public.applications;
CREATE POLICY applications_parent_update_before_review
  ON public.applications FOR UPDATE TO authenticated
  USING (parent_id = auth.uid() AND status IN ('draft', 'documents_pending'))
  WITH CHECK (parent_id = auth.uid() AND status IN ('draft', 'documents_pending', 'submitted'));

DROP POLICY IF EXISTS application_documents_parent_own ON public.application_documents;
DROP POLICY IF EXISTS application_documents_parent_select ON public.application_documents;
CREATE POLICY application_documents_parent_select
  ON public.application_documents FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.applications a
      WHERE a.id = application_documents.application_id
        AND a.parent_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS application_documents_parent_insert_requested ON public.application_documents;
CREATE POLICY application_documents_parent_insert_requested
  ON public.application_documents FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.applications a
      WHERE a.id = application_documents.application_id
        AND a.parent_id = auth.uid()
        AND a.status IN ('draft', 'documents_pending')
    )
  );

DROP POLICY IF EXISTS application_documents_parent_update_draft ON public.application_documents;
CREATE POLICY application_documents_parent_update_draft
  ON public.application_documents FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.applications a
      WHERE a.id = application_documents.application_id
        AND a.parent_id = auth.uid()
        AND a.status = 'draft'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.applications a
      WHERE a.id = application_documents.application_id
        AND a.parent_id = auth.uid()
        AND a.status = 'draft'
    )
  );

DROP POLICY IF EXISTS application_documents_parent_delete_draft ON public.application_documents;
CREATE POLICY application_documents_parent_delete_draft
  ON public.application_documents FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.applications a
      WHERE a.id = application_documents.application_id
        AND a.parent_id = auth.uid()
        AND a.status = 'draft'
    )
  );

CREATE OR REPLACE FUNCTION public.prevent_parent_message_edit_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() <> 'parent' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Parents cannot delete chat messages';
  END IF;

  IF (to_jsonb(NEW) - 'read_at' - 'updated_at') IS DISTINCT FROM
     (to_jsonb(OLD) - 'read_at' - 'updated_at') THEN
    RAISE EXCEPTION 'Parents cannot edit chat messages';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_parent_message_edit_delete ON public.messages;
CREATE TRIGGER trg_prevent_parent_message_edit_delete
BEFORE UPDATE OR DELETE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.prevent_parent_message_edit_delete();

DROP POLICY IF EXISTS msg_parent_participant ON public.messages;
DROP POLICY IF EXISTS msg_parent_select ON public.messages;
CREATE POLICY msg_parent_select
  ON public.messages FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND (sender_id = auth.uid() OR receiver_id = auth.uid())
  );

DROP POLICY IF EXISTS msg_parent_insert ON public.messages;
CREATE POLICY msg_parent_insert
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'parent'
    AND sender_id = auth.uid()
  );

DROP POLICY IF EXISTS msg_parent_mark_read ON public.messages;
CREATE POLICY msg_parent_mark_read
  ON public.messages FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND receiver_id = auth.uid()
  )
  WITH CHECK (
    public.current_user_role() = 'parent'
    AND receiver_id = auth.uid()
  );

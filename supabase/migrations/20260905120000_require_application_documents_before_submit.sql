-- Enforce mandatory admission documents before an application can be submitted.
-- The UI also validates this, but the trigger prevents direct API updates from
-- bypassing the required document rule.

CREATE OR REPLACE FUNCTION public.ensure_application_required_documents_before_submit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_missing text[];
BEGIN
  IF NEW.status = 'submitted' AND OLD.status IS DISTINCT FROM 'submitted' THEN
    SELECT array_agg(required_doc)
    INTO v_missing
    FROM unnest(ARRAY['birth_certificate', 'vaccination_card', 'parent_id', 'proof_of_address']) AS required_doc
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.application_documents d
      WHERE d.application_id = NEW.id
        AND d.document_type = required_doc
        AND coalesce(d.file_url, '') <> ''
    );

    IF coalesce(array_length(v_missing, 1), 0) > 0 THEN
      RAISE EXCEPTION 'Missing required application documents: %', array_to_string(v_missing, ', ');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_application_documents_before_submit ON public.applications;
CREATE TRIGGER trg_require_application_documents_before_submit
BEFORE UPDATE ON public.applications
FOR EACH ROW
EXECUTE FUNCTION public.ensure_application_required_documents_before_submit();

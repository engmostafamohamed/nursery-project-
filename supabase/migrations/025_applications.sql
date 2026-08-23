-- Phase 9 Feature 2: Application Flow & Document Verification

CREATE TABLE IF NOT EXISTS public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid REFERENCES public.inquiries (id) ON DELETE SET NULL,
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  child_id uuid REFERENCES public.children (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  submitted_at timestamptz,
  reviewed_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  rejection_reason text,
  parent_info_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  child_info_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  terms_accepted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT applications_status_ck CHECK (status IN ('draft', 'submitted', 'under_review', 'documents_pending', 'approved', 'rejected'))
);

CREATE TRIGGER trg_applications_updated_at
BEFORE UPDATE ON public.applications
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.application_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications (id) ON DELETE CASCADE,
  document_type text NOT NULL,
  file_url text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT NOW(),
  verified boolean NOT NULL DEFAULT false,
  verified_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  verified_at timestamptz,
  notes text,
  CONSTRAINT application_documents_type_ck CHECK (document_type IN ('birth_certificate', 'vaccination_card', 'parent_id', 'proof_of_address', 'medical_report', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_applications_nursery_id ON public.applications (nursery_id);
CREATE INDEX IF NOT EXISTS idx_applications_parent_id ON public.applications (parent_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON public.applications (status);
CREATE INDEX IF NOT EXISTS idx_application_documents_application_id ON public.application_documents (application_id);
CREATE INDEX IF NOT EXISTS idx_application_documents_type ON public.application_documents (document_type);

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS applications_admin_all ON public.applications;
CREATE POLICY applications_admin_all
  ON public.applications FOR ALL TO authenticated
  USING (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND nursery_id = public.current_user_nursery_id()
  );

DROP POLICY IF EXISTS applications_parent_own ON public.applications;
CREATE POLICY applications_parent_own
  ON public.applications FOR ALL TO authenticated
  USING (parent_id = auth.uid())
  WITH CHECK (parent_id = auth.uid());

DROP POLICY IF EXISTS application_documents_admin_all ON public.application_documents;
CREATE POLICY application_documents_admin_all
  ON public.application_documents FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_documents.application_id
        AND a.nursery_id = public.current_user_nursery_id()
        AND public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_documents.application_id
        AND a.nursery_id = public.current_user_nursery_id()
        AND public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    )
  );

DROP POLICY IF EXISTS application_documents_parent_own ON public.application_documents;
CREATE POLICY application_documents_parent_own
  ON public.application_documents FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_documents.application_id
        AND a.parent_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_documents.application_id
        AND a.parent_id = auth.uid()
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'application-documents',
  'application-documents',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated upload application documents" ON storage.objects;
CREATE POLICY "Authenticated upload application documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'application-documents'
  AND split_part(name, '/', 1) IN (
    SELECT nursery_id::text FROM public.users WHERE id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Parents and admins read application documents" ON storage.objects;
CREATE POLICY "Parents and admins read application documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'application-documents'
  AND split_part(name, '/', 1) IN (
    SELECT nursery_id::text FROM public.users WHERE id = auth.uid()
  )
);

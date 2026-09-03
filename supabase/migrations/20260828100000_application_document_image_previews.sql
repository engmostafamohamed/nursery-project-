-- Admission document image support and metadata backfill.
-- New parent application uploads use the application-documents bucket directly.
-- This also lets older signup documents appear in admissions when their storage
-- path already starts with the nursery id and can be read by existing policies.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
WHERE id = 'application-documents';

INSERT INTO public.application_documents (application_id, document_type, file_url, uploaded_at)
SELECT
  a.id,
  'birth_certificate',
  'child-documents:' || c.birth_certificate_url,
  COALESCE(a.submitted_at, a.created_at, now())
FROM public.applications a
JOIN public.children c ON c.id = a.child_id
WHERE c.birth_certificate_url IS NOT NULL
  AND c.birth_certificate_url LIKE a.nursery_id::text || '/%'
  AND NOT EXISTS (
    SELECT 1
    FROM public.application_documents d
    WHERE d.application_id = a.id
      AND d.document_type = 'birth_certificate'
  );

INSERT INTO public.application_documents (application_id, document_type, file_url, uploaded_at)
SELECT
  a.id,
  'vaccination_card',
  'child-documents:' || c.vaccination_card_url,
  COALESCE(a.submitted_at, a.created_at, now())
FROM public.applications a
JOIN public.children c ON c.id = a.child_id
WHERE c.vaccination_card_url IS NOT NULL
  AND c.vaccination_card_url LIKE a.nursery_id::text || '/%'
  AND NOT EXISTS (
    SELECT 1
    FROM public.application_documents d
    WHERE d.application_id = a.id
      AND d.document_type = 'vaccination_card'
  );

INSERT INTO public.application_documents (application_id, document_type, file_url, uploaded_at)
SELECT
  a.id,
  'parent_id',
  'child-documents:' || u.id_photo_url,
  COALESCE(a.submitted_at, a.created_at, now())
FROM public.applications a
JOIN public.users u ON u.id = a.parent_id
WHERE u.id_photo_url IS NOT NULL
  AND u.id_photo_url LIKE a.nursery_id::text || '/%'
  AND NOT EXISTS (
    SELECT 1
    FROM public.application_documents d
    WHERE d.application_id = a.id
      AND d.document_type = 'parent_id'
  );

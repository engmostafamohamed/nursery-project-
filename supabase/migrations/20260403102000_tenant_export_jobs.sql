-- Tenant-scoped export job tracking for data portability and auditability.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_export_status') THEN
    CREATE TYPE public.tenant_export_status AS ENUM (
      'pending',
      'processing',
      'completed',
      'failed',
      'expired'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.tenant_export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  status public.tenant_export_status NOT NULL DEFAULT 'pending',
  export_scope text NOT NULL DEFAULT 'core',
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_export_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.tenant_export_jobs(id) ON DELETE CASCADE,
  nursery_id uuid NOT NULL REFERENCES public.nurseries(id) ON DELETE CASCADE,
  storage_bucket text NOT NULL,
  storage_object_path text NOT NULL,
  checksum_sha256 text NOT NULL,
  bytes_size bigint,
  file_format text NOT NULL DEFAULT 'json',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_export_artifacts_job_path_unique UNIQUE (job_id, storage_object_path)
);

CREATE INDEX IF NOT EXISTS idx_tenant_export_jobs_nursery_id
  ON public.tenant_export_jobs(nursery_id);
CREATE INDEX IF NOT EXISTS idx_tenant_export_jobs_requested_by
  ON public.tenant_export_jobs(requested_by);
CREATE INDEX IF NOT EXISTS idx_tenant_export_jobs_status
  ON public.tenant_export_jobs(status);
CREATE INDEX IF NOT EXISTS idx_tenant_export_artifacts_nursery_id
  ON public.tenant_export_artifacts(nursery_id);
CREATE INDEX IF NOT EXISTS idx_tenant_export_artifacts_job_id
  ON public.tenant_export_artifacts(job_id);

DROP TRIGGER IF EXISTS trg_tenant_export_jobs_updated_at ON public.tenant_export_jobs;
CREATE TRIGGER trg_tenant_export_jobs_updated_at
BEFORE UPDATE ON public.tenant_export_jobs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tenant_export_artifacts_updated_at ON public.tenant_export_artifacts;
CREATE TRIGGER trg_tenant_export_artifacts_updated_at
BEFORE UPDATE ON public.tenant_export_artifacts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tenant_export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_export_artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_export_jobs_select ON public.tenant_export_jobs;
CREATE POLICY tenant_export_jobs_select
ON public.tenant_export_jobs
FOR SELECT
TO authenticated
USING (
  public.is_xo_super_admin()
  OR (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND (
      nursery_id = public.current_user_nursery_id()
      OR (
        public.current_user_role() = 'chain_super_admin'
        AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
      )
    )
  )
  OR requested_by = auth.uid()
);

DROP POLICY IF EXISTS tenant_export_jobs_insert ON public.tenant_export_jobs;
CREATE POLICY tenant_export_jobs_insert
ON public.tenant_export_jobs
FOR INSERT
TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND (
    public.is_xo_super_admin()
    OR (
      public.current_user_role() IN ('branch_admin', 'chain_super_admin')
      AND (
        nursery_id = public.current_user_nursery_id()
        OR (
          public.current_user_role() = 'chain_super_admin'
          AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
        )
      )
    )
  )
);

DROP POLICY IF EXISTS tenant_export_jobs_update ON public.tenant_export_jobs;
CREATE POLICY tenant_export_jobs_update
ON public.tenant_export_jobs
FOR UPDATE
TO authenticated
USING (
  public.is_xo_super_admin()
  OR (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND (
      nursery_id = public.current_user_nursery_id()
      OR (
        public.current_user_role() = 'chain_super_admin'
        AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
      )
    )
  )
)
WITH CHECK (
  public.is_xo_super_admin()
  OR (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND (
      nursery_id = public.current_user_nursery_id()
      OR (
        public.current_user_role() = 'chain_super_admin'
        AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
      )
    )
  )
);

DROP POLICY IF EXISTS tenant_export_artifacts_select ON public.tenant_export_artifacts;
CREATE POLICY tenant_export_artifacts_select
ON public.tenant_export_artifacts
FOR SELECT
TO authenticated
USING (
  public.is_xo_super_admin()
  OR (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND (
      nursery_id = public.current_user_nursery_id()
      OR (
        public.current_user_role() = 'chain_super_admin'
        AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
      )
    )
  )
);

DROP POLICY IF EXISTS tenant_export_artifacts_insert ON public.tenant_export_artifacts;
CREATE POLICY tenant_export_artifacts_insert
ON public.tenant_export_artifacts
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_xo_super_admin()
  OR (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND (
      nursery_id = public.current_user_nursery_id()
      OR (
        public.current_user_role() = 'chain_super_admin'
        AND nursery_id IN (SELECT public.nursery_ids_for_chain_admin())
      )
    )
  )
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tenant-exports',
  'tenant-exports',
  false,
  52428800,
  ARRAY['application/json']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Tenant exports read" ON storage.objects;
CREATE POLICY "Tenant exports read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'tenant-exports'
  AND (
    public.is_xo_super_admin()
    OR (
      public.current_user_role() IN ('branch_admin', 'chain_super_admin')
      AND split_part(name, '/', 1) IN (
        SELECT id::text
        FROM public.nurseries
        WHERE id = public.current_user_nursery_id()
           OR (
             public.current_user_role() = 'chain_super_admin'
             AND chain_id = public.current_user_chain_id()
           )
      )
    )
  )
);

DROP POLICY IF EXISTS "Tenant exports write" ON storage.objects;
CREATE POLICY "Tenant exports write"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tenant-exports'
  AND (
    public.is_xo_super_admin()
    OR (
      public.current_user_role() IN ('branch_admin', 'chain_super_admin')
      AND split_part(name, '/', 1) IN (
        SELECT id::text
        FROM public.nurseries
        WHERE id = public.current_user_nursery_id()
           OR (
             public.current_user_role() = 'chain_super_admin'
             AND chain_id = public.current_user_chain_id()
           )
      )
    )
  )
);

BEGIN;

CREATE TABLE public.qr_manual_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_token_id uuid NOT NULL REFERENCES public.qr_tokens (id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  issued_by uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_qr_manual_codes_lookup
  ON public.qr_manual_codes (nursery_id, code_hash, expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.qr_manual_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qr_manual_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.qr_manual_codes TO service_role;

CREATE TABLE public.qr_manual_code_attempts (
  staff_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  PRIMARY KEY (staff_id, nursery_id)
);

ALTER TABLE public.qr_manual_code_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qr_manual_code_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.qr_manual_code_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.issue_qr_manual_code(
  p_qr_token_id uuid,
  p_issued_by uuid,
  p_nursery_id uuid,
  p_code_hash text
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_child_id uuid;
  v_expires_at timestamptz;
  v_manual_code_id uuid;
BEGIN
  SELECT child_id
  INTO v_child_id
  FROM public.qr_tokens
  WHERE id = p_qr_token_id
    AND issued_by = p_issued_by
    AND nursery_id = p_nursery_id
    AND purpose = 'parent'
    AND single_use = false
  FOR UPDATE;

  IF v_child_id IS NULL THEN
    RAISE EXCEPTION 'QR token is not eligible for a manual code' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.qr_manual_codes
  WHERE expires_at <= now() OR revoked_at IS NOT NULL;

  v_expires_at := now() + interval '5 minutes';
  INSERT INTO public.qr_manual_codes (
    qr_token_id, child_id, nursery_id, issued_by, code_hash, expires_at
  )
  VALUES (
    p_qr_token_id, v_child_id, p_nursery_id, p_issued_by, p_code_hash, v_expires_at
  )
  ON CONFLICT (code_hash) DO NOTHING
  RETURNING id INTO v_manual_code_id;

  IF v_manual_code_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.qr_manual_codes
  SET revoked_at = now()
  WHERE qr_token_id = p_qr_token_id
    AND id <> v_manual_code_id
    AND revoked_at IS NULL;

  RETURN v_expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.lookup_qr_manual_code(
  p_staff_id uuid,
  p_nursery_id uuid,
  p_code_hash text
)
RETURNS TABLE(qr_token_id uuid, rate_limited boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qr_token_id uuid;
  v_attempts integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = p_staff_id
      AND nursery_id = p_nursery_id
      AND role IN ('teacher', 'branch_admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'Only nursery staff can look up manual QR codes' USING ERRCODE = '42501';
  END IF;

  SELECT c.qr_token_id
  INTO v_qr_token_id
  FROM public.qr_manual_codes AS c
  JOIN public.qr_tokens AS q ON q.id = c.qr_token_id
  WHERE c.code_hash = p_code_hash
    AND c.nursery_id = p_nursery_id
    AND c.revoked_at IS NULL
    AND c.expires_at > now()
    AND q.expires_at > now();

  IF v_qr_token_id IS NOT NULL THEN
    RETURN QUERY SELECT v_qr_token_id, false;
    RETURN;
  END IF;

  INSERT INTO public.qr_manual_code_attempts AS current_attempt (
    staff_id, nursery_id, window_started_at, attempts
  )
  VALUES (p_staff_id, p_nursery_id, now(), 1)
  ON CONFLICT (staff_id, nursery_id) DO UPDATE
  SET attempts = CASE
        WHEN current_attempt.window_started_at <= now() - interval '10 minutes' THEN 1
        ELSE current_attempt.attempts + 1
      END,
      window_started_at = CASE
        WHEN current_attempt.window_started_at <= now() - interval '10 minutes' THEN now()
        ELSE current_attempt.window_started_at
      END
  RETURNING attempts INTO v_attempts;

  RETURN QUERY SELECT NULL::uuid, v_attempts > 5;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_qr_manual_code(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_qr_manual_code(uuid, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.lookup_qr_manual_code(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_qr_manual_code(uuid, uuid, text) TO service_role;

COMMIT;

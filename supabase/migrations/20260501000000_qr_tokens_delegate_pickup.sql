-- Delegate pickup support for qr_tokens.
-- Parent QRs stay multi-use within their TTL; delegate QRs are one-time use,
-- tied to a free-text pickup person name, and self-invalidate on first scan.

BEGIN;

ALTER TABLE public.qr_tokens
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'parent';

ALTER TABLE public.qr_tokens
  DROP CONSTRAINT IF EXISTS qr_tokens_purpose_check;
ALTER TABLE public.qr_tokens
  ADD CONSTRAINT qr_tokens_purpose_check CHECK (purpose IN ('parent', 'delegate'));

ALTER TABLE public.qr_tokens
  ADD COLUMN IF NOT EXISTS delegate_name text;

ALTER TABLE public.qr_tokens
  ADD COLUMN IF NOT EXISTS single_use boolean NOT NULL DEFAULT false;

ALTER TABLE public.qr_tokens
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz;

ALTER TABLE public.qr_tokens
  ADD COLUMN IF NOT EXISTS issued_by uuid REFERENCES public.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.qr_tokens.purpose IS
  'parent = parent shows their own pickup QR (multi-use within TTL). delegate = one-time-use QR for a named pickup person (e.g. driver, grandparent).';
COMMENT ON COLUMN public.qr_tokens.delegate_name IS
  'Free-text name of the person picking up the child. Required when purpose=delegate. Surfaced to the verifier scanner.';
COMMENT ON COLUMN public.qr_tokens.single_use IS
  'When true, qr-verify rejects on second scan and stamps consumed_at on first success.';
COMMENT ON COLUMN public.qr_tokens.consumed_at IS
  'Set by qr-verify on the first successful scan when single_use=true. Re-scans then fail.';
COMMENT ON COLUMN public.qr_tokens.issued_by IS
  'User who generated this token (for audit). For parent/delegate QRs this is the parent.';

CREATE INDEX IF NOT EXISTS idx_qr_tokens_purpose ON public.qr_tokens (purpose);

COMMIT;

-- Rich identity details for parent-created pickup QR tokens.
-- Parent QR remains permanent/self pickup; delegate QR can carry custom pickup
-- person identity for teacher verification at the gate.

BEGIN;

ALTER TABLE public.qr_tokens
  ADD COLUMN IF NOT EXISTS pickup_person_full_name text,
  ADD COLUMN IF NOT EXISTS pickup_relationship text,
  ADD COLUMN IF NOT EXISTS pickup_identity_type text,
  ADD COLUMN IF NOT EXISTS pickup_identity_number text,
  ADD COLUMN IF NOT EXISTS pickup_identity_image_path text,
  ADD COLUMN IF NOT EXISTS pickup_notes text,
  ADD COLUMN IF NOT EXISTS require_id_capture boolean NOT NULL DEFAULT true;

ALTER TABLE public.qr_tokens
  DROP CONSTRAINT IF EXISTS qr_tokens_pickup_identity_type_check;

ALTER TABLE public.qr_tokens
  ADD CONSTRAINT qr_tokens_pickup_identity_type_check
  CHECK (
    pickup_identity_type IS NULL
    OR pickup_identity_type IN ('national_id', 'passport', 'other')
  );

COMMENT ON COLUMN public.qr_tokens.pickup_person_full_name IS
  'Full name entered by parent for custom pickup QR verification.';
COMMENT ON COLUMN public.qr_tokens.pickup_relationship IS
  'Relationship or role of the pickup person, such as driver, grandparent, aunt, uncle, or other.';
COMMENT ON COLUMN public.qr_tokens.pickup_identity_type IS
  'Identity document type supplied by parent: national_id, passport, or other.';
COMMENT ON COLUMN public.qr_tokens.pickup_identity_number IS
  'National ID, passport, or other identity text supplied for custom QR verification.';
COMMENT ON COLUMN public.qr_tokens.pickup_identity_image_path IS
  'Private storage reference for uploaded identity image, usually application-documents:path.';
COMMENT ON COLUMN public.qr_tokens.pickup_notes IS
  'Optional parent note shown to staff during pickup verification.';
COMMENT ON COLUMN public.qr_tokens.require_id_capture IS
  'Whether staff should capture a live ID photo at checkout confirmation.';

COMMIT;

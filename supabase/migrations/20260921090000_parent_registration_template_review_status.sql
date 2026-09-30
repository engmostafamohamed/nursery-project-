-- Add an intermediate "review" status between draft and active, so an admin can mark a
-- duplicated/edited template ready for a second pair of eyes before publishing it live.
ALTER TABLE public.parent_registration_templates
  DROP CONSTRAINT IF EXISTS parent_registration_templates_status_ck;

ALTER TABLE public.parent_registration_templates
  ADD CONSTRAINT parent_registration_templates_status_ck
  CHECK (status IN ('draft', 'review', 'active', 'archived'));

-- Migration 015: Application Extended Metadata
-- Adds fields for enrollment department, referral source, consent tracking
-- Supports complete application data capture from standard Excel format

-- Add application/enrollment metadata to children table
ALTER TABLE children
  ADD COLUMN IF NOT EXISTS enrollment_department TEXT,
  ADD COLUMN IF NOT EXISTS referral_source TEXT CHECK (referral_source IN ('website', 'friend_family', 'social_media', 'sibling_at_nursery', 'walk_in', 'referral', 'advertisement', 'other'));

COMMENT ON COLUMN children.enrollment_department IS 'Which department/class type child is joining (English, French, Arabic, etc)';
COMMENT ON COLUMN children.referral_source IS 'How parent heard about the nursery - marketing attribution';

-- Add consent tracking to applications table
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS health_medication_policy_accepted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS financial_agreement_accepted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS policies_procedures_accepted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS information_accuracy_confirmed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN applications.health_medication_policy_accepted IS 'Parent accepted health & medication policy';
COMMENT ON COLUMN applications.financial_agreement_accepted IS 'Parent accepted financial agreement';
COMMENT ON COLUMN applications.policies_procedures_accepted IS 'Parent accepted all nursery policies & procedures';
COMMENT ON COLUMN applications.information_accuracy_confirmed IS 'Parent confirmed all information is accurate';
COMMENT ON COLUMN applications.consent_accepted_at IS 'Timestamp when all consents were accepted';
;

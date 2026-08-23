ALTER TABLE children ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE children ADD COLUMN IF NOT EXISTS middle_name text;
ALTER TABLE children ADD COLUMN IF NOT EXISTS last_name text;
ALTER TABLE children ADD COLUMN IF NOT EXISTS school_admissions_plan text;
ALTER TABLE children ADD COLUMN IF NOT EXISTS academic_year text;
ALTER TABLE children ADD COLUMN IF NOT EXISTS has_siblings boolean DEFAULT false;
ALTER TABLE children ADD COLUMN IF NOT EXISTS sibling_ages text;
ALTER TABLE children ADD COLUMN IF NOT EXISTS birth_certificate_url text;
ALTER TABLE children ADD COLUMN IF NOT EXISTS vaccination_card_url text;
ALTER TABLE children ADD COLUMN IF NOT EXISTS daily_care_preferences jsonb;
ALTER TABLE children ADD COLUMN IF NOT EXISTS emergency_contacts jsonb;

COMMENT ON COLUMN children.first_name IS 'Child first name (split from full_name)';
COMMENT ON COLUMN children.middle_name IS 'Child middle name';
COMMENT ON COLUMN children.last_name IS 'Child last name / family name';
COMMENT ON COLUMN children.school_admissions_plan IS 'Parent planned school admissions timeline';
COMMENT ON COLUMN children.academic_year IS 'Academic year of enrollment e.g. 2025-2026';
COMMENT ON COLUMN children.has_siblings IS 'Whether child has siblings';
COMMENT ON COLUMN children.sibling_ages IS 'Ages of siblings (free text)';
COMMENT ON COLUMN children.birth_certificate_url IS 'Storage path to uploaded birth certificate';
COMMENT ON COLUMN children.vaccination_card_url IS 'Storage path to uploaded vaccination card';
COMMENT ON COLUMN children.daily_care_preferences IS 'Structured daily care preferences (meals, diapers, nap, etc)';
COMMENT ON COLUMN children.emergency_contacts IS 'Array of emergency contact objects [{name, phone, relationship}]';

ALTER TABLE parent_children ADD COLUMN IF NOT EXISTS relationship text;
COMMENT ON COLUMN parent_children.relationship IS 'Relationship type: father, mother, guardian';

ALTER TABLE authorized_pickups ADD COLUMN IF NOT EXISTS authorization_level text DEFAULT 'anytime';
COMMENT ON COLUMN authorized_pickups.authorization_level IS 'Pickup authorization level: anytime, scheduled, emergency_only';

ALTER TABLE users ADD COLUMN IF NOT EXISTS occupation text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_photo_url text;
COMMENT ON COLUMN users.occupation IS 'Parent occupation/job title';
COMMENT ON COLUMN users.id_photo_url IS 'URL to parent national ID photo';

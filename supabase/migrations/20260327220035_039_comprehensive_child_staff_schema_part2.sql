-- Migration 039: Comprehensive Child & Staff Schema - Part 2
-- New tables for detailed medical records, documents, consents, vaccinations

-- ============================================================================
-- CHILD HEALTH RECORDS (Restructured per pediatrician recommendations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS child_health_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL UNIQUE REFERENCES children(id) ON DELETE CASCADE,
  pediatrician_name text,
  pediatrician_phone text,
  pediatrician_clinic text,
  has_allergies boolean DEFAULT false,
  has_chronic_conditions boolean DEFAULT false,
  has_medications boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_child_health_records_child_id ON child_health_records(child_id);

DROP TRIGGER IF EXISTS trg_child_health_records_updated_at ON child_health_records;
CREATE TRIGGER trg_child_health_records_updated_at
BEFORE UPDATE ON child_health_records
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- ALLERGIES (Detailed per medical expert)
-- ============================================================================

CREATE TABLE IF NOT EXISTS child_allergies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  health_record_id uuid NOT NULL REFERENCES child_health_records(id) ON DELETE CASCADE,
  allergen text NOT NULL,
  reaction_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('mild', 'moderate', 'severe', 'life_threatening')),
  treatment_protocol text,
  last_reaction_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

-- Guarded: a canonical health schema (051_child_health_system.sql) sorts before
-- this file and creates child_allergies WITHOUT a health_record_id column. Only
-- index health_record_id when this file's version of the table actually won.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'child_allergies'
      AND column_name = 'health_record_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_child_allergies_health_record ON child_allergies(health_record_id);
  END IF;
END $$;

-- ============================================================================
-- CHRONIC CONDITIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS child_chronic_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  health_record_id uuid NOT NULL REFERENCES child_health_records(id) ON DELETE CASCADE,
  condition_name text NOT NULL,
  diagnosis_date date,
  severity text CHECK (severity IN ('mild', 'moderate', 'severe')),
  treatment_protocol text,
  trigger_factors text,
  emergency_response text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

-- Guarded for the same reason as child_allergies above (051 may own this table).
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'child_chronic_conditions'
      AND column_name = 'health_record_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_child_chronic_conditions_health_record ON child_chronic_conditions(health_record_id);
  END IF;
END $$;

-- ============================================================================
-- MEDICATIONS (Daily medications tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS child_medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  health_record_id uuid NOT NULL REFERENCES child_health_records(id) ON DELETE CASCADE,
  medication_name text NOT NULL,
  generic_name text,
  dosage text NOT NULL,
  administration_times text[],
  administration_method text CHECK (administration_method IN ('oral', 'inhaler', 'injection', 'topical')),
  storage_requirements text,
  expiry_date date,
  parent_consent_given boolean DEFAULT false,
  parent_consent_date date,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

-- Guarded: 051_child_health_system.sql owns child_medications with a child_id/
-- nursery_id shape (no health_record_id / is_active). Only build these indexes
-- when this file's version of the table actually won.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'child_medications'
      AND column_name = 'health_record_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_child_medications_health_record ON child_medications(health_record_id);
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'child_medications'
      AND column_name = 'is_active'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_child_medications_active ON child_medications(is_active) WHERE is_active = true;
  END IF;
END $$;

-- ============================================================================
-- VACCINATIONS (Egyptian Ministry of Health requirements)
-- ============================================================================

CREATE TABLE IF NOT EXISTS child_vaccinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  vaccine_name text NOT NULL CHECK (vaccine_name IN ('BCG', 'Hepatitis_B', 'Polio', 'DTP', 'MMR', 'Hepatitis_A', 'Other')),
  dose_number int,
  date_administered date NOT NULL,
  next_due_date date,
  administered_by text,
  batch_number text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_child_vaccinations_child_id ON child_vaccinations(child_id);
CREATE INDEX IF NOT EXISTS idx_child_vaccinations_next_due ON child_vaccinations(next_due_date) WHERE next_due_date IS NOT NULL;

-- ============================================================================
-- CHILD DOCUMENTS (Birth cert, vaccination card, medical reports)
-- ============================================================================

CREATE TABLE IF NOT EXISTS child_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('birth_certificate', 'vaccination_card', 'medical_report', 'previous_school', 'court_order', 'other')),
  file_url text NOT NULL,
  uploaded_by uuid REFERENCES users(id),
  uploaded_at timestamptz NOT NULL DEFAULT NOW(),
  expiry_date date,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_child_documents_child_id ON child_documents(child_id);
CREATE INDEX IF NOT EXISTS idx_child_documents_type ON child_documents(document_type);

-- ============================================================================
-- PARENTAL CONSENTS (Detailed per legal expert)
-- ============================================================================

CREATE TABLE IF NOT EXISTS parental_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES users(id),
  consent_type text NOT NULL CHECK (consent_type IN (
    'photo_classroom',
    'photo_website',
    'photo_social_media',
    'photo_promotional',
    'field_trips',
    'emergency_medical_treatment',
    'ambulance_transport',
    'hospital_admission',
    'surgical_procedures',
    'data_privacy',
    'behavior_policy',
    'pickup_policy',
    'liability_waiver'
  )),
  granted boolean NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT NOW(),
  signature text,
  witness_name text,
  notes text,
  UNIQUE(child_id, consent_type)
);

CREATE INDEX IF NOT EXISTS idx_parental_consents_child_id ON parental_consents(child_id);
CREATE INDEX IF NOT EXISTS idx_parental_consents_type ON parental_consents(consent_type);

-- ============================================================================
-- TEMPORARY PICKUP CODES (Emergency one-time pickups)
-- ============================================================================

CREATE TABLE IF NOT EXISTS temporary_pickup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  authorized_person_name text NOT NULL,
  authorized_person_id text NOT NULL,
  code text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES users(id),
  valid_until timestamptz NOT NULL,
  used_at timestamptz,
  used_by uuid REFERENCES users(id),
  status text CHECK (status IN ('active', 'used', 'expired', 'cancelled')) DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_temp_pickup_codes_child_id ON temporary_pickup_codes(child_id);
CREATE INDEX IF NOT EXISTS idx_temp_pickup_codes_code ON temporary_pickup_codes(code);
CREATE INDEX IF NOT EXISTS idx_temp_pickup_codes_status ON temporary_pickup_codes(status) WHERE status = 'active';

COMMENT ON TABLE child_health_records IS 'Medical information per pediatrician expert requirements';
COMMENT ON TABLE child_allergies IS 'Detailed allergy tracking - CRITICAL for child safety';
COMMENT ON TABLE child_chronic_conditions IS 'Chronic conditions like asthma, diabetes, epilepsy';
COMMENT ON TABLE child_medications IS 'Daily medications with administration schedule';
COMMENT ON TABLE child_vaccinations IS 'Egyptian Ministry of Health vaccination tracking';
COMMENT ON TABLE child_documents IS 'Required legal documents: birth cert, vaccination card, etc';
COMMENT ON TABLE parental_consents IS 'Detailed consents per legal expert - separate for each type';
COMMENT ON TABLE temporary_pickup_codes IS 'Emergency one-time pickup authorization system';
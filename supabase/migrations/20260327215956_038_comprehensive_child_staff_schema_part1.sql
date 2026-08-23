-- Migration 038: Comprehensive Child & Staff Schema - Part 1
-- Based on expert panel review: Early Childhood, Legal, Medical, HR experts
-- This migration adds critical fields to existing children and staff_profiles tables

-- ============================================================================
-- CHILDREN TABLE ENHANCEMENTS
-- ============================================================================

-- Developmental & Educational
ALTER TABLE children ADD COLUMN IF NOT EXISTS developmental_screening jsonb;
ALTER TABLE children ADD COLUMN IF NOT EXISTS previous_nursery text;
ALTER TABLE children ADD COLUMN IF NOT EXISTS previous_nursery_duration text;
ALTER TABLE children ADD COLUMN IF NOT EXISTS reason_for_leaving text;
ALTER TABLE children ADD COLUMN IF NOT EXISTS language_spoken_at_home text;
ALTER TABLE children ADD COLUMN IF NOT EXISTS language_proficiency text CHECK (language_proficiency IN ('beginner', 'intermediate', 'fluent'));
ALTER TABLE children ADD COLUMN IF NOT EXISTS toilet_training_status text CHECK (toilet_training_status IN ('not_started', 'in_progress', 'completed'));
ALTER TABLE children ADD COLUMN IF NOT EXISTS sleep_nap_duration int; -- minutes
ALTER TABLE children ADD COLUMN IF NOT EXISTS temperament text;
ALTER TABLE children ADD COLUMN IF NOT EXISTS comfort_items text;
ALTER TABLE children ADD COLUMN IF NOT EXISTS separation_anxiety boolean DEFAULT false;

-- Cultural/Religious
ALTER TABLE children ADD COLUMN IF NOT EXISTS religious_denomination text;
ALTER TABLE children ADD COLUMN IF NOT EXISTS cultural_practices text;
ALTER TABLE children ADD COLUMN IF NOT EXISTS religious_holidays_observed text[];

-- Legal/Custody (CRITICAL!)
ALTER TABLE children ADD COLUMN IF NOT EXISTS custody_status text CHECK (custody_status IN ('both_parents', 'father', 'mother', 'legal_guardian', 'court_order'));
ALTER TABLE children ADD COLUMN IF NOT EXISTS custody_document_url text;
ALTER TABLE children ADD COLUMN IF NOT EXISTS marriage_certificate_url text;

-- Basic Medical (moved from health_records for quick access)
ALTER TABLE children ADD COLUMN IF NOT EXISTS birth_certificate_no text;
ALTER TABLE children ADD COLUMN IF NOT EXISTS nationality text DEFAULT 'Egyptian';
ALTER TABLE children ADD COLUMN IF NOT EXISTS blood_type text CHECK (blood_type IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'));

-- Enrollment Details
ALTER TABLE children ADD COLUMN IF NOT EXISTS enrollment_date date;
ALTER TABLE children ADD COLUMN IF NOT EXISTS enrollment_type text CHECK (enrollment_type IN ('full_day', 'half_day', 'flexible'));
ALTER TABLE children ADD COLUMN IF NOT EXISTS enrollment_status text CHECK (enrollment_status IN ('pending', 'active', 'graduated', 'withdrawn')) DEFAULT 'active';
ALTER TABLE children ADD COLUMN IF NOT EXISTS child_id_number text UNIQUE; -- CH-2025-00001

-- ============================================================================
-- STAFF_PROFILES TABLE ENHANCEMENTS
-- ============================================================================

-- Background Checks (MANDATORY for childcare workers!)
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS criminal_record_check_date date;
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS criminal_record_check_expiry date;
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS criminal_record_status text CHECK (criminal_record_status IN ('pending', 'clear', 'flagged'));
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS reference_check_completed boolean DEFAULT false;
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS reference_1_name text;
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS reference_1_phone text;
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS reference_1_verified_date date;
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS reference_2_name text;
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS reference_2_phone text;
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS reference_2_verified_date date;
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS child_protection_training_date date;
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS child_protection_training_expiry date;

-- Payroll Details (Egyptian Labor Law compliant)
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS base_salary numeric(10,2);
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS transport_allowance numeric(10,2) DEFAULT 0;
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS housing_allowance numeric(10,2) DEFAULT 0;
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS meal_allowance numeric(10,2) DEFAULT 0;
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS phone_allowance numeric(10,2) DEFAULT 0;

-- Social Insurance (MANDATORY in Egypt)
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS social_insurance_employee_rate numeric(5,2) DEFAULT 14.00;
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS social_insurance_employer_rate numeric(5,2) DEFAULT 26.00;

-- Work Schedule
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS work_start_time time;
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS work_end_time time;
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS working_days text[] DEFAULT '{Sunday,Monday,Tuesday,Wednesday,Thursday}';
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS weekly_hours int;

-- Leave Balances
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS annual_leave_balance numeric(5,2) DEFAULT 0;
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS sick_leave_used int DEFAULT 0;

-- Probation Tracking
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS probation_end_date date;
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS probation_evaluation_1_month date;
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS probation_evaluation_2_month date;
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS probation_confirmed boolean DEFAULT false;

-- Alert Flags
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS contract_renewal_alert_sent boolean DEFAULT false;
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS probation_alert_sent boolean DEFAULT false;

-- ============================================================================
-- PARENT_CHILDREN TABLE ENHANCEMENTS
-- ============================================================================

ALTER TABLE parent_children ADD COLUMN IF NOT EXISTS parent_type text CHECK (parent_type IN ('father', 'mother', 'guardian'));
ALTER TABLE parent_children ADD COLUMN IF NOT EXISTS national_id text;
ALTER TABLE parent_children ADD COLUMN IF NOT EXISTS occupation text;
ALTER TABLE parent_children ADD COLUMN IF NOT EXISTS workplace text;
ALTER TABLE parent_children ADD COLUMN IF NOT EXISTS work_address text;
ALTER TABLE parent_children ADD COLUMN IF NOT EXISTS is_primary boolean DEFAULT false;
ALTER TABLE parent_children ADD COLUMN IF NOT EXISTS is_emergency_contact boolean DEFAULT false;

-- ============================================================================
-- AUTHORIZED_PICKUPS TABLE ENHANCEMENTS
-- ============================================================================

ALTER TABLE authorized_pickups ADD COLUMN IF NOT EXISTS national_id text;
ALTER TABLE authorized_pickups ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE authorized_pickups ADD COLUMN IF NOT EXISTS mobile_phone text;
ALTER TABLE authorized_pickups ADD COLUMN IF NOT EXISTS valid_from date DEFAULT CURRENT_DATE;
ALTER TABLE authorized_pickups ADD COLUMN IF NOT EXISTS valid_until date;
ALTER TABLE authorized_pickups ADD COLUMN IF NOT EXISTS can_pickup boolean DEFAULT true;
ALTER TABLE authorized_pickups ADD COLUMN IF NOT EXISTS can_dropoff boolean DEFAULT true;
ALTER TABLE authorized_pickups ADD COLUMN IF NOT EXISTS can_authorize_medical boolean DEFAULT false;
ALTER TABLE authorized_pickups ADD COLUMN IF NOT EXISTS verification_status text CHECK (verification_status IN ('pending', 'verified', 'rejected')) DEFAULT 'verified';

COMMENT ON TABLE children IS 'Enhanced with expert recommendations: developmental, legal/custody, cultural fields';
COMMENT ON TABLE staff_profiles IS 'Enhanced with HR expert recommendations: Egyptian labor law compliance';
COMMENT ON TABLE parent_children IS 'Enhanced with family details for proper parent management';
COMMENT ON TABLE authorized_pickups IS 'Enhanced with safety requirements: ID verification, photos, validity dates';;

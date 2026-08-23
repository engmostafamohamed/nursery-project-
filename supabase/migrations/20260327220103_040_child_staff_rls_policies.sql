-- Migration 040: RLS Policies for new child/staff tables
-- Note: RLS temporarily disabled on some tables due to recursion bug (migrations 034-037)
-- These policies are created for when RLS is re-enabled properly

-- ============================================================================
-- CHILD HEALTH RECORDS RLS
-- ============================================================================

ALTER TABLE child_health_records ENABLE ROW LEVEL SECURITY;

-- Parents can view their own child's health records
CREATE POLICY child_health_parent_select
  ON child_health_records FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parent_children pc
      JOIN children c ON pc.child_id = c.id
      WHERE c.id = child_health_records.child_id
        AND pc.parent_id = auth.uid()
    )
  );

-- Staff can view all health records in their nursery
CREATE POLICY child_health_staff_select
  ON child_health_records FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM children c
      JOIN users u ON u.nursery_id = c.nursery_id
      WHERE c.id = child_health_records.child_id
        AND u.id = auth.uid()
        AND u.role IN ('branch_admin', 'teacher', 'chain_super_admin', 'xo_super_admin')
    )
  );

-- Only admins can insert/update health records
CREATE POLICY child_health_admin_all
  ON child_health_records FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM children c
      JOIN users u ON u.nursery_id = c.nursery_id
      WHERE c.id = child_health_records.child_id
        AND u.id = auth.uid()
        AND u.role IN ('branch_admin', 'chain_super_admin', 'xo_super_admin')
    )
  );

-- ============================================================================
-- ALLERGIES, CONDITIONS, MEDICATIONS - Same RLS pattern
-- ============================================================================

ALTER TABLE child_allergies ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_chronic_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_medications ENABLE ROW LEVEL SECURITY;

-- Parents via health_record_id.
-- Guarded: the canonical health schema (051_child_health_system.sql) sorts before
-- this file, owns these tables with a child_id/nursery_id shape (no
-- health_record_id), and already defines parent-SELECT policies. Only create
-- these (older-design) policies when this file's table shape actually won and the
-- policy name is still free.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'child_allergies' AND column_name = 'health_record_id')
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'child_allergies' AND policyname = 'child_allergies_parent_select') THEN
    EXECUTE $p$ CREATE POLICY child_allergies_parent_select ON child_allergies FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM child_health_records chr JOIN children c ON chr.child_id = c.id JOIN parent_children pc ON pc.child_id = c.id WHERE chr.id = child_allergies.health_record_id AND pc.parent_id = auth.uid())) $p$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'child_chronic_conditions' AND column_name = 'health_record_id')
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'child_chronic_conditions' AND policyname = 'child_conditions_parent_select') THEN
    EXECUTE $p$ CREATE POLICY child_conditions_parent_select ON child_chronic_conditions FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM child_health_records chr JOIN children c ON chr.child_id = c.id JOIN parent_children pc ON pc.child_id = c.id WHERE chr.id = child_chronic_conditions.health_record_id AND pc.parent_id = auth.uid())) $p$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'child_medications' AND column_name = 'health_record_id')
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'child_medications' AND policyname = 'child_medications_parent_select') THEN
    EXECUTE $p$ CREATE POLICY child_medications_parent_select ON child_medications FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM child_health_records chr JOIN children c ON chr.child_id = c.id JOIN parent_children pc ON pc.child_id = c.id WHERE chr.id = child_medications.health_record_id AND pc.parent_id = auth.uid())) $p$;
  END IF;
END $$;

-- ============================================================================
-- VACCINATIONS RLS
-- ============================================================================

ALTER TABLE child_vaccinations ENABLE ROW LEVEL SECURITY;

-- Guarded: 051_child_health_system.sql already defines this exact policy name.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'child_vaccinations' AND policyname = 'child_vaccinations_parent_select') THEN
    EXECUTE $p$ CREATE POLICY child_vaccinations_parent_select ON child_vaccinations FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM parent_children pc WHERE pc.child_id = child_vaccinations.child_id AND pc.parent_id = auth.uid())) $p$;
  END IF;
END $$;

-- ============================================================================
-- DOCUMENTS & CONSENTS RLS
-- ============================================================================

ALTER TABLE child_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE parental_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY child_documents_parent_select
  ON child_documents FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM parent_children pc
      WHERE pc.child_id = child_documents.child_id
        AND pc.parent_id = auth.uid()
    )
  );

CREATE POLICY parental_consents_parent_all
  ON parental_consents FOR ALL TO authenticated
  USING (parent_id = auth.uid())
  WITH CHECK (parent_id = auth.uid());

-- ============================================================================
-- TEMPORARY PICKUP CODES RLS
-- ============================================================================

ALTER TABLE temporary_pickup_codes ENABLE ROW LEVEL SECURITY;

-- Parents can create codes for their children
CREATE POLICY temp_pickup_parent_insert
  ON temporary_pickup_codes FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM parent_children pc
      WHERE pc.child_id = temporary_pickup_codes.child_id
        AND pc.parent_id = auth.uid()
    )
  );

-- Parents can view their own codes
CREATE POLICY temp_pickup_parent_select
  ON temporary_pickup_codes FOR SELECT TO authenticated
  USING (created_by = auth.uid());

-- Staff can view active codes for verification
CREATE POLICY temp_pickup_staff_select
  ON temporary_pickup_codes FOR SELECT TO authenticated
  USING (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM children c
      JOIN users u ON u.nursery_id = c.nursery_id
      WHERE c.id = temporary_pickup_codes.child_id
        AND u.id = auth.uid()
        AND u.role IN ('branch_admin', 'teacher')
    )
  );

-- Staff can update codes when used
CREATE POLICY temp_pickup_staff_update
  ON temporary_pickup_codes FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM children c
      JOIN users u ON u.nursery_id = c.nursery_id
      WHERE c.id = temporary_pickup_codes.child_id
        AND u.id = auth.uid()
        AND u.role IN ('branch_admin', 'teacher')
    )
  );

COMMENT ON POLICY child_health_parent_select ON child_health_records IS 'Parents can view their own child health records';
COMMENT ON POLICY temp_pickup_parent_insert ON temporary_pickup_codes IS 'Parents can create emergency pickup codes for their children';;

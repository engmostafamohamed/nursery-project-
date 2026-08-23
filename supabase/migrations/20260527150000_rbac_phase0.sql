-- =============================================================================
-- Migration: 20260527150000_rbac_phase0
--
-- Goal: replace the three hard-coded permission pillars with database-driven
-- tables so admins can create features, roles, and positions at runtime.
--
-- This is Phase 0 — additive only. After this migration:
--   * No code change required for the app to keep working
--   * Existing permission engine (src/lib/permissions/matrix.ts) still drives
--     the UI; the new tables are populated but not yet read by the engine
--   * Phase 1 will swap the engine to read from these tables
--
-- Tables created (5):
--   public.features         — registry of feature keys (25 seed rows)
--   public.roles            — custom roles (8 seed rows derived from user_role enum)
--   public.role_features    — sparse matrix replacing PERMISSION_MATRIX
--   public.positions        — replaces StaffPosition union (8 seed rows)
--   public.role_assignments_log — audit trail for role changes via sync trigger
--
-- Columns added:
--   public.users.role_id          uuid → roles.id  (overlay on top of role enum)
--   public.staff_profiles.position_id uuid → positions.id
--
-- Sync trigger:
--   When staff_profiles.position_id changes, the linked users row is updated
--   to match the role attached to that position (role_id, role, department).
--
-- Reuses existing helpers:
--   public.is_xo_super_admin()           — from 20260525130000
--   public.rls_staff_manages_nursery(uuid) — from 20260521120100/200
--   public.current_user_role()           — from 20260521120100
--
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. features
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.features (
  id text PRIMARY KEY,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  category text,
  description_en text,
  description_ar text,
  is_seed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2. roles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NULL REFERENCES public.nurseries(id) ON DELETE CASCADE,
  key text NOT NULL,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  base_role public.user_role NOT NULL,
  base_department public.user_department NULL,
  is_seed boolean NOT NULL DEFAULT false,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roles_key_unique UNIQUE (nursery_id, key),
  CONSTRAINT roles_department_role_ck CHECK (
    base_department IS NULL OR base_role = 'manager'
  )
);

-- -----------------------------------------------------------------------------
-- 3. role_features
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_features (
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  feature_id text NOT NULL REFERENCES public.features(id) ON DELETE CASCADE,
  access text NOT NULL,
  PRIMARY KEY (role_id, feature_id),
  CONSTRAINT role_features_access_ck CHECK (access IN ('full', 'with_approval'))
);

-- -----------------------------------------------------------------------------
-- 4. positions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NULL REFERENCES public.nurseries(id) ON DELETE CASCADE,
  key text NOT NULL,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  role_id uuid NOT NULL REFERENCES public.roles(id),
  is_seed boolean NOT NULL DEFAULT false,
  created_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT positions_key_unique UNIQUE (nursery_id, key)
);

-- -----------------------------------------------------------------------------
-- 5. role_assignments_log
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_assignments_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  old_role_id uuid NULL REFERENCES public.roles(id) ON DELETE SET NULL,
  new_role_id uuid NULL REFERENCES public.roles(id) ON DELETE SET NULL,
  changed_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text NULL
);

CREATE INDEX IF NOT EXISTS idx_role_assignments_log_user ON public.role_assignments_log(user_id);
CREATE INDEX IF NOT EXISTS idx_role_assignments_log_changed_at ON public.role_assignments_log(changed_at DESC);

-- -----------------------------------------------------------------------------
-- 6. ADD COLUMNS: users.role_id, staff_profiles.position_id
-- -----------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role_id uuid NULL REFERENCES public.roles(id);

ALTER TABLE public.staff_profiles
  ADD COLUMN IF NOT EXISTS position_id uuid NULL REFERENCES public.positions(id);

CREATE INDEX IF NOT EXISTS idx_users_role_id ON public.users(role_id);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_position_id ON public.staff_profiles(position_id);

-- -----------------------------------------------------------------------------
-- 7. SEED FEATURES (25 rows mirroring src/lib/permissions/types.ts FeatureKey)
-- -----------------------------------------------------------------------------
INSERT INTO public.features (id, name_en, name_ar, category, is_seed) VALUES
  ('dashboard_attendance', 'Dashboard Attendance',     'لوحة الحضور',              'operations', true),
  ('dashboard_finance',    'Dashboard Finance',        'لوحة المالية',             'finance',    true),
  ('newsfeed',             'Newsfeed',                 'آخر الأخبار',              'comms',      true),
  ('kids_applications',    'Kids Applications',        'طلبات الأطفال',            'admissions', true),
  ('staff',                'Staff',                    'الموظفون',                 'hr',         true),
  ('classes',              'Classes',                  'الفصول',                   'operations', true),
  ('admissions',           'Admissions',               'القبول',                   'admissions', true),
  ('permissions',          'Permissions',              'الصلاحيات',                'admin',      true),
  ('event_calendar',       'Event Calendar',           'تقويم الفعاليات',          'operations', true),
  ('financial_reports',    'Financial Reports',        'التقارير المالية',         'finance',    true),
  ('notifications',        'Notifications',            'الإشعارات',                'comms',      true),
  ('media_library',        'Media Library',            'مكتبة الوسائط',            'media',      true),
  ('upload_media',         'Upload Media',             'رفع الوسائط',              'media',      true),
  ('content_library',      'Content Library',          'مكتبة المحتوى',            'media',      true),
  ('surveys',              'Surveys',                  'الاستبيانات',              'operations', true),
  ('messages',             'Messages',                 'الرسائل',                  'comms',      true),
  ('daily_reports',        'Daily Reports',            'التقارير اليومية',         'operations', true),
  ('child_enrollment',     'Child Enrollment',         'تسجيل الأطفال',            'admissions', true),
  ('staff_onboarding',     'Staff Onboarding',         'إدخال الموظفين',           'hr',         true),
  ('inventory',            'Inventory',                'المخزون',                  'operations', true),
  ('meals',                'Meals',                    'الوجبات',                  'operations', true),
  ('qr_code',              'QR Code',                  'رمز QR',                   'operations', true),
  ('health_alerts',        'Health Alerts',            'التنبيهات الصحية',         'operations', true),
  ('loyalty',              'Loyalty',                  'برنامج الولاء',            'finance',    true),
  ('broadcast_messages',   'Broadcast Messages',       'الرسائل الجماعية',         'comms',      true)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 8. SEED ROLES (8 rows covering every user_role × department combination)
--    Use deterministic UUIDs so backfill below can reference them by lookup.
-- -----------------------------------------------------------------------------
INSERT INTO public.roles (key, name_en, name_ar, base_role, base_department, is_seed, nursery_id) VALUES
  ('super_admin',          'Super Admin',          'مسؤول النظام',           'xo_super_admin',    NULL,         true, NULL),
  ('chain_admin',          'Chain Admin',          'مسؤول السلسلة',          'chain_super_admin', NULL,         true, NULL),
  ('branch_admin',         'Branch Admin',         'مسؤول الفرع',            'branch_admin',      NULL,         true, NULL),
  ('manager_finance',      'Manager — Finance',    'مدير - مالية',           'manager',           'finance',    true, NULL),
  ('manager_hr',           'Manager — HR',         'مدير - موارد بشرية',     'manager',           'hr',         true, NULL),
  ('manager_operations',   'Manager — Operations', 'مدير - عمليات',          'manager',           'operations', true, NULL),
  ('teacher',              'Teacher',              'معلم',                   'teacher',           NULL,         true, NULL),
  ('parent',               'Parent',               'ولي أمر',                'parent',            NULL,         true, NULL)
ON CONFLICT (nursery_id, key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 9. SEED role_features — mirrors src/lib/permissions/matrix.ts exactly.
--    Sparse: only insert 'full' or 'with_approval' rows. Absence = 'none'.
--    Top Management roles (chain_admin, branch_admin) and managers get the
--    matrix's "topManagement" / "manager" cells respectively.
--    super_admin (xo) is intentionally NOT seeded here — the engine
--    short-circuits xo to full access regardless of role_features.
-- -----------------------------------------------------------------------------

-- Helper CTE to expand the matrix
WITH role_ids AS (
  SELECT
    (SELECT id FROM public.roles WHERE key = 'super_admin'        AND nursery_id IS NULL) AS super_id,
    (SELECT id FROM public.roles WHERE key = 'chain_admin'        AND nursery_id IS NULL) AS chain_id,
    (SELECT id FROM public.roles WHERE key = 'branch_admin'       AND nursery_id IS NULL) AS branch_id,
    (SELECT id FROM public.roles WHERE key = 'manager_finance'    AND nursery_id IS NULL) AS mgr_fin_id,
    (SELECT id FROM public.roles WHERE key = 'manager_hr'         AND nursery_id IS NULL) AS mgr_hr_id,
    (SELECT id FROM public.roles WHERE key = 'manager_operations' AND nursery_id IS NULL) AS mgr_ops_id,
    (SELECT id FROM public.roles WHERE key = 'teacher'            AND nursery_id IS NULL) AS teacher_id
),
matrix(feature_id, tm, mgr_fin, mgr_hr, mgr_ops, teacher) AS (VALUES
  -- feature_id           tm     mgr_fin mgr_hr  mgr_ops teacher
  ('dashboard_attendance', 'full', 'full', 'full', 'full', 'full'),
  ('dashboard_finance',    'full', 'full', 'none', 'none', 'none'),
  ('newsfeed',             'full', 'full', 'full', 'full', 'full'),
  ('kids_applications',    'full', 'full', 'full', 'full', 'none'),
  ('staff',                'full', 'none', 'full', 'none', 'none'),
  ('classes',              'full', 'full', 'full', 'full', 'full'),
  ('admissions',           'full', 'full', 'full', 'full', 'none'),
  ('permissions',          'full', 'full', 'full', 'full', 'none'),
  ('event_calendar',       'full', 'full', 'full', 'full', 'full'),
  ('financial_reports',    'full', 'full', 'none', 'none', 'none'),
  ('notifications',        'full', 'full', 'full', 'full', 'full'),
  ('media_library',        'full', 'full', 'full', 'full', 'with_approval'),
  ('upload_media',         'full', 'full', 'full', 'full', 'full'),
  ('content_library',      'full', 'full', 'full', 'full', 'full'),
  ('surveys',              'full', 'full', 'full', 'full', 'none'),
  ('messages',             'full', 'full', 'full', 'full', 'full'),
  ('daily_reports',        'full', 'full', 'full', 'full', 'with_approval'),
  ('child_enrollment',     'full', 'full', 'full', 'full', 'none'),
  ('staff_onboarding',     'full', 'full', 'full', 'full', 'none'),
  ('inventory',            'full', 'full', 'full', 'full', 'none'),
  ('meals',                'full', 'full', 'full', 'full', 'none'),
  ('qr_code',              'full', 'full', 'full', 'full', 'none'),
  ('health_alerts',        'full', 'full', 'full', 'full', 'full'),
  ('loyalty',              'full', 'full', 'none', 'none', 'none'),
  ('broadcast_messages',   'full', 'full', 'full', 'full', 'none')
),
expanded AS (
  -- One row per (role, feature) where the matrix value is not 'none'
  SELECT r.chain_id    AS role_id, m.feature_id, m.tm      AS access FROM role_ids r, matrix m WHERE m.tm      != 'none'
  UNION ALL
  SELECT r.branch_id   AS role_id, m.feature_id, m.tm      AS access FROM role_ids r, matrix m WHERE m.tm      != 'none'
  UNION ALL
  SELECT r.mgr_fin_id  AS role_id, m.feature_id, m.mgr_fin AS access FROM role_ids r, matrix m WHERE m.mgr_fin != 'none'
  UNION ALL
  SELECT r.mgr_hr_id   AS role_id, m.feature_id, m.mgr_hr  AS access FROM role_ids r, matrix m WHERE m.mgr_hr  != 'none'
  UNION ALL
  SELECT r.mgr_ops_id  AS role_id, m.feature_id, m.mgr_ops AS access FROM role_ids r, matrix m WHERE m.mgr_ops != 'none'
  UNION ALL
  SELECT r.teacher_id  AS role_id, m.feature_id, m.teacher AS access FROM role_ids r, matrix m WHERE m.teacher != 'none'
)
INSERT INTO public.role_features (role_id, feature_id, access)
SELECT role_id, feature_id, access FROM expanded
ON CONFLICT (role_id, feature_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 10. SEED POSITIONS — 8 rows mirroring StaffPosition union.
--     Each maps to the most-restricted-but-correct seed role.
--     'admin' position maps to Branch Admin (it implies front-office authority).
--     Everyone else maps to Teacher (most-restricted classroom-scoped role).
-- -----------------------------------------------------------------------------
INSERT INTO public.positions (key, name_en, name_ar, role_id, is_seed, nursery_id) VALUES
  ('teacher',   'Teacher',   'معلم',         (SELECT id FROM public.roles WHERE key='teacher'      AND nursery_id IS NULL), true, NULL),
  ('assistant', 'Assistant', 'مساعد',        (SELECT id FROM public.roles WHERE key='teacher'      AND nursery_id IS NULL), true, NULL),
  ('nanny',     'Nanny',     'مربية',        (SELECT id FROM public.roles WHERE key='teacher'      AND nursery_id IS NULL), true, NULL),
  ('driver',    'Driver',    'سائق',         (SELECT id FROM public.roles WHERE key='teacher'      AND nursery_id IS NULL), true, NULL),
  ('kitchen',   'Kitchen',   'مطبخ',         (SELECT id FROM public.roles WHERE key='teacher'      AND nursery_id IS NULL), true, NULL),
  ('cleaner',   'Cleaner',   'عامل نظافة',   (SELECT id FROM public.roles WHERE key='teacher'      AND nursery_id IS NULL), true, NULL),
  ('security',  'Security',  'أمن',          (SELECT id FROM public.roles WHERE key='teacher'      AND nursery_id IS NULL), true, NULL),
  ('admin',     'Admin',     'إداري',        (SELECT id FROM public.roles WHERE key='branch_admin' AND nursery_id IS NULL), true, NULL)
ON CONFLICT (nursery_id, key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 11. BACKFILL users.role_id from existing users.role + users.department
-- -----------------------------------------------------------------------------
UPDATE public.users u
SET role_id = (
  SELECT r.id FROM public.roles r
  WHERE r.nursery_id IS NULL
    AND r.base_role = u.role
    AND COALESCE(r.base_department::text, '~null~') = COALESCE(u.department::text, '~null~')
  LIMIT 1
)
WHERE u.role_id IS NULL;

-- Fallback: if a manager has no department, link them to manager_operations
UPDATE public.users u
SET role_id = (SELECT id FROM public.roles WHERE key='manager_operations' AND nursery_id IS NULL)
WHERE u.role_id IS NULL AND u.role = 'manager';

-- -----------------------------------------------------------------------------
-- 12. BACKFILL staff_profiles.position_id from existing staff_profiles.position
-- -----------------------------------------------------------------------------
UPDATE public.staff_profiles sp
SET position_id = (
  SELECT p.id FROM public.positions p
  WHERE p.nursery_id IS NULL
    AND p.key = sp.position
  LIMIT 1
)
WHERE sp.position_id IS NULL
  AND sp.position IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 13. HELPER: user_has_feature(text) — used by Phase 1 engine and any RLS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_has_feature(p_feature_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_role_id uuid;
BEGIN
  IF public.is_xo_super_admin() THEN
    RETURN true;
  END IF;
  SET LOCAL row_security = off;
  SELECT u.role_id INTO v_role_id FROM public.users u WHERE u.id = auth.uid();
  IF v_role_id IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.role_features rf
    WHERE rf.role_id = v_role_id AND rf.feature_id = p_feature_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.user_has_feature(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_feature(text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 14. SYNC TRIGGER: when staff_profiles.position_id changes, update users
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_user_role_from_position()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id uuid;
  v_base_role public.user_role;
  v_base_dept public.user_department;
  v_old_role_id uuid;
BEGIN
  IF NEW.position_id IS NULL OR NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if position_id unchanged on UPDATE
  IF TG_OP = 'UPDATE' AND OLD.position_id IS NOT DISTINCT FROM NEW.position_id THEN
    RETURN NEW;
  END IF;

  SELECT p.role_id, r.base_role, r.base_department
    INTO v_role_id, v_base_role, v_base_dept
    FROM public.positions p
    JOIN public.roles r ON r.id = p.role_id
    WHERE p.id = NEW.position_id;

  IF v_role_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role_id INTO v_old_role_id FROM public.users WHERE id = NEW.user_id;

  UPDATE public.users
    SET role_id    = v_role_id,
        role       = v_base_role,
        department = v_base_dept
  WHERE id = NEW.user_id;

  -- Audit log
  IF v_old_role_id IS DISTINCT FROM v_role_id THEN
    INSERT INTO public.role_assignments_log (user_id, old_role_id, new_role_id, changed_by, reason)
    VALUES (NEW.user_id, v_old_role_id, v_role_id, auth.uid(),
            'position-sync: staff_profiles.position_id changed');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_user_role_from_position ON public.staff_profiles;
CREATE TRIGGER trg_sync_user_role_from_position
  AFTER INSERT OR UPDATE OF position_id ON public.staff_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_role_from_position();

-- -----------------------------------------------------------------------------
-- 15. RLS — features, roles, role_features, positions, role_assignments_log
-- -----------------------------------------------------------------------------
ALTER TABLE public.features              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_features         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_assignments_log  ENABLE ROW LEVEL SECURITY;

-- features: anyone authenticated reads, xo_super_admin manages.
DROP POLICY IF EXISTS features_select       ON public.features;
DROP POLICY IF EXISTS features_xo_manage    ON public.features;
CREATE POLICY features_select    ON public.features FOR SELECT TO authenticated USING (true);
CREATE POLICY features_xo_manage ON public.features FOR ALL    TO authenticated
  USING (public.is_xo_super_admin())
  WITH CHECK (public.is_xo_super_admin());

-- roles: anyone authenticated reads, branch_admin+/xo manages (no seed edits except xo).
DROP POLICY IF EXISTS roles_select  ON public.roles;
DROP POLICY IF EXISTS roles_manage  ON public.roles;
CREATE POLICY roles_select ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY roles_manage ON public.roles FOR ALL    TO authenticated
  USING (
    public.is_xo_super_admin()
    OR (is_seed = false AND public.rls_staff_manages_nursery(COALESCE(nursery_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  )
  WITH CHECK (
    public.is_xo_super_admin()
    OR public.rls_staff_manages_nursery(COALESCE(nursery_id, '00000000-0000-0000-0000-000000000000'::uuid))
  );

-- role_features: anyone authenticated reads, gated by the role's manage policy via xo or branch_admin+.
DROP POLICY IF EXISTS role_features_select  ON public.role_features;
DROP POLICY IF EXISTS role_features_manage  ON public.role_features;
CREATE POLICY role_features_select ON public.role_features FOR SELECT TO authenticated USING (true);
CREATE POLICY role_features_manage ON public.role_features FOR ALL    TO authenticated
  USING (
    public.is_xo_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = role_features.role_id
        AND r.is_seed = false
        AND public.rls_staff_manages_nursery(COALESCE(r.nursery_id, '00000000-0000-0000-0000-000000000000'::uuid))
    )
  )
  WITH CHECK (
    public.is_xo_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = role_features.role_id
        AND public.rls_staff_manages_nursery(COALESCE(r.nursery_id, '00000000-0000-0000-0000-000000000000'::uuid))
    )
  );

-- positions: same shape as roles
DROP POLICY IF EXISTS positions_select  ON public.positions;
DROP POLICY IF EXISTS positions_manage  ON public.positions;
CREATE POLICY positions_select ON public.positions FOR SELECT TO authenticated USING (true);
CREATE POLICY positions_manage ON public.positions FOR ALL    TO authenticated
  USING (
    public.is_xo_super_admin()
    OR (is_seed = false AND public.rls_staff_manages_nursery(COALESCE(nursery_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  )
  WITH CHECK (
    public.is_xo_super_admin()
    OR public.rls_staff_manages_nursery(COALESCE(nursery_id, '00000000-0000-0000-0000-000000000000'::uuid))
  );

-- role_assignments_log: SELECT for xo_super_admin only (forensic). Inserts via trigger only.
DROP POLICY IF EXISTS role_assignments_log_select ON public.role_assignments_log;
CREATE POLICY role_assignments_log_select ON public.role_assignments_log FOR SELECT TO authenticated
  USING (public.is_xo_super_admin());

-- -----------------------------------------------------------------------------
-- 16. GRANTS
-- -----------------------------------------------------------------------------
GRANT SELECT ON public.features              TO authenticated;
GRANT SELECT ON public.roles                 TO authenticated;
GRANT SELECT ON public.role_features         TO authenticated;
GRANT SELECT ON public.positions             TO authenticated;
GRANT SELECT ON public.role_assignments_log  TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.features              TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.roles                 TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.role_features         TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.positions             TO authenticated;

COMMIT;

-- Phase 7 Feature 1: Staff HR Profiles & Schedules

CREATE TABLE IF NOT EXISTS public.staff_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  employee_id text NOT NULL,
  department text NOT NULL,
  position text NOT NULL,
  hire_date date NOT NULL,
  contract_type text NOT NULL,
  salary_amount numeric(12, 2),
  emergency_contact_name text,
  emergency_contact_phone text,
  address text,
  national_id text,
  qualifications_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  documents_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT staff_profiles_user_uniq UNIQUE (user_id),
  CONSTRAINT staff_profiles_employee_nursery_uniq UNIQUE (nursery_id, employee_id),
  CONSTRAINT staff_profiles_department_ck CHECK (department IN ('teaching', 'admin', 'kitchen', 'maintenance', 'security', 'driver')),
  CONSTRAINT staff_profiles_contract_type_ck CHECK (contract_type IN ('full_time', 'part_time', 'contract', 'temporary'))
);

CREATE TRIGGER trg_staff_profiles_updated_at
BEFORE UPDATE ON public.staff_profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.staff_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff_profiles (id) ON DELETE CASCADE,
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  day_of_week integer NOT NULL,
  start_time time,
  end_time time,
  is_working_day boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT staff_schedules_staff_day_uniq UNIQUE (staff_id, day_of_week),
  CONSTRAINT staff_schedules_day_ck CHECK (day_of_week BETWEEN 0 AND 6)
);

-- Existing table from previous phases: extend for HR profile linkage.
ALTER TABLE public.staff_attendance
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.staff_profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS check_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS check_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS work_hours numeric(6, 2),
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS idx_staff_profiles_nursery_id ON public.staff_profiles (nursery_id);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_department ON public.staff_profiles (department);
CREATE INDEX IF NOT EXISTS idx_staff_schedules_nursery_id ON public.staff_schedules (nursery_id);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_staff_id ON public.staff_attendance (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_check_in ON public.staff_attendance (check_in_at);

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_profiles_admin_all ON public.staff_profiles;
CREATE POLICY staff_profiles_admin_all
  ON public.staff_profiles FOR ALL TO authenticated
  USING (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND nursery_id = public.current_user_nursery_id()
  );

DROP POLICY IF EXISTS staff_profiles_self_select ON public.staff_profiles;
CREATE POLICY staff_profiles_self_select
  ON public.staff_profiles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
  );

DROP POLICY IF EXISTS staff_profiles_teacher_select ON public.staff_profiles;
CREATE POLICY staff_profiles_teacher_select
  ON public.staff_profiles FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND nursery_id = public.current_user_nursery_id()
  );

DROP POLICY IF EXISTS staff_schedules_admin_all ON public.staff_schedules;
CREATE POLICY staff_schedules_admin_all
  ON public.staff_schedules FOR ALL TO authenticated
  USING (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND nursery_id = public.current_user_nursery_id()
  );

DROP POLICY IF EXISTS staff_schedules_staff_select ON public.staff_schedules;
CREATE POLICY staff_schedules_staff_select
  ON public.staff_schedules FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      WHERE sp.id = staff_schedules.staff_id
        AND sp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS staff_attendance_admin_all_v2 ON public.staff_attendance;
CREATE POLICY staff_attendance_admin_all_v2
  ON public.staff_attendance FOR ALL TO authenticated
  USING (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND nursery_id = public.current_user_nursery_id()
  );

DROP POLICY IF EXISTS staff_attendance_staff_select_v2 ON public.staff_attendance;
CREATE POLICY staff_attendance_staff_select_v2
  ON public.staff_attendance FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      WHERE sp.id = staff_attendance.staff_id
        AND sp.user_id = auth.uid()
    )
  );

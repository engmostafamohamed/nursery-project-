-- Migration 041: Audit log for user role changes
-- Track when admins change user roles for compliance

CREATE TABLE IF NOT EXISTS user_role_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  changed_by uuid NOT NULL REFERENCES users(id),
  old_role public.user_role NOT NULL,
  new_role public.user_role NOT NULL,
  reason text,
  changed_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_role_changes_user_id ON user_role_changes(user_id);
CREATE INDEX idx_user_role_changes_changed_by ON user_role_changes(changed_by);
CREATE INDEX idx_user_role_changes_changed_at ON user_role_changes(changed_at DESC);

-- RLS: Only admins can view role change history
ALTER TABLE user_role_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_role_changes_admin_select
  ON user_role_changes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role IN ('branch_admin', 'chain_super_admin', 'xo_super_admin')
    )
  );

-- Function to automatically log role changes
CREATE OR REPLACE FUNCTION log_user_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only log if role actually changed
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    INSERT INTO user_role_changes (user_id, changed_by, old_role, new_role, reason)
    VALUES (NEW.id, auth.uid(), OLD.role, NEW.role, 'Role changed via system');
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger to auto-log role changes
CREATE TRIGGER trg_log_user_role_change
AFTER UPDATE OF role ON users
FOR EACH ROW
EXECUTE FUNCTION log_user_role_change();

COMMENT ON TABLE user_role_changes IS 'Audit log of user role changes for compliance and security';
COMMENT ON FUNCTION log_user_role_change IS 'Automatically logs role changes when users.role is updated';;

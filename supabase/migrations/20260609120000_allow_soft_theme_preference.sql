-- Allow 'soft' as a user theme preference so the Soft theme persists across
-- devices (previously it was downgraded to 'system' on save, which resolved
-- back to light/dark on the next auth event).
-- Date: 2026-06-09

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_theme_preference_check;

ALTER TABLE users
ADD CONSTRAINT users_theme_preference_check
CHECK (theme_preference IN ('light', 'dark', 'soft', 'system'));

COMMENT ON COLUMN users.theme_preference IS 'User personal theme preference: light, dark, soft, or system (follows OS)';

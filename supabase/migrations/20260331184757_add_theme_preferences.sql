-- Add theme preferences at user and nursery level
-- Date: 2026-03-31

-- 1. Add user theme preference
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS theme_preference text DEFAULT 'system' 
CHECK (theme_preference IN ('light', 'dark', 'system'));

COMMENT ON COLUMN users.theme_preference IS 'User personal theme preference: light, dark, or system (follows OS)';

-- 2. Add nursery brand theme colors (optional customization)
ALTER TABLE nursery_settings
ADD COLUMN IF NOT EXISTS brand_theme_colors jsonb DEFAULT NULL;

COMMENT ON COLUMN nursery_settings.brand_theme_colors IS 'Optional brand color overrides: {"primary": "#0062ff", "accent": "#00c853"}';

-- Create index for faster user theme lookups
CREATE INDEX IF NOT EXISTS idx_users_theme_preference ON users(theme_preference);
;

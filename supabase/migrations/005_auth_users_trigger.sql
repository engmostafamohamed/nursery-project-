-- Auto-create public.users when a new auth.users row is inserted.
-- Apply after 001–004. Run in Supabase SQL Editor if migrations are applied manually.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_phone text;
  v_local text;
  v_name_ar text;
  v_name_en text;
BEGIN
  v_email := NEW.email;
  v_phone := NEW.phone;
  v_local := NULLIF(trim(split_part(COALESCE(NEW.email, 'user@local'), '@', 1)), '');

  v_name_ar := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'name_ar'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''),
    v_local,
    'مستخدم'
  );

  v_name_en := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'name_en'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''),
    v_local,
    'User'
  );

  INSERT INTO public.users (
    id,
    role,
    name_ar,
    name_en,
    email,
    phone,
    status,
    language_pref
  )
  VALUES (
    NEW.id,
    'parent'::public.user_role,
    v_name_ar,
    v_name_en,
    v_email,
    v_phone,
    'active',
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'language_pref'), ''), 'ar')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMIT;

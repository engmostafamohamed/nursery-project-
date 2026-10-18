-- set_parent_package_texts() is for signed-in staff only. Supabase's default privileges also
-- grant EXECUTE to anon directly (not through PUBLIC), which 20261018000000's "revoke from public"
-- did not remove. The function already refuses a caller without a user, so this only tightens it.

revoke execute on function public.set_parent_package_texts(uuid, text, text, text, text, text, text) from anon;

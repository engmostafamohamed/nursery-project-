-- Restored from production's migration history (supabase_migrations.schema_migrations):
-- this migration was applied to production without a file in the repo.

alter table public.tuition_packages drop constraint if exists tuition_packages_deal_id_fkey;
alter table public.packages drop constraint if exists packages_deal_id_fkey;
notify pgrst, $$reload schema$$;

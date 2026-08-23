-- Enable realtime change feeds for the tables the app subscribes to.
--
-- A local `supabase start` does NOT add application tables to the
-- supabase_realtime publication (on hosted Supabase this is done via the
-- dashboard). As a result postgres_changes events never fired locally, so the
-- notification bell list and the reminder alert only updated on a full page
-- reload instead of live when a reminder fired.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'personal_reminders'
  ) then
    alter publication supabase_realtime add table public.personal_reminders;
  end if;
end $$;

-- REPLICA IDENTITY FULL so realtime row-level filters (e.g. user_id=eq.…) also
-- match on UPDATE/DELETE events (mark-as-read, reminder edits), not just INSERT.
alter table public.notifications      replica identity full;
alter table public.personal_reminders replica identity full;

-- Live updates across the app (src/providers/RealtimeQuerySync.tsx): broadcast changes
-- on the application tables in public so every page refreshes without a reload.
-- Until now only notifications, personal_reminders and chat tables were published, so
-- realtime listeners on other tables (applications, invoices, courses, ...) never fired.
--
-- Only tables with row level security enabled are added: Realtime checks each
-- subscriber's RLS before delivering a row, whereas a table without RLS would stream
-- every row to every signed-in user. Secrets, audit trails and job queues stay out.
--
-- Tables created after this migration are not picked up automatically; add them to
-- the publication in their own migration (or re-run this block).

do $$
declare
  t record;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  -- A FOR ALL TABLES publication already covers everything and rejects ADD TABLE.
  if (select puballtables from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity
      and c.relname not in (
        'user_push_subscriptions',                        -- push endpoints and keys
        'staff_national_ids',                             -- identity documents
        'role_assignments_log', 'user_role_changes',      -- audit trails
        'tenant_export_jobs', 'tenant_export_artifacts',  -- background jobs
        'import_jobs'
      )
      and not exists (
        select 1 from pg_publication_tables p
        where p.pubname = 'supabase_realtime' and p.schemaname = 'public' and p.tablename = c.relname
      )
  loop
    execute format('alter publication supabase_realtime add table public.%I', t.relname);
  end loop;
end $$;

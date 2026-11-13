-- Live updates for every table the screens read.
--
-- The app refreshes what is on screen when a row it may read changes (RealtimeQuerySync listens to
-- the supabase_realtime publication; Realtime applies each user's row rules). The publication was
-- filled once, on 5 Oct 2026; the 38 tables made since were never added, so their changes reached
-- nobody until a reload: the week's menu and the meal plans, the teachers' messages to families,
-- partner discounts, cancelled course sessions, medicine doses, staff absences and class covers,
-- extra requests, kitchen charges, and the staff tasks.
-- Now every public table is in it, except logs and internal records no screen shows live. The
-- database test security_baseline keeps it so for the tables made after this one.

-- The tables kept out on purpose: logs and internal records no screen shows live (and the busiest
-- writers among them).
create or replace function public.realtime_skipped_tables()
returns setof text
language sql
immutable
set search_path = public
as $$
  select unnest(array[
    'rbac_audit_log', 'role_assignments_log', 'user_role_changes', 'user_push_subscriptions', 'message_deliveries',
    'payment_events', 'qr_manual_code_attempts', 'import_jobs', 'tenant_export_jobs', 'tenant_export_artifacts',
    'staff_national_ids', 'daily_report_reminders'
  ]);
$$;

do $$
declare
  t record;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if (select puballtables from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  for t in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and c.relname not in (select public.realtime_skipped_tables())
       and not exists (
         select 1 from pg_publication_tables p
          where p.pubname = 'supabase_realtime' and p.schemaname = 'public' and p.tablename = c.relname
       )
  loop
    execute format('alter publication supabase_realtime add table public.%I', t.relname);
  end loop;
end;
$$;

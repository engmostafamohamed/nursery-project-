-- The activity log is not something a screen shows live.
--
-- realtime_skipped_tables names the tables deliberately kept out of the supabase_realtime
-- publication: logs and internal records nothing on screen follows as it changes. activity_log
-- (20261119090000) is one of those — it is read only through get_activity_log, never as a table,
-- and the admin's activity screen asks for it when it opens rather than listening.
--
-- It was never added to the list, so the security_baseline test read it as a table the screens
-- read with live updates missing. This says what was always meant.

create or replace function public.realtime_skipped_tables()
returns setof text
language sql
immutable
set search_path = public
as $$
  select unnest(array[
    'rbac_audit_log', 'role_assignments_log', 'user_role_changes', 'user_push_subscriptions', 'message_deliveries',
    'payment_events', 'qr_manual_code_attempts', 'import_jobs', 'tenant_export_jobs', 'tenant_export_artifacts',
    'staff_national_ids', 'daily_report_reminders', 'activity_log'
  ]);
$$;

-- Should it have been added to the publication before this ran, take it back out again.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity_log'
  ) then
    alter publication supabase_realtime drop table public.activity_log;
  end if;
end;
$$;

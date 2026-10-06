-- Fixes from the end-to-end review of 2026-10-06.
--
-- 1) Four tables holding child data had no row level security, so anyone with the public anon
--    key could read and write them: age_milestone_reminders, age_milestone_templates,
--    child_routine_items, child_routine_logs. They are locked to staff of the owning nursery.
-- 2) _generate_tuition_invoice (internal, called only by the billing job) was executable by
--    anon and authenticated. Three user RPCs were also executable by anon; they reject
--    unauthenticated callers themselves, but anon should not reach them at all.
-- 3) Logged-out visitors submitting the public inquiry form could not notify the nursery admins
--    (they cannot read users or write notifications). Admins are now notified by a trigger.
-- 4) Teachers cannot read parent_children, so publishing a daily report notified no parent.
--    Parents are now notified by a trigger when a report becomes published.
-- The app's own client-side notification calls for (3) and (4) are removed in the same change,
-- so nobody is notified twice.

begin;

-- =============================================================================
-- 1. Lock down unprotected child-data tables
-- =============================================================================
do $$
declare
  t text;
begin
  foreach t in array array['age_milestone_reminders', 'age_milestone_templates', 'child_routine_items', 'child_routine_logs'] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);

    execute format('drop policy if exists %I on public.%I', t || '_xo_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_xo_super_admin()) with check (public.is_xo_super_admin())', t || '_xo_all', t);

    execute format('drop policy if exists %I on public.%I', t || '_staff_manage', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.rls_staff_manages_nursery(nursery_id)) with check (public.rls_staff_manages_nursery(nursery_id))', t || '_staff_manage', t);

    execute format('drop policy if exists %I on public.%I', t || '_staff_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.rls_authenticated_staff_sees_nursery(nursery_id))', t || '_staff_select', t);
  end loop;
end $$;

-- =============================================================================
-- 2. Function privileges
-- =============================================================================
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = '_generate_tuition_invoice'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;

  for r in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('approve_application_enrollment', 'select_application_payment_package', 'select_application_extra_hours_package')
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

-- =============================================================================
-- 3. New inquiry → notify the nursery admins
-- =============================================================================
create or replace function public.inquiries_notify_admins()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.notify_users(
    array(
      select u.id from public.users u
      where u.nursery_id = new.nursery_id
        and u.role in ('branch_admin'::public.user_role, 'chain_super_admin'::public.user_role)
    ),
    new.nursery_id,
    'admission_inquiry_new',
    'admission_inquiry_new',
    jsonb_build_object('parent', new.parent_name),
    '/admin/admissions/inquiries'
  );
  return new;
end;
$$;

revoke execute on function public.inquiries_notify_admins() from public, anon, authenticated;

drop trigger if exists trg_inquiries_notify_admins on public.inquiries;
create trigger trg_inquiries_notify_admins
  after insert on public.inquiries
  for each row execute function public.inquiries_notify_admins();

-- =============================================================================
-- 4. Daily report published → notify the child's parents
-- =============================================================================
create or replace function public.daily_reports_notify_parents()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    perform public.notify_users(
      array(select pc.parent_id from public.parent_children pc where pc.child_id = new.child_id),
      new.nursery_id,
      'daily_report_published',
      'daily_report_published',
      '{}'::jsonb,
      '/parent/daily-reports'
    );
  end if;
  return new;
end;
$$;

revoke execute on function public.daily_reports_notify_parents() from public, anon, authenticated;

drop trigger if exists trg_daily_reports_notify_parents on public.daily_reports;
create trigger trg_daily_reports_notify_parents
  after insert or update of status on public.daily_reports
  for each row execute function public.daily_reports_notify_parents();

commit;

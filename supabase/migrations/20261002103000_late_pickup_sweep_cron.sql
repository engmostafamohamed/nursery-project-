-- Automatic late-pickup billing: previously extra-hours charges only ever fired when a
-- checkout actually happened (teacher toggle or QR scan) — a child simply never checked out
-- accrued nothing. This sweep runs every 15 minutes, finds children still checked in past
-- their nursery's standard end time + grace, and applies the same billing logic a real
-- checkout would, via the shared apply_attendance_late_charge (20261002100000).

begin;

create extension if not exists pg_cron;

create or replace function public.run_late_pickup_sweep()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_processed integer := 0;
  v_row record;
begin
  for v_row in
    select ar.id
    from public.attendance_records ar
    join public.children c on c.id = ar.child_id
    join public.nursery_settings ns on ns.nursery_id = c.nursery_id
    where ar.check_out is null
      and ar.check_in is not null
      and ar.late_charge_status <> 'final'
      and coalesce(ns.auto_late_pickup_billing_enabled, true)
      and ns.standard_end_time is not null
      and ar.attendance_date = (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date
      and (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::time
          > (ns.standard_end_time + make_interval(mins => coalesce(ns.late_pickup_grace_minutes, 0)))
    for update of ar skip locked
  loop
    perform public.apply_attendance_late_charge(v_row.id, now(), 'sweep', false);
    v_processed := v_processed + 1;
  end loop;

  return v_processed;
end;
$$;

revoke execute on function public.run_late_pickup_sweep() from public;

do $$
begin
  perform cron.unschedule('late-pickup-sweep');
exception when others then null;
end $$;

select cron.schedule('late-pickup-sweep', '*/15 * * * *',
  $$select public.run_late_pickup_sweep()$$);

commit;

begin;

alter table public.nursery_settings
  add column if not exists invoice_reminder_days_before integer not null default 3
    check (invoice_reminder_days_before between 0 and 30);

create or replace function public.run_payment_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer := 0;
begin
  with due as (
    select i.id as invoice_id, i.nursery_id, i.parent_id,
           greatest(i.amount - coalesce((
             select sum(p.amount)
             from public.payments p
             where p.invoice_id = i.id
               and p.status = 'completed'
           ), 0), 0) as amount,
           i.generated_invoice_number,
           coalesce(ns.currency, 'EGP') as currency,
           (i.due_date - (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date) as days_until
    from public.invoices i
    join public.nursery_settings ns on ns.nursery_id = i.nursery_id
    where i.status = 'pending'
      and coalesce(ns.auto_payment_reminders_enabled, true)
      and greatest(i.amount - coalesce((
        select sum(p.amount)
        from public.payments p
        where p.invoice_id = i.id
          and p.status = 'completed'
      ), 0), 0) > 0
      and (i.due_date - (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date) in (
        coalesce(ns.invoice_reminder_days_before, 3), -1, -3, -7
      )
      and (i.last_reminder_sent_at is null
           or i.last_reminder_sent_at < date_trunc('day', now()))
      and not exists (
        select 1
        from public.event_invoices ei
        join public.permissions p
          on p.event_id = ei.event_id and p.child_id = ei.child_id
        where ei.invoice_id = i.id
          and p.status = 'denied'
      )
  ),
  sent as (
    insert into public.notifications
      (nursery_id, user_id, type, template_key, template_params, read, channel, sent_at, action_link)
    select
      d.nursery_id, d.parent_id,
      case when d.days_until >= 0 then 'invoice_due_reminder' else 'invoice_overdue_reminder' end,
      case when d.days_until >= 0 then 'invoice_due_reminder' else 'invoice_overdue_reminder' end,
      jsonb_build_object(
        'amount', d.amount,
        'currency', d.currency,
        'days', abs(d.days_until),
        'invoice_number', coalesce(nullif(d.generated_invoice_number, ''), upper(left(d.invoice_id::text, 8)))
      ),
      false, 'in_app', now(), '/parent/invoices/' || d.invoice_id::text
    from due d
    returning 1
  )
  select count(*) into inserted from sent;

  update public.invoices i
     set last_reminder_sent_at = now()
   from public.nursery_settings ns
  where ns.nursery_id = i.nursery_id
    and i.status = 'pending'
    and coalesce(ns.auto_payment_reminders_enabled, true)
    and (i.due_date - (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date) in (
      coalesce(ns.invoice_reminder_days_before, 3), -1, -3, -7
    )
    and greatest(i.amount - coalesce((
      select sum(p.amount)
      from public.payments p
      where p.invoice_id = i.id
        and p.status = 'completed'
    ), 0), 0) > 0
    and (i.last_reminder_sent_at is null
         or i.last_reminder_sent_at < date_trunc('day', now()))
    and not exists (
      select 1
      from public.event_invoices ei
      join public.permissions p
        on p.event_id = ei.event_id and p.child_id = ei.child_id
      where ei.invoice_id = i.id
        and p.status = 'denied'
    );

  return inserted;
end;
$$;

commit;

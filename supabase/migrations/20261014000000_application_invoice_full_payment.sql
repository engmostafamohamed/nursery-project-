-- Application package invoices are paid in one payment.
--
-- A parent's payment request on an invoice created for an application (line_items_json carries
-- application_id) must cover everything still due. Partial payments stay allowed on other
-- invoices (tuition, events, extra hours). Staff-recorded payments go through
-- admin_record_invoice_payment into public.payments and are not affected.
--
-- Same function as 20261007000000_notification_templates_payments_hardening.sql plus the
-- payment_full_amount_required check. CREATE OR REPLACE keeps the existing execute revokes.

create or replace function public.payment_attempts_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_remaining numeric;
begin
  select * into v_invoice from public.invoices where id = new.invoice_id for update;
  if not found then
    raise exception 'payment_invoice_not_found' using errcode = 'P0001';
  end if;
  if new.parent_id is distinct from v_invoice.parent_id then
    raise exception 'payment_invoice_not_yours' using errcode = '42501';
  end if;
  if v_invoice.status in ('paid', 'cancelled') then
    raise exception 'payment_invoice_closed' using errcode = 'P0001';
  end if;
  if new.amount is null or new.amount <= 0 then
    raise exception 'payment_invalid_amount' using errcode = 'P0001';
  end if;

  new.nursery_id := v_invoice.nursery_id;
  new.status := coalesce(new.status, 'pending_confirmation');

  if new.status = 'pending_confirmation' then
    v_remaining := v_invoice.amount - public.invoice_paid_total(v_invoice.id) - public.invoice_pending_total(v_invoice.id);
    if new.amount > v_remaining + 0.005 then
      raise exception 'payment_exceeds_balance' using errcode = 'P0001', detail = round(greatest(v_remaining, 0), 2)::text;
    end if;
    if nullif(v_invoice.line_items_json ->> 'application_id', '') is not null
       and new.amount < v_remaining - 0.005 then
      raise exception 'payment_full_amount_required' using errcode = 'P0001', detail = round(greatest(v_remaining, 0), 2)::text;
    end if;
    if exists (
      select 1 from public.payment_attempts pa
      where pa.invoice_id = new.invoice_id
        and pa.parent_id = new.parent_id
        and pa.status = 'pending_confirmation'
        and pa.amount = new.amount
        and pa.created_at > now() - interval '2 minutes'
    ) then
      raise exception 'payment_duplicate' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- Restored from production's migration history (supabase_migrations.schema_migrations):
-- this migration was applied to production without a file in the repo.

-- Mobile wallets: one receiving number per provider.
--
-- Parents pay a manual wallet transfer by choosing the provider (Vodafone Cash, Etisalat Cash,
-- Orange Cash or WE Pay), sending the amount to that provider's nursery number, and submitting
-- their wallet phone, name, optional transaction number and the receipt screenshot. A provider
-- is offered only when it is enabled in payment_methods_enabled AND its number is set.
-- etisalat_cash_account_number already exists (20261011030000).
--
-- submit_invoice_payment gains 'we_pay'; the rest of the function is unchanged (taken from the
-- live definition).


alter table public.nursery_settings
  add column if not exists vodafone_cash_account_number text,
  add column if not exists orange_cash_account_number text,
  add column if not exists we_pay_account_number text;

comment on column public.nursery_settings.vodafone_cash_account_number is 'Nursery Vodafone Cash wallet number parents send manual payments to.';
comment on column public.nursery_settings.orange_cash_account_number is 'Nursery Orange Cash wallet number parents send manual payments to.';
comment on column public.nursery_settings.we_pay_account_number is 'Nursery WE Pay wallet number parents send manual payments to.';

CREATE OR REPLACE FUNCTION public.submit_invoice_payment(p_invoice_id uuid, p_amount numeric, p_method text DEFAULT 'manual'::text, p_reference text DEFAULT NULL::text, p_proof_url text DEFAULT NULL::text, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_existing public.payment_attempts%rowtype;
  v_attempt_id uuid;
  v_invoice public.invoices%rowtype;
  v_ns public.nursery_settings%rowtype;
begin
  if v_uid is null then
    raise exception 'payment_not_authenticated' using errcode = '28000';
  end if;
  if p_method not in ('manual', 'cash', 'bank_transfer', 'instapay', 'vodafone_cash', 'etisalat_cash', 'orange_cash', 'we_pay', 'fawry', 'card') then
    raise exception 'payment_invalid_method' using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing from public.payment_attempts where idempotency_key = p_idempotency_key;
    if found then
      if v_existing.parent_id is distinct from v_uid then
        raise exception 'payment_forbidden' using errcode = '42501';
      end if;
      return jsonb_build_object('status', 'duplicate', 'attempt_id', v_existing.id, 'amount', v_existing.amount);
    end if;
  end if;

  begin
    insert into public.payment_attempts (
      invoice_id, parent_id, nursery_id, amount, payment_method, status, reference, proof_url, idempotency_key
    )
    select p_invoice_id, v_uid, i.nursery_id, round(p_amount, 2), p_method, 'pending_confirmation',
           nullif(trim(coalesce(p_reference, '')), ''), nullif(trim(coalesce(p_proof_url, '')), ''), p_idempotency_key
    from public.invoices i
    where i.id = p_invoice_id
    returning id into v_attempt_id;
  exception
    when unique_violation then
      return jsonb_build_object('status', 'duplicate');
    when sqlstate 'P0001' then
      if sqlerrm = 'payment_duplicate' then
        return jsonb_build_object('status', 'duplicate');
      end if;
      raise;
  end;

  if v_attempt_id is null then
    raise exception 'payment_invoice_not_found' using errcode = 'P0001';
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id;
  select * into v_ns from public.nursery_settings where nursery_id = v_invoice.nursery_id;

  perform public.notify_users(
    public.payment_finance_recipients(v_invoice.nursery_id),
    v_invoice.nursery_id,
    'payment_attempt_created',
    'payment_attempt_created',
    jsonb_build_object(
      'invoice_number', public.invoice_number_label(v_invoice),
      'amount', round(p_amount, 2),
      'currency', coalesce(v_ns.currency, 'EGP'),
      'parent', public.user_names(v_uid)
    ),
    '/admin/invoices/' || v_invoice.id::text
  );

  return jsonb_build_object(
    'status', 'submitted',
    'attempt_id', v_attempt_id,
    'amount', round(p_amount, 2),
    'remaining', greatest(v_invoice.amount - public.invoice_paid_total(v_invoice.id) - public.invoice_pending_total(v_invoice.id), 0)
  );
end;
$function$;

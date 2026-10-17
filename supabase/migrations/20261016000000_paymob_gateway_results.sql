-- Restored from production's migration history (supabase_migrations.schema_migrations):
-- this migration was applied to production without a file in the repo.

-- Paymob results settle online payments.
--
-- Until now an online (Paymob) payment stayed `pending_confirmation` until finance confirmed or
-- rejected it by hand. A declined card or an abandoned checkout therefore blocked the invoice:
-- the pending amount covered the balance, so the parent could neither retry nor pick another
-- method.
--
-- * payment_events keeps every verified Paymob result (server webhook or browser return).
-- * paymob_settle_attempt (service role only) applies one verified result: a success for the
--   exact amount confirms the attempt the same way finance does, a failure releases it, and a
--   pending result (e.g. a Fawry reference) keeps it pending with the reference saved.
-- * cancel_unfinished_online_payment lets a parent release an online checkout they left before
--   Paymob reported any transaction, so they can pay again or choose another method.
-- * confirm_invoice_payment_attempt behaves exactly as before; its body moves to
--   confirm_payment_attempt_internal so the gateway confirms through the same code.


alter table public.payment_attempts
  add column if not exists failure_reason text,
  add column if not exists provider_reference text;

comment on column public.payment_attempts.failure_reason is
  'Why an online attempt failed, as a code the app translates (payment.failure.*).';
comment on column public.payment_attempts.provider_reference is
  'Reference the provider issued for a pending payment, e.g. a Fawry bill reference.';

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'paymob',
  source text not null check (source in ('webhook', 'redirect')),
  transaction_id text,
  attempt_id uuid references public.payment_attempts(id) on delete set null,
  nursery_id uuid references public.nurseries(id) on delete set null,
  success boolean,
  pending boolean,
  amount_cents bigint,
  currency text,
  outcome text not null,
  reason_code text,
  provider_message text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);

create index if not exists payment_events_attempt_idx on public.payment_events (attempt_id);
create index if not exists payment_events_transaction_idx on public.payment_events (provider, transaction_id);
create index if not exists payment_events_nursery_idx on public.payment_events (nursery_id, received_at desc);

alter table public.payment_events enable row level security;

-- Finance staff read the events of their nursery; only the service role writes them.
drop policy if exists payment_events_staff_select on public.payment_events;
create policy payment_events_staff_select on public.payment_events for select to authenticated
  using (public.rls_staff_manages_nursery(nursery_id));

-- ---------------------------------------------------------------------------------------------
-- Confirmation shared by finance (confirm_invoice_payment_attempt) and the gateway.
-- p_confirmed_by is the staff member, or null when Paymob confirmed the payment.
-- ---------------------------------------------------------------------------------------------
create or replace function public.confirm_payment_attempt_internal(p_attempt_id uuid, p_confirmed_by uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_attempt public.payment_attempts%rowtype;
  v_invoice public.invoices%rowtype;
  v_ns public.nursery_settings%rowtype;
  v_already_paid numeric := 0;
  v_confirmed_amount numeric := 0;
  v_total_paid numeric := 0;
  v_fully_paid boolean := false;
  v_payment_id uuid;
  v_application_id uuid;
begin
  select * into v_attempt from public.payment_attempts where id = p_attempt_id for update;
  if not found then
    raise exception 'payment_attempt_not_found' using errcode = '42704';
  end if;

  select * into v_invoice from public.invoices where id = v_attempt.invoice_id for update;
  if not found then
    raise exception 'payment_invoice_not_found' using errcode = '42704';
  end if;
  if v_invoice.nursery_id is distinct from v_attempt.nursery_id
     or v_invoice.parent_id is distinct from v_attempt.parent_id then
    raise exception 'Payment attempt does not match invoice' using errcode = '22023';
  end if;
  select * into v_ns from public.nursery_settings where nursery_id = v_invoice.nursery_id;

  v_already_paid := public.invoice_paid_total(v_invoice.id);

  -- Only a pending attempt does anything, so a second click is harmless.
  if v_attempt.status = 'pending_confirmation' then
    v_confirmed_amount := least(v_attempt.amount, greatest(0, v_invoice.amount - v_already_paid));
    if v_confirmed_amount > 0 then
      insert into public.payments (invoice_id, amount, method, status, paid_at, gateway_ref)
      values (v_invoice.id, v_confirmed_amount, v_attempt.payment_method, 'completed', now(), v_attempt.paymob_transaction_id)
      returning id into v_payment_id;
    end if;
    update public.payment_attempts
       set status = 'confirmed', confirmed_at = now(), confirmed_by = p_confirmed_by
     where id = v_attempt.id;
  end if;

  v_total_paid := v_already_paid + v_confirmed_amount;
  v_fully_paid := v_total_paid + 0.005 >= v_invoice.amount;

  update public.invoices
     set status = case when v_fully_paid then 'paid' else 'pending' end,
         paid_at = case when v_fully_paid then coalesce(v_invoice.paid_at, now()) else null end,
         payment_method = v_attempt.payment_method,
         updated_at = now()
   where id = v_invoice.id;

  if v_attempt.status = 'pending_confirmation' and v_confirmed_amount > 0 then
    perform public.notify_users(
      array[v_invoice.parent_id], v_invoice.nursery_id, 'invoice_paid', 'invoice_paid',
      jsonb_build_object(
        'invoice_number', public.invoice_number_label(v_invoice),
        'amount', v_confirmed_amount,
        'currency', coalesce(v_ns.currency, 'EGP')
      ),
      '/parent/invoices/' || v_invoice.id::text
    );
    perform public.loyalty_award_payment_points(v_invoice.nursery_id, v_invoice.parent_id, v_payment_id, v_confirmed_amount);
  end if;

  begin
    v_application_id := nullif(v_invoice.line_items_json ->> 'application_id', '')::uuid;
  exception when others then
    v_application_id := null;
  end;

  if v_application_id is not null and v_attempt.status = 'pending_confirmation' and v_confirmed_amount > 0 then
    perform public.notify_users(
      array(
        select u.id from public.users u
        where u.nursery_id = v_invoice.nursery_id
          and u.role in ('branch_admin'::public.user_role, 'chain_super_admin'::public.user_role)
      ),
      v_invoice.nursery_id, 'application_payment_confirmed', 'application_payment_confirmed', '{}'::jsonb,
      '/admin/admissions/applications/' || v_application_id::text
    );
  end if;

  return jsonb_build_object(
    'invoiceId', v_invoice.id,
    'paymentId', v_payment_id,
    'confirmedAmount', v_confirmed_amount,
    'paidAmount', v_total_paid,
    'invoiceStatus', case when v_fully_paid then 'paid' else 'pending' end,
    'applicationId', v_application_id,
    'approval', null
  );
end;
$$;

create or replace function public.confirm_invoice_payment_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_nursery_id uuid;
  v_uid uuid;
begin
  select pa.nursery_id into v_nursery_id from public.payment_attempts pa where pa.id = p_attempt_id;
  if not found then
    raise exception 'payment_attempt_not_found' using errcode = '42704';
  end if;
  v_uid := public.payment_staff_guard(v_nursery_id);
  return public.confirm_payment_attempt_internal(p_attempt_id, v_uid);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- One verified Paymob result. Called only by the paymob-webhook and invoice-checkout functions
-- after they checked the HMAC. Every call is recorded in payment_events.
-- ---------------------------------------------------------------------------------------------
create or replace function public.paymob_settle_attempt(
  p_attempt_id uuid,
  p_source text,
  p_transaction_id text,
  p_success boolean,
  p_pending boolean,
  p_amount_cents bigint,
  p_currency text,
  p_reason_code text default null,
  p_provider_message text default null,
  p_provider_reference text default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_attempt public.payment_attempts%rowtype;
  v_invoice public.invoices%rowtype;
  v_ns public.nursery_settings%rowtype;
  v_outcome text;
  v_remaining numeric;
  v_reason text := nullif(trim(coalesce(p_reason_code, '')), '');
  v_reference text := nullif(trim(coalesce(p_provider_reference, '')), '');
  v_transaction text := nullif(trim(coalesce(p_transaction_id, '')), '');
begin
  if p_source not in ('webhook', 'redirect') then
    raise exception 'payment_event_invalid_source' using errcode = '22023';
  end if;

  if p_attempt_id is not null then
    select * into v_attempt from public.payment_attempts where id = p_attempt_id for update;
  end if;

  if v_attempt.id is null then
    v_outcome := 'attempt_not_found';
  elsif v_attempt.payment_method <> 'card' then
    v_outcome := 'not_online_attempt';
  elsif coalesce(v_attempt.notes, '') like '[TEST PAYMENT]%' then
    v_outcome := 'test_attempt';
  elsif v_transaction is not null and exists (
    -- The webhook and the browser return report the same transaction; apply it once.
    select 1 from public.payment_events e
    where e.provider = 'paymob'
      and e.transaction_id = v_transaction
      and e.attempt_id = v_attempt.id
      and e.success is not distinct from p_success
      and e.pending is not distinct from p_pending
      and e.outcome not in ('duplicate', 'ignored')
  ) then
    v_outcome := 'duplicate';
  elsif coalesce(p_success, false) then
    if upper(coalesce(p_currency, '')) <> 'EGP' or p_amount_cents is distinct from round(v_attempt.amount * 100)::bigint then
      -- Never confirm a different amount than the parent was asked for; finance decides.
      v_outcome := 'amount_mismatch';
    elsif v_attempt.status = 'confirmed' then
      v_outcome := 'already_confirmed';
    elsif v_attempt.status = 'cancelled' then
      -- Finance rejected it, yet Paymob took the money.
      v_outcome := 'needs_review';
    else
      if v_attempt.status = 'failed' then
        -- Paid after the attempt was released (a first card was declined and a second one
        -- worked, or the parent came back to the checkout). Re-open it only while the invoice
        -- still has room for it; otherwise it is a double payment finance must refund.
        select * into v_invoice from public.invoices where id = v_attempt.invoice_id for update;
        v_remaining := v_invoice.amount - public.invoice_paid_total(v_invoice.id) - public.invoice_pending_total(v_invoice.id);
        if v_invoice.status in ('paid', 'cancelled') or v_attempt.amount > v_remaining + 0.005 then
          v_outcome := 'needs_review';
        end if;
      end if;
      if v_outcome is null then
        update public.payment_attempts
           set status = 'pending_confirmation',
               failure_reason = null,
               paymob_transaction_id = coalesce(v_transaction, paymob_transaction_id)
         where id = v_attempt.id;
        perform public.confirm_payment_attempt_internal(v_attempt.id, null);
        v_outcome := 'confirmed';
      end if;
    end if;
  elsif coalesce(p_pending, false) then
    -- The money is not in yet, e.g. a Fawry reference was issued for payment at an outlet.
    update public.payment_attempts
       set provider_reference = coalesce(v_reference, provider_reference)
     where id = v_attempt.id and status = 'pending_confirmation';
    v_outcome := 'pending';
  elsif v_attempt.status = 'pending_confirmation' then
    update public.payment_attempts
       set status = 'failed',
           failure_reason = coalesce(v_reason, 'declined'),
           paymob_transaction_id = coalesce(v_transaction, paymob_transaction_id),
           notes = left(concat_ws(' | ', nullif(notes, ''),
             'Paymob: ' || coalesce(nullif(trim(coalesce(p_provider_message, '')), ''), 'payment failed')), 1000)
     where id = v_attempt.id;
    v_outcome := 'failed';
  else
    v_outcome := 'ignored';
  end if;

  insert into public.payment_events (
    provider, source, transaction_id, attempt_id, nursery_id, success, pending,
    amount_cents, currency, outcome, reason_code, provider_message, payload
  )
  values (
    'paymob', p_source, v_transaction, v_attempt.id, v_attempt.nursery_id, p_success, p_pending,
    p_amount_cents, p_currency, v_outcome, v_reason, left(p_provider_message, 500), coalesce(p_payload, '{}'::jsonb)
  );

  if v_outcome in ('failed', 'needs_review', 'amount_mismatch') then
    select * into v_invoice from public.invoices where id = v_attempt.invoice_id;
    select * into v_ns from public.nursery_settings where nursery_id = v_attempt.nursery_id;
  end if;

  if v_outcome = 'failed' then
    perform public.notify_users(
      array[v_attempt.parent_id], v_attempt.nursery_id, 'payment_online_failed', 'payment_online_failed',
      jsonb_build_object(
        'invoice_number', public.invoice_number_label(v_invoice),
        'amount', v_attempt.amount,
        'currency', coalesce(v_ns.currency, 'EGP')
      ),
      '/parent/invoices/' || v_attempt.invoice_id::text,
      'high'
    );
  elsif v_outcome in ('needs_review', 'amount_mismatch') then
    perform public.notify_users(
      public.payment_finance_recipients(v_attempt.nursery_id), v_attempt.nursery_id,
      'payment_gateway_needs_review', 'payment_gateway_needs_review',
      jsonb_build_object(
        'invoice_number', public.invoice_number_label(v_invoice),
        'amount', round(coalesce(p_amount_cents, 0) / 100.0, 2),
        'currency', coalesce(v_ns.currency, 'EGP'),
        'transaction', coalesce(v_transaction, '-')
      ),
      '/admin/invoices/' || v_attempt.invoice_id::text,
      'high'
    );
  end if;

  select * into v_attempt from public.payment_attempts where id = v_attempt.id;
  return jsonb_build_object(
    'outcome', v_outcome,
    'attempt_id', v_attempt.id,
    'attempt_status', v_attempt.status,
    'invoice_id', v_attempt.invoice_id,
    'failure_reason', v_attempt.failure_reason,
    'provider_reference', v_attempt.provider_reference
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- The parent left Paymob's page without paying (back button, closed tab): release the attempt
-- so the invoice can be paid again. Refused once Paymob reported a transaction for it.
-- ---------------------------------------------------------------------------------------------
create or replace function public.cancel_unfinished_online_payment(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_attempt public.payment_attempts%rowtype;
begin
  if v_uid is null then
    raise exception 'payment_not_authenticated' using errcode = '28000';
  end if;
  select * into v_attempt from public.payment_attempts where id = p_attempt_id for update;
  if not found or v_attempt.parent_id is distinct from v_uid then
    raise exception 'payment_forbidden' using errcode = '42501';
  end if;
  if v_attempt.status <> 'pending_confirmation' then
    return jsonb_build_object('status', v_attempt.status, 'changed', false);
  end if;
  if v_attempt.payment_method <> 'card' then
    raise exception 'payment_not_online' using errcode = '22023';
  end if;
  if v_attempt.paymob_transaction_id is not null
     or v_attempt.provider_reference is not null
     or exists (
       select 1 from public.payment_events e
       where e.attempt_id = v_attempt.id and (coalesce(e.success, false) or coalesce(e.pending, false))
     ) then
    raise exception 'payment_in_progress' using errcode = 'P0001';
  end if;

  update public.payment_attempts
     set status = 'failed',
         failure_reason = 'checkout_abandoned',
         notes = left(concat_ws(' | ', nullif(notes, ''), 'Parent left the online checkout without paying.'), 1000)
   where id = v_attempt.id;
  return jsonb_build_object('status', 'failed', 'changed', true);
end;
$$;

revoke execute on function public.confirm_payment_attempt_internal(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.paymob_settle_attempt(uuid, text, text, boolean, boolean, bigint, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.confirm_payment_attempt_internal(uuid, uuid) to service_role;
grant execute on function public.paymob_settle_attempt(uuid, text, text, boolean, boolean, bigint, text, text, text, text, jsonb)
  to service_role;

revoke execute on function public.confirm_invoice_payment_attempt(uuid) from public, anon;
grant execute on function public.confirm_invoice_payment_attempt(uuid) to authenticated;
revoke execute on function public.cancel_unfinished_online_payment(uuid) from public, anon;
grant execute on function public.cancel_unfinished_online_payment(uuid) to authenticated;

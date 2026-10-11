alter table public.nursery_settings
  add column if not exists etisalat_cash_account_number text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Parents upload own payment proofs" on storage.objects;
create policy "Parents upload own payment proofs"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'payment-proofs'
  and split_part(name, '/', 1) = (select nursery_id::text from public.users where id = auth.uid())
  and split_part(name, '/', 2) = auth.uid()::text
);

drop policy if exists "Parents and finance read payment proofs" on storage.objects;
create policy "Parents and finance read payment proofs"
on storage.objects for select to authenticated
using (
  bucket_id = 'payment-proofs'
  and exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and (
        (
          u.id::text = split_part(name, '/', 2)
          and u.nursery_id::text = split_part(name, '/', 1)
        )
        or (
          u.nursery_id::text = split_part(name, '/', 1)
          and (
            public.current_user_role() in ('branch_admin', 'chain_super_admin', 'xo_super_admin')
            or (
              public.current_user_role() in ('manager', 'teacher')
              and public.user_can('payments', 'view')
            )
          )
        )
      )
  )
);

drop policy if exists "Parents delete own payment proofs" on storage.objects;
create policy "Parents delete own payment proofs"
on storage.objects for delete to authenticated
using (
  bucket_id = 'payment-proofs'
  and split_part(name, '/', 1) = (select nursery_id::text from public.users where id = auth.uid())
  and split_part(name, '/', 2) = auth.uid()::text
);

create or replace function public.submit_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_method text default 'manual',
  p_reference text default null,
  p_proof_url text default null,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  if p_method not in ('manual', 'cash', 'bank_transfer', 'instapay', 'vodafone_cash', 'etisalat_cash', 'orange_cash', 'fawry', 'card') then
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
$$;

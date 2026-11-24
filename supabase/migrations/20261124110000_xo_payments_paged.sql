-- The platform's payments page asks the server for one page at a time, and for its counts.
--
-- It used to ask for every payment attempt of every nursery at once. The server answers a read with
-- 1,000 rows at most, so with 12,214 attempts the page silently showed the newest 1,000: the tiles
-- counted those 1,000 ("All 1000"), and a search never reached anything older.
--
-- get_xo_payment_attempts: one page of attempts, newest first, with the invoice number and the
-- nursery's, the parent's and the approver's names joined in, filtered by status and by a search over
-- those names and the invoice number; every row carries total_count, the number of attempts the
-- filters match. "cancelled" (shown as Rejected) means rejected or failed, as the tile counts them.
--
-- get_xo_payment_attempt_counts: the tiles, over every attempt on the platform.
--
-- Both are for the platform's super admin only.

create or replace function public.get_xo_payment_attempts(
  p_status text default null,
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  status text,
  amount numeric,
  payment_method text,
  created_at timestamptz,
  confirmed_at timestamptz,
  invoice_number text,
  nursery_name_ar text,
  nursery_name_en text,
  parent_name_ar text,
  parent_name_en text,
  confirmer_name_ar text,
  confirmer_name_en text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_search text := lower(nullif(btrim(p_search), ''));
begin
  if not public.is_xo_super_admin() then
    raise exception 'xo_payments_forbidden' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('pending_confirmation', 'confirmed', 'cancelled') then
    raise exception 'xo_payments_bad_status' using errcode = '22023';
  end if;

  return query
    select pa.id, pa.status, pa.amount, pa.payment_method, pa.created_at, pa.confirmed_at,
           coalesce(i.generated_invoice_number, left(pa.invoice_id::text, 8)),
           n.name_ar, n.name_en, p.name_ar, p.name_en, c.name_ar, c.name_en,
           count(*) over ()
      from public.payment_attempts pa
      left join public.invoices i on i.id = pa.invoice_id
      left join public.nurseries n on n.id = pa.nursery_id
      left join public.users p on p.id = pa.parent_id
      left join public.users c on c.id = pa.confirmed_by
     where (p_status is null
            or pa.status = p_status
            or (p_status = 'cancelled' and pa.status = 'failed'))
       -- A plain substring match: what the admin types is text, never a LIKE pattern.
       and (v_search is null
            or strpos(lower(concat_ws(' ', n.name_ar, n.name_en, p.name_ar, p.name_en, i.generated_invoice_number)), v_search) > 0)
     order by pa.created_at desc, pa.id
     limit least(greatest(coalesce(p_limit, 20), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.get_xo_payment_attempt_counts()
returns table (total bigint, pending bigint, confirmed bigint, rejected bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_xo_super_admin() then
    raise exception 'xo_payments_forbidden' using errcode = '42501';
  end if;

  return query
    select count(*),
           count(*) filter (where pa.status = 'pending_confirmation'),
           count(*) filter (where pa.status = 'confirmed'),
           count(*) filter (where pa.status in ('cancelled', 'failed'))
      from public.payment_attempts pa;
end;
$$;

revoke all on function public.get_xo_payment_attempts(text, text, integer, integer) from public, anon;
revoke all on function public.get_xo_payment_attempt_counts() from public, anon;
grant execute on function public.get_xo_payment_attempts(text, text, integer, integer) to authenticated, service_role;
grant execute on function public.get_xo_payment_attempt_counts() to authenticated, service_role;

-- Both parents see and pay the family's invoices.
--
-- An invoice is billed to one parent (invoices.parent_id), and only that parent could see or pay it:
-- for the 4,645 children with two parents, the other one saw "nothing to pay" while the family owed.
-- Now a parent sees and pays an invoice when they are the parent billed, or when they share with the
-- parent billed a child both parents look after (children.custody_status 'both_parents') in the
-- invoice's nursery, and that child is on the invoice (or the invoice names no child: a family
-- charge). Where custody is with one parent (or not recorded), only the parent billed sees it.
--  * invoice_family_member(parent, invoice) is the rule; my_family_billers() the parents whose
--    invoices the signed-in parent may see (so the rule reads few rows).
--  * The rules on invoices and payments, get_parent_billing, get_parent_invoice (the parent named
--    is the one billed, and the reminders shown are theirs), redeem_loyalty_points (the reader's
--    points), and the guard on payment attempts (the attempt is the payer's) all follow it.
--  * parent_can_pay_invoice(id) for the online checkout.
-- Reminders still go to the parent billed.

-- The children an invoice is for: its event links, its line items (child_id, child_ids) and its
-- application. (parent_invoice_summary reads them from here.)
create or replace function public.invoice_child_ids(p_invoice public.invoices)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  with application as (
    select a.id, a.child_id
      from public.applications a
     where a.id = case
                    when coalesce(p_invoice.line_items_json ->> 'application_id', '') ~* '^[0-9a-f-]{36}$'
                      then (p_invoice.line_items_json ->> 'application_id')::uuid
                  end
  )
  select coalesce(array_agg(distinct x.child_id) filter (where x.child_id is not null), '{}') as ids
    from (
      select ei.child_id from public.event_invoices ei where ei.invoice_id = p_invoice.id
      union all
      select case when coalesce(p_invoice.line_items_json ->> 'child_id', '') ~* '^[0-9a-f-]{36}$'
                  then (p_invoice.line_items_json ->> 'child_id')::uuid end
      union all
      select case when c ~* '^[0-9a-f-]{36}$' then c::uuid end
        from jsonb_array_elements_text(
               case when jsonb_typeof(p_invoice.line_items_json -> 'child_ids') = 'array'
                    then p_invoice.line_items_json -> 'child_ids' else '[]'::jsonb end
             ) c
      union all
      select child_id from application
    ) x;
$$;


-- The parents whose invoices the signed-in parent may see: themselves, and the other parent of each
-- child they share in both parents' custody.
create or replace function public.my_family_billers()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() where auth.uid() is not null
  union
  select billed.parent_id
    from public.parent_children mine
    join public.parent_children billed on billed.child_id = mine.child_id
    join public.children c on c.id = mine.child_id and c.custody_status = 'both_parents'
   where mine.parent_id = auth.uid();
$$;

-- Whether a parent may see and pay an invoice (see the top).
create or replace function public.invoice_family_member(p_parent_id uuid, p_invoice public.invoices)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_parent_id is not null and (
    p_parent_id = p_invoice.parent_id
    or exists (
      select 1
        from public.parent_children mine
        join public.parent_children billed on billed.child_id = mine.child_id and billed.parent_id = p_invoice.parent_id
        join public.children c on c.id = mine.child_id and c.nursery_id = p_invoice.nursery_id and c.custody_status = 'both_parents'
       cross join lateral (select public.invoice_child_ids(p_invoice) as ids) k
       where mine.parent_id = p_parent_id
         and (cardinality(k.ids) = 0 or mine.child_id = any (k.ids))
    )
  );
$$;

-- Whether the signed-in parent may pay this invoice (the online checkout asks before starting).
create or replace function public.parent_can_pay_invoice(p_invoice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select public.current_user_role() = 'parent'::public.user_role and public.invoice_family_member(auth.uid(), i)
      from public.invoices i where i.id = p_invoice_id
  ), false);
$$;

-- (as in 20261108000000, its children from invoice_child_ids)
create or replace function public.parent_invoice_summary(p_invoice public.invoices)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with k as (
    select (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date as today
      from (select 1) one
      left join public.nursery_settings ns on ns.nursery_id = p_invoice.nursery_id
  ),
  money as (
    select public.invoice_paid_total(p_invoice.id) as paid,
           public.invoice_pending_total(p_invoice.id) as pending
  ),
  application as (
    select a.id, a.child_id
      from public.applications a
     where a.id = case
                    when coalesce(p_invoice.line_items_json ->> 'application_id', '') ~* '^[0-9a-f-]{36}$'
                      then (p_invoice.line_items_json ->> 'application_id')::uuid
                  end
  ),
  children as (
    select public.invoice_child_ids(p_invoice) as ids
  )
  select jsonb_build_object(
    'id', p_invoice.id,
    'nursery_id', p_invoice.nursery_id,
    'invoice_number', public.invoice_number_label(p_invoice),
    'amount', p_invoice.amount,
    'type', p_invoice.invoice_type,
    'status', case
                when p_invoice.status in ('paid', 'cancelled') then p_invoice.status
                when p_invoice.status = 'overdue' or p_invoice.due_date < k.today then 'overdue'
                else 'pending'
              end,
    'due_date', p_invoice.due_date,
    'created_at', p_invoice.created_at,
    'paid_at', p_invoice.paid_at,
    'payment_method', p_invoice.payment_method,
    'line_items', p_invoice.line_items_json,
    'paid_amount', money.paid,
    'pending_amount', case when p_invoice.status in ('paid', 'cancelled') then 0 else money.pending end,
    'payable', case
                 when p_invoice.status in ('paid', 'cancelled') then 0
                 else greatest(round(p_invoice.amount - money.paid - money.pending, 2), 0)
               end,
    'overdue_days', case
                      when p_invoice.status not in ('paid', 'cancelled') and p_invoice.due_date < k.today
                        then k.today - p_invoice.due_date
                      else 0
                    end,
    'application_id', (select id from application),
    'child_ids', (select to_jsonb(ids) from children)
  )
  from k, money
$$;

create or replace function public.get_parent_billing()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'payment_not_authenticated' using errcode = '28000';
  end if;
  return coalesce((
    select jsonb_agg(public.parent_invoice_summary(i) order by i.created_at desc, i.id)
      from public.invoices i
     where i.parent_id in (select public.my_family_billers())
       and public.invoice_family_member(v_uid, i)
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_parent_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invoice public.invoices%rowtype;
  v_summary jsonb;
  v_ns public.nursery_settings%rowtype;
  v_points integer;
  v_previous_discount numeric;
  v_cap numeric;
begin
  if v_uid is null then
    raise exception 'payment_not_authenticated' using errcode = '28000';
  end if;
  select * into v_invoice from public.invoices where id = p_invoice_id;
  if not found then
    return null;
  end if;
  if not public.invoice_family_member(v_uid, v_invoice) then
    raise exception 'payment_invoice_not_yours' using errcode = '42501';
  end if;

  v_summary := public.parent_invoice_summary(v_invoice);
  select * into v_ns from public.nursery_settings where nursery_id = v_invoice.nursery_id;
  select coalesce(sum(lt.points), 0)::integer into v_points
    from public.loyalty_transactions lt
   where lt.parent_id = v_uid and lt.nursery_id = v_invoice.nursery_id;
  v_previous_discount := public.invoice_loyalty_discount_total(v_invoice.line_items_json);
  v_cap := greatest(round((v_invoice.amount + v_previous_discount) * 0.5, 2) - v_previous_discount, 0);

  return v_summary || jsonb_build_object(
    'parent', (select jsonb_build_object('name_ar', u.name_ar, 'name_en', u.name_en) from public.users u where u.id = v_invoice.parent_id),
    'children', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name_ar', c.full_name_ar, 'name_en', c.full_name_en) order by c.full_name_en)
        from public.children c
       where c.id in (select (jsonb_array_elements_text(v_summary -> 'child_ids'))::uuid)
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'amount', p.amount, 'method', p.method, 'paid_at', p.paid_at) order by p.paid_at desc)
        from public.payments p
       where p.invoice_id = v_invoice.id and p.status = 'completed'
    ), '[]'::jsonb),
    'in_review', coalesce((
      select jsonb_agg(jsonb_build_object('id', pa.id, 'amount', pa.amount, 'method', pa.payment_method, 'created_at', pa.created_at) order by pa.created_at)
        from public.payment_attempts pa
       where pa.invoice_id = v_invoice.id and pa.status = 'pending_confirmation'
         and v_invoice.status not in ('paid', 'cancelled')
    ), '[]'::jsonb),
    'reminders', coalesce((
      select jsonb_agg(jsonb_build_object('type', n.type, 'sent_at', n.sent_at) order by n.sent_at)
        from public.notifications n
       where n.user_id = v_invoice.parent_id
         and n.type in ('invoice_reminder', 'invoice_due_reminder', 'invoice_overdue_reminder')
         and n.action_link = '/parent/invoices/' || v_invoice.id::text
    ), '[]'::jsonb),
    'loyalty', jsonb_build_object(
      'enabled', coalesce(v_ns.loyalty_enabled, false) and coalesce(v_ns.points_redemption_rate, 0) > 0,
      'rate', coalesce(v_ns.points_redemption_rate, 0),
      'balance', v_points,
      'min_points', 100,
      -- The most the next redemption may take off: the cap left and what is still payable.
      'max_discount', least(v_cap, (v_summary ->> 'payable')::numeric)
    )
  );
end;
$$;

create or replace function public.redeem_loyalty_points(
  p_invoice_id uuid,
  p_points integer,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invoice public.invoices%rowtype;
  v_ns public.nursery_settings%rowtype;
  v_balance integer;
  v_rate numeric;
  v_discount numeric;
  v_previous_discount numeric;
  v_cap numeric;
  v_due numeric;
  v_new_amount numeric;
  v_paid numeric;
  v_min_points constant integer := 100;
  v_max_share constant numeric := 0.5;
begin
  if v_uid is null then
    raise exception 'payment_not_authenticated' using errcode = '28000';
  end if;
  if p_idempotency_key is not null and exists (
    select 1 from public.loyalty_transactions where idempotency_key = p_idempotency_key
  ) then
    return jsonb_build_object('status', 'duplicate');
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'payment_invoice_not_found' using errcode = 'P0001';
  end if;
  if not public.invoice_family_member(v_uid, v_invoice) then
    raise exception 'payment_invoice_not_yours' using errcode = '42501';
  end if;
  if v_invoice.status in ('paid', 'cancelled') then
    raise exception 'payment_invoice_closed' using errcode = 'P0001';
  end if;

  select * into v_ns from public.nursery_settings where nursery_id = v_invoice.nursery_id;
  v_rate := coalesce(v_ns.points_redemption_rate, 0);
  if not coalesce(v_ns.loyalty_enabled, false) or v_rate <= 0 then
    raise exception 'loyalty_disabled' using errcode = 'P0001';
  end if;
  if p_points is null or p_points < v_min_points then
    raise exception 'loyalty_min_points' using errcode = 'P0001';
  end if;

  select coalesce(sum(lt.points), 0) into v_balance
  from public.loyalty_transactions lt
  where lt.parent_id = v_uid and lt.nursery_id = v_invoice.nursery_id;
  if p_points > v_balance then
    raise exception 'loyalty_insufficient_points' using errcode = 'P0001';
  end if;

  v_discount := round(p_points * v_rate, 2);
  select coalesce(sum(-(item ->> 'total')::numeric), 0) into v_previous_discount
  from jsonb_array_elements(
    case jsonb_typeof(v_invoice.line_items_json)
      when 'array' then v_invoice.line_items_json
      when 'object' then coalesce(case when jsonb_typeof(v_invoice.line_items_json -> 'items') = 'array'
                                       then v_invoice.line_items_json -> 'items' end, '[]'::jsonb)
      else '[]'::jsonb
    end
  ) item
  where item ->> 'kind' = 'loyalty_discount';

  -- At most half of the original invoice, all redemptions together, and never below what's paid.
  v_cap := round((v_invoice.amount + v_previous_discount) * v_max_share, 2) - v_previous_discount;
  v_paid := public.invoice_paid_total(v_invoice.id);
  v_due := v_invoice.amount - v_paid - public.invoice_pending_total(v_invoice.id);
  if v_discount > v_cap + 0.005 or v_discount > v_due + 0.005 then
    raise exception 'loyalty_exceeds_cap' using errcode = 'P0001';
  end if;

  insert into public.loyalty_transactions (
    nursery_id, parent_id, transaction_type, points, source, reference_id, idempotency_key
  )
  values (v_invoice.nursery_id, v_uid, 'redeemed', -p_points, 'manual', v_invoice.id, p_idempotency_key);

  v_new_amount := v_invoice.amount - v_discount;
  update public.invoices
     set amount = v_new_amount,
         line_items_json = public.invoice_append_item(line_items_json, jsonb_build_object(
           'kind', 'loyalty_discount',
           'points', p_points,
           'quantity', 1,
           'unitPrice', -v_discount,
           'unit_price', -v_discount,
           'total', -v_discount
         )),
         status = case when v_new_amount <= v_paid + 0.005 then 'paid' else status end,
         paid_at = case when v_new_amount <= v_paid + 0.005 then coalesce(paid_at, now()) else paid_at end,
         updated_at = now()
   where id = v_invoice.id;

  return jsonb_build_object('status', 'redeemed', 'points', p_points, 'discount', v_discount, 'new_amount', v_new_amount);
end;
$$;

create or replace function public.payment_attempts_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_remaining numeric;
  v_application_id uuid;
  v_application_status text;
  v_terms_accepted boolean;
begin
  select * into v_invoice from public.invoices where id = new.invoice_id for update;
  if not found then
    raise exception 'payment_invoice_not_found' using errcode = 'P0001';
  end if;
  if not public.invoice_family_member(new.parent_id, v_invoice) then
    raise exception 'payment_invoice_not_yours' using errcode = '42501';
  end if;
  if v_invoice.status in ('paid', 'cancelled') then
    raise exception 'payment_invoice_closed' using errcode = 'P0001';
  end if;
  if new.amount is null or new.amount <= 0 then
    raise exception 'payment_invalid_amount' using errcode = 'P0001';
  end if;

  -- Added: paying an admission invoice is what sends its application for review, so a draft
  -- still missing the terms or a required document would take the money and stay a draft.
  begin
    v_application_id := nullif(v_invoice.line_items_json ->> 'application_id', '')::uuid;
  exception when others then
    v_application_id := null;
  end;
  if v_application_id is not null then
    select a.status, coalesce(a.terms_accepted, false)
      into v_application_status, v_terms_accepted
      from public.applications a
     where a.id = v_application_id;
    if v_application_status = 'draft'
       and (not v_terms_accepted or not public.application_has_required_documents(v_application_id)) then
      raise exception 'payment_application_incomplete' using errcode = 'P0001';
    end if;
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

drop policy if exists invoices_parent_select on public.invoices;
create policy invoices_parent_select on public.invoices
  for select to authenticated
  using (
    public.current_user_role() = 'parent'::public.user_role
    and parent_id in (select public.my_family_billers())
    and public.invoice_family_member(auth.uid(), invoices)
  );

drop policy if exists payments_parent_select on public.payments;
create policy payments_parent_select on public.payments
  for select to authenticated
  using (
    public.current_user_role() = 'parent'::public.user_role
    and exists (
      select 1 from public.invoices i
       where i.id = payments.invoice_id
         and i.parent_id in (select public.my_family_billers())
         and public.invoice_family_member(auth.uid(), i)
    )
  );

revoke all on function public.invoice_child_ids(public.invoices) from public, anon;
revoke all on function public.my_family_billers() from public, anon;
revoke all on function public.invoice_family_member(uuid, public.invoices) from public, anon;
revoke all on function public.parent_can_pay_invoice(uuid) from public, anon;
grant execute on function public.invoice_child_ids(public.invoices) to authenticated, service_role;
grant execute on function public.my_family_billers() to authenticated, service_role;
grant execute on function public.invoice_family_member(uuid, public.invoices) to authenticated, service_role;
grant execute on function public.parent_can_pay_invoice(uuid) to authenticated, service_role;

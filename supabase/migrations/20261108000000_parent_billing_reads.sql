-- What a parent sees of their bills, read through two functions instead of table reads.
--
-- Table reads (GET /rest/v1/...) are answered from the service worker's cache first, so right after
-- a parent pays or uses points the screen would still show the old balance. These functions are
-- POST calls the cache never keeps, and they apply the same rules the payment functions check:
--   * paid      = completed payments;
--   * in review = payment requests waiting for the nursery (payment_attempts pending_confirmation);
--   * payable   = what can still be sent now: amount - paid - in review (submit_invoice_payment
--                 refuses more: payment_exceeds_balance);
--   * overdue   = an open invoice whose due date has passed in its nursery's own calendar day;
--   * points    = the parent's balance at the invoice's nursery (sum of loyalty_transactions), the
--                 smallest redemption, and the most the invoice can still be reduced: half of its
--                 original amount over all redemptions, and never more than is payable
--                 (redeem_loyalty_points: loyalty_min_points / loyalty_exceeds_cap).
-- A parent reads only invoices billed to them.

-- Total of the loyalty discount lines already on an invoice (stored as negative totals).
create or replace function public.invoice_loyalty_discount_total(p_line_items jsonb)
returns numeric
language sql
immutable
as $$
  select coalesce(sum(-(item ->> 'total')::numeric), 0)
    from jsonb_array_elements(
      case jsonb_typeof(p_line_items)
        when 'array' then p_line_items
        when 'object' then coalesce(case when jsonb_typeof(p_line_items -> 'items') = 'array' then p_line_items -> 'items' end, '[]'::jsonb)
        else '[]'::jsonb
      end
    ) item
   where item ->> 'kind' = 'loyalty_discount'
$$;

-- One invoice as the parent screens read it.
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
      ) x
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

revoke execute on function public.parent_invoice_summary(public.invoices) from public, anon, authenticated;

-- The signed-in parent's invoices, newest first.
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
     where i.parent_id = v_uid
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.get_parent_billing() from public, anon;
grant execute on function public.get_parent_billing() to authenticated, service_role;

-- One of the parent's invoices with everything the invoice and pay screens show. Null when it does
-- not exist; refused when it is billed to someone else.
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
  if v_invoice.parent_id is distinct from v_uid then
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
    'parent', (select jsonb_build_object('name_ar', u.name_ar, 'name_en', u.name_en) from public.users u where u.id = v_uid),
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
       where n.user_id = v_uid
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

revoke execute on function public.get_parent_invoice(uuid) from public, anon;
grant execute on function public.get_parent_invoice(uuid) to authenticated, service_role;

-- Lets a nursery admin change an already-enrolled child's tuition package/billing period.
-- Parents cannot do this themselves (child_tuition_subscriptions has no parent write policy —
-- see 20261002093000) — this RPC is the only way it changes after enrollment.

begin;

create or replace function public.admin_set_child_tuition_subscription(
  p_child_id uuid,
  p_tuition_package_id uuid,
  p_billing_period text,
  p_effective text default 'next_period',
  p_billed_parent_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_user_nursery_id uuid;
  v_user_chain_id uuid;
  v_child public.children%rowtype;
  v_period public.tuition_package_billing_periods%rowtype;
  v_pkg public.tuition_packages%rowtype;
  v_existing public.child_tuition_subscriptions%rowtype;
  v_billed_parent_id uuid;
  v_next_invoice_date date;
  v_new_id uuid;
  v_invoice_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select u.role, u.nursery_id, u.chain_id into v_role, v_user_nursery_id, v_user_chain_id
  from public.users u where u.id = v_uid;

  select * into v_child from public.children where id = p_child_id;
  if not found then
    raise exception 'Child not found' using errcode = '42704';
  end if;

  if v_role in ('branch_admin'::public.user_role, 'manager'::public.user_role) then
    if v_user_nursery_id is distinct from v_child.nursery_id then
      raise exception 'Cannot manage children outside your nursery' using errcode = '42501';
    end if;
  elsif v_role = 'chain_super_admin'::public.user_role then
    if v_user_chain_id is null or not exists (
      select 1 from public.nurseries n where n.id = v_child.nursery_id and n.chain_id = v_user_chain_id
    ) then
      raise exception 'Cannot manage children outside your chain' using errcode = '42501';
    end if;
  elsif not public.is_xo_super_admin() then
    raise exception 'Cannot manage tuition subscriptions' using errcode = '42501';
  end if;

  if p_effective not in ('next_period', 'immediate') then
    raise exception 'Invalid effective option' using errcode = '22023';
  end if;

  select * into v_pkg from public.tuition_packages
  where id = p_tuition_package_id and nursery_id = v_child.nursery_id and active = true;
  if not found then
    raise exception 'Tuition package not found' using errcode = '42704';
  end if;

  select * into v_period from public.tuition_package_billing_periods
  where tuition_package_id = p_tuition_package_id
    and billing_period = p_billing_period
    and active = true;
  if not found then
    raise exception 'Billing period not offered for this package' using errcode = '42704';
  end if;

  select * into v_existing from public.child_tuition_subscriptions
  where child_id = p_child_id and status = 'active';

  v_billed_parent_id := p_billed_parent_id;
  if v_billed_parent_id is null then
    if v_existing.id is not null then
      v_billed_parent_id := v_existing.billed_parent_id;
    else
      select pc.parent_id into v_billed_parent_id
      from public.parent_children pc where pc.child_id = p_child_id
      order by pc.created_at limit 1;
    end if;
  end if;

  if v_billed_parent_id is null then
    raise exception 'No parent linked to this child to bill' using errcode = '22023';
  end if;

  if v_existing.id is not null then
    update public.child_tuition_subscriptions
       set status = 'cancelled', cancelled_at = now()
     where id = v_existing.id;
  end if;

  -- 'next_period' keeps the existing billing schedule (just swaps what bills from then on);
  -- 'immediate' starts billing today. No proration either way — see plan risk notes.
  v_next_invoice_date := case
    when p_effective = 'immediate' then current_date
    else coalesce(v_existing.next_invoice_date, current_date + make_interval(months => v_period.duration_months))
  end;

  insert into public.child_tuition_subscriptions (
    nursery_id, child_id, tuition_package_id, tuition_package_name_ar, tuition_package_name_en,
    billing_period, duration_months, locked_price, billed_parent_id, status, started_at,
    next_invoice_date, source_application_id, created_by
  )
  values (
    v_child.nursery_id, p_child_id, p_tuition_package_id, v_pkg.name_ar, v_pkg.name_en,
    p_billing_period, v_period.duration_months, v_period.price, v_billed_parent_id, 'active', current_date,
    v_next_invoice_date, v_existing.source_application_id, v_uid
  )
  returning id into v_new_id;

  if p_effective = 'immediate' then
    v_invoice_id := public._generate_tuition_invoice(v_new_id);
  end if;

  return jsonb_build_object('subscriptionId', v_new_id, 'invoiceId', v_invoice_id);
end;
$$;

grant execute on function public.admin_set_child_tuition_subscription(uuid, uuid, text, text, uuid) to authenticated;

commit;

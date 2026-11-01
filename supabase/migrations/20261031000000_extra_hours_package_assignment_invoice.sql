-- An extra-hours package the nursery assigns to a child is billed to the parent (launch blocker PKG-01).
--
-- Until now the admin screens wrote child_packages straight from the browser, so a package given
-- after enrollment ran with no invoice at all. admin_assign_extra_hours_package is now the only way
-- staff assign one, in one transaction:
--   * ends the child's active extra-hours package (one at a time, as before);
--   * starts the new one;
--   * bills the paying parent (p_billed_parent_id, else the one paying the child's tuition, else
--     the primary parent): a pending invoice of the package price less its live deal, due after the
--     nursery's invoice_due_days. Its type is 'other': 'extra_hours' invoices are late-pickup
--     charges, which the attendance and finance figures count on their own. A free package gets no
--     invoice.
--     line_items_json: { child_id, child_package_id, package_id, extra_hours_package_id,
--       extra_hours_package_name_ar/_en, extra_hours_subtotal, extra_hours_discount_amount,
--       items: [{ kind: 'extra_hours_package', scope: 'extra_hours', ... },
--               { kind: 'discount', scope: 'extra_hours', ... } when the deal is live] }
--     (the same item shape the admission invoice uses for its extra-hours lines).
-- Who: xo, the chain's admin, the branch admin, and a manager/teacher allowed packages:create
-- (the people the old insert policy let in).
--
-- Staff lose the direct insert on child_packages (ending a package stays an update).
-- get_package_subscriptions counts these invoices to their package, and takes their parent as its payer.

create or replace function public.admin_assign_extra_hours_package(
  p_child_id uuid,
  p_package_id uuid,
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
  v_user_nursery uuid;
  v_user_chain uuid;
  v_child public.children%rowtype;
  v_pkg public.packages%rowtype;
  v_deal public.deals%rowtype;
  v_parent uuid;
  v_due_days integer;
  v_subtotal numeric;
  v_discount numeric := 0;
  v_items jsonb;
  v_child_package_id uuid;
  v_invoice_id uuid;
begin
  if v_uid is null then
    raise exception 'extra_hours_not_authenticated' using errcode = '28000';
  end if;
  select u.role, u.nursery_id, u.chain_id into v_role, v_user_nursery, v_user_chain
  from public.users u where u.id = v_uid;

  select * into v_child from public.children where id = p_child_id;
  if not found then
    raise exception 'extra_hours_child_not_found' using errcode = '42704';
  end if;

  if public.is_xo_super_admin() then
    null;
  elsif v_role = 'chain_super_admin' then
    if v_user_chain is null or not exists (
      select 1 from public.nurseries n where n.id = v_child.nursery_id and n.chain_id = v_user_chain
    ) then
      raise exception 'extra_hours_forbidden' using errcode = '42501';
    end if;
  elsif v_role = 'branch_admin' then
    if v_user_nursery is distinct from v_child.nursery_id then
      raise exception 'extra_hours_forbidden' using errcode = '42501';
    end if;
  elsif v_role in ('manager', 'teacher') then
    if v_user_nursery is distinct from v_child.nursery_id or not public.user_can('packages', 'create') then
      raise exception 'extra_hours_forbidden' using errcode = '42501';
    end if;
  else
    raise exception 'extra_hours_forbidden' using errcode = '42501';
  end if;

  select * into v_pkg from public.packages
  where id = p_package_id and nursery_id = v_child.nursery_id and active = true;
  if not found then
    raise exception 'extra_hours_package_not_found' using errcode = '42704';
  end if;

  v_subtotal := round(coalesce(v_pkg.price, 0), 2);
  if v_pkg.deal_id is not null then
    select * into v_deal
    from public.deals
    where id = v_pkg.deal_id
      and active = true
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at > now());
    if found then
      v_discount := case
        when v_deal.discount_type = 'percentage' then round(v_subtotal * v_deal.discount_value / 100, 2)
        else v_deal.discount_value
      end;
      v_discount := least(greatest(v_discount, 0), v_subtotal);
    end if;
  end if;

  if p_billed_parent_id is not null then
    select pc.parent_id into v_parent
    from public.parent_children pc
    where pc.child_id = p_child_id and pc.parent_id = p_billed_parent_id;
    if v_parent is null then
      raise exception 'extra_hours_parent_not_linked' using errcode = '22023';
    end if;
  else
    select s.billed_parent_id into v_parent
    from public.child_tuition_subscriptions s
    where s.child_id = p_child_id and s.status = 'active'
    order by s.created_at desc
    limit 1;
    if v_parent is null then
      select pc.parent_id into v_parent
      from public.parent_children pc
      where pc.child_id = p_child_id
      order by pc.is_primary desc nulls last, pc.created_at
      limit 1;
    end if;
  end if;
  if v_parent is null and v_subtotal - v_discount > 0 then
    raise exception 'extra_hours_no_parent' using errcode = '22023';
  end if;

  update public.child_packages
     set status = 'cancelled'
   where child_id = p_child_id and status = 'active';

  insert into public.child_packages (package_id, child_id, nursery_id, status)
  values (p_package_id, p_child_id, v_child.nursery_id, 'active')
  returning id into v_child_package_id;

  if v_subtotal - v_discount > 0 then
    v_items := jsonb_build_array(
      jsonb_build_object(
        'kind', 'extra_hours_package',
        'scope', 'extra_hours',
        'name_ar', nullif(v_pkg.name_ar, ''),
        'name_en', nullif(v_pkg.name_en, ''),
        'description', coalesce(nullif(v_pkg.name_en, ''), nullif(v_pkg.name_ar, ''), 'Extra hours package'),
        'quantity', 1,
        'unitPrice', v_subtotal,
        'unit_price', v_subtotal,
        'total', v_subtotal
      )
    ) || case
      when v_discount > 0 then jsonb_build_array(
        jsonb_build_object(
          'kind', 'discount',
          'scope', 'extra_hours',
          'name_ar', nullif(v_deal.name_ar, ''),
          'name_en', nullif(v_deal.name_en, ''),
          'description', coalesce(nullif(v_deal.name_en, ''), nullif(v_deal.name_ar, ''), 'Discount'),
          'quantity', 1,
          'unitPrice', -v_discount,
          'unit_price', -v_discount,
          'total', -v_discount
        )
      )
      else '[]'::jsonb
    end;

    select ns.invoice_due_days into v_due_days from public.nursery_settings ns where ns.nursery_id = v_child.nursery_id;

    insert into public.invoices (nursery_id, parent_id, amount, due_date, status, invoice_type, line_items_json)
    values (
      v_child.nursery_id,
      v_parent,
      v_subtotal - v_discount,
      current_date + coalesce(v_due_days, 7),
      'pending',
      'other',
      jsonb_build_object(
        'child_id', p_child_id,
        'child_package_id', v_child_package_id,
        'package_id', v_pkg.id,
        'extra_hours_package_id', v_pkg.id,
        'extra_hours_package_name_ar', v_pkg.name_ar,
        'extra_hours_package_name_en', v_pkg.name_en,
        'extra_hours_subtotal', v_subtotal,
        'extra_hours_discount_amount', v_discount,
        'items', v_items
      )
    )
    returning id into v_invoice_id;
  end if;

  return jsonb_build_object('childPackageId', v_child_package_id, 'invoiceId', v_invoice_id);
end;
$$;

revoke execute on function public.admin_assign_extra_hours_package(uuid, uuid, uuid) from public, anon;
grant execute on function public.admin_assign_extra_hours_package(uuid, uuid, uuid) to authenticated, service_role;

-- Staff no longer insert packages themselves: the function above does, with the invoice.
drop policy if exists child_packages_perm_insert on public.child_packages;
drop policy if exists child_packages_admin_all on public.child_packages;

create policy child_packages_admin_select on public.child_packages
  for select
  using (public.current_user_role() = any (array['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])
         and nursery_id = public.current_user_nursery_id());

create policy child_packages_admin_update on public.child_packages
  for update
  using (public.current_user_role() = any (array['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])
         and nursery_id = public.current_user_nursery_id())
  with check (public.current_user_role() = any (array['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])
              and nursery_id = public.current_user_nursery_id());

create policy child_packages_admin_delete on public.child_packages
  for delete
  using (public.current_user_role() = any (array['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])
         and nursery_id = public.current_user_nursery_id());

-- get_package_subscriptions, as in 20261025020000, plus the invoice above: an extra-hours package's
-- invoices are now also the one made when the nursery assigned it (line_items_json.child_package_id),
-- whose parent is the package's payer.

create or replace function public.get_package_subscriptions(p_nursery_id uuid, p_from date default null, p_to date default null)
returns table (
  kind text,                 -- tuition | extra_hours
  subscription_id uuid,
  package_id uuid,
  package_name_ar text,
  package_name_en text,
  child_id uuid,
  child_name_ar text,
  child_name_en text,
  class_name_ar text,
  class_name_en text,
  parent_id uuid,
  parent_name_ar text,
  parent_name_en text,
  parent_phone text,
  billing_period text,       -- fixed packages: monthly | quarterly | half_annual | annual
  duration_months integer,
  price numeric,             -- fixed: the price locked for each billing period; extra hours: the package price
  included_hours integer,    -- extra hours: the hours a quota package holds (null: unlimited)
  hours_used numeric,
  status text,               -- active | cancelled | expired
  started_on date,
  ended_on date,
  invoiced boolean,          -- has any invoice at all (whatever the period)
  invoices integer,          -- invoices counted for the period
  billed numeric,
  paid numeric,
  awaiting numeric,
  unpaid numeric,
  overdue numeric,
  next_due_date date         -- the earliest due date still unpaid
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_tz text;
  v_today date;
begin
  perform public.payment_staff_guard(p_nursery_id);
  if (p_from is null) <> (p_to is null) or p_from > p_to or p_to - p_from + 1 > 366 then
    raise exception 'package_stats_invalid_range' using errcode = '22023';
  end if;
  select coalesce(ns.timezone, 'Africa/Cairo') into v_tz from public.nursery_settings ns where ns.nursery_id = p_nursery_id;
  v_tz := coalesce(v_tz, 'Africa/Cairo');
  v_today := (now() at time zone v_tz)::date;

  return query
  with subs as (
    select
      'tuition'::text as kind,
      s.id as subscription_id,
      s.tuition_package_id as package_id,
      coalesce(nullif(s.tuition_package_name_ar, ''), tp.name_ar) as package_name_ar,
      coalesce(nullif(s.tuition_package_name_en, ''), tp.name_en) as package_name_en,
      s.child_id,
      s.billed_parent_id as parent_id,
      s.billing_period,
      s.duration_months,
      s.locked_price as price,
      null::integer as included_hours,
      null::numeric as hours_used,
      case when s.status = 'active' then 'active' else 'cancelled' end as status,
      s.started_at as started_on,
      case when s.status <> 'active'
        then coalesce((s.cancelled_at at time zone v_tz)::date, (s.updated_at at time zone v_tz)::date) end as ended_on,
      s.source_application_id as application_id
    from public.child_tuition_subscriptions s
    left join public.tuition_packages tp on tp.id = s.tuition_package_id
    where s.nursery_id = p_nursery_id
    union all
    select
      'extra_hours',
      cp.id,
      cp.package_id,
      p.name_ar,
      p.name_en,
      cp.child_id,
      -- The parent billed when the nursery assigned it (none for one chosen in the application).
      (select i.parent_id from public.invoices i
        where i.nursery_id = p_nursery_id and i.line_items_json ->> 'child_package_id' = cp.id::text
        order by i.created_at limit 1),
      null,
      null,
      p.price,
      p.included_hours,
      coalesce(cp.hours_used, 0),
      case
        when cp.status <> 'active' then 'cancelled'
        when cp.expires_at is not null and cp.expires_at < now() then 'expired'
        else 'active'
      end,
      (coalesce(cp.assigned_at, cp.created_at) at time zone v_tz)::date,
      case
        when cp.status <> 'active' then (cp.updated_at at time zone v_tz)::date
        when cp.expires_at is not null and cp.expires_at < now() then (cp.expires_at at time zone v_tz)::date
      end,
      -- The application that chose this package; only the child's first assignment of it came from there.
      case when row_number() over (partition by cp.child_id, cp.package_id order by coalesce(cp.assigned_at, cp.created_at), cp.id) = 1
        then app.id end
    from public.child_packages cp
    join public.packages p on p.id = cp.package_id
    join public.children c on c.id = cp.child_id
    left join lateral (
      select a.id
      from public.applications a
      where a.extra_hours_package_id = cp.package_id
        and (a.id = nullif(c.enrollment_extended_json ->> 'source_application_id', '')::uuid
             or (a.child_id = cp.child_id and a.status = 'approved'))
      order by a.reviewed_at desc nulls last
      limit 1
    ) app on true
    where cp.nursery_id = p_nursery_id
  ),
  -- Each admission invoice's lines: the extra-hours part and the whole.
  admission_parts as (
    select
      i.id,
      coalesce(sum(coalesce(nullif(it ->> 'total', ''), nullif(it ->> 'amount', ''))::numeric)
        filter (where it ->> 'kind' = 'extra_hours_package' or it ->> 'scope' = 'extra_hours'), 0) as extra_total,
      coalesce(sum(coalesce(nullif(it ->> 'total', ''), nullif(it ->> 'amount', ''))::numeric), 0) as all_total
    from public.invoices i
    cross join lateral jsonb_array_elements(
      case jsonb_typeof(i.line_items_json)
        when 'array' then i.line_items_json
        when 'object' then case when jsonb_typeof(i.line_items_json -> 'items') = 'array' then i.line_items_json -> 'items' else '[]'::jsonb end
        else '[]'::jsonb
      end
    ) it
    where i.nursery_id = p_nursery_id
      and i.line_items_json ->> 'application_id' is not null
      and jsonb_typeof(it) = 'object'
    group by i.id
  ),
  links as (
    -- A fixed package's recurring invoices, whole.
    select s.subscription_id, i.id as invoice_id, 1::numeric as share
    from subs s
    join public.invoices i on i.nursery_id = p_nursery_id
      and i.line_items_json ->> 'subscription_id' = s.subscription_id::text
    where s.kind = 'tuition'
    union all
    -- The admission invoice: the package lines to the fixed package, the extra-hours lines to the extra-hours package.
    select s.subscription_id, i.id,
      case
        when s.kind = 'tuition' then case when ap.all_total > 0 then (ap.all_total - ap.extra_total) / ap.all_total else 1 end
        else case when ap.all_total > 0 then ap.extra_total / ap.all_total else 0 end
      end
    from subs s
    join public.invoices i on i.nursery_id = p_nursery_id
      and i.line_items_json ->> 'application_id' = s.application_id::text
    left join admission_parts ap on ap.id = i.id
    where s.application_id is not null
    union all
    -- An extra-hours package the nursery assigned: the invoice made for it, whole.
    select s.subscription_id, i.id, 1::numeric
    from subs s
    join public.invoices i on i.nursery_id = p_nursery_id
      and i.line_items_json ->> 'child_package_id' = s.subscription_id::text
    where s.kind = 'extra_hours'
  ),
  invoice_money as (
    select i.id, i.amount, i.due_date, (i.created_at at time zone v_tz)::date as issued_on,
      case when i.status = 'paid' then i.amount
           else least(i.amount, coalesce((select sum(pm.amount) from public.payments pm
                                          where pm.invoice_id = i.id and pm.status = 'completed'), 0))
      end as paid
    from public.invoices i
    where i.id in (select l.invoice_id from links l) and i.status <> 'cancelled'
  ),
  invoice_split as (
    select m.*,
      greatest(least(m.amount - m.paid, coalesce((select sum(pa.amount) from public.payment_attempts pa
                                                  where pa.invoice_id = m.id and pa.status = 'pending_confirmation'), 0)), 0) as awaiting
    from invoice_money m
  ),
  link_money as (
    select l.subscription_id, m.issued_on, m.due_date,
      round(m.amount * l.share, 2) as billed,
      round(m.paid * l.share, 2) as paid,
      round(m.awaiting * l.share, 2) as awaiting
    from links l
    join invoice_split m on m.id = l.invoice_id
    where l.share > 0
  ),
  money as (
    select lm.subscription_id,
      count(*)::integer as invoices,
      sum(lm.billed) as billed,
      sum(lm.paid) as paid,
      sum(lm.awaiting) as awaiting,
      sum(lm.billed - lm.paid - lm.awaiting) as unpaid,
      coalesce(sum(lm.billed - lm.paid - lm.awaiting) filter (where lm.due_date < v_today), 0) as overdue,
      min(lm.due_date) filter (where lm.billed - lm.paid - lm.awaiting > 0) as next_due_date
    from link_money lm
    where p_from is null or lm.issued_on between p_from and p_to
    group by lm.subscription_id
  ),
  ever as (
    select distinct lm.subscription_id from link_money lm
  )
  select
    s.kind,
    s.subscription_id,
    s.package_id,
    s.package_name_ar,
    s.package_name_en,
    s.child_id,
    c.full_name_ar,
    c.full_name_en,
    cl.name_ar,
    cl.name_en,
    coalesce(s.parent_id, par.parent_id),
    coalesce(bp.name_ar, par.name_ar),
    coalesce(bp.name_en, par.name_en),
    coalesce(bp.phone, par.phone),
    s.billing_period,
    s.duration_months,
    s.price,
    s.included_hours,
    s.hours_used,
    s.status,
    s.started_on,
    s.ended_on,
    e.subscription_id is not null,
    coalesce(mo.invoices, 0),
    coalesce(mo.billed, 0),
    coalesce(mo.paid, 0),
    coalesce(mo.awaiting, 0),
    coalesce(mo.unpaid, 0),
    coalesce(mo.overdue, 0),
    mo.next_due_date
  from subs s
  join public.children c on c.id = s.child_id
  left join public.classes cl on cl.id = c.class_id
  left join public.users bp on bp.id = s.parent_id
  left join lateral (
    select pc.parent_id, u.name_ar, u.name_en, u.phone
    from public.parent_children pc
    join public.users u on u.id = pc.parent_id
    where pc.child_id = s.child_id
    order by pc.is_primary desc nulls last, pc.created_at
    limit 1
  ) par on s.parent_id is null
  left join money mo on mo.subscription_id = s.subscription_id
  left join ever e on e.subscription_id = s.subscription_id
  where p_from is null
     or (s.started_on <= p_to and (s.ended_on is null or s.ended_on >= p_from))
     or mo.subscription_id is not null
  order by s.kind desc, s.package_name_en, c.full_name_en, s.started_on;
end;
$$;

revoke execute on function public.get_package_subscriptions(uuid, date, date) from public, anon;
grant execute on function public.get_package_subscriptions(uuid, date, date) to authenticated, service_role;

-- Discounts from every side: partnerships (a company, a school or another organization whose people
-- get a discount), the sibling discount the settings always offered but billing never applied, and
-- deals that can now run past the first invoice. One engine (discount_lines) works out a family's
-- discounts on an invoice, and every invoice that charges tuition or extra hours uses it: the
-- application's first invoice, its extra hours, an extra-hours package the admin assigns, and the
-- monthly tuition invoice. Combined discounts stop at the nursery's cap (a single discount larger
-- than the cap still applies alone).
--
-- A partner belongs to one branch or to the whole chain, has its offer (percentage or amount, on
-- tuition and/or extra hours), its agreement dates, and whether a proof (company card, HR letter)
-- is needed. A family claims it at signup or later from its invoices page: without a proof needed it
-- is granted at once; otherwise the admin confirms or rejects it. A discount counts on an invoice
-- issued while the agreement and the family's discount are valid, so a period already invoiced keeps
-- it and it stops from the next invoice after the end.

-- -----------------------------------------------------------------------------------------------
-- Settings and deals

alter table public.nursery_settings
  add column if not exists max_total_discount_percentage numeric(5,2) not null default 30,
  add column if not exists sibling_discount_enabled boolean not null default false;

alter table public.nursery_settings drop constraint if exists nursery_settings_max_total_discount_range;
alter table public.nursery_settings add constraint nursery_settings_max_total_discount_range
  check (max_total_discount_percentage >= 0 and max_total_discount_percentage <= 100);

-- How long a deal counts: the first invoice (as before), the first N invoices, or every invoice
-- while it runs.
alter table public.deals
  add column if not exists applies_for text not null default 'first_invoice',
  add column if not exists applies_invoices integer;

alter table public.deals drop constraint if exists deals_applies_for_valid;
alter table public.deals add constraint deals_applies_for_valid check (
  applies_for in ('first_invoice', 'first_invoices', 'every_invoice')
  and (applies_for <> 'first_invoices' or applies_invoices between 2 and 60)
);

-- -----------------------------------------------------------------------------------------------
-- Partners and the families who get their discount

create table if not exists public.discount_partners (
  id uuid primary key default gen_random_uuid(),
  nursery_id uuid references public.nurseries (id) on delete cascade,
  chain_id uuid references public.chains (id) on delete cascade,
  kind text not null check (kind in ('company', 'school', 'organization')),
  name_ar text not null default '',
  name_en text not null default '',
  -- Other names parents may write as their workplace ("vodafone egypt", "فودافون").
  aliases text[] not null default '{}',
  offer_details_ar text check (offer_details_ar is null or char_length(offer_details_ar) <= 600),
  offer_details_en text check (offer_details_en is null or char_length(offer_details_en) <= 600),
  discount_type text not null check (discount_type in ('percentage', 'fixed_amount')),
  discount_value numeric(10,2) not null check (discount_value > 0),
  applies_to text[] not null default '{tuition}',
  starts_on date not null default current_date,
  ends_on date,
  requires_proof boolean not null default true,
  proof_note_ar text check (proof_note_ar is null or char_length(proof_note_ar) <= 200),
  proof_note_en text check (proof_note_en is null or char_length(proof_note_en) <= 200),
  max_families integer check (max_families is null or max_families > 0),
  contact_name text,
  contact_phone text,
  contact_email text,
  agreement_ref text,
  active boolean not null default true,
  ending_alert_sent_on date,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint discount_partners_scope check ((nursery_id is not null) <> (chain_id is not null)),
  constraint discount_partners_dates check (ends_on is null or ends_on >= starts_on),
  constraint discount_partners_percent check (discount_type <> 'percentage' or discount_value <= 100),
  constraint discount_partners_named check (btrim(name_ar) <> '' or btrim(name_en) <> ''),
  constraint discount_partners_applies check (cardinality(applies_to) > 0 and applies_to <@ array['tuition', 'extra_hours'])
);

create index if not exists idx_discount_partners_nursery on public.discount_partners (nursery_id);
create index if not exists idx_discount_partners_chain on public.discount_partners (chain_id);

drop trigger if exists trg_discount_partners_updated_at on public.discount_partners;
create trigger trg_discount_partners_updated_at
  before update on public.discount_partners
  for each row execute function public.set_updated_at();

create table if not exists public.partner_beneficiaries (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.discount_partners (id) on delete cascade,
  -- The family's branch, and the family (one account per family).
  nursery_id uuid not null references public.nurseries (id) on delete cascade,
  parent_id uuid not null references public.users (id) on delete cascade,
  application_id uuid references public.applications (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'active', 'rejected', 'ended')),
  valid_from date,
  -- The last day the discount counts (null: as long as the agreement runs).
  valid_to date,
  proof_path text,
  proof_name text,
  claimed_by uuid references public.users (id) on delete set null,
  claimed_at timestamptz not null default now(),
  decided_by uuid references public.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 300),
  ended_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_beneficiaries_dates check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

-- A family has one open claim per partner.
create unique index if not exists uq_partner_beneficiaries_open
  on public.partner_beneficiaries (partner_id, parent_id) where status in ('pending', 'active');
create index if not exists idx_partner_beneficiaries_parent on public.partner_beneficiaries (parent_id);
create index if not exists idx_partner_beneficiaries_nursery on public.partner_beneficiaries (nursery_id, status);

drop trigger if exists trg_partner_beneficiaries_updated_at on public.partner_beneficiaries;
create trigger trg_partner_beneficiaries_updated_at
  before update on public.partner_beneficiaries
  for each row execute function public.set_updated_at();

-- Read through the functions below; staff see their nursery's rows, a parent their own.
alter table public.discount_partners enable row level security;
alter table public.partner_beneficiaries enable row level security;

drop policy if exists discount_partners_staff_select on public.discount_partners;
create policy discount_partners_staff_select on public.discount_partners for select to authenticated
  using (
    public.is_xo_super_admin()
    or (nursery_id is not null and public.rls_staff_manages_nursery(nursery_id))
    or (chain_id is not null and exists (
      select 1 from public.nurseries n where n.chain_id = discount_partners.chain_id and public.rls_staff_manages_nursery(n.id)
    ))
  );

drop policy if exists partner_beneficiaries_select on public.partner_beneficiaries;
create policy partner_beneficiaries_select on public.partner_beneficiaries for select to authenticated
  using (parent_id = auth.uid() or public.is_xo_super_admin() or public.rls_staff_manages_nursery(nursery_id));

-- The proofs: <nursery_id>/<parent_id>/<file>, private. A parent uploads into their own folder;
-- the nursery's staff and the family read them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partner-proofs', 'partner-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Families upload partner proofs" on storage.objects;
create policy "Families upload partner proofs" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'partner-proofs'
    and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
    and split_part(name, '/', 2) = auth.uid()::text
  );

drop policy if exists "Families and staff read partner proofs" on storage.objects;
create policy "Families and staff read partner proofs" on storage.objects for select to authenticated
  using (
    bucket_id = 'partner-proofs'
    and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
    and (split_part(name, '/', 2) = auth.uid()::text or public.rls_staff_manages_nursery(split_part(name, '/', 1)::uuid))
  );

-- -----------------------------------------------------------------------------------------------
-- Rules

-- Who manages discounts at a branch: XO, its chain's admin, its admin, a manager with the deals permission.
create or replace function public.discount_manage_allowed(p_nursery_id uuid, p_action text default 'update')
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_nursery uuid;
  v_chain uuid;
begin
  if auth.uid() is null or p_nursery_id is null then
    return false;
  end if;
  if public.is_xo_super_admin() then
    return true;
  end if;
  select u.role, u.nursery_id, u.chain_id into v_role, v_nursery, v_chain from public.users u where u.id = auth.uid();
  if v_role = 'chain_super_admin' then
    return v_chain is not null and exists (select 1 from public.nurseries n where n.id = p_nursery_id and n.chain_id = v_chain);
  elsif v_role = 'branch_admin' then
    return v_nursery is not distinct from p_nursery_id;
  elsif v_role = 'manager' then
    return v_nursery is not distinct from p_nursery_id and public.user_can('deals', p_action);
  end if;
  return false;
end;
$$;

-- A chain-wide partner: XO or that chain's admin.
create or replace function public.discount_chain_manage_allowed(p_chain_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_chain_id is not null and (
    public.is_xo_super_admin()
    or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'chain_super_admin' and u.chain_id = p_chain_id)
  )
$$;

-- A partner reaches a branch when it is the branch's own or its chain's.
create or replace function public.discount_partner_in_scope(p public.discount_partners, p_nursery_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p.nursery_id = p_nursery_id
      or (p.chain_id is not null and p.chain_id = (select n.chain_id from public.nurseries n where n.id = p_nursery_id))
$$;

-- Where an agreement stands on a day: paused, scheduled (not started), active, ending_soon (within
-- 30 days) or expired.
create or replace function public.discount_partner_state(p public.discount_partners, p_on date)
returns text
language sql
immutable
as $$
  select case
    when not p.active then 'paused'
    when p.starts_on > p_on then 'scheduled'
    when p.ends_on is not null and p.ends_on < p_on then 'expired'
    when p.ends_on is not null and p.ends_on <= p_on + 30 then 'ending_soon'
    else 'active'
  end
$$;

-- Where a family's discount stands: pending, rejected, scheduled, active, or ended (by its own last
-- day, by the agreement's end, or ended by the admin).
create or replace function public.partner_beneficiary_state(b public.partner_beneficiaries, p public.discount_partners, p_on date)
returns text
language sql
immutable
as $$
  select case
    when b.status in ('pending', 'rejected', 'ended') then b.status
    when (b.valid_to is not null and b.valid_to < p_on) or (p.ends_on is not null and p.ends_on < p_on) then 'ended'
    when b.valid_from is not null and b.valid_from > p_on then 'scheduled'
    else 'active'
  end
$$;

-- A discount's amount on a subtotal: a percentage of it, or the amount (never more than the subtotal).
create or replace function public.discount_amount(p_type text, p_value numeric, p_subtotal numeric)
returns numeric
language sql
immutable
as $$
  select greatest(least(
    case when p_type = 'percentage' then round(coalesce(p_subtotal, 0) * coalesce(p_value, 0) / 100, 2) else round(coalesce(p_value, 0), 2) end,
    coalesce(p_subtotal, 0)
  ), 0)
$$;

-- The discount lines' total (they carry negative totals).
create or replace function public.discount_lines_total(p_lines jsonb)
returns numeric
language sql
immutable
as $$
  select coalesce(sum(-(item ->> 'total')::numeric), 0)
    from jsonb_array_elements(case when jsonb_typeof(p_lines) = 'array' then p_lines else '[]'::jsonb end) item
$$;

-- A family's discounts on an invoice line of `p_scope` (tuition or extra_hours) worth `p_subtotal`:
-- the package's deal (for the invoices it covers: `p_invoice_number` is this invoice's place among
-- the subscription's), the family's partnership (the best when two parents work at partners), and on
-- tuition the sibling discount (the first enrolled child pays in full). The largest counts in full;
-- the others only up to the nursery's cap on combined discounts. Each comes back as an invoice line:
-- kind 'discount', its source, what it is, and a negative total.
create or replace function public.discount_lines(
  p_nursery_id uuid,
  p_parent_id uuid,
  p_scope text,
  p_subtotal numeric,
  p_child_id uuid default null,
  p_deal_id uuid default null,
  p_invoice_number integer default 1
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_on date := public.nursery_today(p_nursery_id);
  v_subtotal numeric := round(greatest(coalesce(p_subtotal, 0), 0), 2);
  v_settings public.nursery_settings%rowtype;
  v_candidates jsonb := '[]'::jsonb;
  v_deal public.deals%rowtype;
  v_partner record;
  v_rank integer := 0;
  v_pct numeric := 0;
  v_cap numeric;
  v_used numeric := 0;
  v_take numeric;
  v_full numeric;
  v_item jsonb;
  v_lines jsonb := '[]'::jsonb;
begin
  if v_subtotal <= 0 or p_scope not in ('tuition', 'extra_hours') then
    return '[]'::jsonb;
  end if;
  select * into v_settings from public.nursery_settings s where s.nursery_id = p_nursery_id;

  -- The package's deal, while it runs, on the invoices it covers.
  if p_deal_id is not null then
    select * into v_deal from public.deals d
     where d.id = p_deal_id and d.active
       and (d.starts_at is null or d.starts_at <= now())
       and (d.ends_at is null or d.ends_at > now());
    if found and (
      v_deal.applies_for = 'every_invoice'
      or (v_deal.applies_for = 'first_invoice' and coalesce(p_invoice_number, 1) <= 1)
      or (v_deal.applies_for = 'first_invoices' and coalesce(p_invoice_number, 1) <= coalesce(v_deal.applies_invoices, 1))
    ) then
      v_candidates := v_candidates || jsonb_build_array(jsonb_build_object(
        'source', 'deal', 'deal_id', v_deal.id,
        'name_ar', nullif(v_deal.name_ar, ''), 'name_en', nullif(v_deal.name_en, ''),
        'discount_type', v_deal.discount_type, 'discount_value', v_deal.discount_value,
        'amount', public.discount_amount(v_deal.discount_type, v_deal.discount_value, v_subtotal)
      ));
    end if;
  end if;

  -- The family's partnership, valid today, on this kind of charge.
  if p_parent_id is not null then
    select b.id as beneficiary_id, p.id as partner_id, p.kind, p.name_ar, p.name_en, p.discount_type, p.discount_value,
           public.discount_amount(p.discount_type, p.discount_value, v_subtotal) as amount
      into v_partner
      from public.partner_beneficiaries b
      join public.discount_partners p on p.id = b.partner_id
     where b.parent_id = p_parent_id
       and public.discount_partner_in_scope(p, p_nursery_id)
       and p_scope = any (p.applies_to)
       and p.active and p.starts_on <= v_on
       and public.partner_beneficiary_state(b, p, v_on) = 'active'
     order by 8 desc, p.name_en, p.id
     limit 1;
    if found then
      v_candidates := v_candidates || jsonb_build_array(jsonb_build_object(
        'source', 'partnership', 'partner_id', v_partner.partner_id, 'beneficiary_id', v_partner.beneficiary_id,
        'partner_kind', v_partner.kind,
        'name_ar', nullif(v_partner.name_ar, ''), 'name_en', nullif(v_partner.name_en, ''),
        'discount_type', v_partner.discount_type, 'discount_value', v_partner.discount_value,
        'amount', v_partner.amount
      ));
    end if;
  end if;

  -- Brothers and sisters billed to the same family: the second and the third (and later) child.
  if p_scope = 'tuition' and p_parent_id is not null and coalesce(v_settings.sibling_discount_enabled, false) then
    with kids as (
      select s.child_id, min(s.started_at) as started, min(s.created_at) as created
        from public.child_tuition_subscriptions s
       where s.billed_parent_id = p_parent_id and s.nursery_id = p_nursery_id and s.status = 'active'
       group by s.child_id
    )
    select case
             when p_child_id is not null and exists (select 1 from kids where kids.child_id = p_child_id) then (
               select count(*) from kids k, kids me
                where me.child_id = p_child_id and (k.started, k.created, k.child_id) <= (me.started, me.created, me.child_id)
             )
             else (select count(*) + 1 from kids where kids.child_id is distinct from p_child_id)
           end
      into v_rank;
    v_pct := case
      when v_rank = 2 then coalesce(v_settings.sibling_discount_2nd_child_percentage, 0)
      when v_rank >= 3 then coalesce(v_settings.sibling_discount_3rd_child_percentage, 0)
      else 0
    end;
    if v_pct > 0 then
      v_candidates := v_candidates || jsonb_build_array(jsonb_build_object(
        'source', 'sibling', 'sibling_rank', v_rank,
        'discount_type', 'percentage', 'discount_value', v_pct,
        'amount', public.discount_amount('percentage', v_pct, v_subtotal)
      ));
    end if;
  end if;

  -- The largest counts in full; together they stop at the cap.
  v_cap := round(v_subtotal * coalesce(v_settings.max_total_discount_percentage, 30) / 100, 2);
  for v_item in
    select c from jsonb_array_elements(v_candidates) c
     order by (c ->> 'amount')::numeric desc, c ->> 'source'
  loop
    v_full := (v_item ->> 'amount')::numeric;
    if v_used = 0 then
      v_take := least(v_full, v_subtotal);
      v_cap := greatest(v_cap, v_take);
    else
      v_take := least(v_full, greatest(v_cap - v_used, 0));
    end if;
    continue when v_take <= 0;
    v_used := v_used + v_take;
    v_lines := v_lines || jsonb_build_array((v_item - 'amount') || jsonb_build_object(
      'kind', 'discount',
      'scope', p_scope,
      'capped', v_take < v_full,
      'description', coalesce(v_item ->> 'name_en', v_item ->> 'name_ar'),
      'quantity', 1,
      'unitPrice', -v_take,
      'unit_price', -v_take,
      'total', -v_take
    ));
  end loop;
  return v_lines;
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- Reading

-- A partner as the screens show it (contact details only for those who manage it).
create or replace function public.discount_partner_json(p public.discount_partners, p_on date, p_with_contact boolean default false)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p.id,
    'scope', case when p.chain_id is not null then 'chain' else 'branch' end,
    'kind', p.kind,
    'name_ar', p.name_ar,
    'name_en', p.name_en,
    'aliases', to_jsonb(p.aliases),
    'offer_details_ar', p.offer_details_ar,
    'offer_details_en', p.offer_details_en,
    'discount_type', p.discount_type,
    'discount_value', p.discount_value,
    'applies_to', to_jsonb(p.applies_to),
    'starts_on', p.starts_on,
    'ends_on', p.ends_on,
    'requires_proof', p.requires_proof,
    'proof_note_ar', p.proof_note_ar,
    'proof_note_en', p.proof_note_en,
    'max_families', p.max_families,
    'active', p.active,
    'state', public.discount_partner_state(p, p_on)
  ) || case when p_with_contact then jsonb_build_object(
    'contact_name', p.contact_name,
    'contact_phone', p.contact_phone,
    'contact_email', p.contact_email,
    'agreement_ref', p.agreement_ref
  ) else '{}'::jsonb end
$$;

-- How much a family's discount has taken off its invoices so far.
create or replace function public.partner_beneficiary_given(p_beneficiary_id uuid, p_parent_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(-(item ->> 'total')::numeric), 0)
    from public.invoices i
   cross join lateral jsonb_array_elements(
     case when jsonb_typeof(i.line_items_json -> 'items') = 'array' then i.line_items_json -> 'items' else '[]'::jsonb end
   ) item
   where i.parent_id = p_parent_id and i.status <> 'cancelled'
     and item ->> 'kind' = 'discount' and item ->> 'beneficiary_id' = p_beneficiary_id::text
$$;

-- Families in the open (pending or active, not ended) for a partner, everywhere it reaches.
create or replace function public.discount_partner_open_families(p_partner_id uuid, p_on date)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from public.partner_beneficiaries b
    join public.discount_partners p on p.id = b.partner_id
   where b.partner_id = p_partner_id and public.partner_beneficiary_state(b, p, p_on) in ('pending', 'active', 'scheduled')
$$;

-- A family as the discount screens name it: the account's names and the children at the branch.
create or replace function public.discount_family_json(p_parent_id uuid, p_nursery_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'parent_id', u.id,
    'name_ar', u.name_ar,
    'name_en', u.name_en,
    'phone', u.phone,
    'email', u.email,
    'children', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name_ar', c.full_name_ar, 'name_en', c.full_name_en) order by c.dob)
        from public.parent_children pc
        join public.children c on c.id = pc.child_id
       where pc.parent_id = u.id and c.nursery_id = p_nursery_id and c.status = 'active'
    ), '[]'::jsonb)
  )
  from public.users u where u.id = p_parent_id
$$;

-- A family's discount record as the screens show it.
create or replace function public.partner_beneficiary_json(b public.partner_beneficiaries, p public.discount_partners, p_on date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', b.id,
    'partner_id', b.partner_id,
    'status', b.status,
    'state', public.partner_beneficiary_state(b, p, p_on),
    'valid_from', b.valid_from,
    'valid_to', b.valid_to,
    'ends_on', least(b.valid_to, p.ends_on),
    'proof_path', b.proof_path,
    'proof_name', b.proof_name,
    'claimed_at', b.claimed_at,
    'claimed_by_family', b.claimed_by = b.parent_id,
    'decided_at', b.decided_at,
    'decided_by', public.user_names(b.decided_by),
    'decision_note', b.decision_note,
    'application_id', b.application_id,
    'given', public.partner_beneficiary_given(b.id, b.parent_id),
    'family', public.discount_family_json(b.parent_id, b.nursery_id)
  )
$$;

-- The partners at a branch for its Partnerships page: each with where it stands and how many
-- families of this branch have it, are waiting, and what it has taken off so far.
create or replace function public.get_discount_partners(p_nursery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_on date := public.nursery_today(p_nursery_id);
  v_chain uuid := (select n.chain_id from public.nurseries n where n.id = p_nursery_id);
begin
  if not public.discount_manage_allowed(p_nursery_id, 'view') then
    raise exception 'partner_forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'today', v_on,
    'can_manage', public.discount_manage_allowed(p_nursery_id, 'update'),
    'can_manage_chain', public.discount_chain_manage_allowed(v_chain),
    'has_chain', v_chain is not null,
    'partners', coalesce((
      select jsonb_agg(public.discount_partner_json(p, v_on, true) || jsonb_build_object(
               'active_families', (select count(*) from public.partner_beneficiaries b
                                    where b.partner_id = p.id and b.nursery_id = p_nursery_id
                                      and public.partner_beneficiary_state(b, p, v_on) in ('active', 'scheduled')),
               'pending_families', (select count(*) from public.partner_beneficiaries b
                                     where b.partner_id = p.id and b.nursery_id = p_nursery_id and b.status = 'pending'),
               'open_families', public.discount_partner_open_families(p.id, v_on),
               'given', (select coalesce(sum(public.partner_beneficiary_given(b.id, b.parent_id)), 0)
                           from public.partner_beneficiaries b where b.partner_id = p.id and b.nursery_id = p_nursery_id),
               'can_edit', case when p.chain_id is not null then public.discount_chain_manage_allowed(p.chain_id)
                                else public.discount_manage_allowed(p_nursery_id, 'update') end
             ) order by p.active desc, coalesce(nullif(p.name_en, ''), p.name_ar))
        from public.discount_partners p
       where public.discount_partner_in_scope(p, p_nursery_id)
    ), '[]'::jsonb)
  );
end;
$$;

-- One partner and this branch's families who have it (or asked for it).
create or replace function public.get_discount_partner(p_nursery_id uuid, p_partner_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_on date := public.nursery_today(p_nursery_id);
  v_partner public.discount_partners%rowtype;
begin
  if not public.discount_manage_allowed(p_nursery_id, 'view') then
    raise exception 'partner_forbidden' using errcode = '42501';
  end if;
  select * into v_partner from public.discount_partners p where p.id = p_partner_id;
  if not found or not public.discount_partner_in_scope(v_partner, p_nursery_id) then
    raise exception 'partner_not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'today', v_on,
    'can_manage', public.discount_manage_allowed(p_nursery_id, 'update'),
    'can_edit', case when v_partner.chain_id is not null then public.discount_chain_manage_allowed(v_partner.chain_id)
                     else public.discount_manage_allowed(p_nursery_id, 'update') end,
    'partner', public.discount_partner_json(v_partner, v_on, true)
               || jsonb_build_object('open_families', public.discount_partner_open_families(v_partner.id, v_on)),
    'beneficiaries', coalesce((
      select jsonb_agg(public.partner_beneficiary_json(b, v_partner, v_on)
                       order by case b.status when 'pending' then 0 when 'active' then 1 else 2 end, b.claimed_at desc)
        from public.partner_beneficiaries b
       where b.partner_id = v_partner.id and b.nursery_id = p_nursery_id
    ), '[]'::jsonb)
  );
end;
$$;

-- The offers a family may claim at a branch (signup and the invoices page): partners running now,
-- without their contact details. Not sensitive: the nursery advertises them.
create or replace function public.get_partner_offers(p_nursery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_on date := public.nursery_today(p_nursery_id);
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'partner_forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(public.discount_partner_json(p, v_on) || jsonb_build_object(
             'full', p.max_families is not null and public.discount_partner_open_families(p.id, v_on) >= p.max_families
           ) order by coalesce(nullif(p.name_en, ''), p.name_ar))
      from public.discount_partners p
     where public.discount_partner_in_scope(p, p_nursery_id)
       and public.discount_partner_state(p, v_on) in ('active', 'ending_soon')
  ), '[]'::jsonb);
end;
$$;

-- A family's discounts at a branch: its partnerships (every state) and the sibling discount on each
-- enrolled child. For the family itself, and for the nursery's staff (a child's billing tab).
create or replace function public.get_family_discounts(p_nursery_id uuid, p_parent_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_on date := public.nursery_today(p_nursery_id);
  v_parent uuid := coalesce(p_parent_id, auth.uid());
  v_settings public.nursery_settings%rowtype;
begin
  if v_parent is null or (v_parent is distinct from auth.uid() and not public.discount_manage_allowed(p_nursery_id, 'view')) then
    raise exception 'partner_forbidden' using errcode = '42501';
  end if;
  select * into v_settings from public.nursery_settings s where s.nursery_id = p_nursery_id;
  return jsonb_build_object(
    'today', v_on,
    'can_manage', public.discount_manage_allowed(p_nursery_id, 'update'),
    'max_total_percentage', coalesce(v_settings.max_total_discount_percentage, 30),
    'partnerships', coalesce((
      select jsonb_agg(public.partner_beneficiary_json(b, p, v_on)
                       || jsonb_build_object('partner', public.discount_partner_json(p, v_on))
                       order by case public.partner_beneficiary_state(b, p, v_on) when 'active' then 0 when 'pending' then 1 when 'scheduled' then 2 else 3 end,
                                b.claimed_at desc)
        from public.partner_beneficiaries b
        join public.discount_partners p on p.id = b.partner_id
       where b.parent_id = v_parent and b.nursery_id = p_nursery_id
    ), '[]'::jsonb),
    'sibling', jsonb_build_object(
      'enabled', coalesce(v_settings.sibling_discount_enabled, false),
      'second_percentage', coalesce(v_settings.sibling_discount_2nd_child_percentage, 0),
      'third_percentage', coalesce(v_settings.sibling_discount_3rd_child_percentage, 0),
      'children', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'child_id', k.child_id, 'name_ar', c.full_name_ar, 'name_en', c.full_name_en, 'rank', k.rank
               ) order by k.rank)
          from (
            select s.child_id, row_number() over (order by min(s.started_at), min(s.created_at), s.child_id) as rank
              from public.child_tuition_subscriptions s
             where s.billed_parent_id = v_parent and s.nursery_id = p_nursery_id and s.status = 'active'
             group by s.child_id
          ) k
          join public.children c on c.id = k.child_id
      ), '[]'::jsonb)
    )
  );
end;
$$;

-- Families of a branch to pick from (adding a partnership by hand): by name, phone, email or a child's name.
create or replace function public.search_discount_families(p_nursery_id uuid, p_search text default '')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := lower(btrim(coalesce(p_search, '')));
begin
  if not public.discount_manage_allowed(p_nursery_id, 'update') then
    raise exception 'partner_forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(public.discount_family_json(f.parent_id, p_nursery_id) order by f.label)
      from (
        select distinct on (u.id) u.id as parent_id, coalesce(nullif(u.name_en, ''), u.name_ar, '') as label
          from public.users u
          join public.parent_children pc on pc.parent_id = u.id
          join public.children c on c.id = pc.child_id and c.nursery_id = p_nursery_id and c.status = 'active'
         where u.role = 'parent'
           and (v_q = '' or lower(concat_ws(' ', u.name_ar, u.name_en, u.phone, u.email, c.full_name_ar, c.full_name_en)) like '%' || v_q || '%')
         order by u.id
         limit 20
      ) f
  ), '[]'::jsonb);
end;
$$;

-- The discounts given between two days (invoices issued then, not cancelled): in all, by source,
-- by partner, by deal and by month. For the financial reports.
create or replace function public.get_discount_report(p_nursery_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.discount_manage_allowed(p_nursery_id, 'view') or (
    public.current_user_role() = 'manager' and public.current_user_nursery_id() = p_nursery_id and public.user_can('financial_reports', 'view')
  )) then
    raise exception 'partner_forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'partner_dates_invalid' using errcode = '22023';
  end if;
  return (
    with lines as (
      select i.id as invoice_id, i.parent_id, (i.created_at at time zone 'Africa/Cairo')::date as day,
             item ->> 'source' as source, item ->> 'partner_id' as partner_id, item ->> 'deal_id' as deal_id,
             -(item ->> 'total')::numeric as amount
        from public.invoices i
       cross join lateral jsonb_array_elements(
         case when jsonb_typeof(i.line_items_json -> 'items') = 'array' then i.line_items_json -> 'items' else '[]'::jsonb end
       ) item
       where i.nursery_id = p_nursery_id and i.status <> 'cancelled'
         and (i.created_at at time zone 'Africa/Cairo')::date between p_from and p_to
         and item ->> 'kind' = 'discount'
    )
    select jsonb_build_object(
      'from', p_from,
      'to', p_to,
      'total', coalesce((select sum(amount) from lines), 0),
      'invoices', (select count(distinct invoice_id) from lines),
      'families', (select count(distinct parent_id) from lines),
      'by_source', jsonb_build_object(
        'deal', coalesce((select sum(amount) from lines where source = 'deal'), 0),
        'partnership', coalesce((select sum(amount) from lines where source = 'partnership'), 0),
        'sibling', coalesce((select sum(amount) from lines where source = 'sibling'), 0),
        'other', coalesce((select sum(amount) from lines where source is null), 0)
      ),
      'by_partner', coalesce((
        select jsonb_agg(jsonb_build_object('partner_id', p.id, 'name_ar', p.name_ar, 'name_en', p.name_en, 'kind', p.kind,
                                            'amount', x.amount, 'families', x.families, 'invoices', x.invoices) order by x.amount desc)
          from (select partner_id, sum(amount) as amount, count(distinct parent_id) as families, count(distinct invoice_id) as invoices
                  from lines where source = 'partnership' group by partner_id) x
          join public.discount_partners p on p.id::text = x.partner_id
      ), '[]'::jsonb),
      'by_deal', coalesce((
        select jsonb_agg(jsonb_build_object('deal_id', d.id, 'name_ar', d.name_ar, 'name_en', d.name_en,
                                            'amount', x.amount, 'families', x.families, 'invoices', x.invoices) order by x.amount desc)
          from (select deal_id, sum(amount) as amount, count(distinct parent_id) as families, count(distinct invoice_id) as invoices
                  from lines where source = 'deal' group by deal_id) x
          join public.deals d on d.id::text = x.deal_id
      ), '[]'::jsonb),
      'by_month', coalesce((
        select jsonb_agg(jsonb_build_object('month', m.month, 'deal', m.deal, 'partnership', m.partnership, 'sibling', m.sibling, 'other', m.other) order by m.month)
          from (select to_char(day, 'YYYY-MM') as month,
                       coalesce(sum(amount) filter (where source = 'deal'), 0) as deal,
                       coalesce(sum(amount) filter (where source = 'partnership'), 0) as partnership,
                       coalesce(sum(amount) filter (where source = 'sibling'), 0) as sibling,
                       coalesce(sum(amount) filter (where source is null), 0) as other
                  from lines group by 1) m
      ), '[]'::jsonb)
    )
  );
end;
$$;

-- The branch's deals for the Deals page: each with the packages it is on and who it has actually
-- reached (the invoices that carry its discount), read through a function so a change shows at once.
create or replace function public.get_deals_overview(p_nursery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.discount_manage_allowed(p_nursery_id, 'view') and not (
    public.current_user_role() in ('teacher', 'manager') and public.current_user_nursery_id() = p_nursery_id
  ) then
    raise exception 'partner_forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', d.id, 'nursery_id', d.nursery_id, 'name_ar', d.name_ar, 'name_en', d.name_en,
             'description_ar', d.description_ar, 'description_en', d.description_en,
             'discount_type', d.discount_type, 'discount_value', d.discount_value,
             'starts_at', d.starts_at, 'ends_at', d.ends_at, 'active', d.active, 'created_at', d.created_at,
             'applies_for', d.applies_for, 'applies_invoices', d.applies_invoices,
             'tuition_packages', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name_ar', t.name_ar, 'name_en', t.name_en) order by t.name_en)
                                             from public.tuition_packages t where t.deal_id = d.id), '[]'::jsonb),
             'extra_hours_packages', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name_ar', x.name_ar, 'name_en', x.name_en) order by x.name_en)
                                                 from public.packages x where x.deal_id = d.id), '[]'::jsonb),
             'usage', (
               select jsonb_build_object(
                        'invoices', count(distinct u.invoice_id),
                        'families', count(distinct u.parent_id),
                        'amount', coalesce(sum(u.amount), 0),
                        'family_names', coalesce((select jsonb_agg(distinct jsonb_build_object('parent_id', f.parent_id, 'name_ar', us.name_ar, 'name_en', us.name_en))
                                                    from (select distinct parent_id from (
                                                            select i.parent_id from public.invoices i
                                                             cross join lateral jsonb_array_elements(case when jsonb_typeof(i.line_items_json -> 'items') = 'array' then i.line_items_json -> 'items' else '[]'::jsonb end) item
                                                             where i.nursery_id = p_nursery_id and i.status <> 'cancelled' and item ->> 'kind' = 'discount' and item ->> 'deal_id' = d.id::text
                                                          ) z) f
                                                    join public.users us on us.id = f.parent_id), '[]'::jsonb)
                      )
                 from (
                   select i.id as invoice_id, i.parent_id, -(item ->> 'total')::numeric as amount
                     from public.invoices i
                    cross join lateral jsonb_array_elements(case when jsonb_typeof(i.line_items_json -> 'items') = 'array' then i.line_items_json -> 'items' else '[]'::jsonb end) item
                    where i.nursery_id = p_nursery_id and i.status <> 'cancelled' and item ->> 'kind' = 'discount' and item ->> 'deal_id' = d.id::text
                 ) u
             )
           ) order by d.created_at desc)
      from public.deals d
     where d.nursery_id = p_nursery_id
  ), '[]'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- Changing

-- The nursery's admins, who hear about claims and agreements ending.
create or replace function public.discount_admin_ids(p_nursery_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(u.id), '{}'::uuid[])
    from public.users u
   where u.role = 'branch_admin' and u.nursery_id = p_nursery_id and coalesce(u.status, 'active') = 'active'
$$;

-- Rebuilds a family's application invoices that nothing was paid on yet, so a discount granted or
-- ended now shows on them (select_application_payment_package with the package and period chosen).
create or replace function public.refresh_parent_application_invoices(p_parent_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select i.line_items_json ->> 'application_id' as application_id,
           i.line_items_json ->> 'package_id' as package_id,
           coalesce(i.line_items_json ->> 'billing_period', 'monthly') as billing_period
      from public.invoices i
     where i.parent_id = p_parent_id and i.status = 'pending'
       and i.line_items_json ? 'application_id' and i.line_items_json ->> 'package_id' is not null
       and public.invoice_paid_total(i.id) = 0 and public.invoice_pending_total(i.id) = 0
  loop
    begin
      perform public.select_application_payment_package(v_row.application_id::uuid, v_row.package_id::uuid, v_row.billing_period);
      v_count := v_count + 1;
    exception when others then
      -- Not this user's to change any more (an approved application, a payment started meanwhile).
      null;
    end;
  end loop;
  return v_count;
end;
$$;

-- Adds or changes a partner (payload: kind, scope 'branch'|'chain', names, aliases, offer details,
-- discount type and value, applies_to, dates, requires_proof, proof notes, max_families, contact,
-- agreement_ref, active). Problems come back as partner_* codes for the form to show under its fields.
create or replace function public.save_discount_partner(p_nursery_id uuid, p_id uuid, p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.discount_partners%rowtype;
  v_chain uuid := (select n.chain_id from public.nurseries n where n.id = p_nursery_id);
  v_scope text := coalesce(p ->> 'scope', 'branch');
  v_name_ar text := btrim(coalesce(p ->> 'name_ar', ''));
  v_name_en text := btrim(coalesce(p ->> 'name_en', ''));
  v_type text := p ->> 'discount_type';
  v_value numeric;
  v_applies text[];
  v_aliases text[];
  v_starts date;
  v_ends date;
  v_max integer;
  v_id uuid;
begin
  if p_id is not null then
    select * into v_existing from public.discount_partners x where x.id = p_id;
    if not found or not public.discount_partner_in_scope(v_existing, p_nursery_id) then
      raise exception 'partner_not_found' using errcode = 'P0002';
    end if;
  end if;
  if v_scope not in ('branch', 'chain') then
    raise exception 'partner_scope_invalid' using errcode = '22023';
  end if;
  -- Branch partners by the branch's managers; chain partners (and moving one to or from the chain) by the chain's admin.
  if (v_scope = 'chain' or v_existing.chain_id is not null) and not public.discount_chain_manage_allowed(v_chain) then
    raise exception 'partner_forbidden' using errcode = '42501';
  end if;
  if v_scope = 'branch' and not public.discount_manage_allowed(p_nursery_id, case when p_id is null then 'create' else 'update' end) then
    raise exception 'partner_forbidden' using errcode = '42501';
  end if;

  if coalesce(p ->> 'kind', '') not in ('company', 'school', 'organization') then
    raise exception 'partner_kind_invalid' using errcode = '22023';
  end if;
  if v_name_ar = '' and v_name_en = '' then
    raise exception 'partner_name_required' using errcode = '22023';
  end if;
  if char_length(v_name_ar) > 120 or char_length(v_name_en) > 120
     or char_length(coalesce(p ->> 'offer_details_ar', '')) > 600 or char_length(coalesce(p ->> 'offer_details_en', '')) > 600
     or char_length(coalesce(p ->> 'proof_note_ar', '')) > 200 or char_length(coalesce(p ->> 'proof_note_en', '')) > 200
     or char_length(coalesce(p ->> 'contact_name', '')) > 120 or char_length(coalesce(p ->> 'contact_phone', '')) > 40
     or char_length(coalesce(p ->> 'contact_email', '')) > 160 or char_length(coalesce(p ->> 'agreement_ref', '')) > 80 then
    raise exception 'partner_text_too_long' using errcode = '22023';
  end if;
  begin
    v_value := (p ->> 'discount_value')::numeric;
  exception when others then
    v_value := null;
  end;
  if v_type not in ('percentage', 'fixed_amount') or v_value is null or v_value <= 0
     or (v_type = 'percentage' and v_value > 100) or v_value > 1000000 then
    raise exception 'partner_value_invalid' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct a), '{}') into v_applies
    from jsonb_array_elements_text(coalesce(p -> 'applies_to', '[]'::jsonb)) a
   where a in ('tuition', 'extra_hours');
  if cardinality(v_applies) = 0 then
    raise exception 'partner_applies_to_required' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct lower(btrim(a))) filter (where btrim(a) <> ''), '{}') into v_aliases
    from (select a from jsonb_array_elements_text(coalesce(p -> 'aliases', '[]'::jsonb)) a limit 12) x;
  if exists (select 1 from unnest(v_aliases) a where char_length(a) > 60) then
    raise exception 'partner_text_too_long' using errcode = '22023';
  end if;
  begin
    v_starts := coalesce(nullif(p ->> 'starts_on', '')::date, public.nursery_today(p_nursery_id));
    v_ends := nullif(p ->> 'ends_on', '')::date;
  exception when others then
    raise exception 'partner_dates_invalid' using errcode = '22023';
  end;
  if v_ends is not null and v_ends < v_starts then
    raise exception 'partner_dates_invalid' using errcode = '22023';
  end if;
  begin
    v_max := nullif(p ->> 'max_families', '')::integer;
  exception when others then
    raise exception 'partner_max_families_invalid' using errcode = '22023';
  end;
  if v_max is not null and v_max < 1 then
    raise exception 'partner_max_families_invalid' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p ->> 'contact_email', '')), '') is not null and (p ->> 'contact_email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'partner_email_invalid' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.discount_partners (
      nursery_id, chain_id, kind, name_ar, name_en, aliases, offer_details_ar, offer_details_en, discount_type, discount_value,
      applies_to, starts_on, ends_on, requires_proof, proof_note_ar, proof_note_en, max_families,
      contact_name, contact_phone, contact_email, agreement_ref, active, created_by
    )
    values (
      case when v_scope = 'branch' then p_nursery_id end, case when v_scope = 'chain' then v_chain end,
      p ->> 'kind', v_name_ar, v_name_en, v_aliases,
      nullif(btrim(coalesce(p ->> 'offer_details_ar', '')), ''), nullif(btrim(coalesce(p ->> 'offer_details_en', '')), ''),
      v_type, round(v_value, 2), v_applies, v_starts, v_ends, coalesce((p ->> 'requires_proof')::boolean, true),
      nullif(btrim(coalesce(p ->> 'proof_note_ar', '')), ''), nullif(btrim(coalesce(p ->> 'proof_note_en', '')), ''), v_max,
      nullif(btrim(coalesce(p ->> 'contact_name', '')), ''), nullif(btrim(coalesce(p ->> 'contact_phone', '')), ''),
      nullif(lower(btrim(coalesce(p ->> 'contact_email', ''))), ''), nullif(btrim(coalesce(p ->> 'agreement_ref', '')), ''),
      coalesce((p ->> 'active')::boolean, true), auth.uid()
    )
    returning id into v_id;
  else
    update public.discount_partners
       set nursery_id = case when v_scope = 'branch' then coalesce(v_existing.nursery_id, p_nursery_id) end,
           chain_id = case when v_scope = 'chain' then v_chain end,
           kind = p ->> 'kind', name_ar = v_name_ar, name_en = v_name_en, aliases = v_aliases,
           offer_details_ar = nullif(btrim(coalesce(p ->> 'offer_details_ar', '')), ''),
           offer_details_en = nullif(btrim(coalesce(p ->> 'offer_details_en', '')), ''),
           discount_type = v_type, discount_value = round(v_value, 2), applies_to = v_applies,
           starts_on = v_starts, ends_on = v_ends,
           requires_proof = coalesce((p ->> 'requires_proof')::boolean, true),
           proof_note_ar = nullif(btrim(coalesce(p ->> 'proof_note_ar', '')), ''),
           proof_note_en = nullif(btrim(coalesce(p ->> 'proof_note_en', '')), ''),
           max_families = v_max,
           contact_name = nullif(btrim(coalesce(p ->> 'contact_name', '')), ''),
           contact_phone = nullif(btrim(coalesce(p ->> 'contact_phone', '')), ''),
           contact_email = nullif(lower(btrim(coalesce(p ->> 'contact_email', ''))), ''),
           agreement_ref = nullif(btrim(coalesce(p ->> 'agreement_ref', '')), ''),
           active = coalesce((p ->> 'active')::boolean, v_existing.active),
           -- A new end date gets its own "ending soon" alert.
           ending_alert_sent_on = case when v_ends is distinct from v_existing.ends_on then null else v_existing.ending_alert_sent_on end
     where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Pauses or resumes a partner: paused, nobody can claim it and its discount stops on new invoices.
create or replace function public.set_discount_partner_active(p_nursery_id uuid, p_partner_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner public.discount_partners%rowtype;
begin
  select * into v_partner from public.discount_partners x where x.id = p_partner_id;
  if not found or not public.discount_partner_in_scope(v_partner, p_nursery_id) then
    raise exception 'partner_not_found' using errcode = 'P0002';
  end if;
  if (v_partner.chain_id is not null and not public.discount_chain_manage_allowed(v_partner.chain_id))
     or (v_partner.nursery_id is not null and not public.discount_manage_allowed(p_nursery_id, 'update')) then
    raise exception 'partner_forbidden' using errcode = '42501';
  end if;
  update public.discount_partners set active = coalesce(p_active, true) where id = p_partner_id;
end;
$$;

-- A family asks for a partner's discount (the parent, or the signup on their behalf). Without a
-- proof needed it is granted at once and the family's unpaid application invoice shows it;
-- otherwise it waits for the admin, who is told.
create or replace function public.create_partner_claim(
  p_nursery_id uuid, p_partner_id uuid, p_parent_id uuid, p_proof_path text, p_proof_name text, p_application_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_on date := public.nursery_today(p_nursery_id);
  v_partner public.discount_partners%rowtype;
  v_row public.partner_beneficiaries%rowtype;
  v_proof text := nullif(btrim(coalesce(p_proof_path, '')), '');
begin
  select * into v_partner from public.discount_partners x where x.id = p_partner_id;
  if not found or not public.discount_partner_in_scope(v_partner, p_nursery_id)
     or public.discount_partner_state(v_partner, v_on) not in ('active', 'ending_soon') then
    raise exception 'partner_not_available' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.partner_beneficiaries b
     where b.partner_id = p_partner_id and b.parent_id = p_parent_id
       and public.partner_beneficiary_state(b, v_partner, v_on) in ('pending', 'active', 'scheduled')
  ) then
    raise exception 'partner_already_claimed' using errcode = '23505';
  end if;
  if v_partner.max_families is not null and public.discount_partner_open_families(p_partner_id, v_on) >= v_partner.max_families then
    raise exception 'partner_full' using errcode = '22023';
  end if;
  if v_partner.requires_proof and v_proof is null then
    raise exception 'partner_proof_required' using errcode = '22023';
  end if;
  if v_proof is not null and (split_part(v_proof, '/', 1) <> p_nursery_id::text or split_part(v_proof, '/', 2) <> p_parent_id::text) then
    raise exception 'partner_proof_invalid' using errcode = '22023';
  end if;

  -- An old ended or rejected claim leaves the way open: the unique index covers open ones only.
  update public.partner_beneficiaries b set status = 'ended'
   where b.partner_id = p_partner_id and b.parent_id = p_parent_id and b.status = 'active'
     and public.partner_beneficiary_state(b, v_partner, v_on) = 'ended';

  insert into public.partner_beneficiaries (
    partner_id, nursery_id, parent_id, application_id, status, valid_from, proof_path, proof_name, claimed_by,
    decided_at
  )
  values (
    p_partner_id, p_nursery_id, p_parent_id, p_application_id,
    case when v_partner.requires_proof then 'pending' else 'active' end,
    case when v_partner.requires_proof then null else v_on end,
    v_proof, nullif(btrim(coalesce(p_proof_name, '')), ''), coalesce(auth.uid(), p_parent_id),
    case when v_partner.requires_proof then null else now() end
  )
  returning * into v_row;

  if v_partner.requires_proof then
    perform public.notify_users(
      public.discount_admin_ids(p_nursery_id), p_nursery_id, 'partner_discount', 'partner_claim_received',
      jsonb_build_object('family', public.user_names(p_parent_id), 'partner', public.i18n_names(v_partner.name_ar, v_partner.name_en)),
      '/admin/deals/partners/' || v_partner.id, 'normal', null
    );
  else
    perform public.refresh_parent_application_invoices(p_parent_id);
  end if;
  return public.partner_beneficiary_json(v_row, v_partner, v_on);
end;
$$;

-- The signed-in family's own claim (from its invoices page).
create or replace function public.claim_partner_discount(p_nursery_id uuid, p_partner_id uuid, p_proof_path text default null, p_proof_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.current_user_role() <> 'parent' or not exists (
    select 1 from public.parent_children pc join public.children c on c.id = pc.child_id
     where pc.parent_id = auth.uid() and c.nursery_id = p_nursery_id
  ) and public.current_user_nursery_id() is distinct from p_nursery_id then
    raise exception 'partner_forbidden' using errcode = '42501';
  end if;
  return public.create_partner_claim(p_nursery_id, p_partner_id, auth.uid(), p_proof_path, p_proof_name, null);
end;
$$;

-- The admin confirms or rejects a family's claim (a reason is needed to reject; the family is told
-- either way). Confirmed, it counts from today and the family's unpaid application invoice shows it.
create or replace function public.decide_partner_claim(p_beneficiary_id uuid, p_approve boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.partner_beneficiaries%rowtype;
  v_partner public.discount_partners%rowtype;
  v_on date;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into v_row from public.partner_beneficiaries b where b.id = p_beneficiary_id for update;
  if not found then
    raise exception 'partner_claim_not_found' using errcode = 'P0002';
  end if;
  if not public.discount_manage_allowed(v_row.nursery_id, 'update') then
    raise exception 'partner_forbidden' using errcode = '42501';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'partner_claim_not_pending' using errcode = '22023';
  end if;
  if char_length(coalesce(v_note, '')) > 300 then
    raise exception 'partner_text_too_long' using errcode = '22023';
  end if;
  select * into v_partner from public.discount_partners x where x.id = v_row.partner_id;
  v_on := public.nursery_today(v_row.nursery_id);

  if coalesce(p_approve, false) then
    if public.discount_partner_state(v_partner, v_on) not in ('active', 'ending_soon') then
      raise exception 'partner_not_available' using errcode = '22023';
    end if;
    update public.partner_beneficiaries
       set status = 'active', valid_from = v_on, decided_by = auth.uid(), decided_at = now(), decision_note = v_note
     where id = v_row.id
    returning * into v_row;
    perform public.refresh_parent_application_invoices(v_row.parent_id);
    perform public.notify_users(
      array[v_row.parent_id], v_row.nursery_id, 'partner_discount', 'partner_discount_approved',
      jsonb_build_object('partner', public.i18n_names(v_partner.name_ar, v_partner.name_en)),
      '/parent/invoices#discounts', 'normal', null
    );
  else
    if v_note is null then
      raise exception 'partner_reason_required' using errcode = '22023';
    end if;
    update public.partner_beneficiaries
       set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = v_note
     where id = v_row.id
    returning * into v_row;
    perform public.notify_users(
      array[v_row.parent_id], v_row.nursery_id, 'partner_discount', 'partner_discount_rejected',
      jsonb_build_object('partner', public.i18n_names(v_partner.name_ar, v_partner.name_en), 'reason', v_note),
      '/parent/invoices#discounts', 'normal', null
    );
  end if;
  return public.partner_beneficiary_json(v_row, v_partner, v_on);
end;
$$;

-- The admin gives a family a partner's discount (a family enrolled before, a parent who changed
-- jobs): active from `p_valid_from`, until `p_valid_to` or the agreement's end.
create or replace function public.add_partner_beneficiary(
  p_nursery_id uuid, p_partner_id uuid, p_parent_id uuid, p_valid_from date default null, p_valid_to date default null, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_on date := public.nursery_today(p_nursery_id);
  v_partner public.discount_partners%rowtype;
  v_row public.partner_beneficiaries%rowtype;
  v_from date := coalesce(p_valid_from, public.nursery_today(p_nursery_id));
begin
  if not public.discount_manage_allowed(p_nursery_id, 'update') then
    raise exception 'partner_forbidden' using errcode = '42501';
  end if;
  select * into v_partner from public.discount_partners x where x.id = p_partner_id;
  if not found or not public.discount_partner_in_scope(v_partner, p_nursery_id)
     or public.discount_partner_state(v_partner, v_on) in ('paused', 'expired') then
    raise exception 'partner_not_available' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.parent_children pc join public.children c on c.id = pc.child_id
     where pc.parent_id = p_parent_id and c.nursery_id = p_nursery_id
  ) then
    raise exception 'partner_family_not_found' using errcode = 'P0002';
  end if;
  if (p_valid_to is not null and p_valid_to < v_from) or (v_partner.ends_on is not null and v_from > v_partner.ends_on) then
    raise exception 'partner_dates_invalid' using errcode = '22023';
  end if;
  if char_length(coalesce(p_note, '')) > 300 then
    raise exception 'partner_text_too_long' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.partner_beneficiaries b
     where b.partner_id = p_partner_id and b.parent_id = p_parent_id
       and public.partner_beneficiary_state(b, v_partner, v_on) in ('pending', 'active', 'scheduled')
  ) then
    raise exception 'partner_already_claimed' using errcode = '23505';
  end if;
  if v_partner.max_families is not null and public.discount_partner_open_families(p_partner_id, v_on) >= v_partner.max_families then
    raise exception 'partner_full' using errcode = '22023';
  end if;
  update public.partner_beneficiaries b set status = 'ended'
   where b.partner_id = p_partner_id and b.parent_id = p_parent_id and b.status = 'active';

  insert into public.partner_beneficiaries (
    partner_id, nursery_id, parent_id, status, valid_from, valid_to, claimed_by, decided_by, decided_at, decision_note
  )
  values (p_partner_id, p_nursery_id, p_parent_id, 'active', v_from, p_valid_to, auth.uid(), auth.uid(), now(), nullif(btrim(coalesce(p_note, '')), ''))
  returning * into v_row;

  perform public.refresh_parent_application_invoices(p_parent_id);
  perform public.notify_users(
    array[p_parent_id], p_nursery_id, 'partner_discount', 'partner_discount_approved',
    jsonb_build_object('partner', public.i18n_names(v_partner.name_ar, v_partner.name_en)),
    '/parent/invoices#discounts', 'normal', null
  );
  return public.partner_beneficiary_json(v_row, v_partner, v_on);
end;
$$;

-- The admin ends a family's discount: it counts on invoices up to `p_last_day` (yesterday when
-- not given, so it stops now). Ended now, the family is told.
create or replace function public.end_partner_beneficiary(p_beneficiary_id uuid, p_last_day date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.partner_beneficiaries%rowtype;
  v_partner public.discount_partners%rowtype;
  v_on date;
  v_last date;
begin
  select * into v_row from public.partner_beneficiaries b where b.id = p_beneficiary_id for update;
  if not found then
    raise exception 'partner_claim_not_found' using errcode = 'P0002';
  end if;
  if not public.discount_manage_allowed(v_row.nursery_id, 'update') then
    raise exception 'partner_forbidden' using errcode = '42501';
  end if;
  select * into v_partner from public.discount_partners x where x.id = v_row.partner_id;
  v_on := public.nursery_today(v_row.nursery_id);
  if public.partner_beneficiary_state(v_row, v_partner, v_on) not in ('active', 'scheduled') then
    raise exception 'partner_claim_not_active' using errcode = '22023';
  end if;
  v_last := coalesce(p_last_day, v_on - 1);
  if v_row.valid_from is not null and v_last < v_row.valid_from then
    -- Never started: it ends before its first day.
    v_last := v_row.valid_from;
    update public.partner_beneficiaries set status = 'ended', valid_to = v_last, ended_notified_at = now() where id = v_row.id returning * into v_row;
  elsif v_last < v_on then
    update public.partner_beneficiaries set status = 'ended', valid_to = v_last, ended_notified_at = now() where id = v_row.id returning * into v_row;
  else
    update public.partner_beneficiaries set valid_to = v_last where id = v_row.id returning * into v_row;
  end if;
  if v_row.status = 'ended' then
    perform public.refresh_parent_application_invoices(v_row.parent_id);
    perform public.notify_users(
      array[v_row.parent_id], v_row.nursery_id, 'partner_discount', 'partner_discount_ended',
      jsonb_build_object('partner', public.i18n_names(v_partner.name_ar, v_partner.name_en)),
      '/parent/invoices#discounts', 'normal', null
    );
  end if;
  return public.partner_beneficiary_json(v_row, v_partner, v_on);
end;
$$;

-- Every morning: admins hear of agreements ending within 30 days (once per end date), and families
-- whose discount ended (its own last day or the agreement's end) are told and marked ended.
create or replace function public.run_partner_discount_notices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner public.discount_partners%rowtype;
  v_row record;
  v_nursery uuid;
  v_count integer := 0;
begin
  for v_partner in
    select * from public.discount_partners p
     where p.active and p.ends_on is not null and p.ending_alert_sent_on is null
       and p.ends_on >= current_date and p.ends_on <= current_date + 30
  loop
    for v_nursery in
      select n.id from public.nurseries n
       where n.id = v_partner.nursery_id or (v_partner.chain_id is not null and n.chain_id = v_partner.chain_id)
    loop
      perform public.notify_users(
        public.discount_admin_ids(v_nursery), v_nursery, 'partner_discount', 'partner_agreement_ending',
        jsonb_build_object(
          'partner', public.i18n_names(v_partner.name_ar, v_partner.name_en),
          'date', v_partner.ends_on,
          'families', (select count(*) from public.partner_beneficiaries b
                        where b.partner_id = v_partner.id and b.nursery_id = v_nursery and b.status = 'active')
        ),
        '/admin/deals/partners/' || v_partner.id, 'normal', null
      );
    end loop;
    update public.discount_partners set ending_alert_sent_on = current_date where id = v_partner.id;
    v_count := v_count + 1;
  end loop;

  for v_row in
    select b.id, b.parent_id, b.nursery_id, p.name_ar, p.name_en
      from public.partner_beneficiaries b
      join public.discount_partners p on p.id = b.partner_id
     where b.status = 'active' and b.ended_notified_at is null
       and public.partner_beneficiary_state(b, p, public.nursery_today(b.nursery_id)) = 'ended'
  loop
    update public.partner_beneficiaries set status = 'ended', ended_notified_at = now() where id = v_row.id;
    perform public.notify_users(
      array[v_row.parent_id], v_row.nursery_id, 'partner_discount', 'partner_discount_ended',
      jsonb_build_object('partner', public.i18n_names(v_row.name_ar, v_row.name_en)),
      '/parent/invoices#discounts', 'normal', null
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'partner-discount-notices';
    perform cron.schedule('partner-discount-notices', '30 4 * * *', 'select public.run_partner_discount_notices()');
  end if;
end;
$$;


-- -----------------------------------------------------------------------------------------------
-- The invoices that charge tuition or extra hours, now through the shared engine. Each is the live
-- function with only its discount arithmetic changed (marked "Changed").

CREATE OR REPLACE FUNCTION public.select_application_payment_package(p_application_id uuid, p_package_id uuid, p_billing_period text DEFAULT 'monthly'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_user_nursery_id uuid;
  v_user_chain_id uuid;
  v_app public.applications%rowtype;
  v_pkg public.tuition_packages%rowtype;
  v_period public.tuition_package_billing_periods%rowtype;
  v_discounts jsonb := '[]'::jsonb;
  v_deal_line jsonb;
  v_invoice public.invoices%rowtype;
  v_paid numeric := 0;
  v_due_days integer := 7;
  v_invoice_id uuid;
  v_line_items jsonb;
  v_billing_period text := coalesce(nullif(p_billing_period, ''), 'monthly');
  v_billing_months integer := 1;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_discount_amount numeric := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select u.role, u.nursery_id, u.chain_id
    into v_role, v_user_nursery_id, v_user_chain_id
  from public.users u
  where u.id = v_uid;

  select * into v_app from public.applications where id = p_application_id for update;
  if not found then
    raise exception 'Application not found' using errcode = '42704';
  end if;
  if v_app.parent_id is null then
    raise exception 'Application must be linked to a parent before selecting a package' using errcode = '22023';
  end if;

  if v_role = 'parent'::public.user_role then
    if v_app.parent_id is distinct from v_uid or v_app.status in ('approved', 'rejected') then
      raise exception 'Cannot change this application package' using errcode = '42501';
    end if;
  elsif v_role in ('branch_admin'::public.user_role, 'manager'::public.user_role) then
    if v_user_nursery_id is distinct from v_app.nursery_id then
      raise exception 'Cannot change applications outside your nursery' using errcode = '42501';
    end if;
  elsif v_role = 'chain_super_admin'::public.user_role then
    if v_user_chain_id is null or not exists (
      select 1 from public.nurseries n where n.id = v_app.nursery_id and n.chain_id = v_user_chain_id
    ) then
      raise exception 'Cannot change applications outside your chain' using errcode = '42501';
    end if;
  elsif not public.is_xo_super_admin() then
    raise exception 'Cannot select application package' using errcode = '42501';
  end if;

  select * into v_pkg
  from public.tuition_packages
  where id = p_package_id and nursery_id = v_app.nursery_id and active = true;
  if not found then
    raise exception 'Package not found' using errcode = '42704';
  end if;

  v_billing_period := case v_billing_period
    when 'monthly' then 'monthly'
    when 'quarterly' then 'quarterly'
    when 'half_annual' then 'half_annual'
    when 'annual' then 'annual'
    else 'monthly'
  end;

  select * into v_period
  from public.tuition_package_billing_periods
  where tuition_package_id = p_package_id and billing_period = v_billing_period and active = true;

  if found then
    v_billing_months := v_period.duration_months;
    v_subtotal := v_period.price;
  elsif exists (select 1 from public.tuition_package_billing_periods where tuition_package_id = p_package_id) then
    -- Changed: the nursery configured this package's periods and this one is not offered (switched
    -- off). Before, it fell through to the legacy price below and charged a period the nursery
    -- disabled; the admin's own assignment (admin_set_child_tuition_subscription) already refused it.
    raise exception 'billing_period_not_offered' using errcode = '22023';
  else
    -- Legacy fallback for a package with no configured periods yet.
    v_billing_months := case v_billing_period
      when 'quarterly' then 3
      when 'half_annual' then 6
      when 'annual' then 12
      else 1
    end;
    v_subtotal := v_pkg.price * v_billing_months;
  end if;

  v_total := v_subtotal;

  -- Changed: every discount the family has on this tuition (the package's deal, a partnership, the
  -- sibling discount), within the nursery's cap, from the shared engine.
  v_discounts := public.discount_lines(v_app.nursery_id, v_app.parent_id, 'tuition', v_subtotal, v_app.child_id, v_pkg.deal_id, 1);
  v_discount_amount := public.discount_lines_total(v_discounts);
  v_total := greatest(v_subtotal - v_discount_amount, 0);
  select item into v_deal_line from jsonb_array_elements(v_discounts) item where item ->> 'source' = 'deal' limit 1;

  select * into v_invoice
  from public.invoices i
  where i.nursery_id = v_app.nursery_id
    and i.parent_id = v_app.parent_id
    and i.line_items_json ->> 'application_id' = p_application_id::text
  order by i.created_at desc
  limit 1
  for update;

  if found then
    select coalesce(sum(p.amount), 0) into v_paid
    from public.payments p
    where p.invoice_id = v_invoice.id and p.status = 'completed';
    -- Changed: a payment awaiting confirmation also locks the package, so the amount the
    -- parent submitted always matches the invoice.
    if v_paid > 0 or public.invoice_pending_total(v_invoice.id) > 0 then
      raise exception 'Cannot change package after payment has started' using errcode = '22023';
    end if;
  end if;

  select coalesce(ns.invoice_due_days, 7) into v_due_days
  from public.nursery_settings ns where ns.nursery_id = v_app.nursery_id;

  v_line_items := jsonb_build_object(
    'application_id', p_application_id,
    'application_payment', true,
    'package_id', p_package_id,
    'package_name_ar', v_pkg.name_ar,
    'package_name_en', v_pkg.name_en,
    'daily_hours', v_pkg.daily_hours,
    'features_json', v_pkg.features_json,
    'billing_period', v_billing_period,
    'billing_months', v_billing_months,
    'monthly_price', v_pkg.price,
    'subtotal', v_subtotal,
    'deal_id', v_deal_line ->> 'deal_id',
    'discount_type', v_deal_line ->> 'discount_type',
    'discount_value', (v_deal_line ->> 'discount_value')::numeric,
    'discount_amount', v_discount_amount,
    'items', jsonb_build_array(
      jsonb_build_object(
        'kind', 'admission_package',
        'name_ar', nullif(v_pkg.name_ar, ''),
        'name_en', nullif(v_pkg.name_en, ''),
        'description', coalesce(nullif(v_pkg.name_en, ''), nullif(v_pkg.name_ar, '')),
        'quantity', v_billing_months,
        'unitPrice', v_pkg.price,
        'unit_price', v_pkg.price,
        'total', v_subtotal
      )
    ) || v_discounts
  );

  if v_invoice.id is not null then
    update public.invoices
       set amount = v_total,
           due_date = (current_date + v_due_days),
           status = 'pending',
           invoice_type = 'monthly',
           line_items_json = v_line_items,
           payment_method = null,
           paid_at = null,
           updated_at = now()
     where id = v_invoice.id
     returning id into v_invoice_id;
  else
    insert into public.invoices (nursery_id, parent_id, amount, due_date, status, invoice_type, line_items_json)
    values (v_app.nursery_id, v_app.parent_id, v_total, (current_date + v_due_days), 'pending', 'monthly', v_line_items)
    returning id into v_invoice_id;
  end if;

  -- Changed: the invoice is rebuilt from the tuition package above, so add the extra-hours
  -- package the parent chose back onto it.
  perform public.application_invoice_sync_extra_hours(p_application_id);

  return v_invoice_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.application_invoice_sync_extra_hours(p_application_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
declare
  v_app public.applications%rowtype;
  v_invoice public.invoices%rowtype;
  v_pkg public.packages%rowtype;
  v_discounts jsonb := '[]'::jsonb;
  v_items jsonb;
  v_old_extra_total numeric := 0;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_extra_items jsonb := '[]'::jsonb;
begin
  select * into v_app from public.applications where id = p_application_id;
  if not found then
    return;
  end if;

  select * into v_invoice
  from public.invoices i
  where i.nursery_id = v_app.nursery_id
    and i.parent_id = v_app.parent_id
    and i.line_items_json ->> 'application_id' = p_application_id::text
  order by i.created_at desc
  limit 1
  for update;
  -- No invoice yet: select_application_payment_package adds the lines when it creates one.
  if not found or v_invoice.status in ('paid', 'cancelled') then
    return;
  end if;
  -- Never change an amount the parent has already paid or submitted.
  if public.invoice_paid_total(v_invoice.id) > 0 or public.invoice_pending_total(v_invoice.id) > 0 then
    return;
  end if;

  v_items := v_invoice.line_items_json -> 'items';
  if v_items is null or jsonb_typeof(v_items) <> 'array' then
    v_items := '[]'::jsonb;
  end if;

  select coalesce(sum(coalesce((item ->> 'total')::numeric, 0)), 0)
    into v_old_extra_total
  from jsonb_array_elements(v_items) item
  where item ->> 'kind' = 'extra_hours_package' or item ->> 'scope' = 'extra_hours';

  select coalesce(jsonb_agg(item), '[]'::jsonb)
    into v_items
  from jsonb_array_elements(v_items) item
  where coalesce(item ->> 'kind', '') <> 'extra_hours_package'
    and coalesce(item ->> 'scope', '') <> 'extra_hours';

  if v_app.extra_hours_package_id is not null then
    select * into v_pkg
    from public.packages
    where id = v_app.extra_hours_package_id and nursery_id = v_app.nursery_id;
  end if;

  if v_pkg.id is not null then
    v_subtotal := round(coalesce(v_pkg.price, 0), 2);

    -- Changed: the family's discounts on extra hours (deal, partnership) from the shared engine.
    v_discounts := public.discount_lines(v_app.nursery_id, v_app.parent_id, 'extra_hours', v_subtotal, v_app.child_id, v_pkg.deal_id, 1);
    v_discount := public.discount_lines_total(v_discounts);

    v_extra_items := jsonb_build_array(
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
    ) || v_discounts;
  end if;

  update public.invoices
     set amount = greatest(round(v_invoice.amount - v_old_extra_total + v_subtotal - v_discount, 2), 0),
         line_items_json = (
           coalesce(v_invoice.line_items_json, '{}'::jsonb)
             - 'extra_hours_package_id'
             - 'extra_hours_package_name_ar'
             - 'extra_hours_package_name_en'
             - 'extra_hours_subtotal'
             - 'extra_hours_discount_amount'
         ) || jsonb_build_object('items', v_items || v_extra_items)
           || case
                when v_pkg.id is not null then jsonb_build_object(
                  'extra_hours_package_id', v_pkg.id,
                  'extra_hours_package_name_ar', v_pkg.name_ar,
                  'extra_hours_package_name_en', v_pkg.name_en,
                  'extra_hours_subtotal', v_subtotal,
                  'extra_hours_discount_amount', v_discount
                )
                else '{}'::jsonb
              end,
         updated_at = now()
   where id = v_invoice.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_assign_extra_hours_package(p_child_id uuid, p_package_id uuid, p_billed_parent_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_user_nursery uuid;
  v_user_chain uuid;
  v_child public.children%rowtype;
  v_pkg public.packages%rowtype;
  v_discounts jsonb := '[]'::jsonb;
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
  -- Changed: the family's discounts on extra hours (deal, partnership) from the shared engine, once
  -- the family who pays is known.
  v_discounts := public.discount_lines(v_child.nursery_id, v_parent, 'extra_hours', v_subtotal, p_child_id, v_pkg.deal_id, 1);
  v_discount := public.discount_lines_total(v_discounts);

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
    ) || v_discounts;

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
$function$;

CREATE OR REPLACE FUNCTION public._generate_tuition_invoice(p_subscription_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sub public.child_tuition_subscriptions%rowtype;
  v_meal public.child_meal_plans%rowtype;
  v_due_days integer := 7;
  v_invoice_id uuid;
  v_items jsonb;
  v_meal_total numeric := 0;
  v_line_items jsonb;
  v_discounts jsonb := '[]'::jsonb;
  v_discount numeric := 0;
  v_number integer;
begin
  select * into v_sub
  from public.child_tuition_subscriptions
  where id = p_subscription_id
    and status = 'active'
  for update;

  if not found or v_sub.next_invoice_date > current_date then
    return null;
  end if;

  select coalesce(ns.invoice_due_days, 7) into v_due_days
  from public.nursery_settings ns where ns.nursery_id = v_sub.nursery_id;

  v_items := jsonb_build_array(
    jsonb_build_object(
      'kind', 'tuition',
      'name_ar', nullif(v_sub.tuition_package_name_ar, ''),
      'name_en', nullif(v_sub.tuition_package_name_en, ''),
      'description', coalesce(nullif(v_sub.tuition_package_name_en, ''), nullif(v_sub.tuition_package_name_ar, '')),
      'quantity', v_sub.duration_months,
      'unitPrice', round(v_sub.locked_price / greatest(v_sub.duration_months, 1), 2),
      'unit_price', round(v_sub.locked_price / greatest(v_sub.duration_months, 1), 2),
      'total', v_sub.locked_price
    )
  );

  -- Changed: the family's discounts on this tuition (the package's deal on the invoices it covers, a
  -- partnership, the sibling discount). This invoice's place among the subscription's: the
  -- application's invoice was the first when the subscription came from one.
  select count(*) + case when v_sub.source_application_id is not null then 2 else 1 end into v_number
    from public.invoices i
   where i.line_items_json ->> 'subscription_id' = v_sub.id::text;
  v_discounts := public.discount_lines(
    v_sub.nursery_id, v_sub.billed_parent_id, 'tuition', v_sub.locked_price, v_sub.child_id,
    (select tp.deal_id from public.tuition_packages tp where tp.id = v_sub.tuition_package_id), v_number
  );
  v_discount := public.discount_lines_total(v_discounts);
  v_items := v_items || v_discounts;

  select * into v_meal
  from public.child_meal_plans
  where child_id = v_sub.child_id and ended_on is null and charged and started_on <= current_date and monthly_price > 0;
  if found then
    v_meal_total := round(v_meal.monthly_price * greatest(v_sub.duration_months, 1), 2);
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind', 'meal_plan',
      'child_meal_plan_id', v_meal.id,
      'name_ar', v_meal.plan_name_ar,
      'name_en', v_meal.plan_name_en,
      'description', v_meal.plan_name_en,
      'meals', to_jsonb(v_meal.meals),
      'quantity', greatest(v_sub.duration_months, 1),
      'unitPrice', v_meal.monthly_price,
      'unit_price', v_meal.monthly_price,
      'total', v_meal_total
    ));
  end if;

  v_line_items := jsonb_build_object(
    'child_id', v_sub.child_id,
    'subscription_id', v_sub.id,
    'tuition_package_id', v_sub.tuition_package_id,
    'package_id', v_sub.tuition_package_id,
    'package_name_ar', v_sub.tuition_package_name_ar,
    'package_name_en', v_sub.tuition_package_name_en,
    'billing_period', v_sub.billing_period,
    'billing_months', v_sub.duration_months,
    'monthly_price', v_sub.locked_price,
    'recurring_tuition', true,
    'discount_amount', v_discount,
    'items', v_items
  );

  insert into public.invoices (
    nursery_id, parent_id, amount, due_date, status, invoice_type, line_items_json
  )
  values (
    v_sub.nursery_id,
    v_sub.billed_parent_id,
    greatest(v_sub.locked_price - v_discount, 0) + v_meal_total,
    current_date + v_due_days,
    'pending',
    'monthly',
    v_line_items
  )
  returning id into v_invoice_id;

  update public.child_tuition_subscriptions
     set next_invoice_date = v_sub.next_invoice_date + make_interval(months => v_sub.duration_months),
         last_invoice_id = v_invoice_id
   where id = v_sub.id;

  return v_invoice_id;
end;
$function$;


-- -----------------------------------------------------------------------------------------------
-- Who calls what

revoke execute on function public.discount_lines(uuid, uuid, text, numeric, uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.discount_partner_open_families(uuid, date) from public, anon, authenticated;
revoke execute on function public.partner_beneficiary_given(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.discount_family_json(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.partner_beneficiary_json(public.partner_beneficiaries, public.discount_partners, date) from public, anon, authenticated;
revoke execute on function public.discount_admin_ids(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_parent_application_invoices(uuid) from public, anon, authenticated;
revoke execute on function public.create_partner_claim(uuid, uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.run_partner_discount_notices() from public, anon, authenticated;
grant execute on function public.create_partner_claim(uuid, uuid, uuid, text, text, uuid) to service_role;

revoke execute on function public.discount_manage_allowed(uuid, text) from public, anon;
revoke execute on function public.discount_chain_manage_allowed(uuid) from public, anon;
grant execute on function public.discount_manage_allowed(uuid, text) to authenticated, service_role;
grant execute on function public.discount_chain_manage_allowed(uuid) to authenticated, service_role;

do $$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'get_discount_partners(uuid)', 'get_discount_partner(uuid, uuid)', 'get_partner_offers(uuid)',
    'get_family_discounts(uuid, uuid)', 'search_discount_families(uuid, text)', 'get_discount_report(uuid, date, date)',
    'get_deals_overview(uuid)', 'save_discount_partner(uuid, uuid, jsonb)', 'set_discount_partner_active(uuid, uuid, boolean)',
    'claim_partner_discount(uuid, uuid, text, text)', 'decide_partner_claim(uuid, boolean, text)',
    'add_partner_beneficiary(uuid, uuid, uuid, date, date, text)', 'end_partner_beneficiary(uuid, date)'
  ]
  loop
    execute format('revoke execute on function public.%s from public, anon', v_sig);
    execute format('grant execute on function public.%s to authenticated, service_role', v_sig);
  end loop;
end;
$$;

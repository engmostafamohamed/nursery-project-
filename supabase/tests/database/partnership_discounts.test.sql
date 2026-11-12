-- Database test · discounts from every side: a branch partner and a chain partner are saved (every
-- problem refused with its code); families claim them (a proof needed or not), the admin confirms
-- or rejects; the engine combines a partnership, the sibling discount and a deal within the
-- nursery's cap, on tuition or extra hours; the monthly and the application invoices carry them;
-- agreements and discounts end (families and admins told once); a partner's family limit holds;
-- who may read what; the report adds them up.
-- Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(39);

-- A chain with two branches (A and B), its admin, A's admin, three families.
insert into public.chains (id, name) values ('00000000-0000-4000-9920-0000000000c1', 'Partner Chain');
insert into public.nurseries (id, name_ar, name_en, chain_id, working_days) values
  ('00000000-0000-4000-9920-00000000000a', 'فرع أ', 'Branch A', '00000000-0000-4000-9920-0000000000c1', '["sun", "mon", "tue", "wed", "thu", "fri", "sat"]'),
  ('00000000-0000-4000-9920-00000000000b', 'فرع ب', 'Branch B', '00000000-0000-4000-9920-0000000000c1', '["sun", "mon", "tue", "wed", "thu", "fri", "sat"]');
update public.nursery_settings
   set sibling_discount_enabled = true, sibling_discount_2nd_child_percentage = 10, sibling_discount_3rd_child_percentage = 15,
       max_total_discount_percentage = 30
 where nursery_id = '00000000-0000-4000-9920-00000000000a';

insert into auth.users (id, email) values
  ('00000000-0000-4000-9920-000000000a01', 'p.admin@test.local'),
  ('00000000-0000-4000-9920-000000000a02', 'p.chain@test.local'),
  ('00000000-0000-4000-9920-000000000a03', 'p.family1@test.local'),
  ('00000000-0000-4000-9920-000000000a04', 'p.family2@test.local'),
  ('00000000-0000-4000-9920-000000000a05', 'p.family3@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = v.nursery::uuid, chain_id = v.chain::uuid, name_ar = v.name_en, name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9920-000000000a01', 'branch_admin', 'Admin A', '00000000-0000-4000-9920-00000000000a', null),
    ('00000000-0000-4000-9920-000000000a02', 'chain_super_admin', 'Chain Admin', null, '00000000-0000-4000-9920-0000000000c1'),
    ('00000000-0000-4000-9920-000000000a03', 'parent', 'Family One', '00000000-0000-4000-9920-00000000000a', null),
    ('00000000-0000-4000-9920-000000000a04', 'parent', 'Family Two', '00000000-0000-4000-9920-00000000000a', null),
    ('00000000-0000-4000-9920-000000000a05', 'parent', 'Family Three', '00000000-0000-4000-9920-00000000000b', null)
  ) as v(id, role, name_en, nursery, chain)
 where u.id = v.id::uuid;

insert into public.children (id, nursery_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-9920-0000000000d1', '00000000-0000-4000-9920-00000000000a', 'أ', 'Kid One', '2022-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9920-0000000000d2', '00000000-0000-4000-9920-00000000000a', 'ب', 'Kid Two', '2023-01-01', 'active', '2026-02-01'),
  ('00000000-0000-4000-9920-0000000000d3', '00000000-0000-4000-9920-00000000000a', 'ج', 'Kid Three', '2023-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9920-0000000000d4', '00000000-0000-4000-9920-00000000000b', 'د', 'Kid Four', '2023-01-01', 'active', '2026-01-01');
insert into public.parent_children (parent_id, child_id, is_primary) values
  ('00000000-0000-4000-9920-000000000a03', '00000000-0000-4000-9920-0000000000d1', true),
  ('00000000-0000-4000-9920-000000000a03', '00000000-0000-4000-9920-0000000000d2', true),
  ('00000000-0000-4000-9920-000000000a04', '00000000-0000-4000-9920-0000000000d3', true),
  ('00000000-0000-4000-9920-000000000a05', '00000000-0000-4000-9920-0000000000d4', true);

insert into public.tuition_packages (id, nursery_id, name_ar, name_en, price, active) values
  ('00000000-0000-4000-9920-0000000000e1', '00000000-0000-4000-9920-00000000000a', 'كامل', 'Full day', 1000, true);
-- Family One: two children (Kid Two second); Family Two: one; the second's invoice is due today.
insert into public.child_tuition_subscriptions (id, nursery_id, child_id, tuition_package_id, tuition_package_name_ar, tuition_package_name_en,
                                                billing_period, duration_months, locked_price, billed_parent_id, status, started_at, next_invoice_date) values
  ('00000000-0000-4000-9920-0000000000f1', '00000000-0000-4000-9920-00000000000a', '00000000-0000-4000-9920-0000000000d1', '00000000-0000-4000-9920-0000000000e1', 'كامل', 'Full day',
   'monthly', 1, 1000, '00000000-0000-4000-9920-000000000a03', 'active', '2026-01-01', current_date + 20),
  ('00000000-0000-4000-9920-0000000000f2', '00000000-0000-4000-9920-00000000000a', '00000000-0000-4000-9920-0000000000d2', '00000000-0000-4000-9920-0000000000e1', 'كامل', 'Full day',
   'monthly', 1, 1000, '00000000-0000-4000-9920-000000000a03', 'active', '2026-02-01', current_date),
  ('00000000-0000-4000-9920-0000000000f3', '00000000-0000-4000-9920-00000000000a', '00000000-0000-4000-9920-0000000000d3', '00000000-0000-4000-9920-0000000000e1', 'كامل', 'Full day',
   'monthly', 1, 1000, '00000000-0000-4000-9920-000000000a04', 'active', '2026-01-01', current_date + 20);
insert into public.deals (id, nursery_id, name_ar, name_en, discount_type, discount_value, applies_for) values
  ('00000000-0000-4000-9920-0000000000b9', '00000000-0000-4000-9920-00000000000a', 'نصف', 'Half off', 'percentage', 50, 'every_invoice');
-- Family Two applies for a second child.
insert into public.applications (id, nursery_id, parent_id, status) values
  ('00000000-0000-4000-9920-0000000000aa', '00000000-0000-4000-9920-00000000000a', '00000000-0000-4000-9920-000000000a04', 'submitted');

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.notes(p_user uuid, p_key text) returns integer language sql security definer as $$
  select count(*)::integer from public.notifications where user_id = p_user and template_key = p_key
$$;
create function pg_temp.lines(p_parent uuid, p_scope text, p_subtotal numeric, p_child uuid, p_deal uuid default null, p_number integer default 1)
returns jsonb language sql security definer as $$
  select public.discount_lines('00000000-0000-4000-9920-00000000000a', p_parent, p_scope, p_subtotal, p_child, p_deal, p_number)
$$;
create function pg_temp.sources(p jsonb) returns text language sql as $$
  select coalesce(string_agg(format('%s:%s', l ->> 'source', trim_scale(-(l ->> 'total')::numeric)), ' ' order by -(l ->> 'total')::numeric desc), '')
    from jsonb_array_elements(p) l
   where l ->> 'kind' = 'discount'
$$;

-- ---------------------------------------------------------------------------------------------
-- Saving partners
select pg_temp.act_as('00000000-0000-4000-9920-000000000a01');
select throws_ok($$ select public.save_discount_partner('00000000-0000-4000-9920-00000000000a', null,
  '{"kind": "company", "discount_type": "percentage", "discount_value": 15, "applies_to": ["tuition"]}') $$,
  '22023', 'partner_name_required', 'a partner needs a name');
select throws_ok($$ select public.save_discount_partner('00000000-0000-4000-9920-00000000000a', null,
  '{"kind": "company", "name_en": "X", "discount_type": "percentage", "discount_value": 150, "applies_to": ["tuition"]}') $$,
  '22023', 'partner_value_invalid', 'a percentage is at most 100');
select throws_ok($$ select public.save_discount_partner('00000000-0000-4000-9920-00000000000a', null,
  '{"kind": "company", "name_en": "X", "discount_type": "percentage", "discount_value": 15, "applies_to": []}') $$,
  '22023', 'partner_applies_to_required', 'it applies to something');
select throws_ok($$ select public.save_discount_partner('00000000-0000-4000-9920-00000000000a', null,
  '{"kind": "company", "name_en": "X", "discount_type": "percentage", "discount_value": 15, "applies_to": ["tuition"], "starts_on": "2026-05-01", "ends_on": "2026-04-01"}') $$,
  '22023', 'partner_dates_invalid', 'it ends after it starts');
select throws_ok($$ select public.save_discount_partner('00000000-0000-4000-9920-00000000000a', null,
  '{"kind": "company", "name_en": "X", "discount_type": "percentage", "discount_value": 15, "applies_to": ["tuition"], "contact_email": "not-an-email"}') $$,
  '22023', 'partner_email_invalid', 'a contact email is an email');
select throws_ok($$ select public.save_discount_partner('00000000-0000-4000-9920-00000000000a', null,
  '{"kind": "company", "scope": "chain", "name_en": "X", "discount_type": "percentage", "discount_value": 15, "applies_to": ["tuition"]}') $$,
  '42501', 'partner_forbidden', 'a branch admin cannot make a chain-wide partner');
select set_config('t.voda', public.save_discount_partner('00000000-0000-4000-9920-00000000000a', null, jsonb_build_object(
  'kind', 'company', 'name_ar', 'فودافون', 'name_en', 'Vodafone', 'aliases', jsonb_build_array('Vodafone Egypt', 'فودافون مصر'),
  'discount_type', 'percentage', 'discount_value', 15, 'applies_to', jsonb_build_array('tuition', 'extra_hours'),
  'starts_on', current_date - 30, 'requires_proof', true, 'contact_email', 'HR@vodafone.example'
))::text, true);
select ok(current_setting('t.voda') <> '', 'the admin saves a branch partner');

select pg_temp.act_as('00000000-0000-4000-9920-000000000a02');
select set_config('t.nile', public.save_discount_partner('00000000-0000-4000-9920-00000000000a', null, jsonb_build_object(
  'kind', 'school', 'scope', 'chain', 'name_en', 'Nile School', 'discount_type', 'percentage', 'discount_value', 10,
  'applies_to', jsonb_build_array('tuition'), 'starts_on', current_date - 30, 'requires_proof', false
))::text, true);
select is((select chain_id from public.discount_partners where id = current_setting('t.nile')::uuid), '00000000-0000-4000-9920-0000000000c1'::uuid,
  'the chain admin saves a partner for the whole chain');

select pg_temp.act_as('00000000-0000-4000-9920-000000000a05');
select is(jsonb_array_length(public.get_partner_offers('00000000-0000-4000-9920-00000000000b')), 1, 'branch B sees only the chain partner');
select throws_ok($$ select public.get_discount_partners('00000000-0000-4000-9920-00000000000a') $$, '42501', 'partner_forbidden',
  'a parent does not read the partners page');

-- ---------------------------------------------------------------------------------------------
-- Claims
select pg_temp.act_as('00000000-0000-4000-9920-000000000a03');
select is(jsonb_array_length(public.get_partner_offers('00000000-0000-4000-9920-00000000000a')), 2, 'branch A offers both partners');
select throws_ok(format($$ select public.claim_partner_discount('00000000-0000-4000-9920-00000000000a', %L) $$, current_setting('t.voda')),
  '22023', 'partner_proof_required', 'Vodafone needs a proof');
select throws_ok(format($$ select public.claim_partner_discount('00000000-0000-4000-9920-00000000000a', %L, '00000000-0000-4000-9920-00000000000a/someone-else/hr.pdf', 'hr.pdf') $$, current_setting('t.voda')),
  '22023', 'partner_proof_invalid', 'a proof in someone else''s folder is refused');
select is(public.claim_partner_discount('00000000-0000-4000-9920-00000000000a', current_setting('t.voda')::uuid,
  '00000000-0000-4000-9920-00000000000a/00000000-0000-4000-9920-000000000a03/hr.pdf', 'hr.pdf') ->> 'state', 'pending',
  'with its proof, the claim waits for the admin');
select throws_ok(format($$ select public.claim_partner_discount('00000000-0000-4000-9920-00000000000a', %L, '00000000-0000-4000-9920-00000000000a/00000000-0000-4000-9920-000000000a03/hr2.pdf', 'hr2.pdf') $$, current_setting('t.voda')),
  '23505', 'partner_already_claimed', 'one open claim per partner');
select pg_temp.act_as('00000000-0000-4000-9920-000000000a04');
select is(public.claim_partner_discount('00000000-0000-4000-9920-00000000000a', current_setting('t.nile')::uuid) ->> 'state', 'active',
  'without a proof needed, the discount is granted at once');
reset role;
select is(pg_temp.notes('00000000-0000-4000-9920-000000000a01', 'partner_claim_received'), 1, 'the admin hears of the claim that waits (not of the other)');

select pg_temp.act_as('00000000-0000-4000-9920-000000000a01');
select set_config('t.claim', (select id::text from public.partner_beneficiaries where parent_id = '00000000-0000-4000-9920-000000000a03'), true);
select throws_ok(format($$ select public.decide_partner_claim(%L, false) $$, current_setting('t.claim')), '22023', 'partner_reason_required',
  'a rejection needs a reason');
select is(public.decide_partner_claim(current_setting('t.claim')::uuid, true) ->> 'state', 'active', 'the admin confirms it');
reset role;
select is(pg_temp.notes('00000000-0000-4000-9920-000000000a03', 'partner_discount_approved'), 1, 'and the family is told');

-- ---------------------------------------------------------------------------------------------
-- The engine
select is(pg_temp.sources(pg_temp.lines('00000000-0000-4000-9920-000000000a03', 'tuition', 1000, '00000000-0000-4000-9920-0000000000d2')),
  'partnership:150 sibling:100', 'the second child: the partnership and the sibling discount together');
select is(pg_temp.sources(pg_temp.lines('00000000-0000-4000-9920-000000000a03', 'tuition', 1000, '00000000-0000-4000-9920-0000000000d1')),
  'partnership:150', 'the first child pays without the sibling discount');
select is(pg_temp.sources(pg_temp.lines('00000000-0000-4000-9920-000000000a03', 'extra_hours', 400, '00000000-0000-4000-9920-0000000000d1'))
          || ' / ' || pg_temp.sources(pg_temp.lines('00000000-0000-4000-9920-000000000a04', 'extra_hours', 400, '00000000-0000-4000-9920-0000000000d3')),
  'partnership:60 / ', 'extra hours: Vodafone covers them, the Nile School does not');
update public.nursery_settings set max_total_discount_percentage = 20 where nursery_id = '00000000-0000-4000-9920-00000000000a';
select is(
  (select string_agg(format('%s:%s:%s', l ->> 'source', trim_scale(-(l ->> 'total')::numeric), l ->> 'capped'), ' ')
     from jsonb_array_elements(pg_temp.lines('00000000-0000-4000-9920-000000000a03', 'tuition', 1000, '00000000-0000-4000-9920-0000000000d2')) l),
  'partnership:150:false sibling:50:true', 'together they stop at the cap (20%): the sibling discount is cut');
select is(pg_temp.sources(pg_temp.lines('00000000-0000-4000-9920-000000000a03', 'tuition', 1000, '00000000-0000-4000-9920-0000000000d1', '00000000-0000-4000-9920-0000000000b9')),
  'deal:500', 'a single discount larger than the cap still applies alone, and nothing is added to it');
update public.deals set applies_for = 'first_invoice' where id = '00000000-0000-4000-9920-0000000000b9';
select is(pg_temp.sources(pg_temp.lines('00000000-0000-4000-9920-000000000a03', 'tuition', 1000, '00000000-0000-4000-9920-0000000000d1', '00000000-0000-4000-9920-0000000000b9', 2)),
  'partnership:150', 'a first-invoice deal is not on the second invoice');
update public.nursery_settings set max_total_discount_percentage = 30 where nursery_id = '00000000-0000-4000-9920-00000000000a';

-- ---------------------------------------------------------------------------------------------
-- Invoices
select set_config('t.monthly', public._generate_tuition_invoice('00000000-0000-4000-9920-0000000000f2')::text, true);
select is(
  (select format('%s|%s|%s', amount, line_items_json ->> 'discount_amount', pg_temp.sources(line_items_json -> 'items'))
     from public.invoices where id = current_setting('t.monthly')::uuid),
  '750.00|250.00|partnership:150 sibling:100', 'the monthly invoice carries the family''s discounts');

select pg_temp.act_as('00000000-0000-4000-9920-000000000a01');
select set_config('t.app_invoice', public.select_application_payment_package('00000000-0000-4000-9920-0000000000aa', '00000000-0000-4000-9920-0000000000e1', 'monthly')::text, true);
reset role;
select is(
  (select format('%s|%s', amount, pg_temp.sources(line_items_json -> 'items')) from public.invoices where id = current_setting('t.app_invoice')::uuid),
  '800.00|partnership:100 sibling:100', 'the application invoice: the school''s discount and, for a second child, the sibling discount');

-- ---------------------------------------------------------------------------------------------
-- Endings
update public.discount_partners set ends_on = current_date - 1 where id = current_setting('t.nile')::uuid;
select is(pg_temp.sources(pg_temp.lines('00000000-0000-4000-9920-000000000a04', 'tuition', 1000, '00000000-0000-4000-9920-0000000000d3')), '',
  'after the agreement''s end, new invoices go without it');
update public.discount_partners set ends_on = current_date + 10 where id = current_setting('t.voda')::uuid;
select ok(public.run_partner_discount_notices() >= 2, 'the morning job runs');
select is(public.run_partner_discount_notices(), 0, 'a second run the same morning tells no one again');
select is(
  format('%s|%s|%s',
    (select status from public.partner_beneficiaries where parent_id = '00000000-0000-4000-9920-000000000a04'),
    pg_temp.notes('00000000-0000-4000-9920-000000000a04', 'partner_discount_ended'),
    pg_temp.notes('00000000-0000-4000-9920-000000000a01', 'partner_agreement_ending')),
  'ended|1|1', 'the family whose discount ended is told once, and the admin once of the agreement ending soon');

select pg_temp.act_as('00000000-0000-4000-9920-000000000a01');
select is(public.end_partner_beneficiary(current_setting('t.claim')::uuid) ->> 'state', 'ended', 'the admin ends a family''s discount');
select throws_ok(format($$ select public.add_partner_beneficiary('00000000-0000-4000-9920-00000000000a', %L, '00000000-0000-4000-9920-000000000a05') $$, current_setting('t.voda')),
  'P0002', 'partner_family_not_found', 'only a family of the branch');
reset role;
update public.discount_partners set max_families = 1 where id = current_setting('t.voda')::uuid;
select pg_temp.act_as('00000000-0000-4000-9920-000000000a01');
select is(public.add_partner_beneficiary('00000000-0000-4000-9920-00000000000a', current_setting('t.voda')::uuid, '00000000-0000-4000-9920-000000000a04') ->> 'state', 'active',
  'the admin gives a family the discount by hand');
select pg_temp.act_as('00000000-0000-4000-9920-000000000a03');
select throws_ok(format($$ select public.claim_partner_discount('00000000-0000-4000-9920-00000000000a', %L, '00000000-0000-4000-9920-00000000000a/00000000-0000-4000-9920-000000000a03/hr3.pdf', 'hr3.pdf') $$, current_setting('t.voda')),
  '22023', 'partner_full', 'a partner with its families limit reached takes no more');
reset role;
select is(
  (select format('%s|%s', amount, pg_temp.sources(line_items_json -> 'items')) from public.invoices where id = current_setting('t.app_invoice')::uuid),
  '750.00|partnership:150 sibling:100', 'the family''s unpaid application invoice follows: Vodafone instead of the ended school discount');

-- ---------------------------------------------------------------------------------------------
-- Reading
select pg_temp.act_as('00000000-0000-4000-9920-000000000a05');
select throws_ok($$ select public.get_family_discounts('00000000-0000-4000-9920-00000000000a', '00000000-0000-4000-9920-000000000a03') $$, '42501', 'partner_forbidden',
  'a family does not read another family''s discounts');
select pg_temp.act_as('00000000-0000-4000-9920-000000000a01');
select is(
  (select format('%s|%s|%s', r ->> 'total', r -> 'by_source' ->> 'partnership', r -> 'by_source' ->> 'sibling')
     from (select public.get_discount_report('00000000-0000-4000-9920-00000000000a', current_date - 1, current_date + 1) as r) x),
  '500.00|300.00|200.00', 'the report adds up what the invoices took off, by source');

select * from finish();
rollback;

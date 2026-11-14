-- Database test · both parents see and pay the family's invoices: the parent billed sees all of
-- them; the other parent sees those of a child in both parents' custody and the family charges,
-- reads one with the billed parent named, and can pay it; never those of a child in one parent's
-- custody; another family sees and pays none. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
create function pg_temp.seen() returns text language sql as $$
  select coalesce(string_agg(line_items_json ->> 'label', ', ' order by line_items_json ->> 'label'), '-') from public.invoices
$$;
-- Whether the signed-in parent may record a payment attempt on an invoice.
create function pg_temp.can_pay(p_invoice uuid) returns text language plpgsql as $$
begin
  insert into public.payment_attempts (invoice_id, parent_id, nursery_id, amount, payment_method, status)
  values (p_invoice, auth.uid(), '00000000-0000-4000-9a00-00000000000a', 10, 'cash', 'pending_confirmation');
  return 'yes';
exception when others then
  return sqlerrm;
end;
$$;

-- Laila is in both parents' custody, Omar in his mother's; another family's mother.
insert into public.nurseries (id, name_ar, name_en) values ('00000000-0000-4000-9a00-00000000000a', 'حضانة', 'Family Nursery');
insert into public.children (id, nursery_id, full_name_ar, full_name_en, dob, status, enrollment_date, custody_status) values
  ('00000000-0000-4000-9a00-0000000000c1', '00000000-0000-4000-9a00-00000000000a', 'ليلى', 'Laila', '2023-01-01', 'active', '2026-01-01', 'both_parents'),
  ('00000000-0000-4000-9a00-0000000000c2', '00000000-0000-4000-9a00-00000000000a', 'عمر', 'Omar', '2023-01-01', 'active', '2026-01-01', 'mother'),
  ('00000000-0000-4000-9a00-0000000000c3', '00000000-0000-4000-9a00-00000000000a', 'سارة', 'Sara', '2023-01-01', 'active', '2026-01-01', 'both_parents');
insert into auth.users (id, email) values
  ('00000000-0000-4000-9a00-000000000a01', 'fam.mother@test.local'),
  ('00000000-0000-4000-9a00-000000000a02', 'fam.father@test.local'),
  ('00000000-0000-4000-9a00-000000000a03', 'fam.other@test.local');
update public.users u set role = 'parent', nursery_id = '00000000-0000-4000-9a00-00000000000a', status = 'active', name_en = v.name_en
  from (values ('00000000-0000-4000-9a00-000000000a01', 'Mother'), ('00000000-0000-4000-9a00-000000000a02', 'Father'),
               ('00000000-0000-4000-9a00-000000000a03', 'Other')) as v(id, name_en)
 where u.id = v.id::uuid;
insert into public.parent_children (parent_id, child_id, is_primary) values
  ('00000000-0000-4000-9a00-000000000a01', '00000000-0000-4000-9a00-0000000000c1', true),
  ('00000000-0000-4000-9a00-000000000a02', '00000000-0000-4000-9a00-0000000000c1', false),
  ('00000000-0000-4000-9a00-000000000a01', '00000000-0000-4000-9a00-0000000000c2', true),
  ('00000000-0000-4000-9a00-000000000a02', '00000000-0000-4000-9a00-0000000000c2', false),
  ('00000000-0000-4000-9a00-000000000a03', '00000000-0000-4000-9a00-0000000000c3', true);

-- The mother is billed: Laila's month, Omar's month, a family charge; the other family's month.
insert into public.invoices (id, nursery_id, parent_id, amount, due_date, status, invoice_type, line_items_json) values
  ('00000000-0000-4000-9a00-0000000000e1', '00000000-0000-4000-9a00-00000000000a', '00000000-0000-4000-9a00-000000000a01', 1000, current_date + 10, 'pending', 'monthly',
   '{"label": "Laila", "child_id": "00000000-0000-4000-9a00-0000000000c1"}'),
  ('00000000-0000-4000-9a00-0000000000e2', '00000000-0000-4000-9a00-00000000000a', '00000000-0000-4000-9a00-000000000a01', 1000, current_date + 10, 'pending', 'monthly',
   '{"label": "Omar", "child_id": "00000000-0000-4000-9a00-0000000000c2"}'),
  ('00000000-0000-4000-9a00-0000000000e3', '00000000-0000-4000-9a00-00000000000a', '00000000-0000-4000-9a00-000000000a01', 200, current_date + 10, 'pending', 'other',
   '{"label": "Family"}'),
  ('00000000-0000-4000-9a00-0000000000e4', '00000000-0000-4000-9a00-00000000000a', '00000000-0000-4000-9a00-000000000a03', 1000, current_date + 10, 'pending', 'monthly',
   '{"label": "Sara", "child_id": "00000000-0000-4000-9a00-0000000000c3"}');
insert into public.payments (invoice_id, amount, status, method, paid_at) values
  ('00000000-0000-4000-9a00-0000000000e1', 300, 'completed', 'cash', now());

select pg_temp.act_as('00000000-0000-4000-9a00-000000000a01');
select is(pg_temp.seen(), 'Family, Laila, Omar', 'the parent billed sees all of her invoices');

select pg_temp.act_as('00000000-0000-4000-9a00-000000000a02');
select is(pg_temp.seen(), 'Family, Laila', 'the other parent sees the shared child''s and the family''s, not those of a child in the mother''s custody');
select is(jsonb_array_length(public.get_parent_billing()), 2, 'and so does his billing list');
select is((select sum(amount)::int from public.payments), 300, 'with the payments made on them');
select is(public.get_parent_invoice('00000000-0000-4000-9a00-0000000000e1') -> 'parent' ->> 'name_en', 'Mother', 'one invoice names the parent billed');
select throws_ok($$ select public.get_parent_invoice('00000000-0000-4000-9a00-0000000000e2') $$, '42501', 'payment_invoice_not_yours', 'Omar''s invoice stays his mother''s');
select ok(public.parent_can_pay_invoice('00000000-0000-4000-9a00-0000000000e1'), 'he may pay Laila''s');
select ok(not public.parent_can_pay_invoice('00000000-0000-4000-9a00-0000000000e2'), 'not Omar''s');
select is(pg_temp.can_pay('00000000-0000-4000-9a00-0000000000e1'), 'yes', 'and his payment is recorded');
select is(pg_temp.can_pay('00000000-0000-4000-9a00-0000000000e2'), 'payment_invoice_not_yours', 'a payment on Omar''s is refused');

select pg_temp.act_as('00000000-0000-4000-9a00-000000000a03');
select is(pg_temp.seen(), 'Sara', 'another family sees only its own');
select ok(not public.parent_can_pay_invoice('00000000-0000-4000-9a00-0000000000e1'), 'and may not pay ours');
select is(pg_temp.can_pay('00000000-0000-4000-9a00-0000000000e1'), 'payment_invoice_not_yours', 'its payment on ours is refused');
reset role;

select is((select parent_id from public.payment_attempts where invoice_id = '00000000-0000-4000-9a00-0000000000e1'),
  '00000000-0000-4000-9a00-000000000a02'::uuid, 'the attempt is the payer''s');

select * from finish();
rollback;

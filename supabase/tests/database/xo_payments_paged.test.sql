-- Database test · the platform's payments page, a page at a time. get_xo_payment_attempts answers
-- one page, newest first, with the names and the invoice number joined in and total_count saying how
-- many attempts the filters match; "cancelled" (Rejected) takes in the failed ones too, and the search
-- reads the nursery's, the parent's and the approver's names in either language and the invoice
-- number, as plain text. get_xo_payment_attempt_counts counts every attempt on the platform. Only
-- the platform's super admin may call either. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(15);

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

-- The statuses of one search, in the order they come back.
create function pg_temp.statuses(p_status text, p_search text, p_limit int, p_offset int) returns text
language sql as $$
  select string_agg(status, ',' order by created_at desc, id)
    from public.get_xo_payment_attempts(p_status, p_search, p_limit, p_offset)
$$;

insert into public.nurseries (id, name_ar, name_en) values
  ('00000000-0000-4000-9125-00000000000a', 'حضانة زيتاباي', 'Zetapay Nursery');
insert into auth.users (id, email) values
  ('00000000-0000-4000-9125-000000000a01', 'paged.xo@test.local'),
  ('00000000-0000-4000-9125-000000000a02', 'paged.admin@test.local'),
  ('00000000-0000-4000-9125-000000000a03', 'paged.parent@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = v.nursery::uuid, name_en = v.name_en, name_ar = v.name_ar, status = 'active'
  from (values
    ('00000000-0000-4000-9125-000000000a01', 'xo_super_admin', null, 'XO', 'المنصة'),
    ('00000000-0000-4000-9125-000000000a02', 'branch_admin', '00000000-0000-4000-9125-00000000000a', 'Finance Ottoline', 'المالية'),
    ('00000000-0000-4000-9125-000000000a03', 'parent', '00000000-0000-4000-9125-00000000000a', 'Quillon Parent', 'ولي الأمر')
  ) as v(id, role, nursery, name_en, name_ar)
 where u.id = v.id::uuid;

-- One invoice per attempt, so no attempt runs past what its invoice still owes.
insert into public.invoices (id, nursery_id, parent_id, amount, due_date, status, invoice_type, line_items_json)
select ('00000000-0000-4000-9125-0000000000b' || g)::uuid, '00000000-0000-4000-9125-00000000000a',
       '00000000-0000-4000-9125-000000000a03', 1000, current_date, 'pending', 'monthly', '{}'::jsonb
  from generate_series(1, 4) g;

-- Four attempts, an hour apart: waiting, accepted, rejected, failed (newest first).
insert into public.payment_attempts (id, invoice_id, parent_id, nursery_id, amount, payment_method, status, created_at, confirmed_at, confirmed_by)
values
  ('00000000-0000-4000-9125-0000000000c1', '00000000-0000-4000-9125-0000000000b1', '00000000-0000-4000-9125-000000000a03',
   '00000000-0000-4000-9125-00000000000a', 100, 'bank_transfer', 'pending_confirmation', now() - interval '1 hour', null, null),
  ('00000000-0000-4000-9125-0000000000c2', '00000000-0000-4000-9125-0000000000b2', '00000000-0000-4000-9125-000000000a03',
   '00000000-0000-4000-9125-00000000000a', 200, 'cash', 'confirmed', now() - interval '2 hours', now(), '00000000-0000-4000-9125-000000000a02'),
  ('00000000-0000-4000-9125-0000000000c3', '00000000-0000-4000-9125-0000000000b3', '00000000-0000-4000-9125-000000000a03',
   '00000000-0000-4000-9125-00000000000a', 300, 'cash', 'cancelled', now() - interval '3 hours', now(), '00000000-0000-4000-9125-000000000a02'),
  ('00000000-0000-4000-9125-0000000000c4', '00000000-0000-4000-9125-0000000000b4', '00000000-0000-4000-9125-000000000a03',
   '00000000-0000-4000-9125-00000000000a', 400, 'card', 'failed', now() - interval '4 hours', null, null);

-- 1-2 · nobody but the platform's super admin.
select pg_temp.act_as('00000000-0000-4000-9125-000000000a02');
select throws_ok($$ select * from public.get_xo_payment_attempts(null, null, 20, 0) $$, '42501', null,
  'a branch admin cannot read the platform''s payments');
select throws_ok($$ select * from public.get_xo_payment_attempt_counts() $$, '42501', null,
  'nor count them');

select pg_temp.act_as('00000000-0000-4000-9125-000000000a01');

-- 3-5 · a page at a time, newest first, each row knowing how many there are.
select is(pg_temp.statuses(null, 'zetapay', 20, 0), 'pending_confirmation,confirmed,cancelled,failed',
  'the nursery''s four attempts come back newest first');
select is(pg_temp.statuses(null, 'zetapay', 2, 2), 'cancelled,failed', 'the second page of two is the older two');
select is((select max(total_count)::int from public.get_xo_payment_attempts(null, 'zetapay', 2, 2)), 4,
  'and each row of a page says the search matches four');

-- 6-7 · by status.
select is(pg_temp.statuses('cancelled', 'zetapay', 20, 0), 'cancelled,failed', 'rejected takes in the failed attempt too');
select is(pg_temp.statuses('confirmed', 'zetapay', 20, 0), 'confirmed', 'accepted is the accepted one only');

-- 8-12 · the search reads every name and the invoice number, as plain text.
select is((select parent_name_en || ' / ' || confirmer_name_en || ' / ' || nursery_name_ar
             from public.get_xo_payment_attempts('confirmed', 'zetapay', 20, 0)),
  'Quillon Parent / Finance Ottoline / حضانة زيتاباي', 'the parent, the approver and the nursery are named');
select is(pg_temp.statuses(null, 'QUILLON', 20, 0), 'pending_confirmation,confirmed,cancelled,failed',
  'the parent''s name finds them, whatever the case');
select is(pg_temp.statuses(null, 'زيتاباي', 20, 0), 'pending_confirmation,confirmed,cancelled,failed',
  'and so does the nursery''s Arabic name');
select is(pg_temp.statuses(null, (select generated_invoice_number from public.invoices where id = '00000000-0000-4000-9125-0000000000b3'), 20, 0),
  'cancelled', 'an invoice number finds its own attempt');
select is(pg_temp.statuses(null, 'zeta%', 20, 0), null, 'a % is a character to find, not a wildcard');

-- 13-15 · the tiles, the page size, a status that does not exist.
select is((select row(total, pending, confirmed, rejected)::text from public.get_xo_payment_attempt_counts()),
  (select row(count(*), count(*) filter (where status = 'pending_confirmation'), count(*) filter (where status = 'confirmed'),
              count(*) filter (where status in ('cancelled', 'failed')))::text from public.payment_attempts),
  'the tiles count every attempt on the platform');
select is((select count(*)::int from public.get_xo_payment_attempts(null, null, 5000, 0)),
  (select least(count(*), 100)::int from public.payment_attempts), 'a page holds a hundred at most');
select throws_ok($$ select * from public.get_xo_payment_attempts('lost', null, 20, 0) $$, '22023', null,
  'a status that does not exist is refused');

select * from finish();
rollback;

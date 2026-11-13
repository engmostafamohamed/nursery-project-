-- Database test · what a family writes is its own: a post or a comment carries the sender as its
-- author (never someone else), a comment is changed only by its author and deleted by nobody; a
-- payment a family sends starts waiting for the nursery, even if it says "confirmed". Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
-- How many comments a statement changes, as whoever is acting.
create function pg_temp.changed(p_sql text) returns integer language plpgsql as $$
declare
  n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

insert into public.nurseries (id, name_ar, name_en) values ('00000000-0000-4000-9d00-00000000000a', 'حضانة', 'Write Nursery');
insert into auth.users (id, email) values
  ('00000000-0000-4000-9d00-000000000a01', 'write.admin@test.local'),
  ('00000000-0000-4000-9d00-000000000a04', 'write.mona@test.local'),
  ('00000000-0000-4000-9d00-000000000a05', 'write.karim@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = '00000000-0000-4000-9d00-00000000000a', name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9d00-000000000a01', 'branch_admin', 'Admin'),
    ('00000000-0000-4000-9d00-000000000a04', 'parent', 'Mona'),
    ('00000000-0000-4000-9d00-000000000a05', 'parent', 'Karim')
  ) as v(id, role, name_en)
 where u.id = v.id::uuid;
insert into public.posts (id, nursery_id, author_id, post_type, title, content) values
  ('00000000-0000-4000-9d00-0000000000e1', '00000000-0000-4000-9d00-00000000000a', '00000000-0000-4000-9d00-000000000a01', 'announcement', 'Welcome', 'Hello');
insert into public.post_comments (id, post_id, author_id, content) values
  ('00000000-0000-4000-9d00-0000000000f5', '00000000-0000-4000-9d00-0000000000e1', '00000000-0000-4000-9d00-000000000a05', 'Karim says hi');

-- The community
select pg_temp.act_as('00000000-0000-4000-9d00-000000000a04');
select throws_ok($$ insert into public.posts (nursery_id, author_id, post_type, title, content)
                    values ('00000000-0000-4000-9d00-00000000000a', '00000000-0000-4000-9d00-000000000a01', 'tip', 'Fake', 'From the admin') $$,
  '42501', null, 'Mona cannot post under the admin''s name');
select lives_ok($$ insert into public.posts (nursery_id, author_id, post_type, title, content)
                   values ('00000000-0000-4000-9d00-00000000000a', '00000000-0000-4000-9d00-000000000a04', 'tip', 'Tip', 'Mine') $$,
  'she posts under her own');
select throws_ok($$ insert into public.post_comments (post_id, author_id, content)
                    values ('00000000-0000-4000-9d00-0000000000e1', '00000000-0000-4000-9d00-000000000a05', 'Forged') $$,
  '42501', null, 'nor comments as Karim');
select lives_ok($$ insert into public.post_comments (post_id, author_id, content)
                   values ('00000000-0000-4000-9d00-0000000000e1', '00000000-0000-4000-9d00-000000000a04', 'Thanks') $$,
  'she comments as herself');
select is(pg_temp.changed($$ update public.post_comments set content = 'changed' where id = '00000000-0000-4000-9d00-0000000000f5' $$), 0,
  'she cannot change Karim''s comment');
select throws_ok($$ delete from public.post_comments where id = '00000000-0000-4000-9d00-0000000000f5' $$, '42501', null, 'nor delete it');
select pg_temp.act_as('00000000-0000-4000-9d00-000000000a05');
select is(pg_temp.changed($$ update public.post_comments set content = 'Karim edits' where id = '00000000-0000-4000-9d00-0000000000f5' $$), 1,
  'Karim edits his own comment');

-- A payment sent as "confirmed"
reset role;
insert into public.invoices (id, nursery_id, parent_id, amount, due_date, status) values
  ('00000000-0000-4000-9d00-0000000000a9', '00000000-0000-4000-9d00-00000000000a', '00000000-0000-4000-9d00-000000000a04', 500, current_date + 7, 'pending');
select pg_temp.act_as('00000000-0000-4000-9d00-000000000a04');
insert into public.payment_attempts (invoice_id, parent_id, nursery_id, amount, payment_method, status, confirmed_at)
values ('00000000-0000-4000-9d00-0000000000a9', '00000000-0000-4000-9d00-000000000a04', '00000000-0000-4000-9d00-00000000000a', 500, 'bank_transfer', 'confirmed', now());
reset role;
select is((select status || ' ' || (confirmed_at is null)::text from public.payment_attempts where invoice_id = '00000000-0000-4000-9d00-0000000000a9'),
  'pending_confirmation true', 'a family''s payment sent as confirmed waits for the nursery');
select is((select status from public.invoices where id = '00000000-0000-4000-9d00-0000000000a9'), 'pending', 'and the invoice is not paid');

select * from finish();
rollback;

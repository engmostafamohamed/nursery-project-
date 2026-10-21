-- Database test · The log of emails, SMS and WhatsApp messages: the nursery's admins and managers
-- read their nursery's rows, nobody else does, and only the server (service role) writes it.
-- Everything runs in one transaction that is rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

insert into public.nurseries (id, name_ar, name_en) values
  ('00000000-0000-4000-d000-00000000000a', 'حضانة أ', 'Nursery A'),
  ('00000000-0000-4000-d000-00000000000b', 'حضانة ب', 'Nursery B');

insert into auth.users (id, email) values
  ('00000000-0000-4000-d000-000000000a01', 'log.admin@test.local'),
  ('00000000-0000-4000-d000-000000000a02', 'log.manager@test.local'),
  ('00000000-0000-4000-d000-000000000a03', 'log.teacher@test.local'),
  ('00000000-0000-4000-d000-000000000a06', 'log.parent@test.local'),
  ('00000000-0000-4000-d000-000000000b01', 'log.admin.b@test.local');

update public.users u
   set role = v.role::public.user_role,
       nursery_id = v.nursery_id::uuid,
       department = v.department::public.user_department,
       status = 'active'
  from (values
    ('00000000-0000-4000-d000-000000000a01', 'branch_admin', '00000000-0000-4000-d000-00000000000a', null),
    ('00000000-0000-4000-d000-000000000a02', 'manager',      '00000000-0000-4000-d000-00000000000a', 'finance'),
    ('00000000-0000-4000-d000-000000000a03', 'teacher',      '00000000-0000-4000-d000-00000000000a', null),
    ('00000000-0000-4000-d000-000000000a06', 'parent',       '00000000-0000-4000-d000-00000000000a', null),
    ('00000000-0000-4000-d000-000000000b01', 'branch_admin', '00000000-0000-4000-d000-00000000000b', null)
  ) as v(id, role, nursery_id, department)
 where u.id = v.id::uuid;

-- What the functions write: a demo email to the parent, and an SMS that failed.
insert into public.message_deliveries (nursery_id, channel, message_type, recipient, user_id, requested_by, mode, status, provider, error) values
  ('00000000-0000-4000-d000-00000000000a', 'email', 'invoice', 'parent@test.local', '00000000-0000-4000-d000-000000000a06',
   '00000000-0000-4000-d000-000000000a01', 'demo', 'sent', 'demo', null),
  ('00000000-0000-4000-d000-00000000000a', 'sms', 'otp_login', '201012345678', '00000000-0000-4000-d000-000000000a06',
   '00000000-0000-4000-d000-000000000a06', 'live', 'failed', 'sms_misr', 'sms_misr_1903');

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

select pg_temp.act_as('00000000-0000-4000-d000-000000000a01');
select is((select count(*)::int from public.message_deliveries), 2, 'the branch admin reads the nursery''s messages');

select pg_temp.act_as('00000000-0000-4000-d000-000000000a02');
select is((select count(*)::int from public.message_deliveries), 2, 'a manager of the nursery reads them too');

select pg_temp.act_as('00000000-0000-4000-d000-000000000a03');
select is((select count(*)::int from public.message_deliveries), 0, 'a teacher does not');

select pg_temp.act_as('00000000-0000-4000-d000-000000000a06');
select is((select count(*)::int from public.message_deliveries), 0, 'a parent does not, even their own');

select pg_temp.act_as('00000000-0000-4000-d000-000000000b01');
select is((select count(*)::int from public.message_deliveries), 0, 'another nursery''s admin does not');

select pg_temp.act_as('00000000-0000-4000-d000-000000000a01');
select throws_ok(
  $$ insert into public.message_deliveries (nursery_id, channel, message_type, recipient, mode, status, provider)
     values ('00000000-0000-4000-d000-00000000000a', 'email', 'invoice', 'x@test.local', 'live', 'sent', 'resend') $$,
  '42501', null,
  'signed-in users cannot write the log (only the server does)'
);

reset role;
select throws_ok(
  $$ insert into public.message_deliveries (nursery_id, channel, message_type, recipient, mode, status, provider)
     values ('00000000-0000-4000-d000-00000000000a', 'fax', 'invoice', 'x', 'live', 'sent', 'x') $$,
  '23514', null,
  'only email, SMS and WhatsApp'
);
select ok(not has_table_privilege('anon', 'public.message_deliveries', 'select'), 'signed-out visitors cannot read it');

select * from finish();
rollback;

-- Database test · an event's life on the server: the admin publishes (the children are asked, each
-- with the deadline, each family told once); a parent says yes (a paid event bills that parent,
-- once per child) or no (with a note), only for their own child, before the deadline; a yes taken
-- back cancels the unpaid invoice, but not inside the nursery's cancellation window; the admin
-- cancels with a reason (the asked families are told, unpaid invoices cancelled, the admins told
-- of the paid ones with the refund policy). Parents only read their permission rows, and none of a
-- draft; deleting is a soft delete of a draft or a cancelled event; the deadline reminder goes only
-- for open events still to come; who is asked is set on the server (a withdrawn request is marked,
-- never removed, and the families are told); moving an open event tells them; a paid yes taken back
-- reaches the admins; approvals without an invoice are billed once. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(57);

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
-- A child's permission for an event.
create function pg_temp.perm(p_event uuid, p_child uuid) returns uuid language sql as $$
  select id from public.permissions where event_id = p_event and child_id = p_child
$$;
-- How many permission rows a direct update changes, as whoever is acting.
create function pg_temp.try_grant_directly(p_permission uuid) returns integer language plpgsql as $$
declare
  n integer;
begin
  update public.permissions set status = 'granted' where id = p_permission;
  get diagnostics n = row_count;
  return n;
end;
$$;
-- The child's event invoices as "status amount" (oldest first).
create function pg_temp.invoices(p_event uuid, p_child uuid) returns text language sql as $$
  select coalesce(string_agg(format('%s %s', i.status, i.amount::numeric(8,2)), ', ' order by i.created_at, (i.status <> 'cancelled'), i.id), '-')
    from public.event_invoices ei join public.invoices i on i.id = ei.invoice_id
   where ei.event_id = p_event and ei.child_id = p_child
$$;

insert into public.nurseries (id, name_ar, name_en) values ('00000000-0000-4000-9500-00000000000a', 'حضانة الفعاليات', 'Events Nursery');
update public.nursery_settings
   set timezone = 'Africa/Cairo', invoice_due_days = 7, event_cancellation_window_hours = 48, paid_event_refund_policy = 'partial', currency = 'EGP'
 where nursery_id = '00000000-0000-4000-9500-00000000000a';

insert into auth.users (id, email) values
  ('00000000-0000-4000-9500-000000000a01', 'events.admin@test.local'),
  ('00000000-0000-4000-9500-000000000a02', 'events.teacher@test.local'),
  ('00000000-0000-4000-9500-000000000a04', 'events.mona@test.local'),
  ('00000000-0000-4000-9500-000000000a05', 'events.karim@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = '00000000-0000-4000-9500-00000000000a', name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9500-000000000a01', 'branch_admin', 'Admin'),
    ('00000000-0000-4000-9500-000000000a02', 'teacher', 'Teacher'),
    ('00000000-0000-4000-9500-000000000a04', 'parent', 'Mona'),
    ('00000000-0000-4000-9500-000000000a05', 'parent', 'Karim')
  ) as v(id, role, name_en)
 where u.id = v.id::uuid;

insert into public.children (id, nursery_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-9500-0000000000c1', '00000000-0000-4000-9500-00000000000a', 'ليلى', 'Laila', '2022-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9500-0000000000c2', '00000000-0000-4000-9500-00000000000a', 'عمر', 'Omar', '2022-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9500-0000000000c3', '00000000-0000-4000-9500-00000000000a', 'نور', 'Nour', '2022-01-01', 'active', '2026-01-01');
insert into public.parent_children (parent_id, child_id, is_primary) values
  ('00000000-0000-4000-9500-000000000a04', '00000000-0000-4000-9500-0000000000c1', true),
  ('00000000-0000-4000-9500-000000000a05', '00000000-0000-4000-9500-0000000000c2', true),
  ('00000000-0000-4000-9500-000000000a04', '00000000-0000-4000-9500-0000000000c3', true);

-- A paid trip in five days (answers until three days before), one in 30 hours, and one whose
-- answers closed yesterday.
insert into public.events (id, nursery_id, title_ar, title_en, starts_at, category, is_paid, price, target_scope, status, permission_deadline) values
  ('00000000-0000-4000-9500-0000000000e1', '00000000-0000-4000-9500-00000000000a', 'رحلة', 'Zoo trip', now() + interval '5 days', 'trip', true, 150, 'all', 'draft', now() + interval '3 days'),
  ('00000000-0000-4000-9500-0000000000e2', '00000000-0000-4000-9500-00000000000a', 'نشاط', 'Painting', now() + interval '30 hours', 'activity', false, null, 'all', 'draft', null),
  ('00000000-0000-4000-9500-0000000000e3', '00000000-0000-4000-9500-00000000000a', 'كشف', 'Dentist', now() + interval '4 days', 'doctor_visit', false, null, 'all', 'draft', now() - interval '1 day');
-- A draft for Laila alone (a chosen child is asked from the draft).
insert into public.events (id, nursery_id, title_ar, title_en, starts_at, category, target_scope, status) values
  ('00000000-0000-4000-9500-0000000000e4', '00000000-0000-4000-9500-00000000000a', 'مسودة', 'Draft visit', now() + interval '6 days', 'activity', 'individual', 'draft');
insert into public.permissions (id, child_id, event_id, permission_type, status) values
  ('00000000-0000-4000-9500-0000000000f4', '00000000-0000-4000-9500-0000000000c1', '00000000-0000-4000-9500-0000000000e4', 'event', 'pending');

-- ---------------------------------------------------------------------------------------------
-- Publishing
select pg_temp.act_as('00000000-0000-4000-9500-000000000a02');
select throws_ok($$ select public.event_publish('00000000-0000-4000-9500-0000000000e1') $$, '42501', 'event_forbidden', 'a teacher cannot publish');
select pg_temp.act_as('00000000-0000-4000-9500-000000000a04');
select throws_ok($$ select public.event_publish('00000000-0000-4000-9500-0000000000e1') $$, '42501', 'event_forbidden', 'nor a parent');

select pg_temp.act_as('00000000-0000-4000-9500-000000000a01');
select is(
  (select format('%s / %s', r ->> 'children', r ->> 'notified') from (select public.event_publish('00000000-0000-4000-9500-0000000000e1') r) x),
  '3 / 2',
  'the admin publishes: the three children are asked, and each of the two families is told once'
);
select is((public.event_publish('00000000-0000-4000-9500-0000000000e1') ->> 'notified'), '0', 'publishing again tells nobody twice');
select set_config('test.p2', public.event_publish('00000000-0000-4000-9500-0000000000e2')::text, true);
select set_config('test.p3', public.event_publish('00000000-0000-4000-9500-0000000000e3')::text, true);
reset role;
select is(
  (select count(*)::int from public.permissions p join public.events e on e.id = p.event_id
    where p.event_id = '00000000-0000-4000-9500-0000000000e1' and p.deadline = e.permission_deadline),
  3,
  'each permission carries the event''s deadline'
);

-- ---------------------------------------------------------------------------------------------
-- The families' answers
select pg_temp.act_as('00000000-0000-4000-9500-000000000a04');
select is(pg_temp.try_grant_directly(pg_temp.perm('00000000-0000-4000-9500-0000000000e1', '00000000-0000-4000-9500-0000000000c1')), 0,
  'a parent cannot change a permission row directly');
select is(
  (select format('%s / %s', r ->> 'status', r -> 'invoice' ->> 'amount')
     from (select public.event_respond(pg_temp.perm('00000000-0000-4000-9500-0000000000e1', '00000000-0000-4000-9500-0000000000c1'), true) r) x),
  'granted / 150.00',
  'Mona says yes for Laila to the paid trip, and gets its invoice'
);
reset role;
select is(
  (select format('%s %s %s %s %s', (i.parent_id = '00000000-0000-4000-9500-000000000a04')::text, i.invoice_type, i.status,
                 (i.due_date = (e.starts_at at time zone 'Africa/Cairo')::date)::text, i.line_items_json ->> 'child_id')
     from public.event_invoices ei join public.invoices i on i.id = ei.invoice_id join public.events e on e.id = ei.event_id
    where ei.event_id = '00000000-0000-4000-9500-0000000000e1' and ei.child_id = '00000000-0000-4000-9500-0000000000c1'),
  'true event pending true 00000000-0000-4000-9500-0000000000c1',
  'the invoice is Mona''s, for the event, due on the trip day (sooner than the usual 7 days), for Laila'
);
select is(
  (select count(*)::int from public.notifications where user_id = '00000000-0000-4000-9500-000000000a04' and template_key = 'event_invoice_generated'),
  1,
  'Mona is told of the invoice'
);

select pg_temp.act_as('00000000-0000-4000-9500-000000000a04');
select is(
  (public.event_respond(pg_temp.perm('00000000-0000-4000-9500-0000000000e1', '00000000-0000-4000-9500-0000000000c1'), true) -> 'invoice' ->> 'amount')
  || ' ' || pg_temp.invoices('00000000-0000-4000-9500-0000000000e1', '00000000-0000-4000-9500-0000000000c1'),
  '150.00 pending 150.00',
  'saying yes again bills nothing new'
);
select pg_temp.act_as('00000000-0000-4000-9500-000000000a05');
select throws_ok(
  $$ select public.event_respond(pg_temp.perm('00000000-0000-4000-9500-0000000000e1', '00000000-0000-4000-9500-0000000000c1'), true) $$,
  '42501', 'event_forbidden', 'Karim cannot answer for a child who is not his'
);
select is(
  (select format('%s / %s', r ->> 'status', coalesce(r ->> 'invoice', '-'))
     from (select public.event_respond(pg_temp.perm('00000000-0000-4000-9500-0000000000e1', '00000000-0000-4000-9500-0000000000c2'), false, '  Omar has a cold  ') r) x),
  'denied / -',
  'Karim says no for Omar: no invoice'
);
reset role;
select is(
  (select parent_note from public.permissions where id = pg_temp.perm('00000000-0000-4000-9500-0000000000e1', '00000000-0000-4000-9500-0000000000c2')),
  'Omar has a cold',
  'with his note'
);

-- Taking a yes back
select pg_temp.act_as('00000000-0000-4000-9500-000000000a04');
select set_config('test.no', public.event_respond(pg_temp.perm('00000000-0000-4000-9500-0000000000e1', '00000000-0000-4000-9500-0000000000c1'), false)::text, true);
select is(pg_temp.invoices('00000000-0000-4000-9500-0000000000e1', '00000000-0000-4000-9500-0000000000c1'), 'cancelled 150.00',
  'a no after a yes cancels the invoice not paid yet');
select set_config('test.yes', public.event_respond(pg_temp.perm('00000000-0000-4000-9500-0000000000e1', '00000000-0000-4000-9500-0000000000c1'), true)::text, true);
select is(pg_temp.invoices('00000000-0000-4000-9500-0000000000e1', '00000000-0000-4000-9500-0000000000c1'), 'cancelled 150.00, pending 150.00',
  'and a new yes bills again');

select set_config('test.paint', public.event_respond(pg_temp.perm('00000000-0000-4000-9500-0000000000e2', '00000000-0000-4000-9500-0000000000c1'), true)::text, true);
select throws_ok(
  $$ select public.event_respond(pg_temp.perm('00000000-0000-4000-9500-0000000000e2', '00000000-0000-4000-9500-0000000000c1'), false) $$,
  '22023', 'event_withdraw_closed', 'a yes cannot be taken back inside the nursery''s 48-hour window'
);
select throws_ok(
  $$ select public.event_respond(pg_temp.perm('00000000-0000-4000-9500-0000000000e3', '00000000-0000-4000-9500-0000000000c1'), true) $$,
  '22023', 'event_deadline_passed', 'nor answered after the deadline'
);
reset role;
update public.events set permission_deadline = now() + interval '2 days' where id = '00000000-0000-4000-9500-0000000000e3';
select pg_temp.act_as('00000000-0000-4000-9500-000000000a04');
select is(
  public.event_respond(pg_temp.perm('00000000-0000-4000-9500-0000000000e3', '00000000-0000-4000-9500-0000000000c1'), true) ->> 'status',
  'granted',
  'once the admin moves the event''s deadline later, the family can answer (the event''s deadline counts, as the parent screen shows)'
);

-- ---------------------------------------------------------------------------------------------
-- Cancelling: Laila's invoice is paid, Nour's (a yes too) is not
select set_config('test.nour', public.event_respond(pg_temp.perm('00000000-0000-4000-9500-0000000000e1', '00000000-0000-4000-9500-0000000000c3'), true)::text, true);
reset role;
update public.invoices i set status = 'paid'
  from public.event_invoices ei
 where ei.invoice_id = i.id and ei.event_id = '00000000-0000-4000-9500-0000000000e1' and ei.child_id = '00000000-0000-4000-9500-0000000000c1' and i.status = 'pending';

select pg_temp.act_as('00000000-0000-4000-9500-000000000a02');
select throws_ok($$ select public.event_cancel('00000000-0000-4000-9500-0000000000e1', 'Rain') $$, '42501', 'event_forbidden', 'a teacher cannot cancel');
select pg_temp.act_as('00000000-0000-4000-9500-000000000a01');
select throws_ok($$ select public.event_cancel('00000000-0000-4000-9500-0000000000e1', '   ') $$, '22023', 'event_cancel_reason_required', 'a cancellation needs a reason');
select is(
  (select format('%s / %s / %s / %s', r ->> 'notified', r ->> 'invoices_cancelled', r ->> 'paid_invoices', r ->> 'refund_policy')
     from (select public.event_cancel('00000000-0000-4000-9500-0000000000e1', 'The bus company cancelled') r) x),
  '1 / 1 / 1 / partial',
  'the admin cancels: Mona is told (Karim said no), Nour''s unpaid invoice is cancelled, Laila''s paid one waits for a refund'
);
reset role;
select is(
  (select format('%s | %s | %s', n.template_params -> 'event' ->> 'en', n.template_params ->> 'reason', n.urgency)
     from public.notifications n where n.user_id = '00000000-0000-4000-9500-000000000a04' and n.template_key = 'event_cancelled'),
  'Zoo trip | The bus company cancelled | high',
  'Mona reads why'
);
select is(
  (select format('%s %s', n.template_params ->> 'count', n.template_params -> 'segments')
     from public.notifications n where n.user_id = '00000000-0000-4000-9500-000000000a01' and n.template_key = 'event_refund_due'),
  '1 ["partial"]',
  'the admin is told one family paid, with the refund policy'
);

select pg_temp.act_as('00000000-0000-4000-9500-000000000a04');
select throws_ok(
  $$ select public.event_respond(pg_temp.perm('00000000-0000-4000-9500-0000000000e1', '00000000-0000-4000-9500-0000000000c1'), true) $$,
  '22023', 'event_closed', 'a cancelled event takes no more answers'
);
select pg_temp.act_as('00000000-0000-4000-9500-000000000a01');
select throws_ok($$ select public.event_cancel('00000000-0000-4000-9500-0000000000e1', 'Again') $$, '22023', 'event_closed', 'nor a second cancellation');

-- ---------------------------------------------------------------------------------------------
-- Deleting is a soft delete (drafts and cancelled events only); nothing leaves the database
select pg_temp.act_as('00000000-0000-4000-9500-000000000a04');
select is(
  (select count(*)::int from public.permissions where event_id = '00000000-0000-4000-9500-0000000000e4'),
  0,
  'a family does not see the request of a draft sent to their child'
);
select pg_temp.act_as('00000000-0000-4000-9500-000000000a02');
select throws_ok($$ select public.event_delete('00000000-0000-4000-9500-0000000000e4') $$, '42501', 'event_forbidden', 'a teacher cannot delete an event');
select pg_temp.act_as('00000000-0000-4000-9500-000000000a01');
select throws_ok($$ delete from public.events where id = '00000000-0000-4000-9500-0000000000e4' $$, '42501', null, 'nobody in the app removes an event row');
select throws_ok($$ select public.event_delete('00000000-0000-4000-9500-0000000000e2') $$, '22023', 'event_delete_not_allowed', 'an open event is cancelled, not deleted');
select lives_ok($$ select public.event_delete('00000000-0000-4000-9500-0000000000e4') $$, 'the admin deletes the draft');
select lives_ok($$ select public.event_delete('00000000-0000-4000-9500-0000000000e1') $$, 'and the cancelled event');
select is((select count(*)::int from public.events where id in ('00000000-0000-4000-9500-0000000000e1', '00000000-0000-4000-9500-0000000000e4')), 0, 'neither shows anywhere again');
select throws_ok($$ select public.event_publish('00000000-0000-4000-9500-0000000000e4') $$, '22023', 'event_closed', 'a deleted draft cannot be published');
reset role;
select is(
  (select format('%s / %s / %s', count(*) filter (where deleted_at is not null), count(*) filter (where deleted_by = '00000000-0000-4000-9500-000000000a01'),
                 (select count(*) from public.permissions where event_id in ('00000000-0000-4000-9500-0000000000e1', '00000000-0000-4000-9500-0000000000e4')))
     from public.events where id in ('00000000-0000-4000-9500-0000000000e1', '00000000-0000-4000-9500-0000000000e4')),
  '2 / 2 / 4',
  'both rows stay, marked with when and by whom, with their permission rows'
);

-- ---------------------------------------------------------------------------------------------
-- The daily deadline reminder: open events still to come, by the event's deadline, once a day
update public.events set permission_deadline = now() + interval '20 hours' where id in ('00000000-0000-4000-9500-0000000000e2', '00000000-0000-4000-9500-0000000000e4');
select set_config('test.reminded', public.run_permission_deadline_reminders()::text, true);
select is(
  (select string_agg(distinct n.user_id::text, ',' order by n.user_id::text) from public.notifications n
    where n.template_key = 'permission_deadline_reminder' and n.action_link = '/parent/events/' || '00000000-0000-4000-9500-0000000000e2'),
  '00000000-0000-4000-9500-000000000a04,00000000-0000-4000-9500-000000000a05',
  'the families still to answer for the painting are reminded, with a link to it'
);
select is(
  (select count(*)::int from public.notifications n
    where n.template_key = 'permission_deadline_reminder' and n.action_link = '/parent/events/' || '00000000-0000-4000-9500-0000000000e4'),
  0,
  'never for a draft or a deleted event'
);
select is(public.run_permission_deadline_reminders(), 0, 'and once a day');

-- ---------------------------------------------------------------------------------------------
-- Who is asked, set on the server: a paid museum visit in ten days for children picked by name
insert into public.events (id, nursery_id, title_ar, title_en, starts_at, category, is_paid, price, target_scope, status, permission_deadline) values
  ('00000000-0000-4000-9500-0000000000e5', '00000000-0000-4000-9500-00000000000a', 'متحف', 'Museum', now() + interval '10 days', 'trip', true, 100, 'individual', 'draft', now() + interval '8 days');
select pg_temp.act_as('00000000-0000-4000-9500-000000000a02');
select throws_ok($$ select public.event_sync_children('00000000-0000-4000-9500-0000000000e5', array['00000000-0000-4000-9500-0000000000c1']::uuid[]) $$, '42501', 'event_forbidden', 'a teacher cannot choose who is asked');
select pg_temp.act_as('00000000-0000-4000-9500-000000000a01');
select is(
  (select format('%s / %s / %s', r ->> 'asked', r ->> 'withdrawn', r ->> 'notified') from (select public.event_sync_children('00000000-0000-4000-9500-0000000000e5', array['00000000-0000-4000-9500-0000000000c1', '00000000-0000-4000-9500-0000000000c2']::uuid[]) r) x),
  '2 / 0 / 0',
  'on the draft the admin picks Laila and Omar (nobody is told yet)'
);
select set_config('test.p5', public.event_publish('00000000-0000-4000-9500-0000000000e5')::text, true);
select is(
  (select format('%s / %s / %s', r ->> 'asked', r ->> 'withdrawn', r ->> 'notified') from (select public.event_sync_children('00000000-0000-4000-9500-0000000000e5', array['00000000-0000-4000-9500-0000000000c1', '00000000-0000-4000-9500-0000000000c3']::uuid[]) r) x),
  '1 / 1 / 2',
  'on the open event Nour is asked and Omar''s request withdrawn, each family told'
);
reset role;
select is(
  (select format('%s of %s', count(*) filter (where deleted_at is not null and deleted_by = '00000000-0000-4000-9500-000000000a01'), count(*)) from public.permissions where event_id = '00000000-0000-4000-9500-0000000000e5'),
  '1 of 3',
  'Omar''s request is kept, marked withdrawn'
);
select is(
  (select count(*)::int from public.notifications where user_id = '00000000-0000-4000-9500-000000000a05' and template_key = 'event_invitation_withdrawn'),
  1,
  'Karim is told no reply is needed'
);
select set_config('test.omar5', pg_temp.perm('00000000-0000-4000-9500-0000000000e5', '00000000-0000-4000-9500-0000000000c2')::text, true);
select pg_temp.act_as('00000000-0000-4000-9500-000000000a05');
select is((select count(*)::int from public.permissions where event_id = '00000000-0000-4000-9500-0000000000e5'), 0, 'and no longer sees the request');
select throws_ok(
  format('select public.event_respond(%L::uuid, true)', current_setting('test.omar5')),
  '22023', 'event_closed', 'nor can he answer it'
);
select pg_temp.act_as('00000000-0000-4000-9500-000000000a01');
select is(
  (select r ->> 'asked' from (select public.event_sync_children('00000000-0000-4000-9500-0000000000e5', array['00000000-0000-4000-9500-0000000000c1', '00000000-0000-4000-9500-0000000000c2', '00000000-0000-4000-9500-0000000000c3']::uuid[]) r) x),
  '1',
  'picking Omar again brings his request back'
);
reset role;
select is((select count(*)::int from public.permissions where event_id = '00000000-0000-4000-9500-0000000000e5'), 3, 'without a second row');
select pg_temp.act_as('00000000-0000-4000-9500-000000000a01');
select throws_ok($$ delete from public.permissions where event_id = '00000000-0000-4000-9500-0000000000e5' $$, '42501', null, 'nobody in the app removes a request');
reset role;

-- A paid yes taken back reaches the admins
select pg_temp.act_as('00000000-0000-4000-9500-000000000a04');
select set_config('test.yes5', public.event_respond(pg_temp.perm('00000000-0000-4000-9500-0000000000e5', '00000000-0000-4000-9500-0000000000c1'), true)::text, true);
reset role;
update public.invoices i set status = 'paid'
  from public.event_invoices ei
 where ei.invoice_id = i.id and ei.event_id = '00000000-0000-4000-9500-0000000000e5' and ei.child_id = '00000000-0000-4000-9500-0000000000c1';
select pg_temp.act_as('00000000-0000-4000-9500-000000000a04');
select set_config('test.no5', public.event_respond(pg_temp.perm('00000000-0000-4000-9500-0000000000e5', '00000000-0000-4000-9500-0000000000c1'), false)::text, true);
reset role;
select is(
  (select format('%s %s', n.template_params -> 'child' ->> 'en', n.template_params -> 'segments')
     from public.notifications n where n.user_id = '00000000-0000-4000-9500-000000000a01' and n.template_key = 'event_withdrawn_paid'),
  'Laila ["partial"]',
  'Mona took back a paid yes for Laila: the admin is told to refund, with the policy'
);

-- Moving an open event tells the families asked (still to answer or yes); a new title alone does not
update public.events set location = 'Egyptian Museum' where id = '00000000-0000-4000-9500-0000000000e5';
update public.events set title_en = 'Museum visit' where id = '00000000-0000-4000-9500-0000000000e5';
select is(
  (select string_agg(n.user_id::text || ':' || (n.template_params ->> 'location'), ',' order by n.user_id::text)
     from public.notifications n where n.template_key = 'event_updated' and n.action_link = '/parent/events/' || '00000000-0000-4000-9500-0000000000e5'),
  '00000000-0000-4000-9500-000000000a04'::text || ':Egyptian Museum,' || '00000000-0000-4000-9500-000000000a05'::text || ':Egyptian Museum',
  'the new place reaches Mona (Nour) and Karim (Omar), once each'
);

-- Approvals without an invoice: Omar's yes from before billing worked, and a trip already over
update public.permissions set status = 'granted', responded_at = now() - interval '1 day' where id = pg_temp.perm('00000000-0000-4000-9500-0000000000e5', '00000000-0000-4000-9500-0000000000c2');
insert into public.events (id, nursery_id, title_ar, title_en, starts_at, category, is_paid, price, target_scope, status) values
  ('00000000-0000-4000-9500-0000000000e6', '00000000-0000-4000-9500-00000000000a', 'رحلة سابقة', 'Past trip', now() - interval '1 day', 'trip', true, 80, 'individual', 'active');
insert into public.permissions (child_id, event_id, permission_type, status, responded_at) values
  ('00000000-0000-4000-9500-0000000000c1', '00000000-0000-4000-9500-0000000000e6', 'event', 'granted', now() - interval '3 days');
select pg_temp.act_as('00000000-0000-4000-9500-000000000a02');
select throws_ok($$ select public.event_bill_approved('00000000-0000-4000-9500-0000000000e5') $$, '42501', 'event_forbidden', 'a teacher cannot bill');
select pg_temp.act_as('00000000-0000-4000-9500-000000000a01');
select is(public.event_bill_approved('00000000-0000-4000-9500-0000000000e5') ->> 'billed', '1', 'the admin bills the approved family without an invoice');
select is(public.event_bill_approved('00000000-0000-4000-9500-0000000000e5') ->> 'billed', '0', 'once');
select is(public.event_bill_approved('00000000-0000-4000-9500-0000000000e6') ->> 'billed', '1', 'an approval of a trip already over is billed too');
select throws_ok($$ select public.event_bill_approved('00000000-0000-4000-9500-0000000000e2') $$, '22023', 'event_not_paid', 'a free event has nothing to bill');
reset role;
select is(
  (select format('%s %s %s', i.parent_id = '00000000-0000-4000-9500-000000000a05', i.amount::numeric(8,2), i.due_date >= (now() at time zone 'Africa/Cairo')::date)
     from public.event_invoices ei join public.invoices i on i.id = ei.invoice_id where ei.event_id = '00000000-0000-4000-9500-0000000000e5' and ei.child_id = '00000000-0000-4000-9500-0000000000c2'),
  't 100.00 t',
  'Omar''s invoice goes to Karim, for the price'
);
select is(
  (select i.due_date from public.event_invoices ei join public.invoices i on i.id = ei.invoice_id where ei.event_id = '00000000-0000-4000-9500-0000000000e6'),
  (now() at time zone 'Africa/Cairo')::date,
  'and the past trip''s is due today, not on the day that passed'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.event_respond(uuid, boolean, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.event_bill_child(public.events, public.permissions, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.event_can_manage(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.event_cancel(uuid, text)', 'execute')
  and has_function_privilege('authenticated', 'public.event_delete(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.event_sync_children(uuid, uuid[])', 'execute')
  and has_function_privilege('authenticated', 'public.event_bill_approved(uuid)', 'execute')
  and not has_table_privilege('authenticated', 'public.permissions', 'delete')
  and not has_table_privilege('authenticated', 'public.events', 'delete')
  and not exists (select 1 from pg_policies where tablename = 'permissions' and policyname = 'perm_parent_all')
  and not exists (select 1 from pg_policies where tablename = 'event_invoices' and cmd = 'INSERT'),
  'parents answer only through event_respond, and only the server bills events'
);

select * from finish();
rollback;

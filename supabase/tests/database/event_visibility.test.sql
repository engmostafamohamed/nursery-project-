-- Database test · which events a family sees: a published one for the whole nursery, for their
-- child's class, or that their child is asked to, and the ones they created; never a draft, another
-- class's trip or another child's visit, nor one whose request was withdrawn. The list of children
-- going follows the same rule and never counts a withdrawn request; the links between the event and
-- its invoices are read by the admins and the family billed. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(15);

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
-- The events the acting user reads, by English title.
create function pg_temp.seen() returns text language sql as $$
  select coalesce(string_agg(title_en, ', ' order by title_en), '-') from public.events
   where nursery_id = '00000000-0000-4000-9600-00000000000a'
$$;

insert into public.nurseries (id, name_ar, name_en) values ('00000000-0000-4000-9600-00000000000a', 'حضانة', 'Seen Nursery');
insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-9600-0000000000b1', '00000000-0000-4000-9600-00000000000a', 'أ', 'Class A'),
  ('00000000-0000-4000-9600-0000000000b2', '00000000-0000-4000-9600-00000000000a', 'ب', 'Class B');

insert into auth.users (id, email) values
  ('00000000-0000-4000-9600-000000000a01', 'seen.admin@test.local'),
  ('00000000-0000-4000-9600-000000000a04', 'seen.mona@test.local'),
  ('00000000-0000-4000-9600-000000000a05', 'seen.karim@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = '00000000-0000-4000-9600-00000000000a', name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9600-000000000a01', 'branch_admin', 'Admin'),
    ('00000000-0000-4000-9600-000000000a04', 'parent', 'Mona'),
    ('00000000-0000-4000-9600-000000000a05', 'parent', 'Karim')
  ) as v(id, role, name_en)
 where u.id = v.id::uuid;

-- Laila is in class A (Mona's), Omar in class B (Karim's).
insert into public.children (id, nursery_id, class_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-9600-0000000000c1', '00000000-0000-4000-9600-00000000000a', '00000000-0000-4000-9600-0000000000b1', 'ليلى', 'Laila', '2022-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9600-0000000000c2', '00000000-0000-4000-9600-00000000000a', '00000000-0000-4000-9600-0000000000b2', 'عمر', 'Omar', '2022-01-01', 'active', '2026-01-01');
insert into public.parent_children (parent_id, child_id, is_primary) values
  ('00000000-0000-4000-9600-000000000a04', '00000000-0000-4000-9600-0000000000c1', true),
  ('00000000-0000-4000-9600-000000000a05', '00000000-0000-4000-9600-0000000000c2', true);

insert into public.events (id, nursery_id, title_ar, title_en, starts_at, category, target_scope, target_class_id, status, parent_created_by) values
  ('00000000-0000-4000-9600-0000000000e1', '00000000-0000-4000-9600-00000000000a', 'حفل', 'Party', now() + interval '5 days', 'activity', 'all', null, 'active', null),
  ('00000000-0000-4000-9600-0000000000e2', '00000000-0000-4000-9600-00000000000a', 'رحلة أ', 'Trip A', now() + interval '5 days', 'trip', 'class', '00000000-0000-4000-9600-0000000000b1', 'active', null),
  ('00000000-0000-4000-9600-0000000000e3', '00000000-0000-4000-9600-00000000000a', 'متحف', 'Museum', now() + interval '5 days', 'trip', 'individual', null, 'active', null),
  ('00000000-0000-4000-9600-0000000000e4', '00000000-0000-4000-9600-00000000000a', 'مسودة', 'Draft', now() + interval '5 days', 'activity', 'all', null, 'draft', null),
  ('00000000-0000-4000-9600-0000000000e5', '00000000-0000-4000-9600-00000000000a', 'طبيب', 'Doctor', now() + interval '5 days', 'doctor_visit', 'individual', null, 'active', '00000000-0000-4000-9600-000000000a04');
-- The museum is for Omar alone, and Karim was billed for it.
insert into public.permissions (child_id, event_id, permission_type, status) values
  ('00000000-0000-4000-9600-0000000000c2', '00000000-0000-4000-9600-0000000000e3', 'event', 'granted');
insert into public.invoices (id, nursery_id, parent_id, amount, due_date, status) values
  ('00000000-0000-4000-9600-0000000000f1', '00000000-0000-4000-9600-00000000000a', '00000000-0000-4000-9600-000000000a05', 100, current_date + 7, 'pending');
insert into public.event_invoices (event_id, invoice_id, child_id, parent_id, nursery_id) values
  ('00000000-0000-4000-9600-0000000000e3', '00000000-0000-4000-9600-0000000000f1', '00000000-0000-4000-9600-0000000000c2',
   '00000000-0000-4000-9600-000000000a05', '00000000-0000-4000-9600-00000000000a');
create function pg_temp.billing_links() returns integer language sql as $$
  select count(*)::int from public.event_invoices where event_id = '00000000-0000-4000-9600-0000000000e3'
$$;

-- Families
select pg_temp.act_as('00000000-0000-4000-9600-000000000a04');
select is(pg_temp.seen(), 'Doctor, Party, Trip A', 'Mona sees the party, her class''s trip and the visit she created; not the draft nor Omar''s museum');
select is((select count(*)::int from public.event_attendees_public where event_id = '00000000-0000-4000-9600-0000000000e3'), 0, 'nor who goes to Omar''s museum');
select is(pg_temp.billing_links(), 0, 'nor which family was billed for it');

select pg_temp.act_as('00000000-0000-4000-9600-000000000a05');
select is(pg_temp.seen(), 'Museum, Party', 'Karim sees the party and his son''s museum; not class A''s trip, the draft nor Mona''s visit');
select is((select count(*)::int from public.event_attendees_public where event_id = '00000000-0000-4000-9600-0000000000e3'), 1, 'and Omar going to the museum');
select is(pg_temp.billing_links(), 1, 'and his own invoice for it');
select is((select count(*)::int from public.events where id = '00000000-0000-4000-9600-0000000000e2'), 0, 'class A''s trip cannot be opened by its id');

-- Published, the draft reaches every family.
reset role;
update public.events set status = 'active' where id = '00000000-0000-4000-9600-0000000000e4';
select pg_temp.act_as('00000000-0000-4000-9600-000000000a05');
select is(pg_temp.seen(), 'Draft, Museum, Party', 'once published, the draft is seen');

-- Laila is asked to the museum too, then the request is withdrawn.
reset role;
insert into public.permissions (child_id, event_id, permission_type, status) values
  ('00000000-0000-4000-9600-0000000000c1', '00000000-0000-4000-9600-0000000000e3', 'event', 'pending');
select pg_temp.act_as('00000000-0000-4000-9600-000000000a04');
select ok(position('Museum' in pg_temp.seen()) > 0, 'asked to the museum, Mona sees it');
select is((select count(*)::int from public.event_attendees_public where event_id = '00000000-0000-4000-9600-0000000000e3'), 1, 'and who is going');
reset role;
update public.permissions set deleted_at = now()
 where event_id = '00000000-0000-4000-9600-0000000000e3' and child_id = '00000000-0000-4000-9600-0000000000c1';
select pg_temp.act_as('00000000-0000-4000-9600-000000000a04');
select ok(position('Museum' in pg_temp.seen()) = 0, 'the request withdrawn, she no longer sees it');
select is((select count(*)::int from public.event_attendees_public where event_id = '00000000-0000-4000-9600-0000000000e3'), 0, 'nor who is going');

-- The staff see every child going; a withdrawn yes is not counted.
select pg_temp.act_as('00000000-0000-4000-9600-000000000a01');
select is((select count(*)::int from public.event_attendees_public where event_id = '00000000-0000-4000-9600-0000000000e3'), 1, 'the admin sees Omar going');
select is(pg_temp.billing_links(), 1, 'and the invoices of the event');
reset role;
update public.permissions set deleted_at = now()
 where event_id = '00000000-0000-4000-9600-0000000000e3' and child_id = '00000000-0000-4000-9600-0000000000c2';
select pg_temp.act_as('00000000-0000-4000-9600-000000000a01');
select is((select count(*)::int from public.event_attendees_public where event_id = '00000000-0000-4000-9600-0000000000e3'), 0, 'a withdrawn request is not among the children going');

select * from finish();
rollback;

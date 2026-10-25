-- Database test · The packages page's subscriptions (get_package_subscriptions): each subscription
-- with its child and paying parent, and the money of its invoices split into paid, awaiting
-- confirmation and unpaid; a shared admission invoice split by its lines; a period keeps the
-- subscriptions running in it and the invoices issued in it; only finance staff can read it.
-- Everything runs in one transaction that is rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

insert into public.nurseries (id, name_ar, name_en) values
  ('00000000-0000-4000-9000-00000000000a', 'حضانة أ', 'Nursery A'),
  ('00000000-0000-4000-9000-00000000000b', 'حضانة ب', 'Nursery B');

insert into auth.users (id, email) values
  ('00000000-0000-4000-9000-000000000a01', 'pkg.admin@test.local'),
  ('00000000-0000-4000-9000-000000000a02', 'pkg.teacher@test.local'),
  ('00000000-0000-4000-9000-000000000a06', 'pkg.mona@test.local'),
  ('00000000-0000-4000-9000-000000000a07', 'pkg.karim@test.local'),
  ('00000000-0000-4000-9000-000000000b01', 'pkg.admin.b@test.local');

update public.users u
   set role = v.role::public.user_role, nursery_id = v.nursery_id::uuid, name_ar = v.name_ar, name_en = v.name_en,
       phone = v.phone, status = 'active'
  from (values
    ('00000000-0000-4000-9000-000000000a01', 'branch_admin', '00000000-0000-4000-9000-00000000000a', 'المديرة', 'Head Admin', null),
    ('00000000-0000-4000-9000-000000000a02', 'teacher',      '00000000-0000-4000-9000-00000000000a', 'المعلمة', 'Teacher', null),
    ('00000000-0000-4000-9000-000000000a06', 'parent',       '00000000-0000-4000-9000-00000000000a', 'منى', 'Mona', '01011111111'),
    ('00000000-0000-4000-9000-000000000a07', 'parent',       '00000000-0000-4000-9000-00000000000a', 'كريم', 'Karim', '01022222222'),
    ('00000000-0000-4000-9000-000000000b01', 'branch_admin', '00000000-0000-4000-9000-00000000000b', 'مديرة ب', 'Admin B', null)
  ) as v(id, role, nursery_id, name_ar, name_en, phone)
 where u.id = v.id::uuid;

insert into public.children (id, nursery_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-9000-0000000000c1', '00000000-0000-4000-9000-00000000000a', 'ليلى', 'Laila', '2023-01-01', 'active', '2026-09-01'),
  ('00000000-0000-4000-9000-0000000000c2', '00000000-0000-4000-9000-00000000000a', 'آدم', 'Adam', '2023-01-01', 'active', '2026-09-01'),
  ('00000000-0000-4000-9000-0000000000c3', '00000000-0000-4000-9000-00000000000a', 'عمر', 'Omar', '2023-01-01', 'active', '2026-06-01');

insert into public.parent_children (parent_id, child_id, is_primary) values
  ('00000000-0000-4000-9000-000000000a06', '00000000-0000-4000-9000-0000000000c1', true),
  ('00000000-0000-4000-9000-000000000a06', '00000000-0000-4000-9000-0000000000c2', true),
  ('00000000-0000-4000-9000-000000000a07', '00000000-0000-4000-9000-0000000000c3', true);

insert into public.tuition_packages (id, nursery_id, name_ar, name_en, price, active) values
  ('00000000-0000-4000-9000-0000000000d1', '00000000-0000-4000-9000-00000000000a', 'يوم كامل', 'Full day', 3000, true),
  ('00000000-0000-4000-9000-0000000000d2', '00000000-0000-4000-9000-00000000000a', 'نصف يوم', 'Half day', 2000, true);

insert into public.packages (id, nursery_id, name_ar, name_en, coverage_type, included_hours, price, active) values
  ('00000000-0000-4000-9000-0000000000e1', '00000000-0000-4000-9000-00000000000a', '١٠ ساعات', '10 hours', 'hours_quota', 10, 600, true),
  ('00000000-0000-4000-9000-0000000000e2', '00000000-0000-4000-9000-00000000000a', 'مفتوحة', 'Unlimited', 'unlimited', null, 800, true);

-- Laila came through an application that chose the full day and the 10-hour pack.
insert into public.applications (id, nursery_id, status, child_id, extra_hours_package_id, reviewed_at) values
  ('00000000-0000-4000-9000-0000000000a1', '00000000-0000-4000-9000-00000000000a', 'approved',
   '00000000-0000-4000-9000-0000000000c1', '00000000-0000-4000-9000-0000000000e1', '2026-09-01 08:00+00');
update public.children set enrollment_extended_json = jsonb_build_object('source_application_id', '00000000-0000-4000-9000-0000000000a1')
 where id = '00000000-0000-4000-9000-0000000000c1';

insert into public.child_tuition_subscriptions
  (id, nursery_id, child_id, tuition_package_id, tuition_package_name_ar, tuition_package_name_en, billing_period, duration_months,
   locked_price, billed_parent_id, status, started_at, next_invoice_date, source_application_id, cancelled_at)
values
  ('00000000-0000-4000-9000-0000000000f1', '00000000-0000-4000-9000-00000000000a', '00000000-0000-4000-9000-0000000000c1',
   '00000000-0000-4000-9000-0000000000d1', 'يوم كامل', 'Full day', 'monthly', 1, 3000, '00000000-0000-4000-9000-000000000a06',
   'active', '2026-09-01', '2026-11-01', '00000000-0000-4000-9000-0000000000a1', null),
  -- Omar's half day, stopped in August.
  ('00000000-0000-4000-9000-0000000000f2', '00000000-0000-4000-9000-00000000000a', '00000000-0000-4000-9000-0000000000c3',
   '00000000-0000-4000-9000-0000000000d2', 'نصف يوم', 'Half day', 'quarterly', 3, 6000, '00000000-0000-4000-9000-000000000a07',
   'cancelled', '2026-06-01', '2026-09-01', null, '2026-08-15 10:00+00');

-- The 10-hour pack: from the application (first), stopped, then given again by the nursery. Adam's
-- unlimited pack was given by the nursery.
insert into public.child_packages (id, package_id, child_id, nursery_id, status, assigned_at) values
  ('00000000-0000-4000-9000-000000000071', '00000000-0000-4000-9000-0000000000e1', '00000000-0000-4000-9000-0000000000c1',
   '00000000-0000-4000-9000-00000000000a', 'cancelled', '2026-09-01 08:00+00'),
  ('00000000-0000-4000-9000-000000000072', '00000000-0000-4000-9000-0000000000e1', '00000000-0000-4000-9000-0000000000c1',
   '00000000-0000-4000-9000-00000000000a', 'active', '2026-10-05 08:00+00'),
  ('00000000-0000-4000-9000-000000000073', '00000000-0000-4000-9000-0000000000e2', '00000000-0000-4000-9000-0000000000c2',
   '00000000-0000-4000-9000-00000000000a', 'active', '2026-10-10 08:00+00');

insert into public.invoices (id, nursery_id, parent_id, amount, due_date, status, invoice_type, line_items_json, created_at) values
  -- The admission invoice, paid: 3000 for the full day, 600 - 100 for the 10-hour pack.
  ('00000000-0000-4000-9000-000000000081', '00000000-0000-4000-9000-00000000000a', '00000000-0000-4000-9000-000000000a06', 3500,
   '2026-09-05', 'paid', 'other',
   jsonb_build_object('application_id', '00000000-0000-4000-9000-0000000000a1', 'items', jsonb_build_array(
     jsonb_build_object('kind', 'admission_package', 'total', 3000),
     jsonb_build_object('kind', 'extra_hours_package', 'scope', 'extra_hours', 'total', 600),
     jsonb_build_object('kind', 'discount', 'scope', 'extra_hours', 'total', -100))),
   '2026-09-01 08:00+00'),
  -- October's full day: 1000 sent and not confirmed yet, the rest past due.
  ('00000000-0000-4000-9000-000000000082', '00000000-0000-4000-9000-00000000000a', '00000000-0000-4000-9000-000000000a06', 3000,
   '2026-10-08', 'pending', 'monthly',
   jsonb_build_object('subscription_id', '00000000-0000-4000-9000-0000000000f1', 'items', jsonb_build_array(jsonb_build_object('kind', 'tuition', 'total', 3000))),
   '2026-10-01 08:00+00'),
  -- A cancelled invoice: not counted.
  ('00000000-0000-4000-9000-000000000083', '00000000-0000-4000-9000-00000000000a', '00000000-0000-4000-9000-000000000a06', 999,
   '2026-10-08', 'cancelled', 'monthly',
   jsonb_build_object('subscription_id', '00000000-0000-4000-9000-0000000000f1', 'items', '[]'::jsonb),
   '2026-10-02 08:00+00'),
  -- Omar's quarter: 2500 received, the rest past due.
  ('00000000-0000-4000-9000-000000000084', '00000000-0000-4000-9000-00000000000a', '00000000-0000-4000-9000-000000000a07', 6000,
   '2026-06-08', 'pending', 'monthly',
   jsonb_build_object('subscription_id', '00000000-0000-4000-9000-0000000000f2', 'items', jsonb_build_array(jsonb_build_object('kind', 'tuition', 'total', 6000))),
   '2026-06-01 08:00+00');

-- Written directly: the payment triggers are for the parent's and the nursery's own actions.
alter table public.payment_attempts disable trigger user;
insert into public.payment_attempts (invoice_id, parent_id, nursery_id, amount, payment_method, status) values
  ('00000000-0000-4000-9000-000000000082', '00000000-0000-4000-9000-000000000a06', '00000000-0000-4000-9000-00000000000a', 1000, 'instapay', 'pending_confirmation'),
  ('00000000-0000-4000-9000-000000000082', '00000000-0000-4000-9000-000000000a06', '00000000-0000-4000-9000-00000000000a', 500, 'instapay', 'cancelled');
alter table public.payment_attempts enable trigger user;
insert into public.payments (invoice_id, amount, method, status, paid_at) values
  ('00000000-0000-4000-9000-000000000084', 2500, 'cash', 'completed', '2026-06-10 10:00+00'),
  ('00000000-0000-4000-9000-000000000084', 700, 'card', 'failed', '2026-06-11 10:00+00');

create function pg_temp.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;

create function pg_temp.row_of(p_id uuid, p_from date default null, p_to date default null) returns text
language sql as $$
  select format('%s %s/%s %s: invoiced=%s n=%s billed=%s paid=%s awaiting=%s unpaid=%s overdue=%s',
                s.kind, s.package_name_en, s.child_name_en, s.status, s.invoiced, s.invoices, s.billed, s.paid, s.awaiting, s.unpaid, s.overdue)
    from public.get_package_subscriptions('00000000-0000-4000-9000-00000000000a', p_from, p_to) s
   where s.subscription_id = p_id
$$;

-- ---------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-9000-000000000a01');

select is(
  (select count(*)::int from public.get_package_subscriptions('00000000-0000-4000-9000-00000000000a')),
  5,
  'every subscription: two fixed packages and three extra-hours packages'
);

select is(
  pg_temp.row_of('00000000-0000-4000-9000-0000000000f1'),
  'tuition Full day/Laila active: invoiced=t n=2 billed=6000.00 paid=3000.00 awaiting=1000.00 unpaid=2000.00 overdue=2000.00',
  'a fixed package: its share of the admission invoice and its own invoice; sent-not-confirmed apart from unpaid; the cancelled invoice left out'
);

select is(
  pg_temp.row_of('00000000-0000-4000-9000-0000000000f2'),
  'tuition Half day/Omar cancelled: invoiced=t n=1 billed=6000.00 paid=2500.00 awaiting=0.00 unpaid=3500.00 overdue=3500.00',
  'a part payment counts as paid, a failed one does not'
);

select is(
  pg_temp.row_of('00000000-0000-4000-9000-000000000071'),
  'extra_hours 10 hours/Laila cancelled: invoiced=t n=1 billed=500.00 paid=500.00 awaiting=0.00 unpaid=0.00 overdue=0.00',
  'an extra-hours package chosen in the application: its lines of the admission invoice, after their discount'
);

select is(
  pg_temp.row_of('00000000-0000-4000-9000-000000000072'),
  'extra_hours 10 hours/Laila active: invoiced=f n=0 billed=0 paid=0 awaiting=0 unpaid=0 overdue=0',
  'the same package given again by the nursery has no invoice; the admission invoice is not counted twice'
);

select is(
  (select format('%s %s %s %s', s.parent_name_en, s.parent_phone, s.billing_period, s.price)
     from public.get_package_subscriptions('00000000-0000-4000-9000-00000000000a') s
    where s.subscription_id = '00000000-0000-4000-9000-000000000073'),
  'Mona 01011111111  800.00',
  'a package without a paying parent on it shows the child''s first parent'
);

select is(
  (select format('billed %s = paid %s + awaiting %s + unpaid %s', sum(s.billed), sum(s.paid), sum(s.awaiting), sum(s.unpaid))
     from public.get_package_subscriptions('00000000-0000-4000-9000-00000000000a') s),
  'billed 12500.00 = paid 6000.00 + awaiting 1000.00 + unpaid 5500.00',
  'the money adds up: billed is paid + awaiting + unpaid'
);

-- September: the subscriptions running then, the invoices issued then.
select is(
  (select string_agg(format('%s/%s billed=%s', s.package_name_en, s.child_name_en, s.billed), '; ' order by s.kind desc, s.package_name_en)
     from public.get_package_subscriptions('00000000-0000-4000-9000-00000000000a', '2026-09-01', '2026-09-30') s),
  'Full day/Laila billed=3000.00; 10 hours/Laila billed=500.00',
  'a period: the subscriptions running in it, with the invoices issued in it'
);

select throws_ok(
  $$ select * from public.get_package_subscriptions('00000000-0000-4000-9000-00000000000a', '2025-01-01', '2026-01-02') $$,
  '22023', 'package_stats_invalid_range',
  'more than 366 days is refused'
);

-- ---------------------------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-9000-000000000a02');
select throws_ok(
  $$ select * from public.get_package_subscriptions('00000000-0000-4000-9000-00000000000a') $$,
  '42501', 'payment_forbidden',
  'a teacher cannot read the money'
);

select pg_temp.act_as('00000000-0000-4000-9000-000000000b01');
select throws_ok(
  $$ select * from public.get_package_subscriptions('00000000-0000-4000-9000-00000000000a') $$,
  '42501', 'payment_forbidden',
  'nor another nursery''s admin'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.get_package_subscriptions(uuid, date, date)', 'execute'),
  'signed-out visitors cannot call it'
);

select * from finish();
rollback;

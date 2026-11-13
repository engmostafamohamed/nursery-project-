-- Database test · a family's urgent event (a notice to the nursery): only for the family's own
-- active children, at least one, in the future, with a title and a valid kind and week schedule;
-- the children's requests are given (no answer asked of the family); the admins and the children's
-- teachers are told at once; the family can cancel it with a reason (the nursery is told), nobody
-- else's family can. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
-- A notice for the given children, starting in two days (repeating on Tuesdays at 10 when asked).
create function pg_temp.notice(p_children uuid[], p_title text default 'Doctor', p_starts timestamptz default now() + interval '2 days',
                               p_category text default 'doctor_visit', p_repeats boolean default false, p_days integer[] default '{}')
returns uuid language sql as $$
  select public.create_parent_urgent_event(null, p_title, null, 'Dentist at 10', p_starts, 'Clinic', p_category, p_children, null,
                                           p_days, case when p_repeats then array[10] else '{}'::integer[] end, p_repeats)
$$;
-- The notifications a user got, as "type link".
create function pg_temp.told(p_user uuid) returns text language sql as $$
  select coalesce(string_agg(type || ' ' || coalesce(action_link, '-'), ', ' order by created_at, type), '-')
    from public.notifications where user_id = p_user and type like 'event_%'
$$;

insert into public.nurseries (id, name_ar, name_en) values ('00000000-0000-4000-9e00-00000000000a', 'حضانة', 'Notice Nursery');
insert into public.classes (id, nursery_id, name_ar, name_en) values
  ('00000000-0000-4000-9e00-0000000000b1', '00000000-0000-4000-9e00-00000000000a', 'أ', 'Class A');
insert into auth.users (id, email) values
  ('00000000-0000-4000-9e00-000000000a01', 'notice.admin@test.local'),
  ('00000000-0000-4000-9e00-000000000a02', 'notice.teacher@test.local'),
  ('00000000-0000-4000-9e00-000000000a04', 'notice.mona@test.local'),
  ('00000000-0000-4000-9e00-000000000a05', 'notice.karim@test.local');
update public.users u
   set role = v.role::public.user_role, nursery_id = '00000000-0000-4000-9e00-00000000000a', name_en = v.name_en, name_ar = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9e00-000000000a01', 'branch_admin', 'Admin'),
    ('00000000-0000-4000-9e00-000000000a02', 'teacher', 'Teacher'),
    ('00000000-0000-4000-9e00-000000000a04', 'parent', 'Mona'),
    ('00000000-0000-4000-9e00-000000000a05', 'parent', 'Karim')
  ) as v(id, role, name_en)
 where u.id = v.id::uuid;
insert into public.class_staff (class_id, user_id) values ('00000000-0000-4000-9e00-0000000000b1', '00000000-0000-4000-9e00-000000000a02');
insert into public.children (id, nursery_id, class_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-9e00-0000000000c1', '00000000-0000-4000-9e00-00000000000a', '00000000-0000-4000-9e00-0000000000b1', 'ليلى', 'Laila', '2022-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9e00-0000000000c2', '00000000-0000-4000-9e00-00000000000a', null, 'عمر', 'Omar', '2022-01-01', 'active', '2026-01-01');
insert into public.parent_children (parent_id, child_id, is_primary) values
  ('00000000-0000-4000-9e00-000000000a04', '00000000-0000-4000-9e00-0000000000c1', true),
  ('00000000-0000-4000-9e00-000000000a05', '00000000-0000-4000-9e00-0000000000c2', true);

-- What is refused
select pg_temp.act_as('00000000-0000-4000-9e00-000000000a05');
select throws_ok($$ select pg_temp.notice(array['00000000-0000-4000-9e00-0000000000c1']::uuid[]) $$, '22023', 'event_children_invalid', 'not for another family''s child');
select pg_temp.act_as('00000000-0000-4000-9e00-000000000a04');
select throws_ok($$ select pg_temp.notice('{}'::uuid[]) $$, '22023', 'event_child_required', 'not for no child');
select throws_ok($$ select pg_temp.notice(array['00000000-0000-4000-9e00-0000000000c1']::uuid[], p_starts => now() - interval '1 hour') $$, '22023', 'event_start_in_past', 'not in the past');
select throws_ok($$ select pg_temp.notice(array['00000000-0000-4000-9e00-0000000000c1']::uuid[], p_title => '  ') $$, '22023', 'event_title_required', 'not without a title');
select throws_ok($$ select pg_temp.notice(array['00000000-0000-4000-9e00-0000000000c1']::uuid[], p_category => 'party') $$, '22023', 'event_category_invalid', 'not of an unknown kind');
select throws_ok($$ select pg_temp.notice(array['00000000-0000-4000-9e00-0000000000c1']::uuid[], p_repeats => true) $$, '22023', 'event_schedule_days_required', 'every week needs its days');
select pg_temp.act_as('00000000-0000-4000-9e00-000000000a01');
select throws_ok($$ select pg_temp.notice(array['00000000-0000-4000-9e00-0000000000c1']::uuid[]) $$, '42501', 'event_forbidden', 'an admin does not make a family''s notice');

-- Mona tells the nursery: the dentist, every Tuesday at 10.
select pg_temp.act_as('00000000-0000-4000-9e00-000000000a04');
select set_config('test.notice', pg_temp.notice(array['00000000-0000-4000-9e00-0000000000c1']::uuid[], p_repeats => true, p_days => array[2])::text, true);
reset role;
select is((select format('%s %s %s %s %s', status, is_urgent, target_scope, urgent_days_of_week, (parent_created_by = '00000000-0000-4000-9e00-000000000a04'))
             from public.events where id = current_setting('test.notice')::uuid),
  'active t individual {2} t', 'an open urgent event of Mona''s, every Tuesday');
select is((select status || ' ' || (responded_at is not null)::text from public.permissions where event_id = current_setting('test.notice')::uuid),
  'granted true', 'Laila''s request is given: the family is not asked to answer its own notice');
select is(pg_temp.told('00000000-0000-4000-9e00-000000000a01'), 'event_family_notice /admin/events/' || current_setting('test.notice'), 'the admin is told');
select is(pg_temp.told('00000000-0000-4000-9e00-000000000a02'), 'event_family_notice /teacher/events?event=' || current_setting('test.notice'), 'and Laila''s teacher, linked to who is going');
select is((select template_params ->> 'family' || ' / ' || (template_params -> 'child' ->> 'en')
             from public.notifications where user_id = '00000000-0000-4000-9e00-000000000a01' and type = 'event_family_notice'),
  '{"ar": "Mona", "en": "Mona"} / Laila', 'with the family and the child');
select is(pg_temp.told('00000000-0000-4000-9e00-000000000a04') || ' / ' || pg_temp.told('00000000-0000-4000-9e00-000000000a05'), '- / -', 'nobody else is told');

select pg_temp.act_as('00000000-0000-4000-9e00-000000000a02');
select is((select format('%s %s', asked, going) from public.teacher_events() where id = current_setting('test.notice')::uuid), '1 1', 'the teacher sees it, Laila going');

-- Taking it back
select pg_temp.act_as('00000000-0000-4000-9e00-000000000a05');
select throws_ok(format($$ select public.event_cancel(%L, 'not mine') $$, current_setting('test.notice')), '42501', 'event_forbidden', 'another family cannot cancel it');
select pg_temp.act_as('00000000-0000-4000-9e00-000000000a04');
select lives_ok(format($$ select public.event_cancel(%L, 'The appointment moved') $$, current_setting('test.notice')), 'Mona cancels her notice, with a reason');
reset role;
select is(pg_temp.told('00000000-0000-4000-9e00-000000000a02'),
  'event_family_notice /teacher/events?event=' || current_setting('test.notice') || ', event_family_notice_cancelled /teacher/events',
  'the teacher is told it is off');
select is(pg_temp.told('00000000-0000-4000-9e00-000000000a04'), '-', 'and Mona, who cancelled it, is not told');

select * from finish();
rollback;

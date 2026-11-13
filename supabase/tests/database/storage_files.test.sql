-- Database test · who opens which stored file: a family its own application's documents, its
-- child's health documents, photos and pickup records, the photos shared with it, and the chat files
-- of its conversations; never another family's. The teachers see the pickup photos, the avatars and
-- the media, not the documents; the admins everything of their nursery; HR and the person the staff
-- files. Uploads go only to one's own folders; a family never changes a child's photo nor fills the
-- media library. Rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set local role authenticated;
end;
$$;
-- The files the acting user sees in a bucket, by their last part.
create function pg_temp.files(p_bucket text) returns text language sql as $$
  select coalesce(string_agg(regexp_replace(name, '^.*/', ''), ', ' order by regexp_replace(name, '^.*/', '')), '-') from storage.objects
   where bucket_id = p_bucket and name like '00000000-0000-4000-9a00-00000000000a/%' or (bucket_id = p_bucket and p_bucket = 'chat-files' and name like '00000000-0000-4000-9a00-%')
$$;
-- Whether the acting user may put a file at a path (the file is taken back at once).
create function pg_temp.can_upload(p_bucket text, p_name text) returns boolean language plpgsql as $$
begin
  insert into storage.objects (bucket_id, name) values (p_bucket, p_name);
  raise exception 'uploaded' using errcode = 'P0001';
exception
  when insufficient_privilege then return false;
  when raise_exception then return true;
end;
$$;

-- How many files the acting user changes in place (the change is taken back at once).
create function pg_temp.replace_count(p_bucket text, p_like text) returns integer language plpgsql as $$
declare
  n integer;
begin
  update storage.objects set metadata = '{"replaced": true}' where bucket_id = p_bucket and name like p_like;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- A nursery: its admin, a teacher, HR; Mona (Laila's mother) and Karim (Omar's father).
insert into public.nurseries (id, name_ar, name_en) values ('00000000-0000-4000-9a00-00000000000a', 'حضانة', 'Files Nursery');
insert into auth.users (id, email) values
  ('00000000-0000-4000-9a00-000000000a01', 'files.admin@test.local'),
  ('00000000-0000-4000-9a00-000000000a02', 'files.teacher@test.local'),
  ('00000000-0000-4000-9a00-000000000a03', 'files.hr@test.local'),
  ('00000000-0000-4000-9a00-000000000a04', 'files.mona@test.local'),
  ('00000000-0000-4000-9a00-000000000a05', 'files.karim@test.local');
update public.users u
   set role = v.role::public.user_role, department = v.dept::public.user_department,
       nursery_id = '00000000-0000-4000-9a00-00000000000a', name_en = v.name_en, status = 'active'
  from (values
    ('00000000-0000-4000-9a00-000000000a01', 'branch_admin', null, 'Admin'),
    ('00000000-0000-4000-9a00-000000000a02', 'teacher', null, 'Teacher'),
    ('00000000-0000-4000-9a00-000000000a03', 'manager', 'hr', 'HR'),
    ('00000000-0000-4000-9a00-000000000a04', 'parent', null, 'Mona'),
    ('00000000-0000-4000-9a00-000000000a05', 'parent', null, 'Karim')
  ) as v(id, role, dept, name_en)
 where u.id = v.id::uuid;
insert into public.children (id, nursery_id, full_name_ar, full_name_en, dob, status, enrollment_date) values
  ('00000000-0000-4000-9a00-0000000000c1', '00000000-0000-4000-9a00-00000000000a', 'ليلى', 'Laila', '2022-01-01', 'active', '2026-01-01'),
  ('00000000-0000-4000-9a00-0000000000c2', '00000000-0000-4000-9a00-00000000000a', 'عمر', 'Omar', '2022-01-01', 'active', '2026-01-01');
insert into public.parent_children (parent_id, child_id, is_primary) values
  ('00000000-0000-4000-9a00-000000000a04', '00000000-0000-4000-9a00-0000000000c1', true),
  ('00000000-0000-4000-9a00-000000000a05', '00000000-0000-4000-9a00-0000000000c2', true);
insert into public.applications (id, nursery_id, parent_id) values
  ('00000000-0000-4000-9a00-0000000000d1', '00000000-0000-4000-9a00-00000000000a', '00000000-0000-4000-9a00-000000000a04'),
  ('00000000-0000-4000-9a00-0000000000d2', '00000000-0000-4000-9a00-00000000000a', '00000000-0000-4000-9a00-000000000a05');
insert into public.staff_profiles (id, user_id, nursery_id, employee_id, department, position, hire_date, contract_type) values
  ('00000000-0000-4000-9a00-0000000000f2', '00000000-0000-4000-9a00-000000000a02', '00000000-0000-4000-9a00-00000000000a', 'T-1', 'teaching', 'Teacher', '2026-01-01', 'full_time');
insert into public.authorized_pickups (child_id, name, phone, photo_url) values
  ('00000000-0000-4000-9a00-0000000000c1', 'Grandma', '0100', '00000000-0000-4000-9a00-00000000000a/parent-signup/s1/pickup-laila.jpg'),
  ('00000000-0000-4000-9a00-0000000000c2', 'Uncle', '0101', '00000000-0000-4000-9a00-00000000000a/parent-signup/s2/pickup-omar.jpg');
-- A photo shared with Laila's family, and one still waiting for approval.
insert into public.media (id, nursery_id, teacher_id, type, url, file_url, status, visibility) values
  ('00000000-0000-4000-9a00-0000000000e1', '00000000-0000-4000-9a00-00000000000a', '00000000-0000-4000-9a00-000000000a02', 'photo',
   '00000000-0000-4000-9a00-00000000000a/2026/11/shared.jpg', '00000000-0000-4000-9a00-00000000000a/2026/11/shared.jpg', 'approved', 'tagged_only'),
  ('00000000-0000-4000-9a00-0000000000e2', '00000000-0000-4000-9a00-00000000000a', '00000000-0000-4000-9a00-000000000a02', 'photo',
   '00000000-0000-4000-9a00-00000000000a/2026/11/waiting.jpg', '00000000-0000-4000-9a00-00000000000a/2026/11/waiting.jpg', 'pending_approval', 'tagged_only');
insert into public.media_children (media_id, child_id) values
  ('00000000-0000-4000-9a00-0000000000e1', '00000000-0000-4000-9a00-0000000000c1'),
  ('00000000-0000-4000-9a00-0000000000e2', '00000000-0000-4000-9a00-0000000000c1');
-- The admin writes to Mona with a file; Karim sends the admin one.
insert into public.chat_conversations (id, nursery_id, created_by, kind) values
  ('00000000-0000-4000-9a00-0000000000b1', '00000000-0000-4000-9a00-00000000000a', '00000000-0000-4000-9a00-000000000a01', 'direct'),
  ('00000000-0000-4000-9a00-0000000000b2', '00000000-0000-4000-9a00-00000000000a', '00000000-0000-4000-9a00-000000000a05', 'direct');
insert into public.chat_conversation_members (conversation_id, user_id) values
  ('00000000-0000-4000-9a00-0000000000b1', '00000000-0000-4000-9a00-000000000a01'),
  ('00000000-0000-4000-9a00-0000000000b1', '00000000-0000-4000-9a00-000000000a04'),
  ('00000000-0000-4000-9a00-0000000000b2', '00000000-0000-4000-9a00-000000000a01'),
  ('00000000-0000-4000-9a00-0000000000b2', '00000000-0000-4000-9a00-000000000a05');
insert into public.chat_messages (conversation_id, sender_id, type, content) values
  ('00000000-0000-4000-9a00-0000000000b1', '00000000-0000-4000-9a00-000000000a01', 'file', 'chat-file:00000000-0000-4000-9a00-000000000a01/to-mona.pdf'),
  ('00000000-0000-4000-9a00-0000000000b2', '00000000-0000-4000-9a00-000000000a05', 'file', 'chat-file:00000000-0000-4000-9a00-000000000a05/from-karim.pdf');

insert into storage.objects (bucket_id, name) values
  ('application-documents', '00000000-0000-4000-9a00-00000000000a/00000000-0000-4000-9a00-0000000000d1/mona-birth.jpg'),
  ('application-documents', '00000000-0000-4000-9a00-00000000000a/00000000-0000-4000-9a00-0000000000d2/karim-birth.jpg'),
  ('application-documents', '00000000-0000-4000-9a00-00000000000a/qr-pickup-identities/00000000-0000-4000-9a00-0000000000c1/laila-delegate.jpg'),
  ('child-documents', '00000000-0000-4000-9a00-00000000000a/health/00000000-0000-4000-9a00-0000000000c1/laila-health.pdf'),
  ('child-documents', '00000000-0000-4000-9a00-00000000000a/health/00000000-0000-4000-9a00-0000000000c2/omar-health.pdf'),
  ('child-documents', '00000000-0000-4000-9a00-00000000000a/parent-signup/s1/signup-birth.png'),
  ('authorized-pickup-photos', '00000000-0000-4000-9a00-00000000000a/parent-signup/s1/pickup-laila.jpg'),
  ('authorized-pickup-photos', '00000000-0000-4000-9a00-00000000000a/parent-signup/s2/pickup-omar.jpg'),
  ('pickup-id-photos', '00000000-0000-4000-9a00-00000000000a/00000000-0000-4000-9a00-0000000000c1/laila-id.jpg'),
  ('pickup-id-photos', '00000000-0000-4000-9a00-00000000000a/00000000-0000-4000-9a00-0000000000c2/omar-id.jpg'),
  ('staff-documents', '00000000-0000-4000-9a00-00000000000a/00000000-0000-4000-9a00-0000000000f2/teacher-id.pdf'),
  ('staff-documents', '00000000-0000-4000-9a00-00000000000a/staff/00000000-0000-4000-9a00-0000000000f9/other-id.pdf'),
  ('child-avatars', '00000000-0000-4000-9a00-00000000000a/00000000-0000-4000-9a00-0000000000c1/laila.jpg'),
  ('child-avatars', '00000000-0000-4000-9a00-00000000000a/00000000-0000-4000-9a00-0000000000c2/omar.jpg'),
  ('media', '00000000-0000-4000-9a00-00000000000a/2026/11/shared.jpg'),
  ('media', '00000000-0000-4000-9a00-00000000000a/2026/11/waiting.jpg'),
  ('chat-files', '00000000-0000-4000-9a00-000000000a01/to-mona.pdf'),
  ('chat-files', '00000000-0000-4000-9a00-000000000a05/from-karim.pdf');

-- Mona
select pg_temp.act_as('00000000-0000-4000-9a00-000000000a04');
select is(pg_temp.files('application-documents'), 'laila-delegate.jpg, mona-birth.jpg', 'Mona: her application''s documents and Laila''s pickup delegate; not Karim''s');
select is(pg_temp.files('child-documents'), 'laila-health.pdf', 'her child''s health document; not Omar''s nor the signup files');
select is(pg_temp.files('authorized-pickup-photos') || ' / ' || pg_temp.files('pickup-id-photos'), 'pickup-laila.jpg / laila-id.jpg', 'the pickup photos of her child only');
select is(pg_temp.files('staff-documents'), '-', 'no staff document');
select is(pg_temp.files('child-avatars'), 'laila.jpg', 'her child''s photo only');
select is(pg_temp.files('media'), 'shared.jpg', 'the photo shared with her; not the one waiting for approval');
select is(pg_temp.files('chat-files'), 'to-mona.pdf', 'the file sent in her conversation; not Karim''s');
select ok(pg_temp.can_upload('application-documents', '00000000-0000-4000-9a00-00000000000a/00000000-0000-4000-9a00-0000000000d1/more.jpg'), 'she uploads to her application');
select ok(not pg_temp.can_upload('application-documents', '00000000-0000-4000-9a00-00000000000a/00000000-0000-4000-9a00-0000000000d2/fake.jpg'), 'not to Karim''s');
select ok(pg_temp.can_upload('child-documents', '00000000-0000-4000-9a00-00000000000a/health/00000000-0000-4000-9a00-0000000000c1/new.pdf')
      and not pg_temp.can_upload('child-documents', '00000000-0000-4000-9a00-00000000000a/health/00000000-0000-4000-9a00-0000000000c2/new.pdf'),
  'a health document for her child, not for Omar');
select ok(not pg_temp.can_upload('child-avatars', '00000000-0000-4000-9a00-00000000000a/00000000-0000-4000-9a00-0000000000c2/swap.jpg')
      and not pg_temp.can_upload('media', '00000000-0000-4000-9a00-00000000000a/2026/11/mine.jpg'),
  'never a child''s photo nor the media library');
select is(pg_temp.replace_count('child-avatars', '%omar.jpg'), 0, 'nor replaces Omar''s photo');
select ok(pg_temp.can_upload('chat-files', '00000000-0000-4000-9a00-000000000a04/hello.pdf')
      and not pg_temp.can_upload('chat-files', '00000000-0000-4000-9a00-000000000a01/forged.pdf'),
  'chat files go to her own folder only');

-- The teacher
select pg_temp.act_as('00000000-0000-4000-9a00-000000000a02');
select is(pg_temp.files('application-documents'), 'laila-delegate.jpg', 'the teacher: the pickup delegate (checked at the door), not the applications');
select is(pg_temp.files('child-documents'), '-', 'no child document');
select is(pg_temp.files('authorized-pickup-photos') || ' / ' || pg_temp.files('pickup-id-photos'), 'pickup-laila.jpg, pickup-omar.jpg / laila-id.jpg, omar-id.jpg', 'every pickup photo');
select is(pg_temp.files('staff-documents'), 'teacher-id.pdf', 'her own staff document only');
select is(pg_temp.files('media') || ' / ' || pg_temp.files('child-avatars'), 'shared.jpg, waiting.jpg / laila.jpg, omar.jpg', 'the whole media library and the children''s photos');
select ok(pg_temp.can_upload('media', '00000000-0000-4000-9a00-00000000000a/2026/11/new.jpg')
      and not pg_temp.can_upload('child-avatars', '00000000-0000-4000-9a00-00000000000a/00000000-0000-4000-9a00-0000000000c1/new.jpg'),
  'she uploads to the media library; the children''s photos are the admins''');
select is(pg_temp.files('chat-files'), '-', 'not the chat files of conversations she is not in');

-- HR and the admin
select pg_temp.act_as('00000000-0000-4000-9a00-000000000a03');
select is(pg_temp.files('staff-documents'), 'other-id.pdf, teacher-id.pdf', 'HR: every staff document');
select pg_temp.act_as('00000000-0000-4000-9a00-000000000a01');
select is(pg_temp.files('application-documents') || ' / ' || pg_temp.files('child-documents'),
  'karim-birth.jpg, laila-delegate.jpg, mona-birth.jpg / laila-health.pdf, omar-health.pdf, signup-birth.png', 'the admin: every document of the nursery');
select is(pg_temp.files('chat-files'), 'from-karim.pdf, to-mona.pdf', 'and the files of the conversations she is in');

-- Someone deactivated opens nothing.
reset role;
update public.users set status = 'inactive' where id = '00000000-0000-4000-9a00-000000000a01';
select pg_temp.act_as('00000000-0000-4000-9a00-000000000a01');
select is(pg_temp.files('application-documents') || ' / ' || pg_temp.files('child-documents'), '- / -', 'a deactivated admin opens no file');

select * from finish();
rollback;

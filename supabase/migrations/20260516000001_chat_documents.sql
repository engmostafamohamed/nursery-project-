-- Chat document attachments: allow 'file' message type + file metadata,
-- and a private chat-files storage bucket (mirrors the manual chat-media bucket).

begin;

-- Allow a new 'file' message type alongside text/image.
alter table public.messages
  drop constraint if exists messages_type_ck;
alter table public.messages
  add constraint messages_type_ck check (type in ('text', 'image', 'file'));

-- File metadata (null for text/image messages).
alter table public.messages
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists file_size_bytes integer;

-- chat-files bucket: private, 10 MB cap, common document + image types.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-files',
  'chat-files',
  false,
  10 * 1024 * 1024,
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Uploaders write only under their own user-id folder ({uid}/{file}).
drop policy if exists "chat_files_insert_own_folder" on storage.objects;
create policy "chat_files_insert_own_folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated read (signed URLs + unguessable paths; message-row RLS gates
-- who can discover a file's path in the first place). Mirrors chat-media.
drop policy if exists "chat_files_authenticated_read" on storage.objects;
create policy "chat_files_authenticated_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'chat-files');

commit;

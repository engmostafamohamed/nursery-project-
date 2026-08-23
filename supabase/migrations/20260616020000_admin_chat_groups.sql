-- =============================================================================
-- Admin chat: direct + group conversations with per-conversation and per-member
-- permissions. Self-contained alongside the legacy 1-on-1 `messages` table.
--
--   chat_conversations         — a direct (2 people) or group (many) thread.
--   chat_conversation_members  — who is in it + their permissions.
--   chat_messages              — the messages (group-capable, no receiver_id).
--
-- Permissions:
--   conversation.is_read_only  — when true, only members flagged is_admin can post.
--   member.can_write           — per-member write toggle (false = read-only member).
--   member.is_hidden           — member hid the thread from their own list.
--   member.is_admin            — can manage the conversation (members/permissions).
-- =============================================================================

create table if not exists public.chat_conversations (
  id           uuid primary key default gen_random_uuid(),
  nursery_id   uuid not null references public.nurseries (id) on delete cascade,
  kind         text not null default 'group' check (kind in ('direct', 'group')),
  title        text,
  is_read_only boolean not null default false,
  created_by   uuid not null references public.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.chat_conversation_members (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  is_admin        boolean not null default false,
  can_write       boolean not null default true,
  is_hidden       boolean not null default false,
  last_read_at    timestamptz,
  created_at      timestamptz not null default now(),
  unique (conversation_id, user_id)
);

create table if not exists public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  sender_id       uuid not null references public.users (id) on delete cascade,
  content         text not null,
  type            text not null default 'text' check (type in ('text', 'image', 'file')),
  created_at      timestamptz not null default now()
);

create index if not exists idx_chat_members_conversation on public.chat_conversation_members (conversation_id);
create index if not exists idx_chat_members_user on public.chat_conversation_members (user_id);
create index if not exists idx_chat_messages_conversation on public.chat_messages (conversation_id, created_at);

create trigger trg_chat_conversations_updated_at
  before update on public.chat_conversations
  for each row execute function public.set_updated_at();

-- Bump the conversation's updated_at whenever a message lands (drives list order).
create or replace function public.touch_chat_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.chat_conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

create trigger trg_chat_messages_touch
  after insert on public.chat_messages
  for each row execute function public.touch_chat_conversation();

-- ── helpers (SECURITY DEFINER so member-policy lookups don't recurse) ─────────
create or replace function public.is_chat_member(p_conv uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.chat_conversation_members m
    where m.conversation_id = p_conv and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_chat_admin(p_conv uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.chat_conversation_members m
    where m.conversation_id = p_conv and m.user_id = auth.uid() and m.is_admin
  );
$$;

-- A nursery admin may moderate any conversation in their nursery.
create or replace function public.can_moderate_chat(p_conv uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_xo_super_admin()
    or exists (
      select 1 from public.chat_conversations c
      where c.id = p_conv
        and public.current_user_role() in ('branch_admin', 'manager', 'chain_super_admin')
        and c.nursery_id = public.current_user_nursery_id()
    );
$$;

create or replace function public.can_write_chat(p_conv uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.chat_conversation_members m
    join public.chat_conversations c on c.id = m.conversation_id
    where m.conversation_id = p_conv
      and m.user_id = auth.uid()
      and m.can_write
      and (not c.is_read_only or m.is_admin)
  );
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.chat_conversations        enable row level security;
alter table public.chat_conversation_members enable row level security;
alter table public.chat_messages             enable row level security;

-- conversations: members read; members-who-are-admin or nursery admins manage.
create policy chat_conv_select on public.chat_conversations
  for select to authenticated
  using (public.is_chat_member(id) or public.can_moderate_chat(id));

create policy chat_conv_insert on public.chat_conversations
  for insert to authenticated
  with check (created_by = auth.uid());

create policy chat_conv_update on public.chat_conversations
  for update to authenticated
  using (public.is_chat_admin(id) or public.can_moderate_chat(id))
  with check (public.is_chat_admin(id) or public.can_moderate_chat(id));

create policy chat_conv_delete on public.chat_conversations
  for delete to authenticated
  using (created_by = auth.uid() or public.is_chat_admin(id) or public.can_moderate_chat(id));

-- members: any member (or moderator) can read the roster; admins/moderators
-- manage it; a member may update only their OWN row (hide / mark read).
create policy chat_member_select on public.chat_conversation_members
  for select to authenticated
  using (public.is_chat_member(conversation_id) or public.can_moderate_chat(conversation_id));

create policy chat_member_admin_write on public.chat_conversation_members
  for all to authenticated
  using (public.is_chat_admin(conversation_id) or public.can_moderate_chat(conversation_id))
  with check (public.is_chat_admin(conversation_id) or public.can_moderate_chat(conversation_id));

create policy chat_member_self_update on public.chat_conversation_members
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- messages: members & moderators read; writing requires can_write_chat();
-- a sender can delete their own message, admins/moderators can delete any.
create policy chat_msg_select on public.chat_messages
  for select to authenticated
  using (public.is_chat_member(conversation_id) or public.can_moderate_chat(conversation_id));

create policy chat_msg_insert on public.chat_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (public.can_write_chat(conversation_id) or public.can_moderate_chat(conversation_id))
  );

create policy chat_msg_delete on public.chat_messages
  for delete to authenticated
  using (sender_id = auth.uid() or public.is_chat_admin(conversation_id) or public.can_moderate_chat(conversation_id));

-- ── RPCs ─────────────────────────────────────────────────────────────────────
-- Create a conversation with members in one call. For 'direct', reuse an
-- existing 1-on-1 thread between the same two users instead of duplicating.
create or replace function public.create_chat_conversation(
  p_kind text,
  p_title text,
  p_member_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_nursery uuid;
  v_conv    uuid;
  v_other   uuid;
  m         uuid;
begin
  select nursery_id into v_nursery from public.users where id = v_uid;
  if v_nursery is null then
    -- xo/chain admins may have no home nursery; fall back to a member's nursery.
    select nursery_id into v_nursery from public.users
      where id = any (p_member_ids) and nursery_id is not null limit 1;
  end if;

  if p_kind = 'direct' then
    v_other := (select x from unnest(p_member_ids) x where x <> v_uid limit 1);
    -- existing direct thread between the two?
    select c.id into v_conv
    from public.chat_conversations c
    where c.kind = 'direct'
      and exists (select 1 from public.chat_conversation_members a where a.conversation_id = c.id and a.user_id = v_uid)
      and exists (select 1 from public.chat_conversation_members b where b.conversation_id = c.id and b.user_id = v_other)
      and (select count(*) from public.chat_conversation_members cm where cm.conversation_id = c.id) = 2
    limit 1;
    if v_conv is not null then
      update public.chat_conversation_members set is_hidden = false
        where conversation_id = v_conv and user_id = v_uid;
      return v_conv;
    end if;
  end if;

  insert into public.chat_conversations (nursery_id, kind, title, created_by)
    values (v_nursery, p_kind, nullif(btrim(coalesce(p_title, '')), ''), v_uid)
    returning id into v_conv;

  insert into public.chat_conversation_members (conversation_id, user_id, is_admin, can_write)
    values (v_conv, v_uid, true, true);

  foreach m in array coalesce(p_member_ids, '{}'::uuid[]) loop
    if m <> v_uid then
      insert into public.chat_conversation_members (conversation_id, user_id)
        values (v_conv, m)
      on conflict (conversation_id, user_id) do nothing;
    end if;
  end loop;

  return v_conv;
end;
$$;

-- List the caller's (non-hidden) conversations with preview + unread + my perms.
create or replace function public.list_chat_conversations()
returns table (
  id uuid, kind text, title text, is_read_only boolean,
  member_count int, last_message text, last_message_at timestamptz,
  unread_count int, is_admin boolean, can_write boolean,
  other_name_ar text, other_name_en text, other_role text
)
language sql security definer stable set search_path = public as $$
  with my as (
    select m.conversation_id, m.is_admin, m.can_write, m.is_hidden, m.last_read_at
    from public.chat_conversation_members m
    where m.user_id = auth.uid()
  )
  select
    c.id, c.kind, c.title, c.is_read_only,
    (select count(*) from public.chat_conversation_members cm where cm.conversation_id = c.id)::int,
    lm.content, lm.created_at,
    (select count(*) from public.chat_messages x
       where x.conversation_id = c.id and x.sender_id <> auth.uid()
         and (my.last_read_at is null or x.created_at > my.last_read_at))::int,
    my.is_admin, my.can_write,
    op.name_ar, op.name_en, op.role::text
  from my
  join public.chat_conversations c on c.id = my.conversation_id
  left join lateral (
    select content, created_at from public.chat_messages mm
    where mm.conversation_id = c.id order by created_at desc limit 1
  ) lm on true
  left join lateral (
    select u.name_ar, u.name_en, u.role
    from public.chat_conversation_members om
    join public.users u on u.id = om.user_id
    where om.conversation_id = c.id and om.user_id <> auth.uid() and c.kind = 'direct'
    limit 1
  ) op on true
  where not my.is_hidden
  order by coalesce(lm.created_at, c.created_at) desc;
$$;

-- Messages for a conversation, with sender display names (bypasses users RLS).
create or replace function public.list_chat_messages(p_conv uuid)
returns table (
  id uuid, sender_id uuid, sender_name_ar text, sender_name_en text,
  content text, type text, created_at timestamptz
)
language sql security definer stable set search_path = public as $$
  select m.id, m.sender_id, u.name_ar, u.name_en, m.content, m.type, m.created_at
  from public.chat_messages m
  join public.users u on u.id = m.sender_id
  where m.conversation_id = p_conv
    and (public.is_chat_member(p_conv) or public.can_moderate_chat(p_conv))
  order by m.created_at asc;
$$;

-- Roster for a conversation with display names + permissions.
create or replace function public.list_chat_members(p_conv uuid)
returns table (
  user_id uuid, name_ar text, name_en text, role text,
  is_admin boolean, can_write boolean
)
language sql security definer stable set search_path = public as $$
  select m.user_id, u.name_ar, u.name_en, u.role::text, m.is_admin, m.can_write
  from public.chat_conversation_members m
  join public.users u on u.id = m.user_id
  where m.conversation_id = p_conv
    and (public.is_chat_member(p_conv) or public.can_moderate_chat(p_conv))
  order by m.is_admin desc, u.name_en;
$$;

grant execute on function public.create_chat_conversation(text, text, uuid[]) to authenticated;
grant execute on function public.list_chat_conversations() to authenticated;
grant execute on function public.list_chat_messages(uuid) to authenticated;
grant execute on function public.list_chat_members(uuid) to authenticated;

-- ── realtime ─────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_conversation_members') then
    alter publication supabase_realtime add table public.chat_conversation_members;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_conversations') then
    alter publication supabase_realtime add table public.chat_conversations;
  end if;
end $$;

alter table public.chat_messages             replica identity full;
alter table public.chat_conversation_members replica identity full;
alter table public.chat_conversations        replica identity full;

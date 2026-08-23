-- Message moderation: instead of hard-deleting, an admin can "remove" or
-- "disable" a message. The row stays, content is withheld, and the thread shows a
-- tombstone ("Removed by admin" / "Disabled by admin"). Disable is reversible.

alter table public.chat_messages
  add column if not exists moderation   text check (moderation in ('removed', 'disabled')),
  add column if not exists moderated_by uuid references public.users (id) on delete set null,
  add column if not exists moderated_at timestamptz;

-- Only a conversation admin or nursery moderator may moderate messages.
drop policy if exists chat_msg_moderate on public.chat_messages;
create policy chat_msg_moderate on public.chat_messages
  for update to authenticated
  using (public.is_chat_admin(conversation_id) or public.can_moderate_chat(conversation_id))
  with check (public.is_chat_admin(conversation_id) or public.can_moderate_chat(conversation_id));

-- Thread RPC: expose moderation state; withhold the content of moderated messages.
drop function if exists public.list_chat_messages(uuid);
create or replace function public.list_chat_messages(p_conv uuid)
returns table (
  id uuid, sender_id uuid, sender_name_ar text, sender_name_en text,
  content text, type text, moderation text, created_at timestamptz
)
language sql security definer stable set search_path = public as $$
  select
    m.id, m.sender_id, u.name_ar, u.name_en,
    case when m.moderation is not null then null else m.content end,
    m.type, m.moderation, m.created_at
  from public.chat_messages m
  join public.users u on u.id = m.sender_id
  where m.conversation_id = p_conv
    and (public.is_chat_member(p_conv) or public.can_moderate_chat(p_conv))
  order by m.created_at asc;
$$;

grant execute on function public.list_chat_messages(uuid) to authenticated;

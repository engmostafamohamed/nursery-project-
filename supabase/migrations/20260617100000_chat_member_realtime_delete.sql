-- Make conversation/membership removals propagate LIVE to the affected member.
--
-- When an admin deletes a conversation (cascade-deleting member rows) or removes
-- a single member, the other participants should see it vanish without a manual
-- refresh. Realtime checks RLS against the OLD row of a DELETE; the existing
-- chat_member_select policy uses is_chat_member(), which returns false once the
-- row is gone, so the DELETE event was filtered out and never delivered.
--
-- Add a permissive SELECT policy on a user's OWN membership rows. It exposes
-- nothing new (those rows already surface via list_chat_conversations), but it
-- lets realtime deliver the DELETE of a member's own row to that member, so their
-- conversation list updates immediately.

drop policy if exists chat_member_select_own on public.chat_conversation_members;
create policy chat_member_select_own on public.chat_conversation_members
  for select to authenticated
  using (user_id = auth.uid());

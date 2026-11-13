-- Security: a post or a comment is written by the one who sends it.
--
-- In the community, a family or a teacher could publish a post under someone else's name (the
-- author was not checked), and anyone of the nursery could write, change or delete any comment,
-- under any name. Now a post or a comment carries the sender as its author, a comment is changed
-- only by its author, and comments are no longer deleted by anyone (the screens never delete one;
-- the owner's rule keeps rows).

drop policy if exists posts_parent_teacher_insert on public.posts;
create policy posts_parent_teacher_insert on public.posts
  for insert to authenticated
  with check (
    public.current_user_role() in ('parent'::public.user_role, 'teacher'::public.user_role)
    and nursery_id = public.current_user_nursery_id()
    and author_id = auth.uid()
  );

drop policy if exists post_comments_all_rw on public.post_comments;

drop policy if exists post_comments_read on public.post_comments;
create policy post_comments_read on public.post_comments
  for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_comments.post_id and p.nursery_id = public.current_user_nursery_id()));

drop policy if exists post_comments_write_own on public.post_comments;
create policy post_comments_write_own on public.post_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = post_comments.post_id and p.nursery_id = public.current_user_nursery_id())
  );

drop policy if exists post_comments_edit_own on public.post_comments;
create policy post_comments_edit_own on public.post_comments
  for update to authenticated
  using (author_id = auth.uid())
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = post_comments.post_id and p.nursery_id = public.current_user_nursery_id())
  );

revoke delete on public.post_comments from anon, authenticated;

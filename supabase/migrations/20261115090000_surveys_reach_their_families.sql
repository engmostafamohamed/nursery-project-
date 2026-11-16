-- Surveys reach the families they were sent to.
--
-- The app has always saved a sent survey with status 'active', but the family and teacher read
-- policies only showed 'published' — so no sent survey ever reached a family's screen. The
-- policies now accept both spellings. They also honour the survey's target classes (a survey sent
-- to one class stays off the other families' screens) and hide soft-deleted surveys: deleting a
-- survey from now on stamps deleted_at and keeps the row and its answers.

alter table public.surveys add column if not exists deleted_at timestamptz;

-- Does the signed-in family have a child in any of these classes? (Security definer so the
-- policy's check does not recurse into parent_children's own policies.)
create or replace function public.rls_parent_has_child_in_classes(p_class_ids uuid[])
returns boolean
language plpgsql
security definer
set search_path to 'public'
set row_security to 'off'
as $$
begin
  if p_class_ids is null or array_length(p_class_ids, 1) is null then
    return false;
  end if;
  set local row_security = off;
  return exists (
    select 1
    from public.parent_children pc
    inner join public.children c on c.id = pc.child_id
    where pc.parent_id = auth.uid()
      and c.class_id = any(p_class_ids)
  );
end;
$$;

drop policy if exists surveys_parent_select on public.surveys;
create policy surveys_parent_select on public.surveys for select using (
  current_user_role() = 'parent'::user_role
  and rls_parent_has_child_in_nursery(nursery_id)
  and target_role = 'parent'::user_role
  and status in ('active', 'published')
  and deleted_at is null
  and (target_class_ids is null or rls_parent_has_child_in_classes(target_class_ids))
);

drop policy if exists surveys_teacher_select on public.surveys;
create policy surveys_teacher_select on public.surveys for select using (
  current_user_role() = 'teacher'::user_role
  and nursery_id = current_user_nursery_id()
  and target_role = 'teacher'::user_role
  and status in ('active', 'published')
  and deleted_at is null
);

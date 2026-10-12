-- Teachers could not read any children.
--
-- The children_teacher_select policy (20260417150000_onboarding_self_bootstrap.sql) calls
-- teacher_assigned_class_ids(), whose body still read classes.teacher_id. That column was
-- dropped the next day in 20260418130000_drop_classes_teacher_id.sql: teacher assignment
-- lives in class_staff. Dropping a column does not check plpgsql bodies, so the drop
-- succeeded and every teacher query on children has since failed with
--   column cl.teacher_id does not exist
--
-- The helper now reads class_staff, like rls_staff_can_access_child does. Lead and
-- assistant teachers both see their classes. row_security is in the SET clause so it is
-- restored on exit (see 20260607140000_fix_rls_helper_row_security_leak.sql).

create or replace function public.teacher_assigned_class_ids()
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  return query
  select cs.class_id
  from public.class_staff cs
  where cs.user_id = auth.uid();
end;
$$;

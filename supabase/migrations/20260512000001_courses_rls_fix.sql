-- Drop the broken RLS policies that query users directly (causes recursion)
-- and replace with the helper-function pattern used throughout this codebase.
-- Idempotent: drops both the old (broken) and new policy names so a partial
-- prior run can be safely re-applied.

begin;

-- courses (old/broken)
drop policy if exists "nursery admins manage courses"         on courses;
drop policy if exists "teachers read own courses"             on courses;
drop policy if exists "parents read courses their children are enrolled in" on courses;

-- course_enrollments (old/broken)
drop policy if exists "nursery admins manage enrollments"           on course_enrollments;
drop policy if exists "teachers read enrollments for own courses"   on course_enrollments;
drop policy if exists "parents read their children enrollments"     on course_enrollments;

-- course_invoices (old/broken)
drop policy if exists "nursery admins manage invoices"          on course_invoices;
drop policy if exists "parents read their children invoices"    on course_invoices;

-- new policy names (in case a previous partial run already created some)
drop policy if exists "courses_branch_all"                 on courses;
drop policy if exists "courses_chain_all"                  on courses;
drop policy if exists "courses_teacher_select"             on courses;
drop policy if exists "courses_parent_select"              on courses;
drop policy if exists "course_enrollments_branch_all"      on course_enrollments;
drop policy if exists "course_enrollments_chain_all"       on course_enrollments;
drop policy if exists "course_enrollments_teacher_select"  on course_enrollments;
drop policy if exists "course_enrollments_parent_select"   on course_enrollments;
drop policy if exists "course_invoices_branch_all"         on course_invoices;
drop policy if exists "course_invoices_chain_all"          on course_invoices;
drop policy if exists "course_invoices_parent_select"      on course_invoices;

-- ── courses ──────────────────────────────────────────────────────────────────

create policy "courses_branch_all"
  on courses for all
  using (
    current_user_role() = 'branch_admin'
    and nursery_id = current_user_nursery_id()
  );

create policy "courses_chain_all"
  on courses for all
  using (
    current_user_role() = 'chain_super_admin'
    and nursery_id = current_user_nursery_id()
  );

create policy "courses_teacher_select"
  on courses for select
  using (
    current_user_role() = 'teacher'
    and teacher_user_id = auth.uid()
  );

create policy "courses_parent_select"
  on courses for select
  using (
    current_user_role() = 'parent'
    and exists (
      select 1 from course_enrollments ce
        join parent_children pc on pc.child_id = ce.child_id
      where ce.course_id = courses.id
        and pc.parent_id = auth.uid()
        and ce.status = 'active'
    )
  );

-- ── course_enrollments ────────────────────────────────────────────────────────

create policy "course_enrollments_branch_all"
  on course_enrollments for all
  using (
    current_user_role() = 'branch_admin'
    and exists (
      select 1 from courses c
      where c.id = course_enrollments.course_id
        and c.nursery_id = current_user_nursery_id()
    )
  );

create policy "course_enrollments_chain_all"
  on course_enrollments for all
  using (
    current_user_role() = 'chain_super_admin'
    and exists (
      select 1 from courses c
      where c.id = course_enrollments.course_id
        and c.nursery_id = current_user_nursery_id()
    )
  );

create policy "course_enrollments_teacher_select"
  on course_enrollments for select
  using (
    current_user_role() = 'teacher'
    and exists (
      select 1 from courses c
      where c.id = course_enrollments.course_id
        and c.teacher_user_id = auth.uid()
    )
  );

create policy "course_enrollments_parent_select"
  on course_enrollments for select
  using (
    current_user_role() = 'parent'
    and exists (
      select 1 from parent_children pc
      where pc.child_id = course_enrollments.child_id
        and pc.parent_id = auth.uid()
    )
  );

-- ── course_invoices ───────────────────────────────────────────────────────────

create policy "course_invoices_branch_all"
  on course_invoices for all
  using (
    current_user_role() = 'branch_admin'
    and nursery_id = current_user_nursery_id()
  );

create policy "course_invoices_chain_all"
  on course_invoices for all
  using (
    current_user_role() = 'chain_super_admin'
    and nursery_id = current_user_nursery_id()
  );

create policy "course_invoices_parent_select"
  on course_invoices for select
  using (
    current_user_role() = 'parent'
    and exists (
      select 1 from parent_children pc
      where pc.child_id = course_invoices.child_id
        and pc.parent_id = auth.uid()
    )
  );

commit;

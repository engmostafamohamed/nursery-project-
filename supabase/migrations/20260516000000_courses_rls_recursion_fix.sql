-- The previous courses RLS fix still recursed: courses policies subquery
-- course_enrollments and vice-versa, so evaluating one table's policy triggers
-- the other's, looping forever. Route every cross-table lookup through
-- SECURITY DEFINER helpers (the codebase pattern) so subqueries bypass RLS.

begin;

-- ── SECURITY DEFINER helpers (bypass RLS on the referenced tables) ───────────

create or replace function public.course_in_my_nursery(p_course_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.courses c
    where c.id = p_course_id
      and c.nursery_id = public.current_user_nursery_id()
  );
$$;

create or replace function public.course_taught_by_me(p_course_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.courses c
    where c.id = p_course_id
      and c.teacher_user_id = auth.uid()
  );
$$;

create or replace function public.parent_has_child_in_course(p_course_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.course_enrollments ce
    join public.parent_children pc on pc.child_id = ce.child_id
    where ce.course_id = p_course_id
      and pc.parent_id = auth.uid()
      and ce.status = 'active'
  );
$$;

create or replace function public.parent_has_child(p_child_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.parent_children pc
    where pc.child_id = p_child_id
      and pc.parent_id = auth.uid()
  );
$$;

-- ── courses ──────────────────────────────────────────────────────────────────

drop policy if exists "courses_branch_all"     on courses;
drop policy if exists "courses_chain_all"      on courses;
drop policy if exists "courses_teacher_select" on courses;
drop policy if exists "courses_parent_select"  on courses;

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
    and public.parent_has_child_in_course(courses.id)
  );

-- ── course_enrollments ────────────────────────────────────────────────────────

drop policy if exists "course_enrollments_branch_all"     on course_enrollments;
drop policy if exists "course_enrollments_chain_all"      on course_enrollments;
drop policy if exists "course_enrollments_teacher_select" on course_enrollments;
drop policy if exists "course_enrollments_parent_select"  on course_enrollments;

create policy "course_enrollments_branch_all"
  on course_enrollments for all
  using (
    current_user_role() = 'branch_admin'
    and public.course_in_my_nursery(course_enrollments.course_id)
  );

create policy "course_enrollments_chain_all"
  on course_enrollments for all
  using (
    current_user_role() = 'chain_super_admin'
    and public.course_in_my_nursery(course_enrollments.course_id)
  );

create policy "course_enrollments_teacher_select"
  on course_enrollments for select
  using (
    current_user_role() = 'teacher'
    and public.course_taught_by_me(course_enrollments.course_id)
  );

create policy "course_enrollments_parent_select"
  on course_enrollments for select
  using (
    current_user_role() = 'parent'
    and public.parent_has_child(course_enrollments.child_id)
  );

-- ── course_invoices ───────────────────────────────────────────────────────────

drop policy if exists "course_invoices_branch_all"    on course_invoices;
drop policy if exists "course_invoices_chain_all"     on course_invoices;
drop policy if exists "course_invoices_parent_select" on course_invoices;

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
    and public.parent_has_child(course_invoices.child_id)
  );

commit;

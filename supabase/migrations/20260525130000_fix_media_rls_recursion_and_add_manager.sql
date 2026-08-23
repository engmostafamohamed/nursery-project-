-- =============================================================================
-- Migration: 20260525130000_fix_media_rls_recursion_and_add_manager
--
-- Problem:
--   public.media had two legacy SELECT policies for parents that reference
--   media_visibility / media_children. Those tables' own RLS policies query
--   public.media in turn, creating an evaluation cycle. PostgreSQL aborts the
--   query with `42P17 — infinite recursion detected in policy for relation
--   "media"`, which breaks every dashboard widget that touches media for
--   every role (including XO super admin).
--
-- What this migration does:
--   1. DROP the two recursive parent-side SELECT policies. Parent access is
--      already covered by the newer `media_parent_select` policy, which uses
--      the media.child_ids array column (no subselect through other tables).
--   2. DROP redundant overlapping legacy policies whose access is already
--      provided by the role-specific media_* policies. Keeps the policy set
--      compact and avoids unintended PERMISSIVE-OR widening.
--   3. ADD media_manager_all so the new manager role can manage media in
--      their nursery (parallel to media_branch_all / media_teacher_all).
-- =============================================================================

-- 1. Drop the recursive parent SELECT policies
DROP POLICY IF EXISTS "Parents can view approved media by visibility rules" ON public.media;
DROP POLICY IF EXISTS parents_can_read_approved_media_for_their_children ON public.media;

-- 2. Drop redundant legacy policies (covered by role-specific media_* policies)
DROP POLICY IF EXISTS "Admins can select media in nursery" ON public.media;
DROP POLICY IF EXISTS "Admins can update media approval fields" ON public.media;
DROP POLICY IF EXISTS admins_can_update_media_for_their_nursery ON public.media;
DROP POLICY IF EXISTS staff_can_read_media_for_their_nursery ON public.media;
DROP POLICY IF EXISTS "Teachers can insert media in their nursery" ON public.media;
DROP POLICY IF EXISTS "Teachers can select own uploaded media" ON public.media;
DROP POLICY IF EXISTS teachers_can_upload_media_for_their_nursery ON public.media;

-- 3. Add manager policy (same scope as branch_admin, gated by nursery)
DROP POLICY IF EXISTS media_manager_all ON public.media;
CREATE POLICY media_manager_all
  ON public.media FOR ALL TO authenticated
  USING (
    public.current_user_role() = 'manager'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() = 'manager'::public.user_role
    AND nursery_id = public.current_user_nursery_id()
  );

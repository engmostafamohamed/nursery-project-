-- Replaces legacy invalid filename migration: 020b_report_reactions.sql
-- Safe/idempotent version for Supabase CLI timestamp-based ordering.

CREATE TABLE IF NOT EXISTS public.report_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.daily_reports (id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  reaction text,
  comment text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT report_reactions_comment_len_ck CHECK (comment IS NULL OR char_length(comment) <= 200)
);

CREATE INDEX IF NOT EXISTS idx_report_reactions_report_id ON public.report_reactions (report_id);
CREATE INDEX IF NOT EXISTS idx_report_reactions_parent_id ON public.report_reactions (parent_id);

DROP TRIGGER IF EXISTS trg_report_reactions_updated_at ON public.report_reactions;
CREATE TRIGGER trg_report_reactions_updated_at
BEFORE UPDATE ON public.report_reactions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.report_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_reactions_parent_insert ON public.report_reactions;
CREATE POLICY report_reactions_parent_insert
  ON public.report_reactions FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'parent'
    AND parent_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.daily_reports dr
      WHERE dr.id = report_reactions.report_id
        AND dr.status = 'published'
        AND public.parent_can_access_child(dr.child_id)
    )
  );

DROP POLICY IF EXISTS report_reactions_parent_select ON public.report_reactions;
CREATE POLICY report_reactions_parent_select
  ON public.report_reactions FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND parent_id = auth.uid()
  );

DROP POLICY IF EXISTS report_reactions_parent_update ON public.report_reactions;
CREATE POLICY report_reactions_parent_update
  ON public.report_reactions FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'parent' AND parent_id = auth.uid())
  WITH CHECK (public.current_user_role() = 'parent' AND parent_id = auth.uid());

DROP POLICY IF EXISTS report_reactions_teacher_select ON public.report_reactions;
CREATE POLICY report_reactions_teacher_select
  ON public.report_reactions FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND EXISTS (
      SELECT 1
      FROM public.daily_reports dr
      JOIN public.children c ON c.id = dr.child_id
      JOIN public.classes cl ON cl.id = c.class_id
      WHERE dr.id = report_reactions.report_id
        AND cl.teacher_id = auth.uid()
    )
  );


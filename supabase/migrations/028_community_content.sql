-- Phase 12: Community + Content (simplified)

CREATE TABLE IF NOT EXISTS public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  post_type text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT posts_type_ck CHECK (post_type IN ('announcement', 'tip', 'question'))
);

CREATE TABLE IF NOT EXISTS public.post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.content_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL,
  content text NOT NULL,
  media_url text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT content_library_category_ck CHECK (category IN ('parenting_tips', 'activities', 'recipes', 'health'))
);

CREATE INDEX IF NOT EXISTS idx_posts_nursery_created ON public.posts (nursery_id, created_at);
CREATE INDEX IF NOT EXISTS idx_post_comments_post ON public.post_comments (post_id);
CREATE INDEX IF NOT EXISTS idx_content_library_nursery_cat ON public.content_library (nursery_id, category);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS posts_admin_all ON public.posts;
CREATE POLICY posts_admin_all
  ON public.posts FOR ALL TO authenticated
  USING (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND nursery_id = public.current_user_nursery_id()
  );

DROP POLICY IF EXISTS posts_parent_teacher_read ON public.posts;
CREATE POLICY posts_parent_teacher_read
  ON public.posts FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('parent', 'teacher')
    AND nursery_id = public.current_user_nursery_id()
  );

DROP POLICY IF EXISTS posts_parent_teacher_insert ON public.posts;
CREATE POLICY posts_parent_teacher_insert
  ON public.posts FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() IN ('parent', 'teacher')
    AND nursery_id = public.current_user_nursery_id()
  );

DROP POLICY IF EXISTS post_comments_all_rw ON public.post_comments;
CREATE POLICY post_comments_all_rw
  ON public.post_comments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = post_comments.post_id
        AND p.nursery_id = public.current_user_nursery_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = post_comments.post_id
        AND p.nursery_id = public.current_user_nursery_id()
    )
  );

DROP POLICY IF EXISTS content_library_admin_all ON public.content_library;
CREATE POLICY content_library_admin_all
  ON public.content_library FOR ALL TO authenticated
  USING (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND nursery_id = public.current_user_nursery_id()
  );

DROP POLICY IF EXISTS content_library_parent_read ON public.content_library;
CREATE POLICY content_library_parent_read
  ON public.content_library FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND nursery_id = public.current_user_nursery_id()
  );

DROP POLICY IF EXISTS content_library_teacher_read ON public.content_library;
CREATE POLICY content_library_teacher_read
  ON public.content_library FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND nursery_id = public.current_user_nursery_id()
  );

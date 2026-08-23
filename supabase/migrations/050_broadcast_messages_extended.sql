-- Extended broadcast metadata, notification linkage, and teacher class announcements.

ALTER TABLE public.broadcast_messages
  ALTER COLUMN sent_at DROP NOT NULL;

ALTER TABLE public.broadcast_messages
  ADD COLUMN IF NOT EXISTS audience_scope text NOT NULL DEFAULT 'all_parents'
    CONSTRAINT broadcast_messages_audience_scope_ck CHECK (
      audience_scope IN ('all_parents', 'class', 'role')
    ),
  ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channels text[] NOT NULL DEFAULT ARRAY['in_app']::text[]
    CONSTRAINT broadcast_messages_channels_ck CHECK (
      cardinality(channels) >= 1
      AND channels <@ ARRAY['in_app', 'whatsapp', 'sms', 'email']::text[]
    ),
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'sent'
    CONSTRAINT broadcast_messages_delivery_status_ck CHECK (
      delivery_status IN ('draft', 'scheduled', 'sent', 'failed')
    ),
  ADD COLUMN IF NOT EXISTS recipient_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS read_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_broadcast_messages_nursery_sent
  ON public.broadcast_messages (nursery_id, sent_at DESC NULLS LAST);

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS related_broadcast_id uuid REFERENCES public.broadcast_messages (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_related_broadcast_id
  ON public.notifications (related_broadcast_id);

-- Legacy rows: ensure sent timestamp and scope
UPDATE public.broadcast_messages
SET sent_at = COALESCE(sent_at, created_at)
WHERE sent_at IS NULL;

-- -----------------------------------------------------------------------------
-- RLS — broadcast_messages (replace parent + teacher select; add teacher policies)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS bcast_parent_select ON public.broadcast_messages;

CREATE POLICY bcast_parent_select
  ON public.broadcast_messages FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'parent'
    AND target_role = 'parent'::public.user_role
    AND (
      (
        audience_scope IN ('all_parents', 'role')
        AND nursery_id IN (
          SELECT DISTINCT c.nursery_id
          FROM public.children c
          JOIN public.parent_children pc ON pc.child_id = c.id
          WHERE pc.parent_id = auth.uid()
        )
      )
      OR (
        audience_scope = 'class'
        AND class_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.parent_children pc2
          JOIN public.children c2 ON c2.id = pc2.child_id
          WHERE pc2.parent_id = auth.uid()
            AND c2.class_id = broadcast_messages.class_id
        )
      )
    )
  );

DROP POLICY IF EXISTS bcast_teacher_select ON public.broadcast_messages;

CREATE POLICY bcast_teacher_select
  ON public.broadcast_messages FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND nursery_id = public.current_user_nursery_id()
    AND (
      target_role = 'teacher'::public.user_role
      OR sender_id = auth.uid()
    )
  );

CREATE POLICY bcast_teacher_insert
  ON public.broadcast_messages FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'teacher'
    AND nursery_id = public.current_user_nursery_id()
    AND sender_id = auth.uid()
    AND target_role = 'parent'::public.user_role
    AND audience_scope = 'class'
    AND class_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.classes cl
      WHERE cl.id = class_id
        AND cl.nursery_id = public.current_user_nursery_id()
        AND cl.teacher_id = auth.uid()
    )
  );

CREATE POLICY bcast_teacher_update_own
  ON public.broadcast_messages FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'teacher'
    AND nursery_id = public.current_user_nursery_id()
    AND sender_id = auth.uid()
  )
  WITH CHECK (
    public.current_user_role() = 'teacher'
    AND nursery_id = public.current_user_nursery_id()
    AND sender_id = auth.uid()
  );

-- -----------------------------------------------------------------------------
-- RLS — notifications (teacher may log outbound class announcements for class parents)
-- -----------------------------------------------------------------------------
CREATE POLICY notif_teacher_class_broadcast_insert
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'teacher'
    AND nursery_id = public.current_user_nursery_id()
    AND type = 'class_announcement'
    AND related_broadcast_id IS NOT NULL
    AND channel IN ('in_app', 'whatsapp', 'sms', 'email', 'push')
    AND EXISTS (
      SELECT 1
      FROM public.broadcast_messages bm
      WHERE bm.id = related_broadcast_id
        AND bm.sender_id = auth.uid()
        AND bm.class_id IS NOT NULL
        AND bm.audience_scope = 'class'
        AND EXISTS (
          SELECT 1
          FROM public.classes cl
          WHERE cl.id = bm.class_id
            AND cl.teacher_id = auth.uid()
            AND cl.nursery_id = public.current_user_nursery_id()
        )
        AND EXISTS (
          SELECT 1
          FROM public.parent_children pc
          JOIN public.children c ON c.id = pc.child_id
          WHERE pc.parent_id = user_id
            AND c.class_id = bm.class_id
        )
    )
  );

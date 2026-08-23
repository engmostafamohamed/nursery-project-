-- Phase 9 Feature 1: Public Inquiry Form & Waitlist Management

CREATE TABLE IF NOT EXISTS public.inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  parent_name text NOT NULL,
  parent_email text NOT NULL,
  parent_phone text NOT NULL,
  child_name text NOT NULL,
  child_dob date NOT NULL,
  preferred_class text,
  preferred_start_date date,
  source text NOT NULL DEFAULT 'website',
  message text,
  status text NOT NULL DEFAULT 'new',
  assigned_to uuid REFERENCES public.users (id) ON DELETE SET NULL,
  admin_notes text,
  declined_reason text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT inquiries_source_ck CHECK (source IN ('website', 'referral', 'walk_in', 'social_media', 'other')),
  CONSTRAINT inquiries_status_ck CHECK (status IN ('new', 'contacted', 'scheduled', 'waitlisted', 'enrolled', 'declined'))
);

CREATE TRIGGER trg_inquiries_updated_at
BEFORE UPDATE ON public.inquiries
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL REFERENCES public.inquiries (id) ON DELETE CASCADE,
  nursery_id uuid NOT NULL REFERENCES public.nurseries (id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes (id) ON DELETE CASCADE,
  position integer NOT NULL,
  added_at timestamptz NOT NULL DEFAULT NOW(),
  notified_at timestamptz,
  status text NOT NULL DEFAULT 'waiting',
  CONSTRAINT waitlist_status_ck CHECK (status IN ('waiting', 'offered', 'accepted', 'declined', 'expired')),
  CONSTRAINT waitlist_pos_positive_ck CHECK (position > 0),
  CONSTRAINT waitlist_unique_inquiry UNIQUE (inquiry_id)
);

CREATE INDEX IF NOT EXISTS idx_inquiries_nursery ON public.inquiries (nursery_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON public.inquiries (status);
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON public.inquiries (created_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_nursery_class ON public.waitlist (nursery_id, class_id, position);
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON public.waitlist (status);

ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Public insert only (no read)
DROP POLICY IF EXISTS inquiries_public_insert ON public.inquiries;
CREATE POLICY inquiries_public_insert
  ON public.inquiries FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'new');

-- Admin full access for their nursery
DROP POLICY IF EXISTS inquiries_admin_all ON public.inquiries;
CREATE POLICY inquiries_admin_all
  ON public.inquiries FOR ALL TO authenticated
  USING (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND nursery_id = public.current_user_nursery_id()
  );

DROP POLICY IF EXISTS waitlist_admin_all ON public.waitlist;
CREATE POLICY waitlist_admin_all
  ON public.waitlist FOR ALL TO authenticated
  USING (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND nursery_id = public.current_user_nursery_id()
  )
  WITH CHECK (
    public.current_user_role() IN ('branch_admin', 'chain_super_admin')
    AND nursery_id = public.current_user_nursery_id()
  );

-- Public class dropdown support for inquiry form.
DROP POLICY IF EXISTS classes_public_select_for_inquiry ON public.classes;
CREATE POLICY classes_public_select_for_inquiry
  ON public.classes FOR SELECT TO anon
  USING (true);

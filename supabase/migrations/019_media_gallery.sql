-- Migration 019: Media gallery tables + storage bucket policies

-- 1) media table (extend if already exists)
CREATE TABLE IF NOT EXISTS public.media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nursery_id UUID NOT NULL REFERENCES public.nurseries(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('photo', 'video')),
  thumbnail_url TEXT,
  captured_at DATE NOT NULL DEFAULT CURRENT_DATE,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'approved', 'rejected')),
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  activity_type TEXT,
  caption TEXT,
  visibility TEXT NOT NULL DEFAULT 'all_class' CHECK (visibility IN ('all_class', 'tagged_only', 'specific_parents')),
  view_count INTEGER NOT NULL DEFAULT 0,
  download_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add missing columns for older media table shape
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS file_type TEXT CHECK (file_type IN ('photo', 'video'));
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS captured_at DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'approved', 'rejected'));
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS rejected_reason TEXT;
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL;
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS activity_type TEXT;
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS caption TEXT;
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'all_class' CHECK (visibility IN ('all_class', 'tagged_only', 'specific_parents'));
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0;

-- 2) Junction tables
CREATE TABLE IF NOT EXISTS public.media_children (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id UUID NOT NULL REFERENCES public.media(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (media_id, child_id)
);

CREATE TABLE IF NOT EXISTS public.media_visibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id UUID NOT NULL REFERENCES public.media(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (media_id, parent_id)
);

-- 3) RLS
ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_children ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can insert media in their nursery"
ON public.media FOR INSERT
WITH CHECK (
  uploaded_by = auth.uid()
  AND nursery_id IN (SELECT nursery_id FROM public.users WHERE id = auth.uid())
);

CREATE POLICY "Teachers can select own uploaded media"
ON public.media FOR SELECT
USING (uploaded_by = auth.uid());

CREATE POLICY "Admins can select media in nursery"
ON public.media FOR SELECT
USING (
  nursery_id IN (
    SELECT nursery_id FROM public.users
    WHERE id = auth.uid() AND role IN ('branch_admin', 'chain_super_admin', 'xo_super_admin')
  )
);

CREATE POLICY "Admins can update media approval fields"
ON public.media FOR UPDATE
USING (
  nursery_id IN (
    SELECT nursery_id FROM public.users
    WHERE id = auth.uid() AND role IN ('branch_admin', 'chain_super_admin', 'xo_super_admin')
  )
)
WITH CHECK (
  nursery_id IN (
    SELECT nursery_id FROM public.users
    WHERE id = auth.uid() AND role IN ('branch_admin', 'chain_super_admin', 'xo_super_admin')
  )
);

CREATE POLICY "Parents can view approved media by visibility rules"
ON public.media FOR SELECT
USING (
  status = 'approved'
  AND (
    (
      visibility = 'all_class'
      AND EXISTS (
        SELECT 1
        FROM public.parent_children pc
        JOIN public.children c ON c.id = pc.child_id
        WHERE pc.parent_id = auth.uid()
          AND c.class_id = media.class_id
      )
    )
    OR (
      visibility = 'tagged_only'
      AND EXISTS (
        SELECT 1
        FROM public.media_children mc
        JOIN public.parent_children pc ON pc.child_id = mc.child_id
        WHERE mc.media_id = media.id
          AND pc.parent_id = auth.uid()
      )
    )
    OR (
      visibility = 'specific_parents'
      AND EXISTS (
        SELECT 1
        FROM public.media_visibility mv
        WHERE mv.media_id = media.id
          AND mv.parent_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Teachers and admins can view media_children"
ON public.media_children FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.media m
    WHERE m.id = media_children.media_id
      AND m.nursery_id IN (SELECT nursery_id FROM public.users WHERE id = auth.uid())
  )
);

CREATE POLICY "Teachers can insert media_children for own nursery media"
ON public.media_children FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.media m
    WHERE m.id = media_children.media_id
      AND m.nursery_id IN (SELECT nursery_id FROM public.users WHERE id = auth.uid())
      AND m.uploaded_by = auth.uid()
  )
);

CREATE POLICY "Admins and teachers can view media_visibility"
ON public.media_visibility FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.media m
    WHERE m.id = media_visibility.media_id
      AND m.nursery_id IN (SELECT nursery_id FROM public.users WHERE id = auth.uid())
  )
);

CREATE POLICY "Teachers can insert media_visibility for own uploads"
ON public.media_visibility FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.media m
    WHERE m.id = media_visibility.media_id
      AND m.uploaded_by = auth.uid()
  )
);

-- 4) Indexes
CREATE INDEX IF NOT EXISTS idx_media_nursery_id ON public.media(nursery_id);
CREATE INDEX IF NOT EXISTS idx_media_uploaded_by ON public.media(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_media_status ON public.media(status);
CREATE INDEX IF NOT EXISTS idx_media_class_id ON public.media(class_id);
CREATE INDEX IF NOT EXISTS idx_media_uploaded_at ON public.media(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_media_children_media_id ON public.media_children(media_id);
CREATE INDEX IF NOT EXISTS idx_media_children_child_id ON public.media_children(child_id);
CREATE INDEX IF NOT EXISTS idx_media_visibility_media_id ON public.media_visibility(media_id);
CREATE INDEX IF NOT EXISTS idx_media_visibility_parent_id ON public.media_visibility(parent_id);

-- 5) Storage bucket + policies
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  false,
  104857600,
  ARRAY['image/jpeg', 'image/png', 'image/heic', 'video/mp4', 'video/quicktime']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Teachers can upload media objects in nursery path"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'media'
  AND split_part(name, '/', 1) IN (
    SELECT nursery_id::text FROM public.users WHERE id = auth.uid()
  )
);

CREATE POLICY "Admins can view nursery media objects"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'media'
  AND split_part(name, '/', 1) IN (
    SELECT nursery_id::text
    FROM public.users
    WHERE id = auth.uid() AND role IN ('branch_admin', 'chain_super_admin', 'xo_super_admin')
  )
);

CREATE POLICY "Teachers can view own nursery media objects"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'media'
  AND split_part(name, '/', 1) IN (
    SELECT nursery_id::text FROM public.users WHERE id = auth.uid()
  )
);

-- Parents access media via signed URLs generated by app/backend rules.

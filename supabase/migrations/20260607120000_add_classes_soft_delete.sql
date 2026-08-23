-- Migration: Add soft-delete column to classes
-- Date: 2026-06-07
-- Mirrors the nurseries.deleted_at soft-delete pattern.

ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.classes.deleted_at IS 'Soft delete timestamp - class marked for deletion';

CREATE INDEX IF NOT EXISTS idx_classes_deleted ON public.classes(deleted_at) WHERE deleted_at IS NOT NULL;

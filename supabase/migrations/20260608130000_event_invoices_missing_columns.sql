-- =============================================================================
-- Fix: parent event details page 400s on `event_invoices` because the table is
-- missing columns the app uses. event_invoices was created (014) with only
-- (event_id, invoice_id, child_id), but the code reads/writes permission_id,
-- parent_id, and nursery_id (src/lib/eventInvoices.ts, useParentEventDetails,
-- etc.). The SELECT `permission_id, invoice_id ... parent_id=eq ...` then fails
-- with "column event_invoices.permission_id does not exist" and the parent
-- event page shows "Could not load this event."
-- Add the missing columns (idempotent, non-destructive).
-- =============================================================================

ALTER TABLE public.event_invoices
  ADD COLUMN IF NOT EXISTS permission_id uuid REFERENCES public.permissions (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nursery_id uuid REFERENCES public.nurseries (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_event_invoices_permission_id ON public.event_invoices (permission_id);
CREATE INDEX IF NOT EXISTS idx_event_invoices_parent_id ON public.event_invoices (parent_id);

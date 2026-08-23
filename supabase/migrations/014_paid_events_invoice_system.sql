-- Migration 014: Paid Events Invoice System
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS invoice_type TEXT CHECK (invoice_type IN ('monthly', 'event', 'extra_hours', 'other')) DEFAULT 'other';

CREATE TABLE IF NOT EXISTS public.event_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, invoice_id, child_id)
);

ALTER TABLE public.event_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view event invoices for their nursery"
ON public.event_invoices FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_invoices.event_id
    AND e.nursery_id IN (SELECT nursery_id FROM public.users WHERE id = auth.uid())
  )
);

CREATE POLICY "Admin can create event invoices for their nursery"
ON public.event_invoices FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_invoices.event_id
    AND e.nursery_id IN (SELECT nursery_id FROM public.users WHERE id = auth.uid())
  )
);

CREATE INDEX IF NOT EXISTS idx_event_invoices_event_id ON public.event_invoices(event_id);
CREATE INDEX IF NOT EXISTS idx_event_invoices_invoice_id ON public.event_invoices(invoice_id);
CREATE INDEX IF NOT EXISTS idx_event_invoices_child_id ON public.event_invoices(child_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_type ON public.invoices(invoice_type);

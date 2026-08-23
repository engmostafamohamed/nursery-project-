-- Migration 018: invoice reminder tracking
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_invoices_last_reminder_sent_at
ON public.invoices(last_reminder_sent_at);

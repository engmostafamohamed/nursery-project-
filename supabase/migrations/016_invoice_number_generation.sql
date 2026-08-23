-- Migration 016: Add generated invoice numbers
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS generated_invoice_number TEXT;

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  invoice_prefix TEXT;
  next_sequence INTEGER;
BEGIN
  IF NEW.generated_invoice_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  invoice_prefix := 'INV-' || to_char(COALESCE(NEW.created_at, now()), 'YYYY-MM') || '-';

  SELECT COALESCE(
    MAX(
      NULLIF(
        regexp_replace(generated_invoice_number, '^INV-\d{4}-\d{2}-', ''),
        ''
      )::INTEGER
    ),
    0
  ) + 1
  INTO next_sequence
  FROM public.invoices
  WHERE generated_invoice_number LIKE invoice_prefix || '%';

  NEW.generated_invoice_number := invoice_prefix || lpad(next_sequence::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_generate_invoice_number ON public.invoices;
CREATE TRIGGER trigger_generate_invoice_number
BEFORE INSERT ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.generate_invoice_number();

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_generated_invoice_number
ON public.invoices(generated_invoice_number)
WHERE generated_invoice_number IS NOT NULL;

-- Supports automatic (no-checkout-required) late-pickup billing. extra_fee previously only
-- ever lived inside qr_scan_log jsonb (never billed); promoting it to a real column plus a
-- provisional/final status lets a scheduled sweep and the real checkout event safely share
-- the same attendance-day charge without ever double-billing or double-consuming package hours.

begin;

alter table public.attendance_records
  add column if not exists extra_fee numeric(10,2),
  add column if not exists late_charge_status text not null default 'none'
    check (late_charge_status in ('none', 'provisional', 'final')),
  add column if not exists late_charge_source text check (late_charge_source in ('sweep', 'checkout')),
  add column if not exists late_charge_applied_at timestamptz,
  add column if not exists late_charge_invoice_id uuid references public.invoices(id) on delete set null,
  -- True once the sweep has already hit the 3-hour auto-charge cap for this day and alerted
  -- staff — stops it from re-alerting every 15 minutes for the same unresolved checkout.
  add column if not exists late_charge_capped boolean not null default false;

alter table public.nursery_settings
  add column if not exists auto_late_pickup_billing_enabled boolean default true,
  add column if not exists auto_tuition_billing_enabled boolean default true;

commit;

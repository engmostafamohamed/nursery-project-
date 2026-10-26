-- Indexes for foreign keys that deleting an account or an invoice has to follow.
--
-- Without an index, deleting one row makes Postgres scan the whole referencing table to clear or
-- delete what points to it: removing a family's account (and with it their invoices) scanned every
-- attendance record and every daily report, once per invoice and once per account. These tables grow
-- every school day, so the cost grows with them.
--
-- Partial where the column is mostly empty: only the rows that point somewhere need indexing, and a
-- lookup by value (column = id) never needs the empty ones.

-- attendance_records.late_charge_invoice_id → invoices (on delete set null): set on late pick-ups only.
create index if not exists idx_attendance_records_late_charge_invoice
  on public.attendance_records (late_charge_invoice_id)
  where late_charge_invoice_id is not null;

-- daily_reports.submitted_by / last_saved_by → users (on delete set null). submitted_by is also how
-- the report history finds the reports a teacher sent.
create index if not exists idx_daily_reports_submitted_by
  on public.daily_reports (submitted_by)
  where submitted_by is not null;

create index if not exists idx_daily_reports_last_saved_by
  on public.daily_reports (last_saved_by)
  where last_saved_by is not null;

-- child_tuition_subscriptions → invoices (on delete set null) and → users (the billed parent, on delete cascade).
create index if not exists idx_child_tuition_subscriptions_last_invoice
  on public.child_tuition_subscriptions (last_invoice_id)
  where last_invoice_id is not null;

create index if not exists idx_child_tuition_subscriptions_billed_parent
  on public.child_tuition_subscriptions (billed_parent_id);

-- attendance_absence_reports.reported_by → users (on delete set null): the parent who reported the absence.
create index if not exists idx_attendance_absence_reports_reported_by
  on public.attendance_absence_reports (reported_by)
  where reported_by is not null;

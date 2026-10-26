-- Database test · Deleting an account or an invoice follows its foreign keys through indexes, not
-- through a scan of every attendance record and daily report (one scan per deleted row).
-- Everything runs in one transaction that is rolled back.
--
-- Run against the local database:   supabase test db
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

-- The single-column foreign keys of a table that no index starts with.
create temp table fk_without_index on commit drop as
select c.conrelid::regclass::text as tbl, a.attname::text as col
from pg_constraint c
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
where c.contype = 'f'
  and cardinality(c.conkey) = 1
  and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]);

select ok(
  not exists (select 1 from fk_without_index where tbl = 'attendance_records' and col = 'late_charge_invoice_id'),
  'an invoice''s late pick-up charges are found by index'
);
select ok(
  not exists (select 1 from fk_without_index where tbl = 'daily_reports' and col = 'submitted_by'),
  'the daily reports a teacher sent are found by index'
);
select ok(
  not exists (select 1 from fk_without_index where tbl = 'daily_reports' and col = 'last_saved_by'),
  'the daily reports a teacher last saved are found by index'
);
select ok(
  not exists (select 1 from fk_without_index where tbl = 'child_tuition_subscriptions' and col = 'last_invoice_id'),
  'the subscription an invoice billed is found by index'
);
select ok(
  not exists (select 1 from fk_without_index where tbl = 'child_tuition_subscriptions' and col = 'billed_parent_id'),
  'the subscriptions a parent pays are found by index'
);
select ok(
  not exists (select 1 from fk_without_index where tbl = 'attendance_absence_reports' and col = 'reported_by'),
  'the absences a parent reported are found by index'
);

-- The partial indexes (rows that point somewhere) still serve the lookup a delete makes: column = id.
create function pg_temp.plan_of(p_sql text) returns text
language plpgsql
as $$
declare
  v_line text;
  v_plan text := '';
begin
  for v_line in execute 'explain (costs off) ' || p_sql loop
    v_plan := v_plan || v_line || ' ';
  end loop;
  return v_plan;
end;
$$;

-- So few rows here that a scan would win anyway: rule scans out to see which index the lookup can use.
set local enable_seqscan = off;

select matches(
  pg_temp.plan_of($q$select 1 from public.attendance_records where late_charge_invoice_id = '00000000-0000-4000-8000-000000000001'$q$),
  'idx_attendance_records_late_charge_invoice',
  'clearing a deleted invoice from attendance uses the partial index'
);
select matches(
  pg_temp.plan_of($q$select 1 from public.daily_reports where submitted_by = '00000000-0000-4000-8000-000000000001'$q$),
  'idx_daily_reports_submitted_by',
  'clearing a deleted teacher from the reports they sent uses the partial index'
);

select * from finish();
rollback;

-- The family is told when the nursery sends a term report or bills a course month.
--
-- Both reached the family silently: an admin sending a child's term report (quarterly_reports.status
-- 'sent') or billing a course month (a course_invoices row) told no one, so the family found them
-- only by opening the screen. Now each of the child's parents gets a notice that opens it:
--  * quarterly_report_sent {child, term} -> /parent/quarterly-reports?report=<id>, once, when the
--    report is first sent;
--  * course_invoice_new {child, course, month, amount, currency, due_date} -> /parent/courses?tab=invoices,
--    for each new bill (not for a waived or already paid one).

create or replace function public.quarterly_report_tell_family()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child public.children;
begin
  if new.status <> 'sent' or (tg_op = 'UPDATE' and old.status = 'sent') then
    return new;
  end if;
  select * into v_child from public.children where id = new.child_id;
  perform public.notify_users(
    array(select pc.parent_id from public.parent_children pc where pc.child_id = new.child_id),
    new.nursery_id, 'quarterly_report_sent', 'quarterly_report_sent',
    jsonb_build_object('child', jsonb_build_object('ar', v_child.full_name_ar, 'en', v_child.full_name_en), 'term', new.term_label),
    '/parent/quarterly-reports?report=' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists trg_quarterly_report_tell_family on public.quarterly_reports;
create trigger trg_quarterly_report_tell_family
  after insert or update of status on public.quarterly_reports
  for each row execute function public.quarterly_report_tell_family();

create or replace function public.course_invoice_tell_family()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child public.children;
  v_course public.courses;
begin
  if new.status not in ('pending', 'overdue') then
    return new;
  end if;
  select * into v_child from public.children where id = new.child_id;
  select * into v_course from public.courses where id = new.course_id;
  perform public.notify_users(
    array(select pc.parent_id from public.parent_children pc where pc.child_id = new.child_id),
    new.nursery_id, 'course_invoice_new', 'course_invoice_new',
    jsonb_build_object(
      'child', jsonb_build_object('ar', v_child.full_name_ar, 'en', v_child.full_name_en),
      'course', jsonb_build_object('ar', v_course.title_ar, 'en', v_course.title_en),
      'month', to_char(new.billing_month, 'YYYY-MM'),
      'amount', new.amount,
      'currency', coalesce(new.currency, 'EGP'),
      'due_date', new.due_date
    ),
    '/parent/courses?tab=invoices'
  );
  return new;
end;
$$;

drop trigger if exists trg_course_invoice_tell_family on public.course_invoices;
create trigger trg_course_invoice_tell_family
  after insert on public.course_invoices
  for each row execute function public.course_invoice_tell_family();

revoke all on function public.quarterly_report_tell_family() from public, anon, authenticated;
revoke all on function public.course_invoice_tell_family() from public, anon, authenticated;

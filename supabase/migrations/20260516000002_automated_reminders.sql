-- Automated reminders (Deliverable 4a + 4b):
--  4a: fixed monthly reminders for teachers (start of each month)
--  4b: date-triggered reminders for pending event permissions and unpaid invoices
--
-- Implemented as pg_cron jobs calling SECURITY DEFINER SQL functions that insert
-- in-app notification rows directly. No outbound HTTP / secrets required; the
-- existing multi-channel edge functions remain for the manual admin path.

create extension if not exists pg_cron;

-- ── per-nursery enable/disable toggles ──────────────────────────────────────
alter table public.nursery_settings
  add column if not exists auto_payment_reminders_enabled boolean default true,
  add column if not exists auto_permission_reminders_enabled boolean default true,
  add column if not exists auto_monthly_teacher_reminders_enabled boolean default true;

-- ── idempotency marker on permissions (invoices already has one) ────────────
alter table public.permissions
  add column if not exists last_reminder_sent_at timestamptz;

-- ── 4a: teacher monthly reminder templates ──────────────────────────────────
create table if not exists public.teacher_monthly_reminder_templates (
  id          uuid primary key default gen_random_uuid(),
  nursery_id  uuid not null references public.nurseries(id) on delete cascade,
  teacher_id  uuid not null references public.users(id) on delete cascade,
  title_ar    text not null default '',
  title_en    text not null default '',
  body_ar     text not null default '',
  body_en     text not null default '',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_tmr_templates_nursery on public.teacher_monthly_reminder_templates (nursery_id);
create index if not exists idx_tmr_templates_teacher on public.teacher_monthly_reminder_templates (teacher_id);

alter table public.teacher_monthly_reminder_templates enable row level security;

drop policy if exists tmr_templates_branch_all on public.teacher_monthly_reminder_templates;
create policy tmr_templates_branch_all
  on public.teacher_monthly_reminder_templates for all to authenticated
  using (
    public.current_user_role() = 'branch_admin'
    and nursery_id = public.current_user_nursery_id()
  )
  with check (
    public.current_user_role() = 'branch_admin'
    and nursery_id = public.current_user_nursery_id()
  );

drop policy if exists tmr_templates_chain_all on public.teacher_monthly_reminder_templates;
create policy tmr_templates_chain_all
  on public.teacher_monthly_reminder_templates for all to authenticated
  using (
    public.current_user_role() = 'chain_super_admin'
    and nursery_id = public.current_user_nursery_id()
  )
  with check (
    public.current_user_role() = 'chain_super_admin'
    and nursery_id = public.current_user_nursery_id()
  );

drop policy if exists tmr_templates_xo_all on public.teacher_monthly_reminder_templates;
create policy tmr_templates_xo_all
  on public.teacher_monthly_reminder_templates for all to authenticated
  using (public.is_xo_super_admin())
  with check (public.is_xo_super_admin());

drop policy if exists tmr_templates_teacher_select on public.teacher_monthly_reminder_templates;
create policy tmr_templates_teacher_select
  on public.teacher_monthly_reminder_templates for select to authenticated
  using (teacher_id = auth.uid());

drop trigger if exists trg_tmr_templates_updated_at on public.teacher_monthly_reminder_templates;
create trigger trg_tmr_templates_updated_at
  before update on public.teacher_monthly_reminder_templates
  for each row execute function public.set_updated_at();

-- ── 4a runner: one notification per active template ─────────────────────────
create or replace function public.run_monthly_teacher_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer := 0;
begin
  with sent as (
    insert into public.notifications
      (nursery_id, user_id, type, title_ar, title_en, body_ar, body_en, read, channel, sent_at)
    select
      tpl.nursery_id,
      tpl.teacher_id,
      'teacher_monthly_reminder',
      coalesce(nullif(tpl.title_ar, ''), 'تذكير شهري'),
      coalesce(nullif(tpl.title_en, ''), 'Monthly reminder'),
      coalesce(nullif(tpl.body_ar, ''), 'تذكير بداية الشهر.'),
      coalesce(nullif(tpl.body_en, ''), 'Start-of-month reminder.'),
      false, 'in_app', now()
    from public.teacher_monthly_reminder_templates tpl
    join public.nursery_settings ns on ns.nursery_id = tpl.nursery_id
    where tpl.active
      and coalesce(ns.auto_monthly_teacher_reminders_enabled, true)
    returning 1
  )
  select count(*) into inserted from sent;
  return inserted;
end;
$$;

-- ── 4b runner: pending event permissions with a deadline in the next 48h ────
create or replace function public.run_permission_deadline_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer := 0;
begin
  with due as (
    select p.id as permission_id, p.child_id, e.nursery_id,
           e.title_ar as ev_ar, e.title_en as ev_en
    from public.permissions p
    join public.events e on e.id = p.event_id
    join public.nursery_settings ns on ns.nursery_id = e.nursery_id
    where p.status = 'pending'
      and p.deadline is not null
      and p.deadline > now()
      and p.deadline <= now() + interval '48 hours'
      and coalesce(ns.auto_permission_reminders_enabled, true)
      and (p.last_reminder_sent_at is null
           or p.last_reminder_sent_at < date_trunc('day', now()))
  ),
  sent as (
    insert into public.notifications
      (nursery_id, user_id, type, title_ar, title_en, body_ar, body_en, read, channel, sent_at, action_link)
    select
      d.nursery_id, pc.parent_id, 'permission_deadline_reminder',
      'تذكير موافقة',
      'Permission reminder',
      'تذكير: مطلوب الرد على موافقة فعالية "' || d.ev_ar || '" قبل انتهاء الموعد.',
      'Reminder: A permission response for "' || d.ev_en || '" is due soon.',
      false, 'in_app', now(), '/parent/events'
    from due d
    join public.parent_children pc on pc.child_id = d.child_id
    returning 1
  )
  select count(*) into inserted from sent;

  update public.permissions p
     set last_reminder_sent_at = now()
   from public.events e
   join public.nursery_settings ns on ns.nursery_id = e.nursery_id
  where p.event_id = e.id
    and p.status = 'pending'
    and p.deadline is not null
    and p.deadline > now()
    and p.deadline <= now() + interval '48 hours'
    and coalesce(ns.auto_permission_reminders_enabled, true)
    and (p.last_reminder_sent_at is null
         or p.last_reminder_sent_at < date_trunc('day', now()));

  return inserted;
end;
$$;

-- ── 4b runner: unpaid invoices on a reminder cadence ────────────────────────
-- Fires at 7/3/1 days before due and 1/3/7 days overdue. Skips invoices tied to
-- a paid event whose permission for that child is denied.
create or replace function public.run_payment_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer := 0;
begin
  with due as (
    select i.id as invoice_id, i.nursery_id, i.parent_id, i.amount,
           (i.due_date::date - current_date) as days_until
    from public.invoices i
    join public.nursery_settings ns on ns.nursery_id = i.nursery_id
    where i.status = 'pending'
      and coalesce(ns.auto_payment_reminders_enabled, true)
      and (i.due_date::date - current_date) in (7, 3, 1, -1, -3, -7)
      and (i.last_reminder_sent_at is null
           or i.last_reminder_sent_at < date_trunc('day', now()))
      and not exists (
        select 1
        from public.event_invoices ei
        join public.permissions p
          on p.event_id = ei.event_id and p.child_id = ei.child_id
        where ei.invoice_id = i.id
          and p.status = 'denied'
      )
  ),
  sent as (
    insert into public.notifications
      (nursery_id, user_id, type, title_ar, title_en, body_ar, body_en, read, channel, sent_at, action_link)
    select
      d.nursery_id, d.parent_id,
      case when d.days_until > 0 then 'invoice_due_reminder' else 'invoice_overdue_reminder' end,
      case when d.days_until > 0 then 'تذكير فاتورة' else 'فاتورة متأخرة' end,
      case when d.days_until > 0 then 'Invoice reminder' else 'Overdue invoice' end,
      case when d.days_until > 0
           then 'تذكير: فاتورة بقيمة ' || d.amount || ' جنيه تستحق خلال ' || d.days_until || ' يوم.'
           else 'فاتورة بقيمة ' || d.amount || ' جنيه متأخرة ' || abs(d.days_until) || ' يوم. يرجى السداد.'
      end,
      case when d.days_until > 0
           then 'Reminder: An invoice of EGP ' || d.amount || ' is due in ' || d.days_until || ' day(s).'
           else 'An invoice of EGP ' || d.amount || ' is ' || abs(d.days_until) || ' day(s) overdue. Please pay.'
      end,
      false, 'in_app', now(), '/parent/invoices'
    from due d
    returning 1
  )
  select count(*) into inserted from sent;

  update public.invoices i
     set last_reminder_sent_at = now()
   from public.nursery_settings ns
  where ns.nursery_id = i.nursery_id
    and i.status = 'pending'
    and coalesce(ns.auto_payment_reminders_enabled, true)
    and (i.due_date::date - current_date) in (7, 3, 1, -1, -3, -7)
    and (i.last_reminder_sent_at is null
         or i.last_reminder_sent_at < date_trunc('day', now()))
    and not exists (
      select 1
      from public.event_invoices ei
      join public.permissions p
        on p.event_id = ei.event_id and p.child_id = ei.child_id
      where ei.invoice_id = i.id
        and p.status = 'denied'
    );

  return inserted;
end;
$$;

-- ── schedule (idempotent: unschedule-if-exists then schedule) ───────────────
do $$
begin
  perform cron.unschedule('payment-reminders-daily');
exception when others then null;
end $$;
do $$
begin
  perform cron.unschedule('permission-deadline-reminders-daily');
exception when others then null;
end $$;
do $$
begin
  perform cron.unschedule('teacher-monthly-reminders');
exception when others then null;
end $$;

select cron.schedule('payment-reminders-daily', '0 9 * * *',
  $$select public.run_payment_reminders()$$);
select cron.schedule('permission-deadline-reminders-daily', '0 10 * * *',
  $$select public.run_permission_deadline_reminders()$$);
select cron.schedule('teacher-monthly-reminders', '0 8 1 * *',
  $$select public.run_monthly_teacher_reminders()$$);

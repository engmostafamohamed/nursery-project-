-- Events: the flow on the server.
--
-- Until now the browser did each step of an event's life itself, and some never happened:
-- * A parent approving a paid event created its invoice from the parent's own session, which the
--   invoices table refuses (parents only read invoices). The failure was hidden, so no paid event
--   was ever billed.
-- * Publishing created the permission rows twice (the trigger and the page) and the "all" and
--   "class" ones never got their deadline; the families were told from the admin's browser.
-- * Cancelling only changed the status: the families were not told, unpaid invoices stayed open,
--   and nobody was asked to refund the paid ones.
-- * A parent could answer after the deadline and change any permission row of their child.
-- * The nursery's "event cancellation window" setting was not used anywhere.
--
-- Now each step is one function:
-- 1. event_publish: opens the event (the trigger asks the children), gives each permission the
--    event's deadline, and tells each family once.
-- 2. event_respond: a parent's yes or no, before the deadline and while the event is open. A yes
--    to a paid event bills the parent who answered (once per child); a later no cancels an unpaid
--    invoice. Taking a yes back closes event_cancellation_window_hours before the start.
-- 3. event_cancel: with a reason the families read; unpaid invoices are cancelled, and the admins
--    are told how many families already paid, with the nursery's refund policy.
-- 4. event_delete: a soft delete (the owner's rule: nothing is removed). Only a draft or a cancelled
--    event; the row and everything pointing at it stay, and no screen shows it again. The app may
--    no longer DELETE events (a deleted open event used to leave its permission rows without an
--    event and its invoices without their link).
-- 5. The deadline reminders went to families of drafts and cancelled events too, by the row's
--    deadline; now only for open events still to come, by the event's deadline (as event_respond).
-- 6. event_sync_children: who is asked, set on the server. Un-picking a child withdrew (deleted) the
--    request; now it is marked withdrawn (soft), picked again it comes back, and on an open event
--    the families of children added or withdrawn are told (before, nobody was).
-- 7. event_bill_approved: approvals without an invoice (all of them, while billing failed) are
--    billed once each, never due in the past. A paid yes taken back now reaches the admins.
-- 8. Moving an open event (day, time or place) tells the families asked.
-- Parents now read their permission rows (only of published events that are not deleted; a draft
-- for chosen children showed in their list before) and answer only through event_respond.

-- -----------------------------------------------------------------------------------------------
-- A deleted event keeps its row: when and by whom it was deleted.
alter table public.events
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users (id) on delete set null;
comment on column public.events.deleted_at is 'Soft delete: the event is hidden from every screen; its records stay.';
create index if not exists idx_events_deleted on public.events (deleted_at) where deleted_at is not null;

-- A request withdrawn from a family keeps its row too.
alter table public.permissions
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users (id) on delete set null;
comment on column public.permissions.deleted_at is 'Soft delete: the request was withdrawn; nobody sees it; the row stays.';
create index if not exists idx_permissions_deleted on public.permissions (deleted_at) where deleted_at is not null;

-- -----------------------------------------------------------------------------------------------
-- Who manages a nursery's events: the same people the events table lets write.
create or replace function public.event_can_manage(p_nursery_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_xo_super_admin()
    or (public.current_user_role() in ('branch_admin', 'manager') and p_nursery_id = public.current_user_nursery_id())
    or (public.current_user_role() = 'chain_super_admin' and p_nursery_id in (select public.nursery_ids_for_chain_admin())),
    false
  )
$$;

-- -----------------------------------------------------------------------------------------------
-- 1. Publishing

-- Opens a draft for the families: the children are asked (the whole nursery or a class through
-- create_event_permissions; chosen children were added while it was a draft), each permission
-- gets the event's deadline, and each family is told once. Publishing an open event again does
-- nothing new.
create or replace function public.event_publish(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_notified integer := 0;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found or not public.event_can_manage(v_event.nursery_id) then
    raise exception 'event_forbidden' using errcode = '42501';
  end if;
  if v_event.cancelled_at is not null or v_event.deleted_at is not null or v_event.status in ('cancelled', 'completed') then
    raise exception 'event_closed' using errcode = '22023';
  end if;
  if v_event.starts_at <= now() then
    raise exception 'event_started' using errcode = '22023';
  end if;

  if coalesce(v_event.status, 'draft') <> 'active' then
    update public.events set status = 'active' where id = p_event_id;
    update public.permissions
       set deadline = v_event.permission_deadline
     where event_id = p_event_id and deleted_at is null and deadline is null and v_event.permission_deadline is not null;
    v_notified := public.notify_users(
      array(select distinct pc.parent_id from public.permissions p join public.parent_children pc on pc.child_id = p.child_id
             where p.event_id = p_event_id and p.deleted_at is null),
      v_event.nursery_id, 'event_published', 'event_published',
      jsonb_build_object('event', public.i18n_names(v_event.title_ar, v_event.title_en)),
      '/parent/events/' || p_event_id, 'normal'
    );
  end if;

  return jsonb_build_object(
    'status', 'active',
    'children', (select count(*) from public.permissions where event_id = p_event_id and deleted_at is null),
    'notified', v_notified
  );
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- 2. A family's answer, and the invoice of a paid event

-- The child's invoice for a paid event: the open (or paid) one already there, else a new one to the
-- parent who said yes, due on the event day or after the nursery's usual days, whichever is first
-- (and never before today, for an approval billed after the event).
create or replace function public.event_bill_child(p_event public.events, p_permission public.permissions, p_parent_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_ns public.nursery_settings%rowtype;
  v_today date;
begin
  select i.* into v_invoice
    from public.event_invoices ei join public.invoices i on i.id = ei.invoice_id
   where ei.event_id = p_event.id and ei.child_id = p_permission.child_id and i.status <> 'cancelled'
   order by i.created_at desc
   limit 1;
  if found then
    return v_invoice;
  end if;

  select * into v_ns from public.nursery_settings where nursery_id = p_event.nursery_id;
  v_today := (now() at time zone coalesce(v_ns.timezone, 'Africa/Cairo'))::date;
  insert into public.invoices (parent_id, nursery_id, amount, due_date, status, invoice_type, line_items_json)
  values (
    p_parent_id, p_event.nursery_id, p_event.price,
    greatest(v_today, least((p_event.starts_at at time zone coalesce(v_ns.timezone, 'Africa/Cairo'))::date, v_today + coalesce(v_ns.invoice_due_days, 7))),
    'pending', 'event',
    jsonb_build_object(
      'child_id', p_permission.child_id,
      'event_id', p_event.id,
      'items', jsonb_build_array(jsonb_build_object(
        'kind', 'event',
        'name_ar', nullif(btrim(p_event.title_ar), ''),
        'name_en', nullif(btrim(p_event.title_en), ''),
        'description', coalesce(nullif(btrim(p_event.title_en), ''), btrim(p_event.title_ar)),
        'amount', p_event.price
      ))
    )
  )
  returning * into v_invoice;

  insert into public.event_invoices (event_id, permission_id, invoice_id, parent_id, child_id, nursery_id)
  values (p_event.id, p_permission.id, v_invoice.id, p_parent_id, p_permission.child_id, p_event.nursery_id);

  perform public.notify_users(
    array[p_parent_id], p_event.nursery_id, 'event_invoice_generated', 'event_invoice_generated',
    jsonb_build_object('event', public.i18n_names(p_event.title_ar, p_event.title_en), 'amount', p_event.price, 'currency', coalesce(v_ns.currency, 'EGP')),
    '/parent/invoices/' || v_invoice.id, 'normal'
  );
  return v_invoice;
end;
$$;

-- A parent's yes or no for their child, while the event is open and before its deadline. Taking a
-- yes back closes the nursery's cancellation window before the start. Returns the answer and, for a
-- yes to a paid event, its invoice.
create or replace function public.event_respond(p_permission_id uuid, p_granted boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_permission public.permissions%rowtype;
  v_event public.events%rowtype;
  v_deadline timestamptz;
  v_window integer;
  v_invoice public.invoices%rowtype;
  v_was_granted boolean;
begin
  select * into v_permission from public.permissions where id = p_permission_id for update;
  if not found or public.current_user_role() is distinct from 'parent' or not public.parent_can_access_child(v_permission.child_id) then
    raise exception 'event_forbidden' using errcode = '42501';
  end if;
  if p_granted is null then
    raise exception 'event_answer_required' using errcode = '22023';
  end if;
  if v_permission.deleted_at is not null then
    raise exception 'event_closed' using errcode = '22023';
  end if;
  v_was_granted := v_permission.status = 'granted';
  select * into v_event from public.events where id = v_permission.event_id;
  if not found or coalesce(v_event.status, '') <> 'active' or v_event.cancelled_at is not null or v_event.deleted_at is not null or v_event.starts_at <= now() then
    raise exception 'event_closed' using errcode = '22023';
  end if;
  -- The event's deadline counts (the admin may move it); a row's own one only when the event has none.
  v_deadline := coalesce(v_event.permission_deadline, v_permission.deadline);
  if v_deadline is not null and now() > v_deadline then
    raise exception 'event_deadline_passed' using errcode = '22023';
  end if;
  if v_permission.status = 'granted' and not p_granted then
    v_window := (select ns.event_cancellation_window_hours from public.nursery_settings ns where ns.nursery_id = v_event.nursery_id);
    if coalesce(v_window, 0) > 0 and now() > v_event.starts_at - make_interval(hours => v_window) then
      raise exception 'event_withdraw_closed' using errcode = '22023';
    end if;
  end if;

  update public.permissions
     set status = case when p_granted then 'granted' else 'denied' end,
         responded_at = now(),
         parent_note = case when p_granted then null else nullif(left(btrim(coalesce(p_note, '')), 200), '') end
   where id = p_permission_id
   returning * into v_permission;

  if p_granted and v_event.is_paid and coalesce(v_event.price, 0) > 0 then
    v_invoice := public.event_bill_child(v_event, v_permission, auth.uid());
  elsif not p_granted then
    -- A no after a yes: the invoice not paid yet is cancelled (a paid one is left for a refund).
    update public.invoices i
       set status = 'cancelled'
      from public.event_invoices ei
     where ei.invoice_id = i.id and ei.event_id = v_event.id and ei.child_id = v_permission.child_id
       and i.status in ('pending', 'overdue');
    -- A paid one waits for a refund: the admins are told, with the nursery's policy.
    if v_was_granted and exists (
      select 1 from public.event_invoices ei join public.invoices i on i.id = ei.invoice_id
       where ei.event_id = v_event.id and ei.child_id = v_permission.child_id and i.status = 'paid'
    ) then
      perform public.attendance_notify_staff(
        v_event.nursery_id, array['branch_admin', 'manager']::public.user_role[], 'event_withdrawn_paid', 'event_withdrawn_paid',
        jsonb_build_object(
          'event', public.i18n_names(v_event.title_ar, v_event.title_en),
          'child', (select public.i18n_names(c.full_name_ar, c.full_name_en) from public.children c where c.id = v_permission.child_id),
          'segments', jsonb_build_array(coalesce((select ns.paid_event_refund_policy from public.nursery_settings ns where ns.nursery_id = v_event.nursery_id), 'none'))
        ),
        '/admin/events/' || v_event.id, 'high'
      );
    end if;
  end if;

  return jsonb_build_object(
    'status', v_permission.status,
    'invoice', case when v_invoice.id is not null
                    then jsonb_build_object('id', v_invoice.id, 'amount', v_invoice.amount, 'status', v_invoice.status) end
  );
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- 3. Cancelling

-- Cancels an event with a reason the families read. The families of the children asked (not the
-- ones who said no) are told; the invoices not paid yet are cancelled; when some families already
-- paid, the admins are told how many, with the nursery's refund policy.
create or replace function public.event_cancel(p_event_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_policy text;
  v_tz text;
  v_cancelled integer;
  v_paid integer;
  v_notified integer;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found or not public.event_can_manage(v_event.nursery_id) then
    raise exception 'event_forbidden' using errcode = '42501';
  end if;
  if v_event.cancelled_at is not null or v_event.deleted_at is not null or v_event.status in ('cancelled', 'completed') then
    raise exception 'event_closed' using errcode = '22023';
  end if;
  if v_reason = '' then
    raise exception 'event_cancel_reason_required' using errcode = '22023';
  end if;
  if char_length(v_reason) > 300 then
    raise exception 'event_cancel_reason_too_long' using errcode = '22023';
  end if;
  select coalesce(ns.paid_event_refund_policy, 'none'), coalesce(ns.timezone, 'Africa/Cairo') into v_policy, v_tz
    from public.nursery_settings ns where ns.nursery_id = v_event.nursery_id;

  update public.events set status = 'cancelled', cancelled_at = now() where id = p_event_id;

  update public.invoices i
     set status = 'cancelled'
    from public.event_invoices ei
   where ei.invoice_id = i.id and ei.event_id = p_event_id and i.status in ('pending', 'overdue');
  get diagnostics v_cancelled = row_count;
  select count(*) into v_paid
    from public.event_invoices ei join public.invoices i on i.id = ei.invoice_id
   where ei.event_id = p_event_id and i.status = 'paid';

  v_notified := public.notify_users(
    array(select distinct pc.parent_id from public.permissions p join public.parent_children pc on pc.child_id = p.child_id
           where p.event_id = p_event_id and p.deleted_at is null and p.status in ('pending', 'granted')),
    v_event.nursery_id, 'event_cancelled', 'event_cancelled',
    jsonb_build_object('event', public.i18n_names(v_event.title_ar, v_event.title_en),
                       'date', (v_event.starts_at at time zone coalesce(v_tz, 'Africa/Cairo'))::date,
                       'reason', v_reason),
    '/parent/events', 'high'
  );
  if v_paid > 0 then
    perform public.attendance_notify_staff(
      v_event.nursery_id, array['branch_admin', 'manager']::public.user_role[], 'event_refund_due', 'event_refund_due',
      jsonb_build_object('event', public.i18n_names(v_event.title_ar, v_event.title_en), 'count', v_paid,
                         'segments', jsonb_build_array(coalesce(v_policy, 'none'))),
      '/admin/events/' || p_event_id, 'high'
    );
  end if;

  return jsonb_build_object('notified', v_notified, 'invoices_cancelled', v_cancelled, 'paid_invoices', v_paid, 'refund_policy', coalesce(v_policy, 'none'));
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- 4. Deleting: a soft delete. A draft (never sent) or a cancelled event (the families were told) can
-- go; an open event is cancelled first, a completed one stays. Deleting again changes nothing.
create or replace function public.event_delete(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found or not public.event_can_manage(v_event.nursery_id) then
    raise exception 'event_forbidden' using errcode = '42501';
  end if;
  if v_event.deleted_at is not null then
    return;
  end if;
  if coalesce(v_event.status, 'draft') not in ('draft', 'cancelled') and v_event.cancelled_at is null then
    raise exception 'event_delete_not_allowed' using errcode = '22023';
  end if;
  update public.events set deleted_at = now(), deleted_by = auth.uid() where id = p_event_id;
end;
$$;

-- No signed-in user reads a deleted event, and nobody in the app removes one. (A nursery's removal
-- still cascades: referential actions run as the table's owner.)
drop policy if exists events_not_deleted on public.events;
create policy events_not_deleted on public.events
  as restrictive
  for select to authenticated
  using (deleted_at is null);
revoke delete on public.events from anon, authenticated;

-- Whether the families may see an event's permission rows: not while it is a draft, nor once it
-- is deleted.
create or replace function public.event_shown_to_families(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_event_id is null
      or exists (select 1 from public.events e where e.id = p_event_id and e.status is distinct from 'draft' and e.deleted_at is null)
$$;

-- -----------------------------------------------------------------------------------------------
-- 5. The daily deadline reminder: families with a child still to answer, two days or less before
-- the event's deadline, for open events still to come (never a draft, a cancelled or a deleted one),
-- once a day, linking to the event.
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
    select p.id as permission_id, p.child_id, e.id as event_id, e.nursery_id, e.title_ar, e.title_en
      from public.permissions p
      join public.events e on e.id = p.event_id
      join public.nursery_settings ns on ns.nursery_id = e.nursery_id
     where p.status = 'pending' and p.deleted_at is null
       and e.status = 'active' and e.cancelled_at is null and e.deleted_at is null and e.starts_at > now()
       and coalesce(e.permission_deadline, p.deadline) > now()
       and coalesce(e.permission_deadline, p.deadline) <= now() + interval '48 hours'
       and coalesce(ns.auto_permission_reminders_enabled, true)
       and (p.last_reminder_sent_at is null or p.last_reminder_sent_at < date_trunc('day', now()))
  ),
  sent as (
    insert into public.notifications (nursery_id, user_id, type, template_key, template_params, read, channel, sent_at, action_link)
    select d.nursery_id, pc.parent_id, 'permission_deadline_reminder', 'permission_deadline_reminder',
           jsonb_build_object('event', public.i18n_names(d.title_ar, d.title_en)), false, 'in_app', now(), '/parent/events/' || d.event_id
      from due d
      join public.parent_children pc on pc.child_id = d.child_id
    returning 1
  ),
  marked as (
    update public.permissions p set last_reminder_sent_at = now()
     where p.id in (select permission_id from due)
    returning 1
  )
  select (select count(*) from sent) into inserted from (select count(*) from marked) m;
  return inserted;
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- 6. Who is asked: the whole nursery, a class, or the children picked (p_child_ids; null keeps the
-- current ones), among the nursery's active children. A child no longer asked whose family has not
-- answered has the request withdrawn (marked, never removed); an answered one stays. A child asked
-- again gets the withdrawn request back. On an open event the families are told: asked, or no reply
-- needed. Returns how many were asked, withdrawn and told.
create or replace function public.event_sync_children(p_event_id uuid, p_child_ids uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_target uuid[];
  v_asked uuid[];
  v_dropped uuid[];
  v_notified integer := 0;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found or not public.event_can_manage(v_event.nursery_id) then
    raise exception 'event_forbidden' using errcode = '42501';
  end if;
  if v_event.cancelled_at is not null or v_event.deleted_at is not null or v_event.status in ('cancelled', 'completed') then
    raise exception 'event_closed' using errcode = '22023';
  end if;
  if v_event.starts_at <= now() then
    raise exception 'event_started' using errcode = '22023';
  end if;

  v_target := array(
    select c.id from public.children c
     where c.nursery_id = v_event.nursery_id and c.status = 'active'
       and case v_event.target_scope
             when 'class' then c.class_id is not distinct from v_event.target_class_id
             when 'individual' then
               case when p_child_ids is null
                    then exists (select 1 from public.permissions p where p.event_id = p_event_id and p.child_id = c.id and p.deleted_at is null)
                    else c.id = any (p_child_ids) end
             else true
           end
  );

  with gone as (
    update public.permissions p
       set deleted_at = now(), deleted_by = auth.uid()
     where p.event_id = p_event_id and p.deleted_at is null and p.status = 'pending' and not (p.child_id = any (v_target))
    returning p.child_id
  )
  select coalesce(array_agg(child_id), '{}') into v_dropped from gone;

  with back as (
    update public.permissions p
       set deleted_at = null, deleted_by = null, status = 'pending', responded_at = null, parent_note = null,
           deadline = coalesce(v_event.permission_deadline, p.deadline)
     where p.id in (
       select distinct on (q.child_id) q.id
         from public.permissions q
        where q.event_id = p_event_id and q.deleted_at is not null and q.child_id = any (v_target)
          and not exists (select 1 from public.permissions l where l.event_id = p_event_id and l.child_id = q.child_id and l.deleted_at is null)
        order by q.child_id, q.deleted_at desc
     )
    returning p.child_id
  ),
  added as (
    insert into public.permissions (child_id, event_id, permission_type, status, deadline)
    select t.id, p_event_id, 'event', 'pending', v_event.permission_deadline
      from unnest(v_target) as t(id)
     where not exists (select 1 from public.permissions q where q.event_id = p_event_id and q.child_id = t.id)
    returning child_id
  )
  select coalesce(array_agg(child_id), '{}') into v_asked from (select child_id from back union all select child_id from added) x;

  if v_event.status = 'active' then
    v_notified := public.notify_users(
      array(select distinct pc.parent_id from public.parent_children pc where pc.child_id = any (v_asked)),
      v_event.nursery_id, 'event_published', 'event_published',
      jsonb_build_object('event', public.i18n_names(v_event.title_ar, v_event.title_en)),
      '/parent/events/' || p_event_id, 'normal'
    ) + public.notify_users(
      array(select distinct pc.parent_id from public.parent_children pc where pc.child_id = any (v_dropped)),
      v_event.nursery_id, 'event_invitation_withdrawn', 'event_invitation_withdrawn',
      jsonb_build_object('event', public.i18n_names(v_event.title_ar, v_event.title_en)),
      '/parent/events', 'normal'
    );
  end if;

  return jsonb_build_object('asked', cardinality(v_asked), 'withdrawn', cardinality(v_dropped), 'notified', v_notified);
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- 7. Billing the approvals that have no invoice (the paid events' yes answers from before billing
-- worked, or any that failed): each child once, to the child's main parent, never due in the past.
create or replace function public.event_bill_approved(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_permission public.permissions%rowtype;
  v_parent uuid;
  v_billed integer := 0;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found or not public.event_can_manage(v_event.nursery_id) then
    raise exception 'event_forbidden' using errcode = '42501';
  end if;
  if v_event.cancelled_at is not null or v_event.deleted_at is not null or v_event.status = 'cancelled' then
    raise exception 'event_closed' using errcode = '22023';
  end if;
  if not coalesce(v_event.is_paid, false) or coalesce(v_event.price, 0) <= 0 then
    raise exception 'event_not_paid' using errcode = '22023';
  end if;

  for v_permission in
    select p.* from public.permissions p
     where p.event_id = p_event_id and p.deleted_at is null and p.status = 'granted'
       and not exists (
         select 1 from public.event_invoices ei join public.invoices i on i.id = ei.invoice_id
          where ei.event_id = p_event_id and ei.child_id = p.child_id and i.status <> 'cancelled'
       )
  loop
    select pc.parent_id into v_parent
      from public.parent_children pc
     where pc.child_id = v_permission.child_id
     order by pc.is_primary desc nulls last, pc.parent_id
     limit 1;
    continue when v_parent is null;
    perform public.event_bill_child(v_event, v_permission, v_parent);
    v_billed := v_billed + 1;
  end loop;

  return jsonb_build_object('billed', v_billed);
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- 8. An open event still to come moved (its day, time or place): the families asked (still to
-- answer, or who said yes) are told the new time and place.
create or replace function public.events_after_move_tell_families()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text;
begin
  if old.status = 'active' and new.status = 'active' and new.cancelled_at is null and new.deleted_at is null and new.starts_at > now()
     and (new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
          or nullif(btrim(new.location), '') is distinct from nullif(btrim(old.location), '')) then
    v_tz := coalesce((select ns.timezone from public.nursery_settings ns where ns.nursery_id = new.nursery_id), 'Africa/Cairo');
    perform public.notify_users(
      array(select distinct pc.parent_id from public.permissions p join public.parent_children pc on pc.child_id = p.child_id
             where p.event_id = new.id and p.deleted_at is null and p.status in ('pending', 'granted')),
      new.nursery_id, 'event_updated', 'event_updated',
      jsonb_build_object(
        'event', public.i18n_names(new.title_ar, new.title_en),
        'date', (new.starts_at at time zone v_tz)::date,
        'start_time', new.starts_at,
        'tz', v_tz,
        'location', coalesce(nullif(btrim(new.location), ''), ''),
        'segments', case when nullif(btrim(new.location), '') is null then '[]'::jsonb else '["place"]'::jsonb end
      ),
      '/parent/events/' || new.id, 'high'
    );
  end if;
  return null;
end;
$$;

drop trigger if exists events_after_move_tell_families on public.events;
create trigger events_after_move_tell_families
  after update of starts_at, ends_at, location on public.events
  for each row execute function public.events_after_move_tell_families();

-- -----------------------------------------------------------------------------------------------
-- Parents answer only through event_respond, and see a request only once the event is published;
-- invoices of events are only made here.
drop policy if exists perm_parent_all on public.permissions;
drop policy if exists perm_parent_select on public.permissions;
create policy perm_parent_select on public.permissions
  for select to authenticated
  using (
    public.current_user_role() = 'parent'::public.user_role
    and public.parent_can_access_child(child_id)
    and public.event_shown_to_families(event_id)
  );

drop policy if exists permissions_not_deleted on public.permissions;
create policy permissions_not_deleted on public.permissions
  as restrictive
  for select to authenticated
  using (deleted_at is null);
revoke delete on public.permissions from anon, authenticated;

drop policy if exists "Admin can create event invoices for their nursery" on public.event_invoices;

revoke execute on function public.event_shown_to_families(uuid) from public, anon;
grant execute on function public.event_shown_to_families(uuid) to authenticated, service_role;
revoke execute on function public.event_can_manage(uuid) from public, anon, authenticated;
revoke execute on function public.event_bill_child(public.events, public.permissions, uuid) from public, anon, authenticated;
grant execute on function public.event_can_manage(uuid) to service_role;
grant execute on function public.event_bill_child(public.events, public.permissions, uuid) to service_role;

revoke execute on function public.event_publish(uuid) from public, anon;
revoke execute on function public.event_respond(uuid, boolean, text) from public, anon;
revoke execute on function public.event_cancel(uuid, text) from public, anon;
revoke execute on function public.event_delete(uuid) from public, anon;
revoke execute on function public.event_sync_children(uuid, uuid[]) from public, anon;
revoke execute on function public.event_bill_approved(uuid) from public, anon;
revoke execute on function public.events_after_move_tell_families() from public, anon, authenticated;
grant execute on function public.event_publish(uuid) to authenticated, service_role;
grant execute on function public.event_respond(uuid, boolean, text) to authenticated, service_role;
grant execute on function public.event_cancel(uuid, text) to authenticated, service_role;
grant execute on function public.event_delete(uuid) to authenticated, service_role;
grant execute on function public.event_sync_children(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.event_bill_approved(uuid) to authenticated, service_role;

-- Events: a family's urgent event (a notice to the nursery).
--
-- A family can tell the nursery about something for their child: a doctor's visit, an early
-- pickup, a session every week. Until now:
-- * "Notify the nursery" notified nobody: no admin and no teacher heard of it.
-- * The family was asked to approve its own event (a pending request for its own child) and was
--   reminded of the deadline to answer it.
-- * A notice could be made for no child at all, and errors came back as English sentences.
-- * The family could not take it back when the visit was off.
-- Now:
-- * create_parent_urgent_event (same arguments) needs at least one of the family's active children;
--   their requests are given (the family's own notice needs no answer); the nursery's admins and the
--   children's teachers are told at once, with the child, the day and the time. Refusals are codes.
-- * event_cancel lets the family cancel its own notice (with a reason): the admins and the teachers
--   are told; the family itself is not (it cancelled it).
-- * The notices made before keep their rows; their requests still pending become given.

create or replace function public.create_parent_urgent_event(
  p_title_ar text,
  p_title_en text,
  p_description_ar text default null,
  p_description_en text default null,
  p_starts_at timestamptz default null,
  p_location text default null,
  p_category text default 'activity',
  p_child_ids uuid[] default '{}',
  p_permission_deadline timestamptz default null,
  p_urgent_days_of_week integer[] default '{}',
  p_urgent_hours_of_day integer[] default '{}',
  p_urgent_repeats_weekly boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent public.users;
  v_children uuid[] := array(select distinct x from unnest(coalesce(p_child_ids, '{}')) x where x is not null);
  v_nursery uuid;
  v_found integer;
  v_nurseries integer;
  v_title_ar text := nullif(btrim(coalesce(p_title_ar, '')), '');
  v_title_en text := nullif(btrim(coalesce(p_title_en, '')), '');
  v_days integer[] := array(select distinct d from unnest(coalesce(p_urgent_days_of_week, '{}')) d order by d);
  v_hours integer[] := array(select distinct h from unnest(coalesce(p_urgent_hours_of_day, '{}')) h order by h);
  v_event_id uuid;
  v_tz text;
  v_params jsonb;
begin
  select * into v_parent from public.users where id = auth.uid();
  if auth.uid() is null or public.current_user_role() is distinct from 'parent'::public.user_role then
    raise exception 'event_forbidden' using errcode = '42501';
  end if;
  if v_title_ar is null and v_title_en is null then
    raise exception 'event_title_required' using errcode = '22023';
  end if;
  if char_length(coalesce(v_title_ar, v_title_en)) > 120 then
    raise exception 'event_title_too_long' using errcode = '22023';
  end if;
  if p_starts_at is null or p_starts_at <= now() then
    raise exception 'event_start_in_past' using errcode = '22023';
  end if;
  if coalesce(p_category, '') not in ('trip', 'activity', 'service', 'doctor_visit') then
    raise exception 'event_category_invalid' using errcode = '22023';
  end if;
  if not (v_days <@ array[0, 1, 2, 3, 4, 5, 6]) or not (v_hours <@ array(select generate_series(0, 23))) then
    raise exception 'event_schedule_invalid' using errcode = '22023';
  end if;
  if coalesce(p_urgent_repeats_weekly, false) and (cardinality(v_days) = 0 or cardinality(v_hours) = 0) then
    raise exception 'event_schedule_days_required' using errcode = '22023';
  end if;
  if cardinality(v_children) = 0 then
    raise exception 'event_child_required' using errcode = '22023';
  end if;

  -- Every child is the family's, active, and all at one nursery.
  select min(c.nursery_id::text)::uuid, count(distinct c.id)::int, count(distinct c.nursery_id)::int
    into v_nursery, v_found, v_nurseries
    from public.children c
    join public.parent_children pc on pc.child_id = c.id and pc.parent_id = auth.uid()
   where c.id = any (v_children) and c.status = 'active';
  if v_found <> cardinality(v_children) or v_nurseries <> 1 then
    raise exception 'event_children_invalid' using errcode = '22023';
  end if;

  insert into public.events (
    nursery_id, parent_created_by, title_ar, title_en, description_ar, description_en, starts_at, location,
    category, is_urgent, urgent_days_of_week, urgent_hours_of_day, urgent_repeats_weekly,
    is_paid, price, target_scope, target_class_id, permission_deadline, status, cancelled_at
  ) values (
    v_nursery, auth.uid(), coalesce(v_title_ar, v_title_en), coalesce(v_title_en, v_title_ar),
    nullif(btrim(coalesce(p_description_ar, '')), ''), nullif(btrim(coalesce(p_description_en, '')), ''),
    p_starts_at, nullif(btrim(coalesce(p_location, '')), ''),
    p_category, true, v_days, v_hours, coalesce(p_urgent_repeats_weekly, false),
    false, null, 'individual', null, null, 'active', null
  )
  returning id into v_event_id;

  -- The family's own notice: their children's requests are given.
  insert into public.permissions (child_id, event_id, permission_type, status, responded_at)
  select c, v_event_id, 'event', 'granted', now() from unnest(v_children) c;

  select coalesce(ns.timezone, 'Africa/Cairo') into v_tz from public.nursery_settings ns where ns.nursery_id = v_nursery;
  v_params := jsonb_build_object(
    'event', public.i18n_names(coalesce(v_title_ar, v_title_en), coalesce(v_title_en, v_title_ar)),
    'family', public.i18n_names(v_parent.name_ar, v_parent.name_en),
    'child', (select jsonb_build_object(
                'ar', string_agg(coalesce(nullif(c.full_name_ar, ''), c.full_name_en), '، ' order by c.full_name_en),
                'en', string_agg(coalesce(nullif(c.full_name_en, ''), c.full_name_ar), ', ' order by c.full_name_en))
                from public.children c where c.id = any (v_children)),
    'date', (p_starts_at at time zone coalesce(v_tz, 'Africa/Cairo'))::date,
    'start_time', p_starts_at,
    'tz', coalesce(v_tz, 'Africa/Cairo')
  );
  perform public.attendance_notify_staff(
    v_nursery, array['branch_admin', 'manager']::public.user_role[], 'event_family_notice', 'event_family_notice',
    v_params, '/admin/events/' || v_event_id, 'high'
  );
  perform public.notify_users(
    array(select distinct cs.user_id from public.class_staff cs join public.children c on c.class_id = cs.class_id where c.id = any (v_children)),
    v_nursery, 'event_family_notice', 'event_family_notice', v_params, '/teacher/events?event=' || v_event_id, 'high'
  );
  return v_event_id;
end;
$$;

-- Cancelling: the nursery's managers, or the family who made the notice.
create or replace function public.event_cancel(p_event_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_by_family boolean;
  v_policy text;
  v_tz text;
  v_cancelled integer;
  v_paid integer;
  v_notified integer;
  v_params jsonb;
begin
  select * into v_event from public.events where id = p_event_id for update;
  v_by_family := found and v_event.parent_created_by is not null and v_event.parent_created_by = auth.uid()
                 and public.current_user_role() = 'parent'::public.user_role;
  if not found or not (public.event_can_manage(v_event.nursery_id) or v_by_family) then
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

  -- The families asked (never the one who cancelled).
  v_notified := public.notify_users(
    array(select distinct pc.parent_id from public.permissions p join public.parent_children pc on pc.child_id = p.child_id
           where p.event_id = p_event_id and p.deleted_at is null and p.status in ('pending', 'granted')
             and pc.parent_id is distinct from auth.uid()),
    v_event.nursery_id, 'event_cancelled', 'event_cancelled',
    jsonb_build_object('event', public.i18n_names(v_event.title_ar, v_event.title_en),
                       'date', (v_event.starts_at at time zone coalesce(v_tz, 'Africa/Cairo'))::date,
                       'reason', v_reason),
    '/parent/events', 'high'
  );

  -- A family's notice taken back: the admins and the children's teachers.
  if v_by_family then
    v_params := jsonb_build_object(
      'event', public.i18n_names(v_event.title_ar, v_event.title_en),
      'child', (select jsonb_build_object(
                  'ar', string_agg(coalesce(nullif(c.full_name_ar, ''), c.full_name_en), '، ' order by c.full_name_en),
                  'en', string_agg(coalesce(nullif(c.full_name_en, ''), c.full_name_ar), ', ' order by c.full_name_en))
                  from public.permissions p join public.children c on c.id = p.child_id
                 where p.event_id = p_event_id and p.deleted_at is null),
      'date', (v_event.starts_at at time zone coalesce(v_tz, 'Africa/Cairo'))::date,
      'reason', v_reason
    );
    perform public.attendance_notify_staff(
      v_event.nursery_id, array['branch_admin', 'manager']::public.user_role[], 'event_family_notice_cancelled',
      'event_family_notice_cancelled', v_params, '/admin/events/' || p_event_id, 'normal'
    );
    perform public.notify_users(
      array(select distinct cs.user_id from public.class_staff cs join public.children c on c.class_id = cs.class_id
              join public.permissions p on p.child_id = c.id where p.event_id = p_event_id and p.deleted_at is null),
      v_event.nursery_id, 'event_family_notice_cancelled', 'event_family_notice_cancelled', v_params, '/teacher/events', 'normal'
    );
  end if;

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

-- The notices made before: a request a family left pending on its own notice is given.
update public.permissions p
   set status = 'granted', responded_at = coalesce(p.responded_at, now())
  from public.events e
 where e.id = p.event_id and e.parent_created_by is not null and p.status = 'pending' and p.deleted_at is null
   and exists (select 1 from public.parent_children pc where pc.child_id = p.child_id and pc.parent_id = e.parent_created_by);

revoke execute on function public.create_parent_urgent_event(text, text, text, text, timestamptz, text, text, uuid[], timestamptz, integer[], integer[], boolean) from public, anon;
grant execute on function public.create_parent_urgent_event(text, text, text, text, timestamptz, text, text, uuid[], timestamptz, integer[], integer[], boolean) to authenticated, service_role;

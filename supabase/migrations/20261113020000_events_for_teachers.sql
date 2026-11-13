-- Events: the teacher's view.
--
-- A teacher saw the events for the whole nursery and for their classes, but not the ones for chosen
-- children (a trip for six children of their class), and never who was going: the permission rows
-- are closed to teachers. On the day they could not tell whom to wait for, nor whom the QR scanner
-- had checked in.
-- * teacher_events(): the published events (open or done, not cancelled) that concern the teacher's
--   classes, with how many of those children were asked, said yes, and were checked in.
-- * event_roster(event): the children asked to one event (a teacher: of their classes; an admin:
--   all), with the answer and the check-in time. Names only; the families' notes stay with the admins.

-- The children of the classes the signed-in user teaches.
create or replace function public.my_class_children()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
    from public.class_staff cs
    join public.classes cl on cl.id = cs.class_id and cl.deleted_at is null
    join public.children c on c.class_id = cs.class_id
   where cs.user_id = auth.uid();
$$;

create or replace function public.teacher_events()
returns table (
  id uuid,
  title_ar text,
  title_en text,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  category text,
  is_urgent boolean,
  is_paid boolean,
  target_scope text,
  status text,
  asked integer,
  going integer,
  checked_in integer
)
language sql
stable
security definer
set search_path = public
as $$
  with kids as (select public.my_class_children() as child_id),
  mine as (
    select e.*
      from public.events e
     where public.current_user_role() = 'teacher'::public.user_role
       and e.nursery_id = public.current_user_nursery_id()
       and e.status in ('active', 'completed')
       and e.cancelled_at is null
       and e.deleted_at is null
       and (
         e.target_scope = 'all'
         or (e.target_scope = 'class' and e.target_class_id in (select cs.class_id from public.class_staff cs where cs.user_id = auth.uid()))
         or exists (
           select 1 from public.permissions p
            where p.event_id = e.id and p.deleted_at is null and p.child_id in (select child_id from kids)
         )
       )
  )
  select m.id, m.title_ar, m.title_en, m.starts_at, m.ends_at, m.location, m.category, coalesce(m.is_urgent, false),
         coalesce(m.is_paid, false), m.target_scope, m.status,
         (select count(*)::int from public.permissions p
           where p.event_id = m.id and p.deleted_at is null and p.child_id in (select child_id from kids)),
         (select count(*)::int from public.permissions p
           where p.event_id = m.id and p.deleted_at is null and p.status = 'granted' and p.child_id in (select child_id from kids)),
         (select count(*)::int from public.event_attendance a
           where a.event_id = m.id and a.child_id in (select child_id from kids))
    from mine m
   order by m.starts_at desc;
$$;

create or replace function public.event_roster(p_event_id uuid)
returns table (
  child_id uuid,
  name_ar text,
  name_en text,
  avatar_url text,
  class_name_ar text,
  class_name_en text,
  status text,
  responded_at timestamptz,
  checked_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_admin boolean;
begin
  select * into v_event from public.events e where e.id = p_event_id and e.deleted_at is null;
  if not found then
    raise exception 'event_forbidden' using errcode = '42501';
  end if;
  v_admin := public.event_can_manage(v_event.nursery_id);
  if not v_admin and not (
    public.current_user_role() = 'teacher'::public.user_role
    and public.current_user_nursery_id() = v_event.nursery_id
    and v_event.status <> 'draft'
  ) then
    raise exception 'event_forbidden' using errcode = '42501';
  end if;

  return query
    select c.id, c.full_name_ar, c.full_name_en, c.avatar_url, cl.name_ar, cl.name_en, p.status, p.responded_at, a.checked_in_at
      from public.permissions p
      join public.children c on c.id = p.child_id
      left join public.classes cl on cl.id = c.class_id
      left join public.event_attendance a on a.event_id = p.event_id and a.child_id = p.child_id
     where p.event_id = p_event_id
       and p.deleted_at is null
       and (v_admin or c.id in (select public.my_class_children()))
     order by (p.status = 'granted') desc, (p.status = 'pending') desc, coalesce(nullif(c.full_name_en, ''), c.full_name_ar);
end;
$$;

revoke execute on function public.my_class_children() from public, anon, authenticated;
revoke execute on function public.teacher_events() from public, anon;
revoke execute on function public.event_roster(uuid) from public, anon;
grant execute on function public.my_class_children() to service_role;
grant execute on function public.teacher_events() to authenticated, service_role;
grant execute on function public.event_roster(uuid) to authenticated, service_role;

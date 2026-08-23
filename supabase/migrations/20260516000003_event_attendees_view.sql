-- Deliverable 6: parents can see who else is attending an event.
-- Privacy: own children show full name + avatar; other families show
-- first name + last initial only, no avatar. Gated by a per-nursery toggle.

begin;

alter table public.nursery_settings
  add column if not exists show_event_attendee_list boolean default true;

-- Is the current user staff for the given nursery?
create or replace function public.is_staff_of_nursery(p_nursery_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.is_xo_super_admin()
    or (
      public.current_user_role() in ('branch_admin', 'chain_super_admin', 'teacher')
      and public.current_user_nursery_id() = p_nursery_id
    );
$$;

-- May the current user view the attendee list for this event at all?
-- Staff of the event's nursery: always. Parents: only if they have a child
-- tied to the event AND the nursery has the attendee list enabled.
create or replace function public.can_view_event_attendees(p_event_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.events e
    where e.id = p_event_id
      and (
        public.is_staff_of_nursery(e.nursery_id)
        or (
          public.current_user_role() = 'parent'
          and coalesce(
            (select ns.show_event_attendee_list
               from public.nursery_settings ns
              where ns.nursery_id = e.nursery_id),
            true
          )
          and exists (
            select 1
            from public.permissions p
            join public.parent_children pc on pc.child_id = p.child_id
            where p.event_id = p_event_id
              and pc.parent_id = auth.uid()
          )
        )
      )
  );
$$;

-- May the current user see this child's full identity (full name + avatar)?
-- True for staff of the child's nursery and for the child's own parent.
create or replace function public.can_see_full_attendee(p_child_id uuid, p_nursery_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.is_staff_of_nursery(p_nursery_id)
    or exists (
      select 1 from public.parent_children pc
      where pc.child_id = p_child_id
        and pc.parent_id = auth.uid()
    );
$$;

-- Helper: "First L." style truncation, language-aware, blank-safe.
create or replace function public.short_display_name(p_name text)
returns text
language sql
immutable
as $$
  select case
    when p_name is null or btrim(p_name) = '' then ''
    when position(' ' in btrim(p_name)) = 0 then btrim(p_name)
    else split_part(btrim(p_name), ' ', 1)
         || ' '
         || left(split_part(btrim(p_name), ' ', 2), 1) || '.'
  end;
$$;

-- The parent/staff-facing attendee view. Runs as owner (security_invoker off)
-- so it bypasses RLS on permissions/children; access is enforced by the
-- can_view_event_attendees() predicate in the WHERE clause.
create or replace view public.event_attendees_public as
select
  p.event_id,
  p.child_id,
  case
    when public.can_see_full_attendee(p.child_id, c.nursery_id)
      then c.full_name_ar
    else public.short_display_name(c.full_name_ar)
  end as display_name_ar,
  case
    when public.can_see_full_attendee(p.child_id, c.nursery_id)
      then c.full_name_en
    else public.short_display_name(c.full_name_en)
  end as display_name_en,
  case
    when public.can_see_full_attendee(p.child_id, c.nursery_id)
      then c.avatar_url
    else null
  end as avatar_url,
  p.status
from public.permissions p
join public.children c on c.id = p.child_id
where p.status = 'granted'
  and p.event_id is not null
  and public.can_view_event_attendees(p.event_id);

grant select on public.event_attendees_public to authenticated;

commit;

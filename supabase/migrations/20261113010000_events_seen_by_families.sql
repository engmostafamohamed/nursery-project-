-- Events: which ones a family sees.
--
-- A parent read every event of their child's nursery: the drafts (the admin's unfinished work), the
-- trips of other classes and the visits of other children. The family dashboard listed them all
-- under "today" and "this week". Now a family sees an event once it is published, and only when it
-- concerns them: one for the whole nursery, one for their child's class, one their child is asked to,
-- or one they created themselves. The list of who is going follows the same rule (a family whose
-- request was withdrawn no longer reads it), and never counts a withdrawn request.
-- The links between events and invoices were read by anyone of the nursery (families and teachers
-- saw which family was billed for which event); now by the nursery's admins, and a family its own.

-- Whether one of the signed-in parent's children is concerned by an event (its row is read by the
-- policy; the children and the requests are read here, past their own policies).
create or replace function public.rls_parent_sees_event(p_event_id uuid, p_nursery_id uuid, p_scope text, p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.parent_children pc
      join public.children c on c.id = pc.child_id
     where pc.parent_id = auth.uid()
       and c.nursery_id = p_nursery_id
       and (
         p_scope = 'all'
         or (p_scope = 'class' and c.class_id = p_class_id)
         or exists (
           select 1 from public.permissions p
            where p.event_id = p_event_id and p.child_id = c.id and p.deleted_at is null
         )
       )
  );
$$;

drop policy if exists events_parent_select on public.events;
create policy events_parent_select on public.events
  for select to authenticated
  using (
    public.current_user_role() = 'parent'::public.user_role
    and (
      parent_created_by = auth.uid()
      or (status <> 'draft' and public.rls_parent_sees_event(id, nursery_id, target_scope, target_class_id))
    )
  );

-- Who may read the list of children going: the nursery's staff, and a family still asked to a
-- published event (when the nursery shows the list).
create or replace function public.can_view_event_attendees(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.events e
     where e.id = p_event_id
       and e.deleted_at is null
       and (
         public.is_staff_of_nursery(e.nursery_id)
         or (
           public.current_user_role() = 'parent'
           and e.status <> 'draft'
           and coalesce(
             (select ns.show_event_attendee_list from public.nursery_settings ns where ns.nursery_id = e.nursery_id),
             true
           )
           and exists (
             select 1
               from public.permissions p
               join public.parent_children pc on pc.child_id = p.child_id
              where p.event_id = p_event_id
                and p.deleted_at is null
                and pc.parent_id = auth.uid()
           )
         )
       )
  );
$$;

-- The children going: a withdrawn request is not counted.
create or replace view public.event_attendees_public as
select p.event_id,
       p.child_id,
       case when public.can_see_full_attendee(p.child_id, c.nursery_id) then c.full_name_ar
            else public.short_display_name(c.full_name_ar) end as display_name_ar,
       case when public.can_see_full_attendee(p.child_id, c.nursery_id) then c.full_name_en
            else public.short_display_name(c.full_name_en) end as display_name_en,
       case when public.can_see_full_attendee(p.child_id, c.nursery_id) then c.avatar_url
            else null::text end as avatar_url,
       p.status
  from public.permissions p
  join public.children c on c.id = p.child_id
 where p.status = 'granted'
   and p.event_id is not null
   and p.deleted_at is null
   and public.can_view_event_attendees(p.event_id);

revoke execute on function public.rls_parent_sees_event(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.rls_parent_sees_event(uuid, uuid, text, uuid) to authenticated, service_role;

-- Who reads the links between events and invoices: the nursery's admins (and a teacher allowed to
-- see invoices), and the family billed.
create or replace function public.event_invoice_readable(p_nursery_id uuid, p_event_id uuid, p_parent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with n as (select coalesce(p_nursery_id, (select e.nursery_id from public.events e where e.id = p_event_id)) as id)
  select p_parent_id = auth.uid()
      or public.event_can_manage((select id from n))
      or (public.current_user_role() = 'teacher'::public.user_role
          and public.current_user_nursery_id() = (select id from n)
          and public.user_can('invoices', 'view'));
$$;

drop policy if exists "Admin can view event invoices for their nursery" on public.event_invoices;
drop policy if exists event_invoices_read on public.event_invoices;
create policy event_invoices_read on public.event_invoices
  for select to authenticated
  using (public.event_invoice_readable(nursery_id, event_id, parent_id));

revoke execute on function public.event_invoice_readable(uuid, uuid, uuid) from public, anon;
grant execute on function public.event_invoice_readable(uuid, uuid, uuid) to authenticated, service_role;


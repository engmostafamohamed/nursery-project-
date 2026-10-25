-- Class teams, the teacher's own classes, chats limited to the families of those classes, and
-- messages from the staff to families.
--
-- 1. Class team. A new permission feature, class_team (view / update), lets the nursery admin or a
--    head of teachers set each class's lead teacher, assistants and backup teacher. A new seeded role,
--    "Head of teachers" (a teacher role with class_team), is added to every nursery; the admin can
--    also give class_team to any other role. Changes go through set_class_team_member /
--    remove_class_team_member (checked on the server, logged in class_team_changes, and the
--    teacher is told), and get_class_teams lists the classes, their team and every teacher.
-- 2. The teacher's classes. get_my_classes: the classes the caller works in, with their place in
--    each and the rest of the team. get_my_class_children: every child of those classes with today's
--    state (here, picked up, absent, in extra hours right now) and the child's parents.
-- 3. Chat. A teacher's directory shows the staff and only the parents of children in the teacher's
--    classes (each parent with their children's names); the same rule is enforced whenever someone
--    is added to a conversation, whatever the way they are added.
-- 4. Messages to families. A teacher (or the nursery's staff) writes to the parents of one child, of
--    chosen children, of a class, of today's absent children or of the children in extra hours now.
--    Each message keeps who sent it as it was then: name, role, the role title the nursery gave them,
--    department, and their classes and place in them. Parents see it in their inbox and get a
--    notification; the sender sees what they sent and how many families read it.

-- -----------------------------------------------------------------------------------------------
-- 1. Class team
insert into public.features (id, name_en, name_ar, category, description_en, description_ar, is_seed, actions, sort_order)
values (
  'class_team', 'Class team', 'فريق الفصول', 'staff',
  'Assign the lead teacher, assistants and backup teacher of each class.',
  'تعيين المعلم الرئيسي والمساعدين والمعلم البديل لكل فصل.',
  true, array['view', 'update'], 33
)
on conflict (id) do nothing;

-- The "Head of teachers" template: a teacher's permissions, plus the class team and the staff list.
insert into public.roles (nursery_id, key, name_en, name_ar, base_role, base_department, is_seed, is_system)
select null, 'head_teacher', 'Head of teachers', 'رئيس المعلمين', 'teacher', null, true, false
where not exists (select 1 from public.roles where nursery_id is null and key = 'head_teacher');

insert into public.role_features (role_id, feature_id, access, actions, requires_approval)
select ht.id, rf.feature_id, rf.access, rf.actions, rf.requires_approval
from public.roles ht
join public.roles tt on tt.nursery_id is null and tt.key = 'teacher'
join public.role_features rf on rf.role_id = tt.id
where ht.nursery_id is null and ht.key = 'head_teacher'
on conflict (role_id, feature_id) do nothing;

insert into public.role_features (role_id, feature_id, access, actions, requires_approval)
select ht.id, g.feature_id, 'full', g.actions, false
from public.roles ht
cross join (values ('class_team', array['view', 'update']), ('staff', array['view'])) as g(feature_id, actions)
where ht.nursery_id is null and ht.key = 'head_teacher'
on conflict (role_id, feature_id) do update set actions = excluded.actions;

-- Every nursery gets its own copy (new nurseries get it from rbac_seed_nursery_roles).
insert into public.roles (nursery_id, key, name_en, name_ar, base_role, base_department, is_seed, is_system, managed_position_keys)
select n.id, t.key, t.name_en, t.name_ar, t.base_role, t.base_department, false, true, t.managed_position_keys
from public.nurseries n
cross join public.roles t
where t.nursery_id is null and t.key = 'head_teacher'
on conflict (nursery_id, key) do nothing;

insert into public.role_features (role_id, feature_id, access, actions, requires_approval)
select n.id, rf.feature_id, rf.access, rf.actions, rf.requires_approval
from public.roles n
join public.roles t on t.nursery_id is null and t.key = 'head_teacher'
join public.role_features rf on rf.role_id = t.id
where n.nursery_id is not null and n.key = 'head_teacher'
  and not exists (select 1 from public.role_features x where x.role_id = n.id)
on conflict (role_id, feature_id) do nothing;

create table if not exists public.class_team_changes (
  id uuid primary key default gen_random_uuid(),
  nursery_id uuid not null references public.nurseries(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  action text not null check (action in ('assigned', 'changed', 'removed')),
  role public.class_staff_role,
  previous_role public.class_staff_role,
  changed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists class_team_changes_nursery_idx on public.class_team_changes (nursery_id, created_at desc);
alter table public.class_team_changes enable row level security;
drop policy if exists class_team_changes_read on public.class_team_changes;
create policy class_team_changes_read on public.class_team_changes
  for select to authenticated
  using (
    public.is_xo_super_admin()
    or (nursery_id = public.current_user_nursery_id() and public.user_can('class_team', 'view'))
  );

-- Who may see or change a nursery's class teams: its admins, chain and XO admins, and staff whose
-- role has class_team. Returns the caller.
create or replace function public.class_team_guard(p_nursery_id uuid, p_action text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_nursery uuid;
  v_chain uuid;
begin
  if v_uid is null then
    raise exception 'class_team_not_authenticated' using errcode = '28000';
  end if;
  select u.role, u.nursery_id, u.chain_id into v_role, v_nursery, v_chain from public.users u where u.id = v_uid;
  if v_role = 'xo_super_admin' then
    return v_uid;
  end if;
  if v_role = 'chain_super_admin' then
    if exists (select 1 from public.nurseries n where n.id = p_nursery_id and n.chain_id is not null and n.chain_id = v_chain) then
      return v_uid;
    end if;
    raise exception 'class_team_forbidden' using errcode = '42501';
  end if;
  if v_nursery is distinct from p_nursery_id or not public.user_can('class_team', p_action) then
    raise exception 'class_team_forbidden' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

revoke execute on function public.class_team_guard(uuid, text) from public, anon, authenticated;

-- The nursery's classes with their team, every teacher with their role, department and classes,
-- the latest changes, and whether the caller may change them.
create or replace function public.get_class_teams(p_nursery_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_classes jsonb;
  v_staff jsonb;
  v_changes jsonb;
  v_can_update boolean;
begin
  perform public.class_team_guard(p_nursery_id, 'view');
  v_can_update := public.user_can('class_team', 'update')
    or exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('xo_super_admin', 'chain_super_admin'));

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', cl.id,
           'name_ar', cl.name_ar,
           'name_en', cl.name_en,
           'capacity', cl.capacity,
           'room_number', cl.room_number,
           'children_count', (select count(*) from public.children c where c.class_id = cl.id and c.status = 'active'),
           'members', coalesce((
             select jsonb_agg(jsonb_build_object('user_id', cs.user_id, 'role', cs.role) order by cs.role, cs.created_at)
             from public.class_staff cs where cs.class_id = cl.id
           ), '[]'::jsonb)
         ) order by cl.name_en, cl.name_ar), '[]'::jsonb)
    into v_classes
  from public.classes cl
  where cl.nursery_id = p_nursery_id and cl.deleted_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', u.id,
           'name_ar', u.name_ar,
           'name_en', u.name_en,
           'email', u.email,
           'phone', u.phone,
           'role', u.role,
           'role_title_ar', r.name_ar,
           'role_title_en', r.name_en,
           'department', u.department,
           'status', coalesce(u.status, 'active'),
           'classes', coalesce((
             select jsonb_agg(jsonb_build_object('class_id', cs.class_id, 'role', cs.role) order by cs.role)
             from public.class_staff cs
             join public.classes cl on cl.id = cs.class_id and cl.deleted_at is null
             where cs.user_id = u.id
           ), '[]'::jsonb)
         ) order by u.name_en, u.name_ar), '[]'::jsonb)
    into v_staff
  from public.users u
  left join public.roles r on r.id = u.role_id
  where u.nursery_id = p_nursery_id and u.role = 'teacher';

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', ch.id, 'class_id', ch.class_id, 'user_id', ch.user_id, 'action', ch.action,
           'role', ch.role, 'previous_role', ch.previous_role, 'created_at', ch.created_at,
           'changed_by_ar', public.attendance_user_name(ch.changed_by, 'ar'),
           'changed_by_en', public.attendance_user_name(ch.changed_by, 'en')
         ) order by ch.created_at desc), '[]'::jsonb)
    into v_changes
  from (
    select * from public.class_team_changes x where x.nursery_id = p_nursery_id order by x.created_at desc limit 12
  ) ch;

  return jsonb_build_object('classes', v_classes, 'staff', v_staff, 'changes', v_changes, 'can_update', v_can_update);
end;
$$;

-- Puts a teacher in a class as lead, assistant or backup. A class has one lead and one backup: the
-- teacher who held that place leaves the class. A teacher already in the class changes place.
create or replace function public.set_class_team_member(p_class_id uuid, p_user_id uuid, p_role public.class_staff_role)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class public.classes%rowtype;
  v_actor uuid;
  v_teacher public.users%rowtype;
  v_previous public.class_staff_role;
  v_replaced uuid;
begin
  select * into v_class from public.classes where id = p_class_id and deleted_at is null;
  if not found then
    raise exception 'class_team_class_not_found' using errcode = '22023';
  end if;
  v_actor := public.class_team_guard(v_class.nursery_id, 'update');
  if p_role is null then
    raise exception 'class_team_invalid_role' using errcode = '22023';
  end if;
  select * into v_teacher from public.users where id = p_user_id;
  if not found or v_teacher.nursery_id is distinct from v_class.nursery_id or v_teacher.role <> 'teacher' then
    raise exception 'class_team_not_a_teacher' using errcode = '22023';
  end if;
  if coalesce(v_teacher.status, 'active') <> 'active' then
    raise exception 'class_team_teacher_inactive' using errcode = '22023';
  end if;

  select cs.role into v_previous from public.class_staff cs where cs.class_id = p_class_id and cs.user_id = p_user_id;
  if v_previous = p_role then
    return jsonb_build_object('class_id', p_class_id, 'user_id', p_user_id, 'role', p_role, 'changed', false);
  end if;

  if p_role in ('lead', 'substitute') then
    delete from public.class_staff cs
     where cs.class_id = p_class_id and cs.role = p_role and cs.user_id <> p_user_id
    returning cs.user_id into v_replaced;
    if v_replaced is not null then
      insert into public.class_team_changes (nursery_id, class_id, user_id, action, role, previous_role, changed_by)
      values (v_class.nursery_id, p_class_id, v_replaced, 'removed', null, p_role, v_actor);
    end if;
  end if;

  insert into public.class_staff (class_id, user_id, role)
  values (p_class_id, p_user_id, p_role)
  on conflict (class_id, user_id) do update set role = excluded.role, updated_at = now();

  insert into public.class_team_changes (nursery_id, class_id, user_id, action, role, previous_role, changed_by)
  values (v_class.nursery_id, p_class_id, p_user_id, case when v_previous is null then 'assigned' else 'changed' end, p_role, v_previous, v_actor);

  -- The teacher hears about it (unless they did it themselves).
  if p_user_id <> v_actor then
    insert into public.notifications (nursery_id, user_id, type, channel, template_key, template_params, action_link)
    values (
      v_class.nursery_id, p_user_id, 'class_team', 'in_app', 'class_team_assigned',
      jsonb_build_object(
        'class', jsonb_build_object('ar', coalesce(nullif(v_class.name_ar, ''), v_class.name_en), 'en', coalesce(nullif(v_class.name_en, ''), v_class.name_ar)),
        'role', jsonb_build_object('i18n', 'classTeam.roles.' || p_role::text)
      ),
      '/teacher'
    );
  end if;

  return jsonb_build_object('class_id', p_class_id, 'user_id', p_user_id, 'role', p_role, 'changed', true, 'replaced_user_id', v_replaced);
end;
$$;

create or replace function public.remove_class_team_member(p_class_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class public.classes%rowtype;
  v_actor uuid;
  v_previous public.class_staff_role;
begin
  select * into v_class from public.classes where id = p_class_id and deleted_at is null;
  if not found then
    raise exception 'class_team_class_not_found' using errcode = '22023';
  end if;
  v_actor := public.class_team_guard(v_class.nursery_id, 'update');
  delete from public.class_staff cs where cs.class_id = p_class_id and cs.user_id = p_user_id returning cs.role into v_previous;
  if v_previous is null then
    return false;
  end if;
  insert into public.class_team_changes (nursery_id, class_id, user_id, action, role, previous_role, changed_by)
  values (v_class.nursery_id, p_class_id, p_user_id, 'removed', null, v_previous, v_actor);
  return true;
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- 2. The teacher's classes
create or replace function public.get_my_classes()
returns table (
  class_id uuid,
  name_ar text,
  name_en text,
  my_role public.class_staff_role,
  children_count integer,
  team jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cl.id,
    cl.name_ar,
    cl.name_en,
    mine.role,
    (select count(*)::integer from public.children c where c.class_id = cl.id and c.status = 'active'),
    coalesce((
      select jsonb_agg(jsonb_build_object('user_id', u.id, 'name_ar', u.name_ar, 'name_en', u.name_en, 'role', cs.role) order by cs.role, u.name_en)
      from public.class_staff cs join public.users u on u.id = cs.user_id
      where cs.class_id = cl.id
    ), '[]'::jsonb)
  from public.class_staff mine
  join public.classes cl on cl.id = mine.class_id and cl.deleted_at is null
  where mine.user_id = auth.uid()
  order by cl.name_en, cl.name_ar
$$;

create or replace function public.get_my_class_children()
returns table (
  child_id uuid,
  full_name_ar text,
  full_name_en text,
  child_code text,
  avatar_url text,
  class_id uuid,
  class_name_ar text,
  class_name_en text,
  my_role public.class_staff_role,
  -- in_nursery | picked_up | excused | absent | off (a weekend or holiday) | not_enrolled
  day_status text,
  check_in timestamptz,
  check_out timestamptz,
  pickup_due_at timestamptz,
  late_now boolean,
  extra_hours numeric,
  absence_reason text,
  absence_note text,
  parents jsonb
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'attendance_not_authenticated' using errcode = '28000';
  end if;

  return query
  select
    c.id,
    c.full_name_ar,
    c.full_name_en,
    c.child_id_number,
    c.avatar_url,
    cl.id,
    cl.name_ar,
    cl.name_en,
    mine.role,
    case
      when ar.check_in is not null and ar.check_out is null then 'in_nursery'
      when ar.check_in is not null then 'picked_up'
      when coalesce(c.enrollment_date, c.created_at::date) > k.today then 'not_enrolled'
      when abr.id is not null then 'excused'
      when not public.attendance_is_school_day(c.nursery_id, k.today) then 'off'
      else 'absent'
    end,
    ar.check_in,
    ar.check_out,
    case when ar.check_in is not null then
      public.attendance_billing_start(ar, ns) + make_interval(mins => coalesce(ns.late_pickup_grace_minutes, 0))
    end,
    coalesce(
      ar.check_in is not null and ar.check_out is null
        and now() > public.attendance_billing_start(ar, ns) + make_interval(mins => coalesce(ns.late_pickup_grace_minutes, 0)),
      false
    ),
    coalesce(ar.extra_hours, 0),
    abr.reason,
    abr.note,
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', u.id, 'name_ar', u.name_ar, 'name_en', u.name_en, 'phone', u.phone,
               'relationship', coalesce(pc.relationship, pc.parent_type), 'is_primary', coalesce(pc.is_primary, false)
             ) order by pc.is_primary desc nulls last, pc.created_at)
      from public.parent_children pc join public.users u on u.id = pc.parent_id
      where pc.child_id = c.id
    ), '[]'::jsonb)
  from public.class_staff mine
  join public.classes cl on cl.id = mine.class_id and cl.deleted_at is null
  join public.children c on c.class_id = cl.id and c.status = 'active'
  left join public.nursery_settings ns on ns.nursery_id = c.nursery_id
  cross join lateral (select (now() at time zone coalesce(ns.timezone, 'Africa/Cairo'))::date as today) k
  left join public.attendance_records ar on ar.child_id = c.id and ar.attendance_date = k.today
  left join public.attendance_absence_reports abr on abr.child_id = c.id and abr.absence_date = k.today
  where mine.user_id = auth.uid()
  order by cl.name_en, c.full_name_en, c.full_name_ar;
end;
$$;

-- -----------------------------------------------------------------------------------------------
-- 3. Chat: a teacher's families are those of the children in the teacher's classes

-- May p_actor put p_member in a conversation? Same nursery (chain and XO admins anywhere in their
-- reach); a parent never adds another parent; a teacher adds a parent only of a child in one of
-- the teacher's classes.
create or replace function public.chat_member_allowed(p_actor uuid, p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_actor is null or p_actor = p_member then true
    else coalesce((
      select case
        when a.role = 'xo_super_admin' then true
        when m.role in ('xo_super_admin', 'chain_super_admin') then true
        when a.role = 'chain_super_admin' then exists (
          select 1 from public.nurseries n where n.id = m.nursery_id and n.chain_id is not null and n.chain_id = a.chain_id)
        when m.nursery_id is distinct from a.nursery_id then false
        when a.role = 'parent' and m.role = 'parent' then false
        when a.role = 'teacher' and m.role = 'parent' then exists (
          select 1
          from public.parent_children pc
          join public.children c on c.id = pc.child_id
          join public.class_staff cs on cs.class_id = c.class_id and cs.user_id = a.id
          where pc.parent_id = m.id)
        else true
      end
      from public.users a, public.users m
      where a.id = p_actor and m.id = p_member
    ), false)
  end
$$;

revoke execute on function public.chat_member_allowed(uuid, uuid) from public, anon, authenticated;

create or replace function public.chat_members_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.chat_member_allowed(auth.uid(), new.user_id) then
    raise exception 'chat_member_not_allowed' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_chat_members_guard on public.chat_conversation_members;
create trigger trg_chat_members_guard
  before insert on public.chat_conversation_members
  for each row execute function public.chat_members_guard();

-- The people the caller can start a conversation with; a parent comes with their children's names.
drop function if exists public.chat_directory(text, uuid);
create function public.chat_directory(search text default null, p_nursery_id uuid default null)
returns table (id uuid, name_ar text, name_en text, role text, context_ar text, context_en text)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select u.id, u.nursery_id, u.role from public.users u where u.id = auth.uid()
  ),
  target as (
    select case
      when (select role from me) = 'xo_super_admin' and p_nursery_id is not null
        then p_nursery_id
      when (select role from me) = 'chain_super_admin' and p_nursery_id is not null
        and p_nursery_id in (select public.nursery_ids_for_chain_admin())
        then p_nursery_id
      else (select nursery_id from me)
    end as nursery_id
  ),
  my_classes as (
    select cs.class_id from public.class_staff cs where cs.user_id = auth.uid()
  )
  select
    u.id,
    u.name_ar,
    u.name_en,
    u.role::text,
    case when u.role = 'parent' then (
      select string_agg(coalesce(nullif(c.full_name_ar, ''), c.full_name_en), '، ' order by c.full_name_ar)
      from public.parent_children pc join public.children c on c.id = pc.child_id
      where pc.parent_id = u.id and c.status = 'active'
        and ((select role from me) <> 'teacher' or c.class_id in (select class_id from my_classes))
    ) end,
    case when u.role = 'parent' then (
      select string_agg(coalesce(nullif(c.full_name_en, ''), c.full_name_ar), ', ' order by c.full_name_en)
      from public.parent_children pc join public.children c on c.id = pc.child_id
      where pc.parent_id = u.id and c.status = 'active'
        and ((select role from me) <> 'teacher' or c.class_id in (select class_id from my_classes))
    ) end
  from public.users u, me, target
  where u.nursery_id = target.nursery_id
    and u.id <> auth.uid()
    -- parents only see staff
    and (me.role <> 'parent' or u.role <> 'parent')
    -- a teacher sees the staff, and the parents of the children in the teacher's classes
    and (
      me.role <> 'teacher' or u.role <> 'parent'
      or exists (
        select 1 from public.parent_children pc join public.children c on c.id = pc.child_id
        where pc.parent_id = u.id and c.class_id in (select class_id from my_classes)
      )
    )
    and (
      search is null
      or btrim(search) = ''
      or u.name_ar ilike '%' || search || '%'
      or u.name_en ilike '%' || search || '%'
    )
  order by u.role::text, u.name_en
  limit 200
$$;

-- -----------------------------------------------------------------------------------------------
-- 4. Messages to families
create table if not exists public.family_messages (
  id uuid primary key default gen_random_uuid(),
  nursery_id uuid not null references public.nurseries(id) on delete cascade,
  sender_id uuid references public.users(id) on delete set null,
  -- Who sent it, as they were then (people, roles and classes change later).
  sender_name_ar text,
  sender_name_en text,
  sender_role public.user_role not null,
  sender_role_title_ar text,
  sender_role_title_en text,
  sender_department public.user_department,
  sender_class_names_ar text,
  sender_class_names_en text,
  sender_class_role public.class_staff_role,
  -- How the children were chosen.
  audience text not null check (audience in ('child', 'children', 'class', 'absent_today', 'extra_hours_now')),
  class_id uuid references public.classes(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists family_messages_sender_idx on public.family_messages (sender_id, created_at desc);
create index if not exists family_messages_nursery_idx on public.family_messages (nursery_id, created_at desc);

create table if not exists public.family_message_recipients (
  message_id uuid not null references public.family_messages(id) on delete cascade,
  parent_id uuid not null references public.users(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  read_at timestamptz,
  primary key (message_id, parent_id, child_id)
);
create index if not exists family_message_recipients_parent_idx on public.family_message_recipients (parent_id, read_at);

-- Read only: everything is written through the functions below.
alter table public.family_messages enable row level security;
alter table public.family_message_recipients enable row level security;

drop policy if exists family_messages_read on public.family_messages;
create policy family_messages_read on public.family_messages
  for select to authenticated
  using (
    sender_id = auth.uid()
    or exists (select 1 from public.family_message_recipients r where r.message_id = id and r.parent_id = auth.uid())
    or public.is_xo_super_admin()
    or (public.current_user_role() in ('branch_admin', 'manager') and nursery_id = public.current_user_nursery_id())
  );

-- A parent reads their own rows (the sender reads theirs through get_sent_family_messages; the two
-- policies must not refer to each other).
drop policy if exists family_message_recipients_read on public.family_message_recipients;
create policy family_message_recipients_read on public.family_message_recipients
  for select to authenticated
  using (parent_id = auth.uid() or public.is_xo_super_admin());

create or replace function public.send_family_message(
  p_child_ids uuid[],
  p_body text,
  p_audience text default 'children',
  p_class_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_me public.users%rowtype;
  v_ids uuid[];
  v_body text := btrim(coalesce(p_body, ''));
  v_nursery uuid;
  v_title_ar text;
  v_title_en text;
  v_class_ar text;
  v_class_en text;
  v_class_role public.class_staff_role;
  v_message uuid;
  v_parents integer;
  v_children integer;
begin
  if v_uid is null then
    raise exception 'family_message_not_authenticated' using errcode = '28000';
  end if;
  select * into v_me from public.users where id = v_uid;
  if v_me.role is null or v_me.role = 'parent' then
    raise exception 'family_message_forbidden' using errcode = '42501';
  end if;
  if v_me.role in ('teacher', 'manager') and not public.user_can('messages', 'create') then
    raise exception 'family_message_forbidden' using errcode = '42501';
  end if;
  if char_length(v_body) = 0 or char_length(v_body) > 2000 then
    raise exception 'family_message_body_invalid' using errcode = '22023';
  end if;
  if coalesce(p_audience, '') not in ('child', 'children', 'class', 'absent_today', 'extra_hours_now') then
    raise exception 'family_message_invalid_audience' using errcode = '22023';
  end if;

  v_ids := array(select distinct x from unnest(coalesce(p_child_ids, '{}'::uuid[])) x where x is not null);
  if cardinality(v_ids) = 0 or cardinality(v_ids) > 300 then
    raise exception 'family_message_no_children' using errcode = '22023';
  end if;
  -- Active children, all of one nursery.
  if exists (
    select 1 from unnest(v_ids) x left join public.children c on c.id = x
    where c.id is null or c.status <> 'active'
  ) or (select count(distinct c.nursery_id) from public.children c where c.id = any (v_ids)) <> 1 then
    raise exception 'family_message_child_not_found' using errcode = '22023';
  end if;
  select c.nursery_id into v_nursery from public.children c where c.id = v_ids[1];

  -- The sender works in that nursery.
  if v_me.role = 'chain_super_admin' then
    if not exists (select 1 from public.nurseries n where n.id = v_nursery and n.chain_id is not null and n.chain_id = v_me.chain_id) then
      raise exception 'family_message_forbidden' using errcode = '42501';
    end if;
  elsif v_me.role <> 'xo_super_admin' and v_me.nursery_id is distinct from v_nursery then
    raise exception 'family_message_forbidden' using errcode = '42501';
  end if;

  -- A teacher writes only to the families of the children in the teacher's own classes.
  if v_me.role = 'teacher' and exists (
    select 1 from public.children c
    where c.id = any (v_ids)
      and not exists (select 1 from public.class_staff cs where cs.user_id = v_uid and cs.class_id = c.class_id)
  ) then
    raise exception 'family_message_child_not_in_your_class' using errcode = '42501';
  end if;
  if p_class_id is not null and not exists (select 1 from public.classes cl where cl.id = p_class_id and cl.nursery_id = v_nursery) then
    raise exception 'family_message_child_not_found' using errcode = '22023';
  end if;

  -- The title the nursery gave the sender, and the sender's classes among the children's.
  select r.name_ar, r.name_en into v_title_ar, v_title_en from public.roles r where r.id = v_me.role_id;
  select string_agg(distinct coalesce(nullif(cl.name_ar, ''), cl.name_en), '، '),
         string_agg(distinct coalesce(nullif(cl.name_en, ''), cl.name_ar), ', '),
         min(cs.role)
    into v_class_ar, v_class_en, v_class_role
  from public.class_staff cs
  join public.classes cl on cl.id = cs.class_id
  where cs.user_id = v_uid
    and cs.class_id in (select c.class_id from public.children c where c.id = any (v_ids));

  insert into public.family_messages (
    nursery_id, sender_id, sender_name_ar, sender_name_en, sender_role, sender_role_title_ar, sender_role_title_en,
    sender_department, sender_class_names_ar, sender_class_names_en, sender_class_role, audience, class_id, body
  )
  values (
    v_nursery, v_uid, v_me.name_ar, v_me.name_en, v_me.role, v_title_ar, v_title_en,
    v_me.department, v_class_ar, v_class_en, v_class_role, p_audience, p_class_id, v_body
  )
  returning id into v_message;

  insert into public.family_message_recipients (message_id, parent_id, child_id)
  select v_message, pc.parent_id, pc.child_id
  from public.parent_children pc
  join public.users u on u.id = pc.parent_id and u.role = 'parent'
  where pc.child_id = any (v_ids)
  on conflict do nothing;

  select count(distinct r.parent_id), count(distinct r.child_id) into v_parents, v_children
  from public.family_message_recipients r where r.message_id = v_message;
  if v_parents = 0 then
    raise exception 'family_message_no_parents' using errcode = '22023';
  end if;

  -- One notification per parent, naming their own children in the message.
  insert into public.notifications (nursery_id, user_id, type, channel, template_key, template_params, action_link)
  select
    v_nursery,
    r.parent_id,
    'family_message',
    'in_app',
    'family_message',
    jsonb_build_object(
      'sender', jsonb_build_object('ar', coalesce(nullif(v_me.name_ar, ''), v_me.name_en), 'en', coalesce(nullif(v_me.name_en, ''), v_me.name_ar)),
      'children', jsonb_build_object(
        'ar', string_agg(coalesce(nullif(c.full_name_ar, ''), c.full_name_en), '، ' order by c.full_name_ar),
        'en', string_agg(coalesce(nullif(c.full_name_en, ''), c.full_name_ar), ', ' order by c.full_name_en)
      ),
      'preview', left(v_body, 140)
    ),
    '/parent/inbox?message=' || v_message
  from public.family_message_recipients r
  join public.children c on c.id = r.child_id
  where r.message_id = v_message
  group by r.parent_id;

  return jsonb_build_object('message_id', v_message, 'parents', v_parents, 'children', v_children);
end;
$$;

-- A parent's messages from the staff, newest first: who sent it (name, role, title, department,
-- classes), which of the parent's children it is about, and whether the parent has read it.
create or replace function public.get_parent_family_messages(p_limit integer default 50)
returns table (
  message_id uuid,
  created_at timestamptz,
  body text,
  audience text,
  sender_name_ar text,
  sender_name_en text,
  sender_role public.user_role,
  sender_role_title_ar text,
  sender_role_title_en text,
  sender_department public.user_department,
  sender_class_names_ar text,
  sender_class_names_en text,
  sender_class_role public.class_staff_role,
  children_ar text,
  children_en text,
  read_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.created_at,
    m.body,
    m.audience,
    m.sender_name_ar,
    m.sender_name_en,
    m.sender_role,
    m.sender_role_title_ar,
    m.sender_role_title_en,
    m.sender_department,
    m.sender_class_names_ar,
    m.sender_class_names_en,
    m.sender_class_role,
    string_agg(coalesce(nullif(c.full_name_ar, ''), c.full_name_en), '، ' order by c.full_name_ar),
    string_agg(coalesce(nullif(c.full_name_en, ''), c.full_name_ar), ', ' order by c.full_name_en),
    case when bool_and(r.read_at is not null) then max(r.read_at) end
  from public.family_message_recipients r
  join public.family_messages m on m.id = r.message_id
  join public.children c on c.id = r.child_id
  where r.parent_id = auth.uid()
  group by m.id
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

create or replace function public.mark_family_message_read(p_message_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'family_message_not_authenticated' using errcode = '28000';
  end if;
  update public.family_message_recipients
     set read_at = now()
   where message_id = p_message_id and parent_id = auth.uid() and read_at is null;
  get diagnostics v_count = row_count;
  update public.notifications
     set read = true
   where user_id = auth.uid() and type = 'family_message' and action_link = '/parent/inbox?message=' || p_message_id and not read;
  return v_count;
end;
$$;

-- What the caller sent, newest first: to how many children and families, and how many have read it.
create or replace function public.get_sent_family_messages(p_limit integer default 50)
returns table (
  message_id uuid,
  created_at timestamptz,
  body text,
  audience text,
  sender_class_names_ar text,
  sender_class_names_en text,
  children_count integer,
  parents_count integer,
  read_count integer,
  children_ar text,
  children_en text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.created_at,
    m.body,
    m.audience,
    m.sender_class_names_ar,
    m.sender_class_names_en,
    (select count(distinct r.child_id)::integer from public.family_message_recipients r where r.message_id = m.id),
    (select count(distinct r.parent_id)::integer from public.family_message_recipients r where r.message_id = m.id),
    (select count(distinct r.parent_id)::integer from public.family_message_recipients r where r.message_id = m.id and r.read_at is not null),
    (select string_agg(distinct coalesce(nullif(c.full_name_ar, ''), c.full_name_en), '، ')
       from public.family_message_recipients r join public.children c on c.id = r.child_id where r.message_id = m.id),
    (select string_agg(distinct coalesce(nullif(c.full_name_en, ''), c.full_name_ar), ', ')
       from public.family_message_recipients r join public.children c on c.id = r.child_id where r.message_id = m.id)
  from public.family_messages m
  where m.sender_id = auth.uid()
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

-- -----------------------------------------------------------------------------------------------
revoke execute on function public.get_class_teams(uuid) from public, anon;
revoke execute on function public.set_class_team_member(uuid, uuid, public.class_staff_role) from public, anon;
revoke execute on function public.remove_class_team_member(uuid, uuid) from public, anon;
revoke execute on function public.get_my_classes() from public, anon;
revoke execute on function public.get_my_class_children() from public, anon;
revoke execute on function public.chat_directory(text, uuid) from public, anon;
revoke execute on function public.send_family_message(uuid[], text, text, uuid) from public, anon;
revoke execute on function public.get_parent_family_messages(integer) from public, anon;
revoke execute on function public.mark_family_message_read(uuid) from public, anon;
revoke execute on function public.get_sent_family_messages(integer) from public, anon;
grant execute on function public.get_class_teams(uuid) to authenticated, service_role;
grant execute on function public.set_class_team_member(uuid, uuid, public.class_staff_role) to authenticated, service_role;
grant execute on function public.remove_class_team_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_my_classes() to authenticated, service_role;
grant execute on function public.get_my_class_children() to authenticated, service_role;
grant execute on function public.chat_directory(text, uuid) to authenticated, service_role;
grant execute on function public.send_family_message(uuid[], text, text, uuid) to authenticated, service_role;
grant execute on function public.get_parent_family_messages(integer) to authenticated, service_role;
grant execute on function public.mark_family_message_read(uuid) to authenticated, service_role;
grant execute on function public.get_sent_family_messages(integer) to authenticated, service_role;
grant select on public.family_messages, public.family_message_recipients, public.class_team_changes to authenticated;

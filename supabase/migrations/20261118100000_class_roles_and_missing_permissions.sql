-- The roles page carries the nursery's own class roles, and two screens gain their own permission.
--
-- A nursery's staff are a lead teacher, a co-teacher and a nanny, but the roles page only offered
-- "Teacher" and "Head of teachers": a co-teacher and a nanny had to be given a full teacher's
-- powers. Both are added to the roles every nursery is seeded from, so they reach the nurseries
-- that already exist and every one opened from now on.
--
-- Staff tasks and reminders were the only screens with no permission of their own — staff tasks
-- borrowed the staff directory's, so anyone who could see a colleague's file could run the tasks
-- board. Each gets its own, and the roles that could already reach them keep that reach.

-- 1 · The two screens that had no permission of their own.
insert into public.features (id, name_en, name_ar, category, description_en, description_ar, is_seed, actions, sort_order)
values
  ('staff_tasks', 'Staff tasks', 'مهام الموظفين', 'staff',
   'The tasks the nursery sets its staff, and whether they were done.',
   'المهام التي تحددها الحضانة لموظفيها، وهل تمت.',
   true, array['view', 'create', 'update', 'delete'], 50),
  ('reminders', 'Reminders', 'التذكيرات', 'staff',
   'Personal reminders a member of staff keeps.',
   'تذكيرات شخصية يحتفظ بها الموظف.',
   true, array['view', 'create', 'update', 'delete'], 60)
on conflict (id) do nothing;

-- Whoever could already reach the tasks board through the staff directory keeps it.
insert into public.role_features (role_id, feature_id, actions)
select rf.role_id, 'staff_tasks', rf.actions
  from public.role_features rf
 where rf.feature_id = 'staff'
on conflict (role_id, feature_id) do nothing;

-- 2 · The co-teacher and the nanny, as roles every nursery is seeded from.
insert into public.roles (nursery_id, key, name_en, name_ar, base_role, base_department, is_seed, is_system)
values
  (null, 'co_teacher', 'Co-teacher', 'معلّمة مشاركة', 'teacher'::public.user_role, null, true, false),
  (null, 'nanny', 'Nanny', 'مساعدة', 'teacher'::public.user_role, null, true, false)
on conflict (nursery_id, key) do nothing;

-- What a co-teacher needs: she teaches beside the lead, so she writes the day's reports and takes
-- the register, but the class itself and its team are the nursery's to change.
insert into public.role_features (role_id, feature_id, actions)
select r.id, v.feature_id, v.actions
  from public.roles r
  cross join (values
    ('classes', array['view']),
    ('class_team', array['view']),
    ('dashboard_attendance', array['view', 'create']),
    ('qr_scanner', array['view']),
    ('daily_reports', array['view', 'create', 'update']),
    ('health_alerts', array['view']),
    ('event_calendar', array['view']),
    ('media_library', array['view']),
    ('upload_media', array['view', 'create']),
    ('messages', array['view', 'create']),
    ('chat', array['view', 'create']),
    ('notifications', array['view']),
    ('newsfeed', array['view']),
    ('staff_tasks', array['view', 'update']),
    ('reminders', array['view', 'create', 'update', 'delete']),
    ('meals', array['view']),
    ('courses', array['view'])
  ) as v(feature_id, actions)
 where r.nursery_id is null and r.key = 'co_teacher'
on conflict (role_id, feature_id) do nothing;

-- What a nanny needs: she cares for the children beside the teachers — the register, the day as it
-- stands and the children's health notes — but does not write the reports or the messages home.
insert into public.role_features (role_id, feature_id, actions)
select r.id, v.feature_id, v.actions
  from public.roles r
  cross join (values
    ('classes', array['view']),
    ('dashboard_attendance', array['view', 'create']),
    ('qr_scanner', array['view']),
    ('daily_reports', array['view']),
    ('health_alerts', array['view']),
    ('event_calendar', array['view']),
    ('upload_media', array['view', 'create']),
    ('chat', array['view', 'create']),
    ('notifications', array['view']),
    ('staff_tasks', array['view', 'update']),
    ('reminders', array['view', 'create', 'update', 'delete']),
    ('meals', array['view'])
  ) as v(feature_id, actions)
 where r.nursery_id is null and r.key = 'nanny'
on conflict (role_id, feature_id) do nothing;

-- 3 · Every nursery that already exists gets its copy; new ones are seeded by their own trigger.
do $$
declare v_nursery uuid;
begin
  for v_nursery in select id from public.nurseries loop
    perform public.rbac_seed_nursery_roles(v_nursery);
  end loop;
end $$;

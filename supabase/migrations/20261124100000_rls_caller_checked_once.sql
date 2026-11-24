-- Every policy below asked who the caller is once for every row it looked at.
--
-- A policy is checked for each row a query reads. Calls such as public.current_user_role(),
-- public.current_user_nursery_id(), public.is_xo_super_admin() and auth.uid() give the same answer
-- for the whole query, but written bare the planner cannot know that (they are plpgsql or security
-- definer functions it cannot see into), so it ran them again for every row: a branch admin counting
-- 1,100 invoices made some 5,000 such calls. Wrapped in (select ...), each runs once per query and the
-- rows are compared with its answer: the same count took 21 ms before and 2 ms after.
--
-- Only the wrapping changes. Each policy keeps its name, roles, command and logic; the expressions are
-- the ones the database held (pg_policies), with these calls wrapped. public.user_can is wrapped only
-- where its arguments are constants. Calls that take a column of the row, such as
-- public.parent_can_access_child(child_id), depend on the row and stay as they are.
--
-- supabase/tests/database/rls_caller_checked_once.test.sql keeps new policies to the same form.

alter policy calendars_branch_admin_all on public.academic_calendars
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy calendars_chain_super_admin_all on public.academic_calendars
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy calendars_parent_select on public.academic_calendars
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (EXISTS ( SELECT 1
   FROM (public.children c
     JOIN public.parent_children pc ON ((pc.child_id = c.id)))
  WHERE ((pc.parent_id = (select auth.uid())) AND (c.nursery_id = academic_calendars.nursery_id))))));

alter policy calendars_teacher_select on public.academic_calendars
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy calendars_xo_super_admin_all on public.academic_calendars
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy activity_log_read on public.activity_log
  using (((select public.is_xo_super_admin()) OR (((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'manager'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))) OR (((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))));

alter policy admission_docs_branch_all on public.admission_documents
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.admissions a
  WHERE ((a.id = admission_documents.admission_id) AND (a.nursery_id = (select public.current_user_nursery_id())))))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.admissions a
  WHERE ((a.id = admission_documents.admission_id) AND (a.nursery_id = (select public.current_user_nursery_id())))))));

alter policy admission_docs_chain_all on public.admission_documents
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.admissions a
  WHERE ((a.id = admission_documents.admission_id) AND (a.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.admissions a
  WHERE ((a.id = admission_documents.admission_id) AND (a.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))));

alter policy admission_docs_parent_select_linked on public.admission_documents
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.admissions a
  WHERE ((a.id = admission_documents.admission_id) AND (a.linked_parent_user_id = (select auth.uid())))))));

alter policy admission_docs_teacher_select on public.admission_documents
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.admissions a
  WHERE ((a.id = admission_documents.admission_id) AND (a.nursery_id = (select public.current_user_nursery_id())))))));

alter policy admission_docs_xo_all on public.admission_documents
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy admissions_branch_all on public.admissions
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy admissions_chain_all on public.admissions
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy admissions_parent_select_linked on public.admissions
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (linked_parent_user_id = (select auth.uid()))));

alter policy admissions_teacher_select on public.admissions
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy admissions_xo_all on public.admissions
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy application_documents_admin_all on public.application_documents
  using ((EXISTS ( SELECT 1
   FROM public.applications a
  WHERE ((a.id = application_documents.application_id) AND (a.nursery_id = (select public.current_user_nursery_id())) AND ((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM public.applications a
  WHERE ((a.id = application_documents.application_id) AND (a.nursery_id = (select public.current_user_nursery_id())) AND ((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role]))))));

alter policy application_documents_parent_delete_draft on public.application_documents
  using ((EXISTS ( SELECT 1
   FROM public.applications a
  WHERE ((a.id = application_documents.application_id) AND (a.parent_id = (select auth.uid())) AND (a.status = 'draft'::text)))));

alter policy application_documents_parent_insert_requested on public.application_documents
  with check ((EXISTS ( SELECT 1
   FROM public.applications a
  WHERE ((a.id = application_documents.application_id) AND (a.parent_id = (select auth.uid())) AND (a.status = ANY (ARRAY['draft'::text, 'documents_pending'::text]))))));

alter policy application_documents_parent_select on public.application_documents
  using ((EXISTS ( SELECT 1
   FROM public.applications a
  WHERE ((a.id = application_documents.application_id) AND (a.parent_id = (select auth.uid()))))));

alter policy application_documents_parent_update_draft on public.application_documents
  using ((EXISTS ( SELECT 1
   FROM public.applications a
  WHERE ((a.id = application_documents.application_id) AND (a.parent_id = (select auth.uid())) AND (a.status = 'draft'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM public.applications a
  WHERE ((a.id = application_documents.application_id) AND (a.parent_id = (select auth.uid())) AND (a.status = 'draft'::text)))));

alter policy applications_admin_all on public.applications
  using ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy applications_parent_insert on public.applications
  with check (((parent_id = (select auth.uid())) AND (status = 'draft'::text)));

alter policy applications_parent_select on public.applications
  using ((parent_id = (select auth.uid())));

alter policy applications_parent_update_before_review on public.applications
  using (((parent_id = (select auth.uid())) AND (status = ANY (ARRAY['draft'::text, 'documents_pending'::text]))))
  with check (((parent_id = (select auth.uid())) AND (status = ANY (ARRAY['draft'::text, 'documents_pending'::text, 'submitted'::text]))));

alter policy absence_reports_delete on public.attendance_absence_reports
  using (((public.parent_can_access_child(child_id) AND (reported_by = (select auth.uid())) AND (absence_date >= CURRENT_DATE)) OR public.attendance_staff_can_access_child(child_id)));

alter policy attendance_parent_select on public.attendance_records
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND public.parent_can_access_child(child_id)));

alter policy pickups_branch_admin_all on public.authorized_pickups
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.children c
  WHERE ((c.id = authorized_pickups.child_id) AND (c.nursery_id = (select public.current_user_nursery_id())))))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.children c
  WHERE ((c.id = authorized_pickups.child_id) AND (c.nursery_id = (select public.current_user_nursery_id())))))));

alter policy pickups_chain_super_admin_all on public.authorized_pickups
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.children c
  WHERE ((c.id = authorized_pickups.child_id) AND (c.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.children c
  WHERE ((c.id = authorized_pickups.child_id) AND (c.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))));

alter policy pickups_parent_select on public.authorized_pickups
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND public.parent_can_access_child(child_id)));

alter policy pickups_xo_super_admin_all on public.authorized_pickups
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy bcast_branch_all on public.broadcast_messages
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy bcast_chain_all on public.broadcast_messages
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy bcast_parent_select on public.broadcast_messages
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (target_role = 'parent'::public.user_role) AND (((audience_scope = ANY (ARRAY['all_parents'::text, 'role'::text])) AND (nursery_id IN ( SELECT DISTINCT c.nursery_id
   FROM (public.children c
     JOIN public.parent_children pc ON ((pc.child_id = c.id)))
  WHERE (pc.parent_id = (select auth.uid()))))) OR ((audience_scope = 'class'::text) AND (class_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (public.parent_children pc2
     JOIN public.children c2 ON ((c2.id = pc2.child_id)))
  WHERE ((pc2.parent_id = (select auth.uid())) AND (c2.class_id = broadcast_messages.class_id))))))));

alter policy bcast_teacher_select on public.broadcast_messages
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id())) AND ((target_role = 'teacher'::public.user_role) OR (sender_id = (select auth.uid())))));

alter policy bcast_teacher_update_own on public.broadcast_messages
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id())) AND (sender_id = (select auth.uid()))))
  with check ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id())) AND (sender_id = (select auth.uid()))));

alter policy bcast_xo_all on public.broadcast_messages
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy broadcast_messages_manager_all on public.broadcast_messages
  using ((((select public.current_user_role()) = 'manager'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'manager'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy parents_can_read_class_broadcasts on public.broadcast_messages
  using (((audience_scope = 'class'::text) AND (class_id IN ( SELECT c.class_id
   FROM (public.children c
     JOIN public.parent_children pc ON ((pc.child_id = c.id)))
  WHERE (pc.parent_id = (select auth.uid()))))));

alter policy batt_branch_all on public.bus_attendance
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.bus_routes br
  WHERE ((br.id = bus_attendance.route_id) AND (br.nursery_id = (select public.current_user_nursery_id())))))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.bus_routes br
  WHERE ((br.id = bus_attendance.route_id) AND (br.nursery_id = (select public.current_user_nursery_id())))))));

alter policy batt_chain_all on public.bus_attendance
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.bus_routes br
  WHERE ((br.id = bus_attendance.route_id) AND (br.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.bus_routes br
  WHERE ((br.id = bus_attendance.route_id) AND (br.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))));

alter policy batt_parent_select on public.bus_attendance
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND public.parent_can_access_child(child_id)));

alter policy batt_teacher_all on public.bus_attendance
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.bus_routes br
  WHERE ((br.id = bus_attendance.route_id) AND (br.nursery_id = (select public.current_user_nursery_id())))))))
  with check ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.bus_routes br
  WHERE ((br.id = bus_attendance.route_id) AND (br.nursery_id = (select public.current_user_nursery_id())))))));

alter policy batt_xo_all on public.bus_attendance
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy broutes_branch_all on public.bus_routes
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy broutes_chain_all on public.bus_routes
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy broutes_parent_select on public.bus_routes
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (EXISTS ( SELECT 1
   FROM (public.children c
     JOIN public.parent_children pc ON ((pc.child_id = c.id)))
  WHERE ((pc.parent_id = (select auth.uid())) AND (c.nursery_id = bus_routes.nursery_id))))));

alter policy broutes_teacher_select on public.bus_routes
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy broutes_xo_all on public.bus_routes
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy camacc_branch_all on public.camera_access
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.cameras c
  WHERE ((c.id = camera_access.camera_id) AND (c.nursery_id = (select public.current_user_nursery_id())))))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.cameras c
  WHERE ((c.id = camera_access.camera_id) AND (c.nursery_id = (select public.current_user_nursery_id())))))));

alter policy camacc_chain_all on public.camera_access
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.cameras c
  WHERE ((c.id = camera_access.camera_id) AND (c.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.cameras c
  WHERE ((c.id = camera_access.camera_id) AND (c.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))));

alter policy camacc_parent_select on public.camera_access
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (parent_id = (select auth.uid()))));

alter policy camacc_teacher_deny on public.camera_access
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND false));

alter policy camacc_xo_all on public.camera_access
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy cameras_branch_all on public.cameras
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy cameras_chain_all on public.cameras
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy cameras_parent_select_granted on public.cameras
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.camera_access ca
  WHERE ((ca.camera_id = cameras.id) AND (ca.parent_id = (select auth.uid())) AND (ca.active = true))))));

alter policy cameras_teacher_select on public.cameras
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy cameras_xo_all on public.cameras
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy chains_branch_admin_select on public.chains
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.nurseries n
  WHERE ((n.id = (select public.current_user_nursery_id())) AND (n.chain_id = chains.id))))));

alter policy chains_chain_super_admin_all on public.chains
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (id = (select public.current_user_chain_id()))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (id = (select public.current_user_chain_id()))));

alter policy chains_parent_deny on public.chains
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND false));

alter policy chains_teacher_select on public.chains
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.nurseries n
  WHERE ((n.id = (select public.current_user_nursery_id())) AND (n.chain_id = chains.id))))));

alter policy chains_xo_super_admin_all on public.chains
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy chat_member_select_own on public.chat_conversation_members
  using ((user_id = (select auth.uid())));

alter policy chat_member_self_update on public.chat_conversation_members
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy chat_conv_delete on public.chat_conversations
  using (((created_by = (select auth.uid())) OR public.is_chat_admin(id) OR public.can_moderate_chat(id)));

alter policy chat_conv_insert on public.chat_conversations
  with check ((created_by = (select auth.uid())));

alter policy chat_msg_delete on public.chat_messages
  using (((sender_id = (select auth.uid())) OR public.is_chat_admin(conversation_id) OR public.can_moderate_chat(conversation_id)));

alter policy chat_msg_insert on public.chat_messages
  with check (((sender_id = (select auth.uid())) AND (public.can_write_chat(conversation_id) OR public.can_moderate_chat(conversation_id))));

alter policy child_allergies_branch_all on public.child_allergies
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy child_allergies_chain_all on public.child_allergies
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy child_allergies_manager_select on public.child_allergies
  using ((((select public.current_user_role()) = 'manager'::public.user_role) AND public.rls_staff_can_access_child(child_id)));

alter policy child_allergies_parent_select on public.child_allergies
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND public.parent_can_access_child(child_id)));

alter policy child_allergies_xo_all on public.child_allergies
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy child_chronic_branch_all on public.child_chronic_conditions
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy child_chronic_chain_all on public.child_chronic_conditions
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy child_chronic_manager_select on public.child_chronic_conditions
  using ((((select public.current_user_role()) = 'manager'::public.user_role) AND public.rls_staff_can_access_child(child_id)));

alter policy child_chronic_parent_select on public.child_chronic_conditions
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND public.parent_can_access_child(child_id)));

alter policy child_chronic_xo_all on public.child_chronic_conditions
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy "Admins can manage diaper care" on public.child_diaper_care
  using ((EXISTS ( SELECT 1
   FROM (public.children c
     JOIN public.users u ON ((u.nursery_id = c.nursery_id)))
  WHERE ((c.id = child_diaper_care.child_id) AND (u.id = (select auth.uid())) AND (u.role = 'branch_admin'::public.user_role)))));

alter policy "Parents can view own children diaper care" on public.child_diaper_care
  using ((child_id IN ( SELECT pc.child_id
   FROM public.parent_children pc
  WHERE (pc.parent_id = (select auth.uid())))));

alter policy "Staff can view nursery children diaper care" on public.child_diaper_care
  using ((EXISTS ( SELECT 1
   FROM (public.children c
     JOIN public.users u ON ((u.nursery_id = c.nursery_id)))
  WHERE ((c.id = child_diaper_care.child_id) AND (u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['branch_admin'::public.user_role, 'teacher'::public.user_role]))))));

alter policy "Admins can manage dietary prefs" on public.child_dietary_preferences
  using ((EXISTS ( SELECT 1
   FROM (public.children c
     JOIN public.users u ON ((u.nursery_id = c.nursery_id)))
  WHERE ((c.id = child_dietary_preferences.child_id) AND (u.id = (select auth.uid())) AND (u.role = 'branch_admin'::public.user_role)))));

alter policy "Parents can view own children dietary prefs" on public.child_dietary_preferences
  using ((child_id IN ( SELECT pc.child_id
   FROM public.parent_children pc
  WHERE (pc.parent_id = (select auth.uid())))));

alter policy "Staff can view nursery children dietary prefs" on public.child_dietary_preferences
  using ((EXISTS ( SELECT 1
   FROM (public.children c
     JOIN public.users u ON ((u.nursery_id = c.nursery_id)))
  WHERE ((c.id = child_dietary_preferences.child_id) AND (u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['branch_admin'::public.user_role, 'teacher'::public.user_role]))))));

alter policy child_documents_parent_select on public.child_documents
  using ((EXISTS ( SELECT 1
   FROM public.parent_children pc
  WHERE ((pc.child_id = child_documents.child_id) AND (pc.parent_id = (select auth.uid()))))));

alter policy child_health_dismissals_branch_all on public.child_health_alert_dismissals
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy child_health_dismissals_chain_all on public.child_health_alert_dismissals
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy child_health_dismissals_xo_all on public.child_health_alert_dismissals
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy child_health_docs_branch_all on public.child_health_documents
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy child_health_docs_chain_all on public.child_health_documents
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy child_health_docs_parent_insert on public.child_health_documents
  with check ((((select public.current_user_role()) = 'parent'::public.user_role) AND (uploaded_by = (select auth.uid())) AND public.parent_can_access_child(child_id) AND (EXISTS ( SELECT 1
   FROM public.children c
  WHERE ((c.id = child_health_documents.child_id) AND (c.nursery_id = child_health_documents.nursery_id))))));

alter policy child_health_docs_parent_select on public.child_health_documents
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND public.parent_can_access_child(child_id)));

alter policy child_health_docs_xo_all on public.child_health_documents
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy parents_read_own_children_health_docs on public.child_health_documents
  using ((child_id IN ( SELECT parent_children.child_id
   FROM public.parent_children
  WHERE (parent_children.parent_id = (select auth.uid())))));

alter policy parents_upload_own_children_health_docs on public.child_health_documents
  with check ((child_id IN ( SELECT parent_children.child_id
   FROM public.parent_children
  WHERE (parent_children.parent_id = (select auth.uid())))));

alter policy staff_read_nursery_health_docs on public.child_health_documents
  using ((EXISTS ( SELECT 1
   FROM (public.children c
     JOIN public.users u ON ((u.nursery_id = c.nursery_id)))
  WHERE ((c.id = child_health_documents.child_id) AND (u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['teacher'::public.user_role, 'branch_admin'::public.user_role, 'chain_super_admin'::public.user_role]))))));

alter policy child_health_admin_all on public.child_health_records
  using ((EXISTS ( SELECT 1
   FROM (public.children c
     JOIN public.users u ON ((u.nursery_id = c.nursery_id)))
  WHERE ((c.id = child_health_records.child_id) AND (u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role, 'xo_super_admin'::public.user_role]))))));

alter policy child_health_parent_select on public.child_health_records
  using ((EXISTS ( SELECT 1
   FROM (public.parent_children pc
     JOIN public.children c ON ((pc.child_id = c.id)))
  WHERE ((c.id = child_health_records.child_id) AND (pc.parent_id = (select auth.uid()))))));

alter policy child_health_records_branch_all on public.child_health_records
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy child_health_records_chain_all on public.child_health_records
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy child_health_records_manager_select on public.child_health_records
  using ((((select public.current_user_role()) = 'manager'::public.user_role) AND public.rls_staff_can_access_child(child_id)));

alter policy child_health_records_parent_insert on public.child_health_records
  with check ((((select public.current_user_role()) = 'parent'::public.user_role) AND public.parent_can_access_child(child_id) AND (EXISTS ( SELECT 1
   FROM public.children c
  WHERE ((c.id = child_health_records.child_id) AND (c.nursery_id = c.nursery_id))))));

alter policy child_health_records_parent_select on public.child_health_records
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND public.parent_can_access_child(child_id)));

alter policy child_health_records_xo_all on public.child_health_records
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy child_health_staff_select on public.child_health_records
  using ((EXISTS ( SELECT 1
   FROM (public.children c
     JOIN public.users u ON ((u.nursery_id = c.nursery_id)))
  WHERE ((c.id = child_health_records.child_id) AND (u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['branch_admin'::public.user_role, 'teacher'::public.user_role, 'chain_super_admin'::public.user_role, 'xo_super_admin'::public.user_role]))))));

alter policy parents_insert_own_children_health_record on public.child_health_records
  with check ((child_id IN ( SELECT parent_children.child_id
   FROM public.parent_children
  WHERE (parent_children.parent_id = (select auth.uid())))));

alter policy child_health_requests_branch_all on public.child_health_update_requests
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy child_health_requests_chain_all on public.child_health_update_requests
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy child_health_requests_parent_insert on public.child_health_update_requests
  with check ((((select public.current_user_role()) = 'parent'::public.user_role) AND (parent_id = (select auth.uid())) AND public.parent_can_access_child(child_id) AND (EXISTS ( SELECT 1
   FROM public.children c
  WHERE ((c.id = child_health_update_requests.child_id) AND (c.nursery_id = c.nursery_id))))));

alter policy child_health_requests_parent_select on public.child_health_update_requests
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (parent_id = (select auth.uid())) AND public.parent_can_access_child(child_id)));

alter policy child_health_requests_xo_all on public.child_health_update_requests
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy child_medications_branch_all on public.child_medications
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy child_medications_chain_all on public.child_medications
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy child_medications_parent_select on public.child_medications
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND public.parent_can_access_child(child_id)));

alter policy child_medications_xo_all on public.child_medications
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy child_packages_admin_delete on public.child_packages
  using ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy child_packages_admin_select on public.child_packages
  using ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy child_packages_admin_update on public.child_packages
  using ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy child_packages_parent_select on public.child_packages
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.parent_children pc
  WHERE ((pc.child_id = child_packages.child_id) AND (pc.parent_id = (select auth.uid())))))));

alter policy child_packages_perm_delete on public.child_packages
  using ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('packages'::text, 'delete'::text))));

alter policy child_packages_perm_select on public.child_packages
  using ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('packages'::text, 'view'::text))));

alter policy child_packages_perm_update on public.child_packages
  using ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('packages'::text, 'update'::text))))
  with check ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('packages'::text, 'update'::text))));

alter policy child_packages_teacher_select on public.child_packages
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy child_packages_xo_all on public.child_packages
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy child_tuition_subscriptions_admin_all on public.child_tuition_subscriptions
  using ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy child_tuition_subscriptions_parent_select on public.child_tuition_subscriptions
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.parent_children pc
  WHERE ((pc.child_id = child_tuition_subscriptions.child_id) AND (pc.parent_id = (select auth.uid())))))));

alter policy child_tuition_subscriptions_staff_select on public.child_tuition_subscriptions
  using ((((select public.current_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'manager'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy child_tuition_subscriptions_xo_all on public.child_tuition_subscriptions
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy child_vaccinations_branch_all on public.child_vaccinations
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy child_vaccinations_chain_all on public.child_vaccinations
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy child_vaccinations_parent_select on public.child_vaccinations
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND public.parent_can_access_child(child_id)));

alter policy child_vaccinations_xo_all on public.child_vaccinations
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy children_chain_super_admin_all on public.children
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy children_manager_all on public.children
  using ((((select public.current_user_role()) = 'manager'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'manager'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy children_teacher_select on public.children
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id())) AND (class_id IN ( SELECT public.teacher_assigned_class_ids() AS teacher_assigned_class_ids))));

alter policy class_staff_branch_admin_all on public.class_staff
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (class_id IN ( SELECT classes.id
   FROM public.classes
  WHERE (classes.nursery_id = (select public.current_user_nursery_id()))))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (class_id IN ( SELECT classes.id
   FROM public.classes
  WHERE (classes.nursery_id = (select public.current_user_nursery_id()))))));

alter policy class_staff_chain_admin_all on public.class_staff
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (class_id IN ( SELECT classes.id
   FROM public.classes
  WHERE (classes.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (class_id IN ( SELECT classes.id
   FROM public.classes
  WHERE (classes.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))));

alter policy class_staff_manager_all on public.class_staff
  using ((((select public.current_user_role()) = 'manager'::public.user_role) AND (class_id IN ( SELECT classes.id
   FROM public.classes
  WHERE (classes.nursery_id = (select public.current_user_nursery_id()))))))
  with check ((((select public.current_user_role()) = 'manager'::public.user_role) AND (class_id IN ( SELECT classes.id
   FROM public.classes
  WHERE (classes.nursery_id = (select public.current_user_nursery_id()))))));

alter policy class_staff_parent_select on public.class_staff
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND public.rls_parent_has_child_in_class(class_id)));

alter policy class_staff_teacher_select on public.class_staff
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (class_id IN ( SELECT classes.id
   FROM public.classes
  WHERE (classes.nursery_id = (select public.current_user_nursery_id()))))));

alter policy class_staff_xo_all on public.class_staff
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy class_team_changes_read on public.class_team_changes
  using (((select public.is_xo_super_admin()) OR ((nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('class_team'::text, 'view'::text)))));

alter policy classes_branch_admin_all on public.classes
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy classes_chain_super_admin_all on public.classes
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy classes_manager_all on public.classes
  using ((((select public.current_user_role()) = 'manager'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'manager'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy classes_parent_select on public.classes
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (id IN ( SELECT public.parent_accessible_class_ids() AS parent_accessible_class_ids))));

alter policy classes_teacher_select on public.classes
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy classes_teacher_update_assigned on public.classes
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (id IN ( SELECT public.current_user_class_staff_ids() AS current_user_class_staff_ids))))
  with check ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (id IN ( SELECT public.current_user_class_staff_ids() AS current_user_class_staff_ids))));

alter policy classes_xo_super_admin_all on public.classes
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy ccom_branch_all on public.community_comments
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.community_posts p
  WHERE ((p.id = community_comments.post_id) AND (p.nursery_id = (select public.current_user_nursery_id())))))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.community_posts p
  WHERE ((p.id = community_comments.post_id) AND (p.nursery_id = (select public.current_user_nursery_id())))))));

alter policy ccom_chain_all on public.community_comments
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.community_posts p
  WHERE ((p.id = community_comments.post_id) AND (p.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.community_posts p
  WHERE ((p.id = community_comments.post_id) AND (p.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))));

alter policy ccom_parent_all on public.community_comments
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.community_posts p
  WHERE ((p.id = community_comments.post_id) AND (EXISTS ( SELECT 1
           FROM (public.children c
             JOIN public.parent_children pc ON ((pc.child_id = c.id)))
          WHERE ((pc.parent_id = (select auth.uid())) AND (c.nursery_id = p.nursery_id))))))) AND ((author_id = (select auth.uid())) OR (status = 'approved'::text))))
  with check ((((select public.current_user_role()) = 'parent'::public.user_role) AND (author_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.community_posts p
  WHERE ((p.id = community_comments.post_id) AND (EXISTS ( SELECT 1
           FROM (public.children c
             JOIN public.parent_children pc ON ((pc.child_id = c.id)))
          WHERE ((pc.parent_id = (select auth.uid())) AND (c.nursery_id = p.nursery_id)))))))));

alter policy ccom_teacher_select on public.community_comments
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.community_posts p
  WHERE ((p.id = community_comments.post_id) AND (p.nursery_id = (select public.current_user_nursery_id())))))));

alter policy ccom_xo_all on public.community_comments
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy cposts_branch_all on public.community_posts
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy cposts_chain_all on public.community_posts
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy cposts_parent_all on public.community_posts
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (EXISTS ( SELECT 1
   FROM (public.children c
     JOIN public.parent_children pc ON ((pc.child_id = c.id)))
  WHERE ((pc.parent_id = (select auth.uid())) AND (c.nursery_id = community_posts.nursery_id)))) AND ((author_id = (select auth.uid())) OR (status = 'approved'::text))))
  with check ((((select public.current_user_role()) = 'parent'::public.user_role) AND (author_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM (public.children c
     JOIN public.parent_children pc ON ((pc.child_id = c.id)))
  WHERE ((pc.parent_id = (select auth.uid())) AND (c.nursery_id = community_posts.nursery_id))))));

alter policy cposts_teacher_select on public.community_posts
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy cposts_xo_all on public.community_posts
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy compliance_branch_admin_all on public.compliance_docs
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy compliance_chain_super_admin_all on public.compliance_docs
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy compliance_parent_deny on public.compliance_docs
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND false));

alter policy compliance_teacher_select on public.compliance_docs
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy compliance_xo_super_admin_all on public.compliance_docs
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy content_library_admin_all on public.content_library
  using ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy content_library_parent_read on public.content_library
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy content_library_teacher_read on public.content_library
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy course_requests_read on public.course_enrollment_requests
  using ((public.is_nursery_staff(nursery_id, false) OR (((select public.current_user_role()) = 'parent'::public.user_role) AND public.parent_can_access_child(child_id))));

alter policy course_enrollments_branch_all on public.course_enrollments
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND public.course_in_my_nursery(course_id)));

alter policy course_enrollments_chain_all on public.course_enrollments
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND public.course_in_my_nursery(course_id)));

alter policy course_enrollments_parent_select on public.course_enrollments
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND public.parent_has_child(child_id)));

alter policy course_enrollments_teacher_select on public.course_enrollments
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND public.course_taught_by_me(course_id)));

alter policy course_invoices_branch_all on public.course_invoices
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy course_invoices_chain_all on public.course_invoices
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy course_invoices_parent_select on public.course_invoices
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND public.parent_has_child(child_id)));

alter policy courses_branch_all on public.courses
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy courses_chain_all on public.courses
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy courses_parent_select on public.courses
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND public.parent_has_child_in_course(id)));

alter policy courses_teacher_select on public.courses
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (teacher_user_id = (select auth.uid()))));

alter policy daily_reports_manager_all on public.daily_reports
  using ((((select public.current_user_role()) = 'manager'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'manager'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy parents_can_read_published_reports_for_their_children on public.daily_reports
  using (((status = 'published'::text) AND (EXISTS ( SELECT 1
   FROM public.parent_children pc
  WHERE ((pc.parent_id = (select auth.uid())) AND (pc.child_id = daily_reports.child_id))))));

alter policy reports_branch_all on public.daily_reports
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.children c
  WHERE ((c.id = daily_reports.child_id) AND (c.nursery_id = (select public.current_user_nursery_id())))))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.children c
  WHERE ((c.id = daily_reports.child_id) AND (c.nursery_id = (select public.current_user_nursery_id())))))));

alter policy reports_chain_all on public.daily_reports
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.children c
  WHERE ((c.id = daily_reports.child_id) AND (c.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.children c
  WHERE ((c.id = daily_reports.child_id) AND (c.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))));

alter policy reports_parent_select on public.daily_reports
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (status = 'published'::text) AND public.parent_can_access_child(child_id)));

alter policy reports_xo_all on public.daily_reports
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy staff_can_read_reports_for_their_nursery on public.daily_reports
  using ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = (select auth.uid())) AND (users.role = ANY (ARRAY['teacher'::public.user_role, 'branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (users.nursery_id = daily_reports.nursery_id)))));

alter policy deals_admin_all on public.deals
  using ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy deals_parent_select on public.deals
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (EXISTS ( SELECT 1
   FROM (public.applications a
     JOIN public.tuition_packages tp ON (((tp.nursery_id = a.nursery_id) AND (tp.deal_id = deals.id))))
  WHERE ((a.parent_id = (select auth.uid())) AND (tp.active = true) AND (deals.nursery_id = a.nursery_id))))));

alter policy deals_perm_delete on public.deals
  using ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('deals'::text, 'delete'::text))));

alter policy deals_perm_insert on public.deals
  with check ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('deals'::text, 'create'::text))));

alter policy deals_perm_select on public.deals
  using ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('deals'::text, 'view'::text))));

alter policy deals_perm_update on public.deals
  using ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('deals'::text, 'update'::text))))
  with check ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('deals'::text, 'update'::text))));

alter policy deals_staff_select on public.deals
  using ((((select public.current_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'manager'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy deals_xo_all on public.deals
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy discount_partners_staff_select on public.discount_partners
  using (((select public.is_xo_super_admin()) OR ((nursery_id IS NOT NULL) AND public.rls_staff_manages_nursery(nursery_id)) OR ((chain_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.nurseries n
  WHERE ((n.chain_id = discount_partners.chain_id) AND public.rls_staff_manages_nursery(n.id)))))));

alter policy event_attendance_parent_select on public.event_attendance
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (child_id IN ( SELECT pc.child_id
   FROM public.parent_children pc
  WHERE (pc.parent_id = (select auth.uid()))))));

alter policy event_attendance_staff_select on public.event_attendance
  using (((select public.is_xo_super_admin()) OR (((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))) OR (((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))));

alter policy events_branch_all on public.events
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy events_chain_all on public.events
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy events_manager_all on public.events
  using ((((select public.current_user_role()) = 'manager'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'manager'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy events_parent_select on public.events
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND ((parent_created_by = (select auth.uid())) OR ((status <> 'draft'::text) AND public.rls_parent_sees_event(id, nursery_id, target_scope, target_class_id)))));

alter policy events_teacher_select on public.events
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy events_xo_all on public.events
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy family_message_recipients_read on public.family_message_recipients
  using (((parent_id = (select auth.uid())) OR (select public.is_xo_super_admin())));

alter policy family_messages_read on public.family_messages
  using (((sender_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM public.family_message_recipients r
  WHERE ((r.message_id = family_messages.id) AND (r.parent_id = (select auth.uid()))))) OR (select public.is_xo_super_admin()) OR (((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'manager'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())))));

alter policy features_xo_manage on public.features
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy food_branch_all on public.food_menus
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy food_chain_all on public.food_menus
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy food_parent_select on public.food_menus
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (EXISTS ( SELECT 1
   FROM (public.children c
     JOIN public.parent_children pc ON ((pc.child_id = c.id)))
  WHERE ((pc.parent_id = (select auth.uid())) AND (c.nursery_id = food_menus.nursery_id))))));

alter policy food_teacher_select on public.food_menus
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy food_xo_all on public.food_menus
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy hart_branch_select on public.health_articles
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (status = 'published'::text)));

alter policy hart_branch_update_pin on public.health_articles
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (status = 'published'::text)))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (status = 'published'::text) AND ((pinned_by_nursery_id IS NULL) OR (pinned_by_nursery_id = (select public.current_user_nursery_id())))));

alter policy hart_chain_select on public.health_articles
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (status = 'published'::text)));

alter policy hart_parent_select on public.health_articles
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (status = 'published'::text)));

alter policy hart_teacher_select on public.health_articles
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (status = 'published'::text)));

alter policy hart_xo_all on public.health_articles
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy health_branch_all on public.health_records
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.children c
  WHERE ((c.id = health_records.child_id) AND (c.nursery_id = (select public.current_user_nursery_id())))))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.children c
  WHERE ((c.id = health_records.child_id) AND (c.nursery_id = (select public.current_user_nursery_id())))))));

alter policy health_chain_all on public.health_records
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.children c
  WHERE ((c.id = health_records.child_id) AND (c.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.children c
  WHERE ((c.id = health_records.child_id) AND (c.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))));

alter policy health_parent_select on public.health_records
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND public.parent_can_access_child(child_id)));

alter policy health_xo_all on public.health_records
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy branch_admin_import_jobs_own_nursery on public.import_jobs
  using ((nursery_id IN ( SELECT users.nursery_id
   FROM public.users
  WHERE ((users.id = (select auth.uid())) AND (users.role = 'branch_admin'::public.user_role)))));

alter policy import_jobs_branch_admin on public.import_jobs
  using ((nursery_id IN ( SELECT u.nursery_id
   FROM public.users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = 'branch_admin'::public.user_role)))));

alter policy import_jobs_chain_super_admin on public.import_jobs
  using ((EXISTS ( SELECT 1
   FROM (public.nurseries n
     JOIN public.users u ON ((u.id = (select auth.uid()))))
  WHERE ((n.id = import_jobs.nursery_id) AND (n.chain_id = u.chain_id) AND (u.role = 'chain_super_admin'::public.user_role)))));

alter policy import_jobs_xo_admin on public.import_jobs
  using ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = 'xo_super_admin'::public.user_role)))));

alter policy xo_super_admin_import_jobs_all on public.import_jobs
  using ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = (select auth.uid())) AND (users.role = 'xo_super_admin'::public.user_role)))));

alter policy inquiries_admin_all on public.inquiries
  using ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy inv_branch_read on public.inventory
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy inv_chain_read on public.inventory
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy inv_parent_deny on public.inventory
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND false));

alter policy inv_teacher_select on public.inventory
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy inv_xo_read on public.inventory
  using ((select public.is_xo_super_admin()));

alter policy invoices_branch_all on public.invoices
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy invoices_chain_all on public.invoices
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy invoices_parent_select on public.invoices
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (parent_id IN ( SELECT public.my_family_billers() AS my_family_billers)) AND public.invoice_family_member((select auth.uid()), invoices.*)));

alter policy invoices_perm_delete on public.invoices
  using ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('invoices'::text, 'delete'::text))));

alter policy invoices_perm_insert on public.invoices
  with check ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('invoices'::text, 'create'::text))));

alter policy invoices_perm_select on public.invoices
  using ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('invoices'::text, 'view'::text))));

alter policy invoices_perm_update on public.invoices
  using ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('invoices'::text, 'update'::text))))
  with check ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('invoices'::text, 'update'::text))));

alter policy invoices_teacher_deny on public.invoices
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND false));

alter policy invoices_xo_all on public.invoices
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy kitchen_charges_read on public.kitchen_charges
  using ((public.menu_can_edit(nursery_id) OR (staff_user_id = (select auth.uid()))));

alter policy lpoints_branch_all on public.loyalty_points
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy lpoints_chain_all on public.loyalty_points
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy lpoints_parent_select on public.loyalty_points
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (parent_id = (select auth.uid()))));

alter policy lpoints_teacher_deny on public.loyalty_points
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND false));

alter policy lpoints_xo_all on public.loyalty_points
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy lred_branch_all on public.loyalty_redemptions
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.loyalty_rewards r
  WHERE ((r.id = loyalty_redemptions.reward_id) AND (r.nursery_id = (select public.current_user_nursery_id())))))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.loyalty_rewards r
  WHERE ((r.id = loyalty_redemptions.reward_id) AND (r.nursery_id = (select public.current_user_nursery_id())))))));

alter policy lred_chain_all on public.loyalty_redemptions
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.loyalty_rewards r
  WHERE ((r.id = loyalty_redemptions.reward_id) AND (r.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.loyalty_rewards r
  WHERE ((r.id = loyalty_redemptions.reward_id) AND (r.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))));

alter policy lred_parent_own on public.loyalty_redemptions
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (parent_id = (select auth.uid()))))
  with check ((((select public.current_user_role()) = 'parent'::public.user_role) AND (parent_id = (select auth.uid()))));

alter policy lred_teacher_deny on public.loyalty_redemptions
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND false));

alter policy lred_xo_all on public.loyalty_redemptions
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy lrew_branch_all on public.loyalty_rewards
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy lrew_chain_all on public.loyalty_rewards
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy lrew_parent_select on public.loyalty_rewards
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (EXISTS ( SELECT 1
   FROM (public.children c
     JOIN public.parent_children pc ON ((pc.child_id = c.id)))
  WHERE ((pc.parent_id = (select auth.uid())) AND (c.nursery_id = loyalty_rewards.nursery_id))))));

alter policy lrew_teacher_deny on public.loyalty_rewards
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND false));

alter policy lrew_xo_all on public.loyalty_rewards
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy loyalty_transactions_admin_all on public.loyalty_transactions
  using ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy loyalty_transactions_parent_select_own on public.loyalty_transactions
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (parent_id = (select auth.uid()))));

alter policy meal_plans_admin_all on public.meal_plans
  using ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy meal_plans_parent_select on public.meal_plans
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy media_manager_all on public.media
  using ((((select public.current_user_role()) = 'manager'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'manager'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy media_parent_select on public.media
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND public.rls_media_parent_may_view(id)));

alter policy media_teacher_own on public.media
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (uploaded_by = (select auth.uid())) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (uploaded_by = (select auth.uid())) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy media_xo_all on public.media
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy media_children_select on public.media_children
  using ((public.rls_media_staff_media_row_ok(media_id) OR (((select public.current_user_role()) = 'parent'::public.user_role) AND public.rls_media_parent_may_view(media_id))));

alter policy media_visibility_select on public.media_visibility
  using ((public.rls_media_staff_media_row_ok(media_id) OR (((select public.current_user_role()) = 'parent'::public.user_role) AND public.rls_media_parent_may_view(media_id))));

alter policy message_deliveries_staff_select on public.message_deliveries
  using (((select public.is_xo_super_admin()) OR (EXISTS ( SELECT 1
   FROM (public.users u
     LEFT JOIN public.nurseries n ON ((n.id = message_deliveries.nursery_id)))
  WHERE ((u.id = (select auth.uid())) AND (((u.role = ANY (ARRAY['branch_admin'::public.user_role, 'manager'::public.user_role])) AND (u.nursery_id = message_deliveries.nursery_id)) OR ((u.role = 'chain_super_admin'::public.user_role) AND (n.chain_id IS NOT NULL) AND (n.chain_id = u.chain_id))))))));

alter policy msg_branch_all on public.messages
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.users us
  WHERE ((us.id = messages.sender_id) AND (us.nursery_id = (select public.current_user_nursery_id()))))) AND (EXISTS ( SELECT 1
   FROM public.users ur
  WHERE ((ur.id = messages.receiver_id) AND (ur.nursery_id = (select public.current_user_nursery_id())))))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.users us
  WHERE ((us.id = messages.sender_id) AND (us.nursery_id = (select public.current_user_nursery_id()))))) AND (EXISTS ( SELECT 1
   FROM public.users ur
  WHERE ((ur.id = messages.receiver_id) AND (ur.nursery_id = (select public.current_user_nursery_id())))))));

alter policy msg_chain_all on public.messages
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM (public.users us
     JOIN public.nurseries n ON ((n.id = us.nursery_id)))
  WHERE ((us.id = messages.sender_id) AND (n.chain_id = (select public.current_user_chain_id()))))) AND (EXISTS ( SELECT 1
   FROM (public.users ur
     JOIN public.nurseries n ON ((n.id = ur.nursery_id)))
  WHERE ((ur.id = messages.receiver_id) AND (n.chain_id = (select public.current_user_chain_id())))))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM (public.users us
     JOIN public.nurseries n ON ((n.id = us.nursery_id)))
  WHERE ((us.id = messages.sender_id) AND (n.chain_id = (select public.current_user_chain_id()))))) AND (EXISTS ( SELECT 1
   FROM (public.users ur
     JOIN public.nurseries n ON ((n.id = ur.nursery_id)))
  WHERE ((ur.id = messages.receiver_id) AND (n.chain_id = (select public.current_user_chain_id())))))));

alter policy msg_parent_insert on public.messages
  with check ((((select public.current_user_role()) = 'parent'::public.user_role) AND (sender_id = (select auth.uid()))));

alter policy msg_parent_mark_read on public.messages
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (receiver_id = (select auth.uid()))))
  with check ((((select public.current_user_role()) = 'parent'::public.user_role) AND (receiver_id = (select auth.uid()))));

alter policy msg_parent_select on public.messages
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND ((sender_id = (select auth.uid())) OR (receiver_id = (select auth.uid())))));

alter policy msg_teacher_participant on public.messages
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND ((sender_id = (select auth.uid())) OR (receiver_id = (select auth.uid())))))
  with check ((((select public.current_user_role()) = 'teacher'::public.user_role) AND ((sender_id = (select auth.uid())) OR (receiver_id = (select auth.uid())))));

alter policy msg_xo_all on public.messages
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy milestones_parent_select on public.milestones
  using (((deleted_at IS NULL) AND shared_with_parent AND ((select public.current_user_role()) = 'parent'::public.user_role) AND public.parent_can_access_child(child_id)));

alter policy milestones_staff_select on public.milestones
  using (((deleted_at IS NULL) AND (public.is_nursery_staff(nursery_id, false) OR (((select public.current_user_role()) = 'teacher'::public.user_role) AND (child_id IN ( SELECT public.my_class_children() AS my_class_children))))));

alter policy milestones_xo_all on public.milestones
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy admins_can_insert_notifications_for_their_nursery on public.notifications
  with check ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = (select auth.uid())) AND (users.role = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND ((users.nursery_id = notifications.nursery_id) OR (notifications.nursery_id IS NULL))))));

alter policy finance_manager_insert_notifications on public.notifications
  with check ((((select public.current_user_role()) = 'manager'::public.user_role) AND ((select public.current_user_department()) = ANY (ARRAY['finance'::public.user_department, 'hr'::public.user_department])) AND ((nursery_id = (select public.current_user_nursery_id())) OR (nursery_id IS NULL))));

alter policy notif_branch_all on public.notifications
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND ((nursery_id IS NULL) OR (nursery_id = (select public.current_user_nursery_id())))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND ((nursery_id IS NULL) OR (nursery_id = (select public.current_user_nursery_id())))));

alter policy notif_chain_all on public.notifications
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND ((nursery_id IS NULL) OR (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND ((nursery_id IS NULL) OR (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))));

alter policy notif_manager_all on public.notifications
  using ((((select public.current_user_role()) = 'manager'::public.user_role) AND ((nursery_id IS NULL) OR (nursery_id = (select public.current_user_nursery_id())))))
  with check ((((select public.current_user_role()) = 'manager'::public.user_role) AND ((nursery_id IS NULL) OR (nursery_id = (select public.current_user_nursery_id())))));

alter policy notif_parent_own on public.notifications
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (user_id = (select auth.uid()))))
  with check ((((select public.current_user_role()) = 'parent'::public.user_role) AND (user_id = (select auth.uid()))));

alter policy notif_teacher_own on public.notifications
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (user_id = (select auth.uid()))))
  with check ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (user_id = (select auth.uid()))));

alter policy notif_xo_all on public.notifications
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy users_can_read_own_notifications on public.notifications
  using ((user_id = (select auth.uid())));

alter policy users_can_update_own_notifications on public.notifications
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy nps_branch_all on public.nps_ratings
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy nps_chain_all on public.nps_ratings
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy nps_parent_own on public.nps_ratings
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (parent_id = (select auth.uid()))))
  with check ((((select public.current_user_role()) = 'parent'::public.user_role) AND (parent_id = (select auth.uid()))));

alter policy nps_teacher_deny on public.nps_ratings
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND false));

alter policy nps_xo_all on public.nps_ratings
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy nurseries_branch_admin_all on public.nurseries
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (id = (select public.current_user_nursery_id()))));

alter policy nurseries_chain_super_admin_all on public.nurseries
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (chain_id = (select public.current_user_chain_id()))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (chain_id = (select public.current_user_chain_id()))));

alter policy nurseries_manager_select on public.nurseries
  using ((((select public.current_user_role()) = 'manager'::public.user_role) AND (id = (select public.current_user_nursery_id()))));

alter policy nurseries_parent_select on public.nurseries
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (id IN ( SELECT public.parent_accessible_nursery_ids() AS parent_accessible_nursery_ids))));

alter policy nurseries_teacher_select on public.nurseries
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (id = (select public.current_user_nursery_id()))));

alter policy nurseries_xo_super_admin_all on public.nurseries
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy nursery_holidays_read on public.nursery_holidays
  using (((select public.is_xo_super_admin()) OR (nursery_id = (select public.current_user_nursery_id())) OR (((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))) OR (EXISTS ( SELECT 1
   FROM (public.children c
     JOIN public.parent_children pc ON ((pc.child_id = c.id)))
  WHERE ((pc.parent_id = (select auth.uid())) AND (c.nursery_id = nursery_holidays.nursery_id))))));

alter policy "Admins can update settings for their nursery" on public.nursery_settings
  using ((nursery_id IN ( SELECT users.nursery_id
   FROM public.users
  WHERE ((users.id = (select auth.uid())) AND (users.role = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role, 'xo_super_admin'::public.user_role]))))));

alter policy "Users can view settings for their nursery" on public.nursery_settings
  using ((nursery_id IN ( SELECT users.nursery_id
   FROM public.users
  WHERE (users.id = (select auth.uid())))));

alter policy nursery_settings_perm_update on public.nursery_settings
  using ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('settings'::text, 'update'::text))))
  with check ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('settings'::text, 'update'::text))));

alter policy packages_admin_all on public.packages
  using ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy packages_parent_select on public.packages
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id())) AND ((active = true) OR (EXISTS ( SELECT 1
   FROM (public.child_packages cp
     JOIN public.parent_children pc ON ((pc.child_id = cp.child_id)))
  WHERE ((cp.package_id = packages.id) AND (cp.status = 'active'::text) AND (pc.parent_id = (select auth.uid()))))))));

alter policy packages_perm_delete on public.packages
  using ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('packages'::text, 'delete'::text))));

alter policy packages_perm_insert on public.packages
  with check ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('packages'::text, 'create'::text))));

alter policy packages_perm_select on public.packages
  using ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('packages'::text, 'view'::text))));

alter policy packages_perm_update on public.packages
  using ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('packages'::text, 'update'::text))))
  with check ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('packages'::text, 'update'::text))));

alter policy packages_teacher_select on public.packages
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy packages_xo_all on public.packages
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy parent_children_branch_admin_all on public.parent_children
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.children c
  WHERE ((c.id = parent_children.child_id) AND (c.nursery_id = (select public.current_user_nursery_id())))))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.children c
  WHERE ((c.id = parent_children.child_id) AND (c.nursery_id = (select public.current_user_nursery_id())))))));

alter policy parent_children_chain_super_admin_all on public.parent_children
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.children c
  WHERE ((c.id = parent_children.child_id) AND (c.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.children c
  WHERE ((c.id = parent_children.child_id) AND (c.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))));

alter policy parent_children_parent_select on public.parent_children
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (parent_id = (select auth.uid()))));

alter policy parent_children_xo_super_admin_all on public.parent_children
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy parent_registration_templates_admin_all on public.parent_registration_templates
  using (((nursery_id = (select public.current_user_nursery_id())) AND ((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role]))))
  with check (((nursery_id = (select public.current_user_nursery_id())) AND ((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role]))));

alter policy parental_consents_parent_all on public.parental_consents
  using ((parent_id = (select auth.uid())))
  with check ((parent_id = (select auth.uid())));

alter policy partner_beneficiaries_select on public.partner_beneficiaries
  using (((parent_id = (select auth.uid())) OR (select public.is_xo_super_admin()) OR public.rls_staff_manages_nursery(nursery_id)));

alter policy "Admins can update payment attempts for their nursery" on public.payment_attempts
  using ((nursery_id IN ( SELECT users.nursery_id
   FROM public.users
  WHERE ((users.id = (select auth.uid())) AND (users.role = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role, 'xo_super_admin'::public.user_role]))))))
  with check (((status = ANY (ARRAY['confirmed'::text, 'cancelled'::text])) AND (nursery_id IN ( SELECT users.nursery_id
   FROM public.users
  WHERE ((users.id = (select auth.uid())) AND (users.role = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role, 'xo_super_admin'::public.user_role])))))));

alter policy "Admins can view payment attempts for their nursery" on public.payment_attempts
  using ((nursery_id IN ( SELECT users.nursery_id
   FROM public.users
  WHERE ((users.id = (select auth.uid())) AND (users.role = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role, 'xo_super_admin'::public.user_role]))))));

alter policy "Parents can insert their own payment attempts" on public.payment_attempts
  with check (((parent_id = (select auth.uid())) AND (nursery_id IN ( SELECT users.nursery_id
   FROM public.users
  WHERE (users.id = (select auth.uid()))))));

alter policy "Parents can view their own payment attempts" on public.payment_attempts
  using ((parent_id = (select auth.uid())));

alter policy payment_attempts_perm_select on public.payment_attempts
  using ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('payments'::text, 'view'::text))));

alter policy payment_attempts_xo_select on public.payment_attempts
  using ((select public.is_xo_super_admin()));

alter policy payments_branch_all on public.payments
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = payments.invoice_id) AND (i.nursery_id = (select public.current_user_nursery_id())))))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = payments.invoice_id) AND (i.nursery_id = (select public.current_user_nursery_id())))))));

alter policy payments_chain_all on public.payments
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = payments.invoice_id) AND (i.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = payments.invoice_id) AND (i.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))));

alter policy payments_parent_select on public.payments
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = payments.invoice_id) AND (i.parent_id IN ( SELECT public.my_family_billers() AS my_family_billers)) AND public.invoice_family_member((select auth.uid()), i.*))))));

alter policy payments_perm_select on public.payments
  using ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (select public.user_can('payments'::text, 'view'::text)) AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = payments.invoice_id) AND (i.nursery_id = (select public.current_user_nursery_id())))))));

alter policy payments_teacher_deny on public.payments
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND false));

alter policy payments_xo_all on public.payments
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy pay_branch_all on public.payroll
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.staff s
  WHERE ((s.id = payroll.staff_id) AND (s.nursery_id = (select public.current_user_nursery_id())))))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.staff s
  WHERE ((s.id = payroll.staff_id) AND (s.nursery_id = (select public.current_user_nursery_id())))))));

alter policy pay_chain_all on public.payroll
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.staff s
  WHERE ((s.id = payroll.staff_id) AND (s.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.staff s
  WHERE ((s.id = payroll.staff_id) AND (s.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))));

alter policy pay_parent_deny on public.payroll
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND false));

alter policy pay_teacher_self on public.payroll
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.staff s
  WHERE ((s.id = payroll.staff_id) AND (s.user_id = (select auth.uid())))))));

alter policy pay_xo_all on public.payroll
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy perm_branch_all on public.permissions
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.children c
  WHERE ((c.id = permissions.child_id) AND (c.nursery_id = (select public.current_user_nursery_id())))))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.children c
  WHERE ((c.id = permissions.child_id) AND (c.nursery_id = (select public.current_user_nursery_id())))))));

alter policy perm_chain_all on public.permissions
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.children c
  WHERE ((c.id = permissions.child_id) AND (c.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.children c
  WHERE ((c.id = permissions.child_id) AND (c.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))));

alter policy perm_manager_all on public.permissions
  using ((((select public.current_user_role()) = 'manager'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.children c
  WHERE ((c.id = permissions.child_id) AND (c.nursery_id = (select public.current_user_nursery_id())))))))
  with check ((((select public.current_user_role()) = 'manager'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.children c
  WHERE ((c.id = permissions.child_id) AND (c.nursery_id = (select public.current_user_nursery_id())))))));

alter policy perm_parent_select on public.permissions
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND public.parent_can_access_child(child_id) AND public.event_shown_to_families(event_id)));

alter policy perm_xo_all on public.permissions
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy personal_reminders_owner_all on public.personal_reminders
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy pickup_incidents_staff_insert on public.pickup_incidents
  with check (((nursery_id = ( SELECT users.nursery_id
   FROM public.users
  WHERE (users.id = (select auth.uid())))) AND ((select public.current_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'branch_admin'::public.user_role, 'chain_super_admin'::public.user_role]))));

alter policy pickup_incidents_staff_select on public.pickup_incidents
  using (((select public.is_xo_super_admin()) OR (nursery_id = ( SELECT users.nursery_id
   FROM public.users
  WHERE (users.id = (select auth.uid()))))));

alter policy positions_manage on public.positions
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy post_comments_edit_own on public.post_comments
  using ((author_id = (select auth.uid())))
  with check (((author_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.posts p
  WHERE ((p.id = post_comments.post_id) AND (p.nursery_id = (select public.current_user_nursery_id())))))));

alter policy post_comments_read on public.post_comments
  using ((EXISTS ( SELECT 1
   FROM public.posts p
  WHERE ((p.id = post_comments.post_id) AND (p.nursery_id = (select public.current_user_nursery_id()))))));

alter policy post_comments_write_own on public.post_comments
  with check (((author_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.posts p
  WHERE ((p.id = post_comments.post_id) AND (p.nursery_id = (select public.current_user_nursery_id())))))));

alter policy posts_admin_all on public.posts
  using ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy posts_parent_teacher_insert on public.posts
  with check ((((select public.current_user_role()) = ANY (ARRAY['parent'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (author_id = (select auth.uid()))));

alter policy posts_parent_teacher_read on public.posts
  using ((((select public.current_user_role()) = ANY (ARRAY['parent'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy parents_can_read_qr_tokens_for_their_children on public.qr_tokens
  using (((purpose <> 'event'::text) AND (EXISTS ( SELECT 1
   FROM public.parent_children pc
  WHERE ((pc.parent_id = (select auth.uid())) AND (pc.child_id = qr_tokens.child_id))))));

alter policy qr_tokens_admin_select on public.qr_tokens
  using ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role, 'xo_super_admin'::public.user_role])) AND ((nursery_id = (select public.current_user_nursery_id())) OR (select public.is_xo_super_admin()) OR (((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))));

alter policy qr_tokens_parent_event_select on public.qr_tokens
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (purpose = 'event'::text) AND (child_id IN ( SELECT pc.child_id
   FROM public.parent_children pc
  WHERE (pc.parent_id = (select auth.uid())))) AND (EXISTS ( SELECT 1
   FROM public.permissions pm
  WHERE ((pm.event_id = qr_tokens.event_id) AND (pm.child_id = qr_tokens.child_id) AND (pm.status = 'granted'::text))))));

alter policy qr_tokens_parent_select on public.qr_tokens
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (purpose <> 'event'::text) AND (EXISTS ( SELECT 1
   FROM public.parent_children pc
  WHERE ((pc.parent_id = (select auth.uid())) AND (pc.child_id = qr_tokens.child_id))))));

alter policy quarterly_report_grade_levels_admin_all on public.quarterly_report_grade_levels
  using (((select public.is_xo_super_admin()) OR (((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())))))
  with check (((select public.is_xo_super_admin()) OR (((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())))));

alter policy quarterly_report_grade_levels_read on public.quarterly_report_grade_levels
  using (((select public.is_xo_super_admin()) OR (nursery_id = (select public.current_user_nursery_id()))));

alter policy quarterly_report_grades_admin_all on public.quarterly_report_grades
  using (((select public.is_xo_super_admin()) OR (((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())))))
  with check (((select public.is_xo_super_admin()) OR (((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())))));

alter policy quarterly_report_items_admin_all on public.quarterly_report_items
  using (((select public.is_xo_super_admin()) OR (((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())))))
  with check (((select public.is_xo_super_admin()) OR (((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())))));

alter policy quarterly_report_items_read on public.quarterly_report_items
  using (((select public.is_xo_super_admin()) OR (nursery_id = (select public.current_user_nursery_id()))));

alter policy quarterly_report_sections_admin_all on public.quarterly_report_sections
  using (((select public.is_xo_super_admin()) OR (((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())))))
  with check (((select public.is_xo_super_admin()) OR (((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())))));

alter policy quarterly_report_sections_read on public.quarterly_report_sections
  using (((select public.is_xo_super_admin()) OR (nursery_id = (select public.current_user_nursery_id()))));

alter policy quarterly_report_templates_admin_all on public.quarterly_report_templates
  using (((select public.is_xo_super_admin()) OR (((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())))))
  with check (((select public.is_xo_super_admin()) OR (((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())))));

alter policy quarterly_report_templates_read on public.quarterly_report_templates
  using (((select public.is_xo_super_admin()) OR (nursery_id = (select public.current_user_nursery_id()))));

alter policy quarterly_reports_admin_all on public.quarterly_reports
  using (((select public.is_xo_super_admin()) OR (((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())))))
  with check (((select public.is_xo_super_admin()) OR (((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())))));

alter policy report_reactions_manager_all on public.report_reactions
  using ((((select public.current_user_role()) = 'manager'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.daily_reports dr
  WHERE ((dr.id = report_reactions.report_id) AND (dr.nursery_id = (select public.current_user_nursery_id())))))))
  with check ((((select public.current_user_role()) = 'manager'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.daily_reports dr
  WHERE ((dr.id = report_reactions.report_id) AND (dr.nursery_id = (select public.current_user_nursery_id())))))));

alter policy report_reactions_parent_insert on public.report_reactions
  with check ((((select public.current_user_role()) = 'parent'::public.user_role) AND (parent_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.daily_reports dr
  WHERE ((dr.id = report_reactions.report_id) AND (dr.status = 'published'::text) AND public.parent_can_access_child(dr.child_id))))));

alter policy report_reactions_parent_select on public.report_reactions
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (parent_id = (select auth.uid()))));

alter policy report_reactions_parent_update on public.report_reactions
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (parent_id = (select auth.uid()))))
  with check ((((select public.current_user_role()) = 'parent'::public.user_role) AND (parent_id = (select auth.uid()))));

alter policy role_assignments_log_select on public.role_assignments_log
  using ((select public.is_xo_super_admin()));

alter policy role_features_manage on public.role_features
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy role_features_select on public.role_features
  using ((EXISTS ( SELECT 1
   FROM public.roles r
  WHERE ((r.id = role_features.role_id) AND ((r.nursery_id IS NULL) OR (r.nursery_id = (select public.current_user_nursery_id())) OR public.rbac_manages_nursery(r.nursery_id))))));

alter policy roles_manage on public.roles
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy roles_select on public.roles
  using (((nursery_id IS NULL) OR (nursery_id = (select public.current_user_nursery_id())) OR public.rbac_manages_nursery(nursery_id)));

alter policy staff_branch_admin_all on public.staff
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy staff_chain_super_admin_all on public.staff
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy staff_parent_deny on public.staff
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND false));

alter policy staff_teacher_select_self on public.staff
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (user_id = (select auth.uid()))));

alter policy staff_xo_super_admin_all on public.staff
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy staff_absences_read on public.staff_absences
  using (((user_id = (select auth.uid())) OR (select public.is_xo_super_admin()) OR (((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'manager'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))) OR (((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))));

alter policy staff_att_branch_all on public.staff_attendance
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy staff_att_chain_all on public.staff_attendance
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy staff_att_parent_deny on public.staff_attendance
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND false));

alter policy staff_att_teacher_self on public.staff_attendance
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (user_id = (select auth.uid())) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (user_id = (select auth.uid())) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy staff_att_xo_all on public.staff_attendance
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy staff_attendance_admin_all_v2 on public.staff_attendance
  using ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy staff_attendance_staff_select_v2 on public.staff_attendance
  using ((EXISTS ( SELECT 1
   FROM public.staff_profiles sp
  WHERE ((sp.id = staff_attendance.staff_id) AND (sp.user_id = (select auth.uid()))))));

alter policy staff_national_ids_admin_all on public.staff_national_ids
  using (((select public.is_xo_super_admin()) OR (((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))) OR (((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))
  with check (((select public.is_xo_super_admin()) OR (((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))) OR (((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))));

alter policy staff_national_ids_manager_hr_all on public.staff_national_ids
  using (((select public.is_manager_hr()) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check (((select public.is_manager_hr()) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy staff_national_ids_self_read on public.staff_national_ids
  using ((user_id = (select auth.uid())));

alter policy staff_payroll_perm_select on public.staff_payroll
  using ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('payroll'::text, 'view'::text))));

alter policy staff_payroll_staff_select on public.staff_payroll
  using ((EXISTS ( SELECT 1
   FROM public.staff_profiles sp
  WHERE ((sp.id = staff_payroll.staff_id) AND (sp.user_id = (select auth.uid()))))));

alter policy staff_profiles_admin_manage on public.staff_profiles
  using ((((select public.current_user_role()) <> 'manager'::public.user_role) AND public.rls_staff_manages_nursery(nursery_id)))
  with check ((((select public.current_user_role()) <> 'manager'::public.user_role) AND public.rls_staff_manages_nursery(nursery_id)));

alter policy staff_profiles_manager_hr_all on public.staff_profiles
  using (((select public.is_manager_hr()) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check (((select public.is_manager_hr()) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy staff_profiles_manager_select on public.staff_profiles
  using ((((select public.current_user_role()) = 'manager'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy staff_profiles_self_select on public.staff_profiles
  using ((user_id = (select auth.uid())));

alter policy staff_profiles_teacher_select on public.staff_profiles
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy staff_profiles_xo_manage on public.staff_profiles
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy staff_profiles_xo_select on public.staff_profiles
  using ((select public.is_xo_super_admin()));

alter policy staff_schedules_admin_all on public.staff_schedules
  using ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy staff_schedules_manager_hr_all on public.staff_schedules
  using (((select public.is_manager_hr()) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check (((select public.is_manager_hr()) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy staff_schedules_staff_select on public.staff_schedules
  using ((EXISTS ( SELECT 1
   FROM public.staff_profiles sp
  WHERE ((sp.id = staff_schedules.staff_id) AND (sp.user_id = (select auth.uid()))))));

alter policy staff_task_items_read on public.staff_task_items
  using (((assignee_id = (select auth.uid())) OR public.staff_task_can_manage(nursery_id)));

alter policy staff_tasks_read on public.staff_tasks
  using ((public.staff_task_can_manage(nursery_id) OR (EXISTS ( SELECT 1
   FROM public.staff_task_items i
  WHERE ((i.task_id = staff_tasks.id) AND (i.assignee_id = (select auth.uid())))))));

alter policy subinv_branch_all on public.subscription_invoices
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy subinv_chain_all on public.subscription_invoices
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy subinv_parent_deny on public.subscription_invoices
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND false));

alter policy subinv_teacher_deny on public.subscription_invoices
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND false));

alter policy subinv_xo_all on public.subscription_invoices
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy sresp_branch_all on public.survey_responses
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.surveys s
  WHERE ((s.id = survey_responses.survey_id) AND (s.nursery_id = (select public.current_user_nursery_id())))))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.surveys s
  WHERE ((s.id = survey_responses.survey_id) AND (s.nursery_id = (select public.current_user_nursery_id())))))));

alter policy sresp_chain_all on public.survey_responses
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.surveys s
  WHERE ((s.id = survey_responses.survey_id) AND (s.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (EXISTS ( SELECT 1
   FROM public.surveys s
  WHERE ((s.id = survey_responses.survey_id) AND (s.nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))));

alter policy sresp_parent_own on public.survey_responses
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (user_id = (select auth.uid()))))
  with check ((((select public.current_user_role()) = 'parent'::public.user_role) AND (user_id = (select auth.uid()))));

alter policy sresp_teacher_own on public.survey_responses
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (user_id = (select auth.uid()))))
  with check ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (user_id = (select auth.uid()))));

alter policy sresp_xo_all on public.survey_responses
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy surveys_branch_all on public.surveys
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy surveys_chain_all on public.surveys
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy surveys_manager_all on public.surveys
  using ((((select public.current_user_role()) = 'manager'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'manager'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy surveys_parent_select on public.surveys
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND public.rls_parent_has_child_in_nursery(nursery_id) AND (target_role = 'parent'::public.user_role) AND (status = ANY (ARRAY['active'::text, 'published'::text])) AND (deleted_at IS NULL) AND ((target_class_ids IS NULL) OR public.rls_parent_has_child_in_classes(target_class_ids))));

alter policy surveys_teacher_select on public.surveys
  using ((((select public.current_user_role()) = 'teacher'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id())) AND (target_role = 'teacher'::public.user_role) AND (status = ANY (ARRAY['active'::text, 'published'::text])) AND (deleted_at IS NULL)));

alter policy surveys_xo_all on public.surveys
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy tmr_templates_branch_all on public.teacher_monthly_reminder_templates
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy tmr_templates_chain_all on public.teacher_monthly_reminder_templates
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy tmr_templates_teacher_select on public.teacher_monthly_reminder_templates
  using ((teacher_id = (select auth.uid())));

alter policy tmr_templates_xo_all on public.teacher_monthly_reminder_templates
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy temp_pickup_parent_insert on public.temporary_pickup_codes
  with check (((created_by = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.parent_children pc
  WHERE ((pc.child_id = temporary_pickup_codes.child_id) AND (pc.parent_id = (select auth.uid())))))));

alter policy temp_pickup_parent_select on public.temporary_pickup_codes
  using ((created_by = (select auth.uid())));

alter policy temp_pickup_staff_select on public.temporary_pickup_codes
  using (((status = 'active'::text) AND (EXISTS ( SELECT 1
   FROM (public.children c
     JOIN public.users u ON ((u.nursery_id = c.nursery_id)))
  WHERE ((c.id = temporary_pickup_codes.child_id) AND (u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['branch_admin'::public.user_role, 'teacher'::public.user_role])))))));

alter policy temp_pickup_staff_update on public.temporary_pickup_codes
  using ((EXISTS ( SELECT 1
   FROM (public.children c
     JOIN public.users u ON ((u.nursery_id = c.nursery_id)))
  WHERE ((c.id = temporary_pickup_codes.child_id) AND (u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['branch_admin'::public.user_role, 'teacher'::public.user_role]))))));

alter policy tenant_export_artifacts_insert on public.tenant_export_artifacts
  with check (((select public.is_xo_super_admin()) OR (((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND ((nursery_id = (select public.current_user_nursery_id())) OR (((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))));

alter policy tenant_export_artifacts_select on public.tenant_export_artifacts
  using (((select public.is_xo_super_admin()) OR (((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND ((nursery_id = (select public.current_user_nursery_id())) OR (((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))));

alter policy tenant_export_jobs_insert on public.tenant_export_jobs
  with check (((requested_by = (select auth.uid())) AND ((select public.is_xo_super_admin()) OR (((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND ((nursery_id = (select public.current_user_nursery_id())) OR (((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))))));

alter policy tenant_export_jobs_select on public.tenant_export_jobs
  using (((select public.is_xo_super_admin()) OR (((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND ((nursery_id = (select public.current_user_nursery_id())) OR (((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))))) OR (requested_by = (select auth.uid()))));

alter policy tenant_export_jobs_update on public.tenant_export_jobs
  using (((select public.is_xo_super_admin()) OR (((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND ((nursery_id = (select public.current_user_nursery_id())) OR (((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))))
  with check (((select public.is_xo_super_admin()) OR (((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND ((nursery_id = (select public.current_user_nursery_id())) OR (((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin)))))));

alter policy tuition_package_billing_periods_admin_all on public.tuition_package_billing_periods
  using ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy tuition_package_billing_periods_parent_select on public.tuition_package_billing_periods
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (active = true) AND (EXISTS ( SELECT 1
   FROM (public.applications a
     JOIN public.tuition_packages tp ON (((tp.nursery_id = a.nursery_id) AND (tp.id = tuition_package_billing_periods.tuition_package_id))))
  WHERE ((a.parent_id = (select auth.uid())) AND (tp.active = true) AND (tuition_package_billing_periods.nursery_id = a.nursery_id))))));

alter policy tuition_package_billing_periods_perm_delete on public.tuition_package_billing_periods
  using ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('packages'::text, 'delete'::text))));

alter policy tuition_package_billing_periods_perm_insert on public.tuition_package_billing_periods
  with check ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('packages'::text, 'create'::text))));

alter policy tuition_package_billing_periods_perm_select on public.tuition_package_billing_periods
  using ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('packages'::text, 'view'::text))));

alter policy tuition_package_billing_periods_perm_update on public.tuition_package_billing_periods
  using ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('packages'::text, 'update'::text))))
  with check ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('packages'::text, 'update'::text))));

alter policy tuition_package_billing_periods_staff_select on public.tuition_package_billing_periods
  using ((((select public.current_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'manager'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy tuition_package_billing_periods_xo_all on public.tuition_package_billing_periods
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy tuition_packages_admin_all on public.tuition_packages
  using ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))))
  with check ((((select public.current_user_role()) = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy tuition_packages_parent_select on public.tuition_packages
  using ((((select public.current_user_role()) = 'parent'::public.user_role) AND (active = true) AND (EXISTS ( SELECT 1
   FROM public.applications a
  WHERE ((a.parent_id = (select auth.uid())) AND (a.nursery_id = tuition_packages.nursery_id))))));

alter policy tuition_packages_perm_delete on public.tuition_packages
  using ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('packages'::text, 'delete'::text))));

alter policy tuition_packages_perm_insert on public.tuition_packages
  with check ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('packages'::text, 'create'::text))));

alter policy tuition_packages_perm_select on public.tuition_packages
  using ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('packages'::text, 'view'::text))));

alter policy tuition_packages_perm_update on public.tuition_packages
  using ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('packages'::text, 'update'::text))))
  with check ((((select public.current_user_role()) = ANY (ARRAY['manager'::public.user_role, 'teacher'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id())) AND (select public.user_can('packages'::text, 'update'::text))));

alter policy tuition_packages_staff_select on public.tuition_packages
  using ((((select public.current_user_role()) = ANY (ARRAY['teacher'::public.user_role, 'manager'::public.user_role])) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy tuition_packages_xo_all on public.tuition_packages
  using ((select public.is_xo_super_admin()))
  with check ((select public.is_xo_super_admin()));

alter policy user_push_subscriptions_delete_own on public.user_push_subscriptions
  using (((select auth.uid()) = user_id));

alter policy user_push_subscriptions_insert_own on public.user_push_subscriptions
  with check (((select auth.uid()) = user_id));

alter policy user_push_subscriptions_select_own on public.user_push_subscriptions
  using (((select auth.uid()) = user_id));

alter policy user_push_subscriptions_update_own on public.user_push_subscriptions
  using (((select auth.uid()) = user_id));

alter policy users_manage_own_push_subscriptions on public.user_push_subscriptions
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy user_role_changes_admin_select on public.user_role_changes
  using ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = (select auth.uid())) AND (u.role = ANY (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role, 'xo_super_admin'::public.user_role]))))));

alter policy users_branch_admin_select on public.users
  using ((((select public.current_user_role()) = 'branch_admin'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy users_chain_admin_select on public.users
  using ((((select public.current_user_role()) = 'chain_super_admin'::public.user_role) AND (nursery_id IN ( SELECT public.nursery_ids_for_chain_admin() AS nursery_ids_for_chain_admin))));

alter policy users_manager_hr_select on public.users
  using (((select public.is_manager_hr()) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy users_manager_hr_update on public.users
  using (((select public.is_manager_hr()) AND (nursery_id = (select public.current_user_nursery_id())) AND (role <> ALL (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role, 'xo_super_admin'::public.user_role]))))
  with check (((select public.is_manager_hr()) AND (nursery_id = (select public.current_user_nursery_id())) AND (role <> ALL (ARRAY['branch_admin'::public.user_role, 'chain_super_admin'::public.user_role, 'xo_super_admin'::public.user_role]))));

alter policy users_manager_select_own_nursery on public.users
  using ((((select public.current_user_role()) = 'manager'::public.user_role) AND (nursery_id = (select public.current_user_nursery_id()))));

alter policy users_select_own on public.users
  using ((id = (select auth.uid())));

alter policy users_self_insert_bootstrap on public.users
  with check ((id = (select auth.uid())));

alter policy users_update_own on public.users
  using ((id = (select auth.uid())))
  with check ((id = (select auth.uid())));

alter policy users_xo_select_all on public.users
  using ((select public.is_xo_super_admin()));

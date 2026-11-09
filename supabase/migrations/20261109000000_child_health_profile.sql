-- The child's health profile, read and written in one place.
--
-- 1. get_child_health_profile(child): everything the health page shows, gathered from where it is
--    kept: the child (name, class, age, and the blood type kept on the child), the nursery's health
--    record (doctor, an extra emergency contact, insurance), the parents and the emergency contacts
--    given at enrollment, the people allowed to authorise medical care, what the parents wrote about
--    health at enrollment, the allergies (with the menu foods each one covers), the conditions,
--    medicines, vaccinations and documents. The staff who manage the child and the child's parents
--    may read it; can_edit says whether the reader may change it. Reading never writes (the old page
--    created an empty health record on every visit), and it is a function so a change shows at once
--    (the service worker answers table reads from its cache first).
-- 2. save_child_health_overview(child, fields): the blood type, the doctor, the extra emergency
--    contact and the insurance, checked. The blood type is kept on the child, the one place
--    enrollment and the child's record read it, so every screen shows the same one.
-- 3. A child's allergy keeps the menu foods chosen for it. The foods are read from its name only when
--    none were given (a new allergy) or when the name changes and the foods were left as they were.

-- -----------------------------------------------------------------------------------------------
-- Who may do what with a child's health: 'edit' (the branch's admins, the chain's admins and XO),
-- 'view' (the branch's managers), 'parent' (the child's parents), or null.
create or replace function public.child_health_access(p_child_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.user_role := public.current_user_role();
  v_nursery uuid;
begin
  select nursery_id into v_nursery from public.children where id = p_child_id;
  if v_nursery is null or v_role is null then
    return null;
  end if;
  if public.is_xo_super_admin() then
    return 'edit';
  end if;
  if v_role = 'branch_admin' and v_nursery = public.current_user_nursery_id() then
    return 'edit';
  end if;
  if v_role = 'chain_super_admin' and v_nursery in (select public.nursery_ids_for_chain_admin()) then
    return 'edit';
  end if;
  if v_role = 'manager' and public.rls_staff_can_access_child(p_child_id) then
    return 'view';
  end if;
  if v_role = 'parent' and public.parent_can_access_child(p_child_id) then
    return 'parent';
  end if;
  return null;
end;
$$;

revoke execute on function public.child_health_access(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------------------------
-- 1. Reading the profile
create or replace function public.get_child_health_profile(p_child_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_access text := public.child_health_access(p_child_id);
  c public.children%rowtype;
  r public.child_health_records%rowtype;
  v_care jsonb;
  v_today date;
begin
  if v_access is null then
    raise exception 'health_forbidden' using errcode = '42501';
  end if;
  select * into c from public.children where id = p_child_id;
  select * into r from public.child_health_records where child_id = p_child_id;
  v_care := case when jsonb_typeof(c.daily_care_preferences) = 'object' then c.daily_care_preferences else '{}'::jsonb end;
  v_today := public.nursery_today(c.nursery_id);

  return jsonb_build_object(
    'viewer', case when v_access = 'parent' then 'parent' else 'staff' end,
    'can_edit', v_access = 'edit',
    'today', v_today,
    'child', jsonb_build_object(
      'id', c.id,
      'nursery_id', c.nursery_id,
      'name_ar', c.full_name_ar,
      'name_en', c.full_name_en,
      'avatar_url', c.avatar_url,
      'dob', c.dob,
      'gender', c.gender,
      'status', c.status,
      'class_name_ar', (select cl.name_ar from public.classes cl where cl.id = c.class_id),
      'class_name_en', (select cl.name_en from public.classes cl where cl.id = c.class_id),
      'blood_type', coalesce(c.blood_type, nullif(btrim(r.blood_type), ''))
    ),
    'record', jsonb_build_object(
      'pediatrician_name', r.pediatrician_name,
      'pediatrician_phone', r.pediatrician_phone,
      'pediatrician_clinic', r.pediatrician_clinic,
      'emergency_contact_name', r.emergency_contact_name,
      'emergency_contact_phone', r.emergency_contact_phone,
      'insurance_provider', r.insurance_provider,
      'insurance_policy_number', r.insurance_policy_number,
      'insurance_notes', r.insurance_notes,
      'updated_at', r.updated_at
    ),
    'parents', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name_ar', u.name_ar, 'name_en', u.name_en, 'phone', u.phone,
               'relationship', coalesce(nullif(pc.relationship, ''), pc.parent_type),
               'is_primary', coalesce(pc.is_primary, false),
               'is_emergency_contact', coalesce(pc.is_emergency_contact, false))
             order by pc.is_primary desc nulls last, u.name_en)
        from public.parent_children pc
        join public.users u on u.id = pc.parent_id
       where pc.child_id = p_child_id
    ), '[]'::jsonb),
    'emergency_contacts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', coalesce(e ->> 'name', e ->> 'full_name'),
               'phone', coalesce(e ->> 'phone', e ->> 'mobile'),
               'relationship', coalesce(e ->> 'relationship', e ->> 'relation')))
        from jsonb_array_elements(case when jsonb_typeof(c.emergency_contacts) = 'array' then c.emergency_contacts else '[]'::jsonb end) e
       where jsonb_typeof(e) = 'object'
    ), '[]'::jsonb),
    'medical_pickups', coalesce((
      select jsonb_agg(jsonb_build_object('name', p.name, 'phone', coalesce(p.mobile_phone, p.phone), 'relation', p.relation) order by p.name)
        from public.authorized_pickups p
       where p.child_id = p_child_id
         and p.active
         and p.can_authorize_medical
         and (p.valid_until is null or p.valid_until >= v_today)
    ), '[]'::jsonb),
    'enrollment', jsonb_build_object(
      'has_allergy', v_care -> 'has_allergy',
      'allergy_types', v_care -> 'allergy_types',
      'food_allergies', coalesce(nullif(btrim(v_care ->> 'food_allergies'), ''),
                                 (select nullif(btrim(d.food_allergies_details), '') from public.child_dietary_preferences d where d.child_id = p_child_id limit 1)),
      'allergy_other_details', v_care ->> 'allergy_other_details',
      'has_medical_condition', v_care -> 'has_medical_condition',
      'medical_condition_details', v_care ->> 'medical_condition_details',
      'health_notes', v_care ->> 'child_behavior_health_notes',
      'medication_consents', v_care -> 'emergency_medications'
    ),
    'allergies', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'allergen_name', a.allergen_name, 'reaction_type', a.reaction_type, 'severity', a.severity,
               'treatment_protocol', a.treatment_protocol, 'last_reaction_date', a.last_reaction_date,
               'food_allergens', to_jsonb(a.food_allergens))
             order by array_position(array['life_threatening', 'severe', 'moderate', 'mild'], a.severity::text), a.allergen_name)
        from public.child_allergies a
       where a.child_id = p_child_id
    ), '[]'::jsonb),
    'conditions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'condition_name', x.condition_name, 'diagnosis_date', x.diagnosis_date, 'severity', x.severity,
               'treatment_protocol', x.treatment_protocol, 'trigger_factors', x.trigger_factors,
               'emergency_response_plan', x.emergency_response_plan)
             order by x.condition_name)
        from public.child_chronic_conditions x
       where x.child_id = p_child_id
    ), '[]'::jsonb),
    'medications', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'name', m.name, 'dosage', m.dosage, 'administration_times', m.administration_times,
               'administration_method', m.administration_method, 'storage_requirements', m.storage_requirements,
               'expiry_date', m.expiry_date, 'parent_consent_status', m.parent_consent_status)
             order by m.name)
        from public.child_medications m
       where m.child_id = p_child_id
    ), '[]'::jsonb),
    'vaccinations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id, 'vaccine_name', v.vaccine_name, 'dose_number', v.dose_number,
               'date_administered', v.date_administered, 'next_due_date', v.next_due_date,
               'administered_by', v.administered_by, 'batch_number', v.batch_number)
             order by v.date_administered desc nulls last, v.vaccine_name, v.dose_number)
        from public.child_vaccinations v
       where v.child_id = p_child_id
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'label_ar', d.label_ar, 'label_en', d.label_en, 'storage_path', d.storage_path, 'created_at', d.created_at)
             order by d.created_at desc)
        from public.child_health_documents d
       where d.child_id = p_child_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_child_health_profile(uuid) from public, anon;
grant execute on function public.get_child_health_profile(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------------------------
-- 2. Saving the blood type, the doctor, the extra emergency contact and the insurance
create or replace function public.save_child_health_overview(p_child_id uuid, p_fields jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nursery uuid;
  v_blood text := nullif(btrim(coalesce(p_fields ->> 'blood_type', '')), '');
  v_field text;
  v_value text;
  v_max integer;
  v_get constant text[] := array['pediatrician_name', 'pediatrician_phone', 'pediatrician_clinic', 'emergency_contact_name',
                                 'emergency_contact_phone', 'insurance_provider', 'insurance_policy_number', 'insurance_notes'];
  v jsonb := '{}'::jsonb;
begin
  if public.child_health_access(p_child_id) is distinct from 'edit' then
    raise exception 'health_forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(p_fields) is distinct from 'object' then
    raise exception 'health_fields_invalid' using errcode = '22023';
  end if;
  if v_blood is not null and v_blood not in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') then
    raise exception 'health_blood_type_invalid' using errcode = '22023';
  end if;

  foreach v_field in array v_get loop
    v_value := nullif(btrim(coalesce(p_fields ->> v_field, '')), '');
    v_max := (case when v_field = 'insurance_notes' then 1000 else 120 end);
    if v_value is not null and char_length(v_value) > v_max then
      raise exception 'health_text_too_long' using errcode = '22023';
    end if;
    if v_field like '%_phone' and v_value is not null and v_value !~ '^\+[0-9]{8,15}$' then
      raise exception 'health_phone_invalid' using errcode = '22023';
    end if;
    v := v || jsonb_build_object(v_field, v_value);
  end loop;
  if (v ->> 'emergency_contact_name' is null) <> (v ->> 'emergency_contact_phone' is null) then
    raise exception 'health_contact_incomplete' using errcode = '22023';
  end if;

  select nursery_id into v_nursery from public.children where id = p_child_id;
  insert into public.child_health_records as h
    (child_id, nursery_id, blood_type, pediatrician_name, pediatrician_phone, pediatrician_clinic,
     emergency_contact_name, emergency_contact_phone, insurance_provider, insurance_policy_number, insurance_notes)
  values
    (p_child_id, v_nursery, v_blood, v ->> 'pediatrician_name', v ->> 'pediatrician_phone', v ->> 'pediatrician_clinic',
     v ->> 'emergency_contact_name', v ->> 'emergency_contact_phone', v ->> 'insurance_provider',
     v ->> 'insurance_policy_number', v ->> 'insurance_notes')
  on conflict (child_id) do update set
    blood_type = excluded.blood_type,
    pediatrician_name = excluded.pediatrician_name,
    pediatrician_phone = excluded.pediatrician_phone,
    pediatrician_clinic = excluded.pediatrician_clinic,
    emergency_contact_name = excluded.emergency_contact_name,
    emergency_contact_phone = excluded.emergency_contact_phone,
    insurance_provider = excluded.insurance_provider,
    insurance_policy_number = excluded.insurance_policy_number,
    insurance_notes = excluded.insurance_notes;

  update public.children set blood_type = v_blood where id = p_child_id and blood_type is distinct from v_blood;
end;
$$;

revoke execute on function public.save_child_health_overview(uuid, jsonb) from public, anon;
grant execute on function public.save_child_health_overview(uuid, jsonb) to authenticated, service_role;

-- -----------------------------------------------------------------------------------------------
-- 3. The menu foods of a child's allergy: the ones chosen are kept; they are read from the name only
-- when none were given or the name changed and the foods did not. Only known foods are kept, each
-- once, in the menu's order.
create or replace function public.child_allergy_food_allergens()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if cardinality(coalesce(new.food_allergens, '{}')) = 0 then
      new.food_allergens := public.food_allergens_for(new.allergen_name);
    end if;
  elsif new.food_allergens is not distinct from old.food_allergens
        and new.allergen_name is distinct from old.allergen_name then
    new.food_allergens := public.food_allergens_for(new.allergen_name);
  end if;
  new.food_allergens := array(
    select fa.code from public.food_allergens fa
     where fa.code = any(coalesce(new.food_allergens, '{}'))
     order by fa.sort_order
  );
  return new;
end;
$$;

drop trigger if exists trg_child_allergy_food_allergens on public.child_allergies;
create trigger trg_child_allergy_food_allergens
  before insert or update of allergen_name, food_allergens on public.child_allergies
  for each row execute function public.child_allergy_food_allergens();

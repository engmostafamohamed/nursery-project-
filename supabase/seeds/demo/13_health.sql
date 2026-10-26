-- Demo seed · 13 · Health ({{branches}})
--
-- About one child in ten has a food or other allergy, a few have a long-term condition (asthma,
-- eczema, favism…), and the children with asthma keep an inhaler at the nursery.

insert into public.child_allergies (child_id, nursery_id, allergen_name, reaction_type, severity, treatment_protocol, last_reaction_date)
select k.child_id, seed.branch_id(k.branch), a.allergen, a.reaction,
       seed.pick_weighted(array['mild', 'moderate', 'severe', 'life_threatening'], array[50, 35, 12, 3], 'allergy-severity:' || k.child_id),
       a.treatment,
       seed.config('today')::date - seed.int_between(30, 400, 'last-reaction:' || k.child_id)
from seed.kids k
cross join lateral (
  select * from (values
    ('Peanuts', 'Hives and swelling', 'Antihistamine syrup; call the parents. Epinephrine if breathing is affected.'),
    ('Eggs', 'Skin rash', 'Keep away from egg dishes; antihistamine if a rash appears.'),
    ('Cow''s milk', 'Stomach upset', 'Lactose-free milk only; tell the kitchen.'),
    ('Strawberries', 'Rash around the mouth', 'No strawberries in snacks.'),
    ('Dust mites', 'Sneezing and itchy eyes', 'Keep the nap mat clean; antihistamine if needed.'),
    ('Penicillin', 'Rash', 'Never give penicillin-based medicine; tell any doctor.')
  ) v(allergen, reaction, treatment)
  offset seed.int_between(0, 5, 'allergen:' || k.child_id) limit 1
) a
where k.branch = any({{branches}}) and seed.chance(10, 'allergy:' || k.child_id)
  and not exists (select 1 from public.child_allergies x where x.child_id = k.child_id);

insert into public.child_chronic_conditions (child_id, nursery_id, condition_name, diagnosis_date, severity, treatment_protocol, trigger_factors, emergency_response_plan)
select k.child_id, seed.branch_id(k.branch), c.condition, seed.config('today')::date - seed.int_between(60, 700, 'diagnosed:' || k.child_id),
       seed.pick(array['mild', 'moderate'], 'condition-severity:' || k.child_id), c.treatment, c.triggers, c.emergency
from seed.kids k
cross join lateral (
  select * from (values
    ('Asthma', 'Inhaler (Ventolin) before outdoor play when needed.', 'Dust, cold air, running a lot', 'Two puffs of the inhaler, sit the child up, call the parents; ambulance if no better in 10 minutes.'),
    ('Eczema', 'Moisturising cream twice a day.', 'Heat, sweat, wool', 'Cool compress; call the parents if the skin bleeds.'),
    ('Favism (G6PD deficiency)', 'No fava beans (foul) in any meal.', 'Fava beans, some medicines', 'Call the parents at once if the child turns pale or yellow.'),
    ('Lactose intolerance', 'Lactose-free milk and yoghurt.', 'Milk', 'Call the parents if stomach pain lasts.')
  ) v(condition, treatment, triggers, emergency)
  offset seed.int_between(0, 3, 'condition:' || k.child_id) limit 1
) c
where k.branch = any({{branches}}) and seed.chance(4, 'chronic:' || k.child_id)
  and not exists (select 1 from public.child_chronic_conditions x where x.child_id = k.child_id);

insert into public.child_medications (child_id, nursery_id, name, dosage, administration_times, administration_method, storage_requirements, expiry_date, parent_consent_status)
select c.child_id, c.nursery_id, 'Ventolin inhaler', '2 puffs', 'When needed', 'inhaler', 'Room temperature, in the class first-aid box (with its spacer)',
       seed.config('today')::date + seed.int_between(90, 500, 'inhaler-expiry:' || c.child_id), 'granted'
from public.child_chronic_conditions c
where c.condition_name = 'Asthma'
  and c.nursery_id in (select seed.branch_id(n) from unnest({{branches}}) n)
  and not exists (select 1 from public.child_medications m where m.child_id = c.child_id);

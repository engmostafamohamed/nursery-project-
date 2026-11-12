-- The daily report's toilet question: each visit (or diaper change) with its type.
--
-- The teacher now records each visit and chooses its type from a list, urine or stool, instead of
-- only counting the visits. toilet_json becomes { visits: [{ type }], change_count, notes }, with
-- change_count still the number of visits for anything that reads only that.
--
-- The question is answered when the report says "none today" (no visits) or every visit has its
-- type: a visit without one keeps the report from being sent (send_daily_reports and the publish
-- check both use daily_report_missing). Reports from before the type was asked have only
-- change_count and keep the old rule, so the reports already sent and their statistics do not
-- change.

create or replace function public.daily_report_missing(p_meals jsonb, p_nap jsonb, p_mood jsonb, p_toilet jsonb, p_activities jsonb)
returns text[]
language sql
immutable
as $$
  select array_remove(array[
    case when coalesce(p_meals -> 'breakfast' ->> 'amount', '') in ('none', 'quarter', 'half', 'three_quarters', 'all', 'some') then null else 'breakfast' end,
    case when coalesce(p_meals -> 'lunch' ->> 'amount', '') in ('none', 'quarter', 'half', 'three_quarters', 'all', 'some') then null else 'lunch' end,
    case when coalesce(p_meals -> 'snacks' ->> 'amount', '') in ('none', 'quarter', 'half', 'three_quarters', 'all', 'some') then null else 'snacks' end,
    case
      when p_nap -> 'napped' = 'false'::jsonb then null
      when p_nap -> 'napped' = 'true'::jsonb
        and (case when jsonb_typeof(p_nap -> 'duration_minutes') = 'number' then (p_nap ->> 'duration_minutes')::numeric > 0 else false end)
        and coalesce(p_nap ->> 'quality', '') in ('good', 'ok', 'restless') then null
      else 'nap'
    end,
    case when coalesce(p_mood ->> 'mood', '') in ('happy', 'content', 'fussy', 'cranky') then null else 'mood' end,
    case
      -- Each visit with its type (an empty list is "none today").
      when jsonb_typeof(p_toilet -> 'visits') = 'array' then
        case when exists (select 1 from jsonb_array_elements(p_toilet -> 'visits') v where coalesce(v ->> 'type', '') not in ('urine', 'stool'))
             then 'toilet' end
      -- A report from before the type was asked: the number of visits.
      when (case when jsonb_typeof(p_toilet -> 'change_count') = 'number' then (p_toilet ->> 'change_count')::numeric >= 0 else false end)
        then null
      else 'toilet'
    end,
    case when (case when jsonb_typeof(p_activities -> 'tags') = 'array' then jsonb_array_length(p_activities -> 'tags') > 0 else false end)
           or btrim(coalesce(p_activities ->> 'free_text', '')) <> ''
      then null else 'activities' end
  ], null)
$$;

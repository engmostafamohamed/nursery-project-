CREATE OR REPLACE FUNCTION public.create_parent_urgent_event(
  p_title_ar text,
  p_title_en text,
  p_description_ar text DEFAULT NULL,
  p_description_en text DEFAULT NULL,
  p_starts_at timestamptz DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_category text DEFAULT 'activity',
  p_child_ids uuid[] DEFAULT '{}',
  p_permission_deadline timestamptz DEFAULT NULL,
  p_urgent_days_of_week int[] DEFAULT '{}',
  p_urgent_hours_of_day int[] DEFAULT '{}',
  p_urgent_repeats_weekly boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parent_id uuid := auth.uid();
  v_role text := public.current_user_role();
  v_event_id uuid;
  v_nursery_id uuid;
  v_child_count int;
  v_title_ar text := nullif(trim(coalesce(p_title_ar, '')), '');
  v_title_en text := nullif(trim(coalesce(p_title_en, '')), '');
BEGIN
  IF v_parent_id IS NULL OR v_role <> 'parent' THEN
    RAISE EXCEPTION 'Only signed-in parents can create parent urgent events';
  END IF;

  IF v_title_ar IS NULL AND v_title_en IS NULL THEN
    RAISE EXCEPTION 'Event title is required';
  END IF;

  IF p_starts_at IS NULL OR p_starts_at <= now() THEN
    RAISE EXCEPTION 'Event start must be in the future';
  END IF;

  IF coalesce(array_length(p_child_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Choose at least one child';
  END IF;

  IF p_category NOT IN ('trip', 'activity', 'service', 'doctor_visit') THEN
    RAISE EXCEPTION 'Invalid event category';
  END IF;

  IF NOT (coalesce(p_urgent_days_of_week, '{}') <@ ARRAY[0, 1, 2, 3, 4, 5, 6]) THEN
    RAISE EXCEPTION 'Invalid urgent days';
  END IF;

  IF NOT (coalesce(p_urgent_hours_of_day, '{}') <@ ARRAY[
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23
  ]) THEN
    RAISE EXCEPTION 'Invalid urgent hours';
  END IF;

  SELECT c.nursery_id, count(*)::int
  INTO v_nursery_id, v_child_count
  FROM public.children c
  JOIN public.parent_children pc ON pc.child_id = c.id
  WHERE pc.parent_id = v_parent_id
    AND c.id = ANY(p_child_ids)
    AND c.status = 'active'
  GROUP BY c.nursery_id
  ORDER BY count(*) DESC
  LIMIT 1;

  IF v_nursery_id IS NULL OR v_child_count <> cardinality(p_child_ids) THEN
    RAISE EXCEPTION 'You can only create events for your active children in one nursery';
  END IF;

  INSERT INTO public.events (
    nursery_id,
    title_ar,
    title_en,
    description_ar,
    description_en,
    starts_at,
    location,
    category,
    is_urgent,
    urgent_days_of_week,
    urgent_hours_of_day,
    urgent_repeats_weekly,
    is_paid,
    price,
    target_scope,
    target_class_id,
    permission_deadline,
    status,
    cancelled_at
  )
  VALUES (
    v_nursery_id,
    coalesce(v_title_ar, v_title_en),
    coalesce(v_title_en, v_title_ar),
    nullif(trim(coalesce(p_description_ar, '')), ''),
    nullif(trim(coalesce(p_description_en, '')), ''),
    p_starts_at,
    nullif(trim(coalesce(p_location, '')), ''),
    p_category,
    true,
    coalesce(p_urgent_days_of_week, '{}'),
    coalesce(p_urgent_hours_of_day, '{}'),
    coalesce(p_urgent_repeats_weekly, false),
    false,
    NULL,
    'individual',
    NULL,
    p_permission_deadline,
    'active',
    NULL
  )
  RETURNING id INTO v_event_id;

  INSERT INTO public.permissions (child_id, event_id, permission_type, status, deadline)
  SELECT c.id, v_event_id, 'event', 'pending', p_permission_deadline
  FROM public.children c
  JOIN public.parent_children pc ON pc.child_id = c.id
  WHERE pc.parent_id = v_parent_id
    AND c.id = ANY(p_child_ids)
    AND c.nursery_id = v_nursery_id
    AND c.status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.permissions p
      WHERE p.child_id = c.id
        AND p.event_id = v_event_id
    );

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_parent_urgent_event(
  text, text, text, text, timestamptz, text, text, uuid[], timestamptz, int[], int[], boolean
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_parent_urgent_event(
  text, text, text, text, timestamptz, text, text, uuid[], timestamptz, int[], int[], boolean
) TO authenticated;

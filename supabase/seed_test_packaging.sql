-- Script to seed test data for attendance features (Classes, Packaging, Attendance)
-- Please run this in your Supabase SQL Editor.

DO $$
DECLARE
  v_nursery_id UUID;
  v_class_id UUID := gen_random_uuid();
  v_child1_id UUID := gen_random_uuid();
  v_child2_id UUID := gen_random_uuid();
  v_child3_id UUID := gen_random_uuid();
  v_today DATE := current_date;
  v_check_in_time TIMESTAMPTZ := current_date + interval '7 hours'; -- 7:00 AM today
BEGIN
  -- 1. Get an active nursery (take the first one available)
  SELECT id INTO v_nursery_id FROM public.nurseries LIMIT 1;
  
  IF v_nursery_id IS NULL THEN
    RAISE NOTICE 'No nursery found in the database. Please create one first.';
    RETURN;
  END IF;

  -- 2. Create a test class with capacity
  INSERT INTO public.classes (id, nursery_id, name_ar, name_en, capacity)
  VALUES (v_class_id, v_nursery_id, 'فصل الاختبار', 'Test Class (Packaging)', 5);

  -- 3. Create three test children in this class
  -- Child 1: Prepaid Extra Hours = true
  INSERT INTO public.children (id, nursery_id, class_id, full_name_ar, full_name_en, status, dob, photo_privacy_restricted, enrollment_extended_json)
  VALUES (v_child1_id, v_nursery_id, v_class_id, 'طفل مسبق الدفع', 'Prepaid Child', 'active', '2020-01-01', false, '{"has_prepaid_extra_hours": true}'::jsonb);

  -- Child 2: No prepaid hours (standard)
  INSERT INTO public.children (id, nursery_id, class_id, full_name_ar, full_name_en, status, dob, photo_privacy_restricted, enrollment_extended_json)
  VALUES (v_child2_id, v_nursery_id, v_class_id, 'طفل عادي', 'Standard Child', 'active', '2020-01-01', false, '{"has_prepaid_extra_hours": false}'::jsonb);

  -- Child 3: Absent child
  INSERT INTO public.children (id, nursery_id, class_id, full_name_ar, full_name_en, status, dob, photo_privacy_restricted, enrollment_extended_json)
  VALUES (v_child3_id, v_nursery_id, v_class_id, 'طفل غائب', 'Absent Child', 'active', '2020-01-01', false, '{}'::jsonb);

  -- 4. Create attendance records for today (Only child 1 and child 2 are present)
  INSERT INTO public.attendance_records (child_id, attendance_date, check_in)
  VALUES (v_child1_id, v_today, v_check_in_time);

  INSERT INTO public.attendance_records (child_id, attendance_date, check_in)
  VALUES (v_child2_id, v_today, v_check_in_time);

  -- 5. Update Nursery Settings to ensure 'standard_end_time' is set so late fees can be calculated.
  -- We set the standard end time to '14:00' (2:00 PM), grace period 15 min, fee 50 EGP.
  -- If you run this script after 2:15 PM, these children will be considered 'Late'.
  INSERT INTO public.nursery_settings (nursery_id, standard_end_time, late_pickup_grace_minutes, late_pickup_fee_per_hour)
  VALUES (v_nursery_id, '14:00', 15, 50)
  ON CONFLICT (nursery_id) DO UPDATE 
  SET standard_end_time = '14:00', late_pickup_grace_minutes = 15, late_pickup_fee_per_hour = 50;

  RAISE NOTICE 'Test data successfully seeded!';
END $$;

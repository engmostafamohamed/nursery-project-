-- Migration 012: Child Dietary & Feeding Preferences
-- Complete dietary tracking for Egyptian nursery operations
-- Covers 15 Excel fields related to meals, snacks, vitamins, and water

CREATE TABLE IF NOT EXISTS child_dietary_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID REFERENCES children(id) ON DELETE CASCADE NOT NULL UNIQUE,
  
  -- Arrival & Breakfast
  usual_arrival_time TIME,
  eats_breakfast_at_home BOOLEAN DEFAULT false,
  
  -- Nursery Meals
  eats_nursery_meals BOOLEAN DEFAULT true,
  food_allergies_details TEXT,
  
  -- Snacks
  sends_extra_snacks BOOLEAN DEFAULT false,
  extra_snack_type TEXT CHECK (extra_snack_type IN ('optional', 'required', 'none')),
  leftover_snack_action TEXT CHECK (leftover_snack_action IN ('return_with_child', 'discard', 'donate')),
  
  -- Meal Appetite Policy
  meal_appetite_preference TEXT CHECK (meal_appetite_preference IN ('all_required', 'some_allowed', 'child_choice')),
  
  -- Vitamins
  sends_vitamins_daily BOOLEAN DEFAULT false,
  vitamin_details TEXT,
  
  -- Baby Class Meal Timing
  preferred_meal_times_json JSONB,
  
  -- Water Policy
  water_preference TEXT CHECK (water_preference IN ('mineral_with_approval', 'mineral_without_approval', 'home_sent_only')),
  
  -- Extra Meal/Snack Policy
  extra_meal_policy TEXT CHECK (extra_meal_policy IN ('ask_parent_first', 'give_snack_without_approval', 'give_meal_without_approval', 'give_both_without_approval', 'never_give_extra')),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE child_dietary_preferences IS 'Comprehensive dietary and feeding preferences per child - standard Egyptian nursery requirements';
COMMENT ON COLUMN child_dietary_preferences.usual_arrival_time IS 'Time child usually arrives at nursery (affects breakfast/meal planning)';
COMMENT ON COLUMN child_dietary_preferences.eats_breakfast_at_home IS 'Whether child eats breakfast before arriving';
COMMENT ON COLUMN child_dietary_preferences.eats_nursery_meals IS 'Whether child participates in nursery meal program';
COMMENT ON COLUMN child_dietary_preferences.sends_extra_snacks IS 'Whether parent sends daily snacks from home';
COMMENT ON COLUMN child_dietary_preferences.leftover_snack_action IS 'What to do with unfinished home-sent snacks';
COMMENT ON COLUMN child_dietary_preferences.water_preference IS 'Policy for providing water when child runs out';
COMMENT ON COLUMN child_dietary_preferences.extra_meal_policy IS 'Policy when child requests additional food beyond scheduled meals';

-- Enable RLS
ALTER TABLE child_dietary_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Parents can view own children dietary prefs"
  ON child_dietary_preferences FOR SELECT
  USING (
    child_id IN (
      SELECT pc.child_id 
      FROM parent_children pc 
      WHERE pc.parent_id = auth.uid()
    )
  );

CREATE POLICY "Staff can view nursery children dietary prefs"
  ON child_dietary_preferences FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM children c
      JOIN users u ON u.nursery_id = c.nursery_id
      WHERE c.id = child_dietary_preferences.child_id
        AND u.id = auth.uid()
        AND u.role IN ('branch_admin', 'teacher')
    )
  );

CREATE POLICY "Admins can manage dietary prefs"
  ON child_dietary_preferences FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM children c
      JOIN users u ON u.nursery_id = c.nursery_id
      WHERE c.id = child_dietary_preferences.child_id
        AND u.id = auth.uid()
        AND u.role = 'branch_admin'
    )
  );
;

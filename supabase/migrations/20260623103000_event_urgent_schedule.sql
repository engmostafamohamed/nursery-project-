ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS urgent_days_of_week int[] NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS urgent_hours_of_day int[] NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS urgent_repeats_weekly boolean NOT NULL DEFAULT false;

ALTER TABLE public.events
DROP CONSTRAINT IF EXISTS events_urgent_days_of_week_range,
ADD CONSTRAINT events_urgent_days_of_week_range CHECK (
  urgent_days_of_week <@ ARRAY[0, 1, 2, 3, 4, 5, 6]
);

ALTER TABLE public.events
DROP CONSTRAINT IF EXISTS events_urgent_hours_of_day_range,
ADD CONSTRAINT events_urgent_hours_of_day_range CHECK (
  urgent_hours_of_day <@ ARRAY[
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23
  ]
);

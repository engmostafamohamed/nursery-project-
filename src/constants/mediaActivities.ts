/** Values stored in `media.activity_type` for new uploads. */
export const MEDIA_ACTIVITY_KEYS = [
  'field_trip',
  'art',
  'outdoor_play',
  'music',
  'reading',
  'circle_time',
  'meal_time',
  'nap_time',
  'sports',
  'celebration',
  'free_play',
  'custom',
] as const;

export type MediaActivityKey = (typeof MEDIA_ACTIVITY_KEYS)[number];

/** Filter dropdown: new keys + legacy DB values still in use. */
export const PARENT_MEDIA_ACTIVITY_FILTER_KEYS = [
  ...MEDIA_ACTIVITY_KEYS.filter((k) => k !== 'custom'),
  'outdoor',
] as const;

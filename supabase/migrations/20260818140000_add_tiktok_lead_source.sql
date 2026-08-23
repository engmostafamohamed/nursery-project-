-- "How did you hear about us?" reads nurseries.lead_sources, so adding TikTok to the
-- form's fallback list alone would never show it for a nursery that has its own list.
-- Add it to every nursery that does not already offer it, right after Instagram.

UPDATE public.nurseries
SET lead_sources = (
  SELECT jsonb_agg(source ORDER BY ordinality)
  FROM (
    SELECT source, ordinality
    FROM jsonb_array_elements(lead_sources) WITH ORDINALITY AS t(source, ordinality)
    UNION ALL
    SELECT '"TikTok"'::jsonb, 1.5
  ) merged
)
WHERE deleted_at IS NULL
  AND lead_sources IS NOT NULL
  AND jsonb_typeof(lead_sources) = 'array'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(lead_sources) AS existing(value)
    WHERE lower(existing.value) = 'tiktok'
  );

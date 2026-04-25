-- Add customer_types to existing plans in platform_config
-- Run in Supabase SQL Editor

-- Add customer_types=["direct"] to all existing plans that don't have it
UPDATE platform_config
SET plans = (
  SELECT jsonb_agg(
    CASE
      WHEN NOT (elem ? 'customer_types') THEN elem || '{"customer_types": ["direct"]}'::jsonb
      ELSE elem
    END
  )
  FROM jsonb_array_elements(plans) AS elem
)
WHERE plans IS NOT NULL AND plans != '[]'::jsonb;

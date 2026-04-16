-- Remove non-production/demo locations from the live location selector.
-- These UUIDs were verified in production before deletion.

DELETE FROM public.locations
WHERE id IN (
  '00fb85b0-5a55-4814-a4f4-c6ddd60a7ed6'::uuid, -- Remy Calloway
  'b18d7271-3918-4de3-98af-e9a059c41c0b'::uuid  -- Test
);

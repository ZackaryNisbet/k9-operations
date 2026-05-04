-- Adds the missing inventory products reported from AM field use.
-- These products are countable immediately, but default to par 0 so they do not
-- create reorder work until a manager sets an intentional par value.

WITH source_items(item_name, category, subcategory) AS (
  VALUES
    ('Boot Disinfectant Spray', 'Grooming', ''),
    ('Brushes/Combs', 'Grooming', ''),
    ('Happy Hoods', 'Grooming', ''),
    ('Casabella Angled Bristle Broom w/ Dustpan', 'Cleaning', ''),
    ('Invisible Glass', 'Cleaning', ''),
    ('Dish Sponges', 'Cleaning', ''),
    ('Citrace', 'Cleaning', ''),
    ('Expo White Board Cleaner', 'Cleaning', ''),
    ('1-2 Gallon Trash Bags (Office/Lobby)', 'Cleaning', ''),
    ('7-10 Gallon Trash Bags (Bathroom)', 'Cleaning', ''),
    ('HippoSak Poop Bags (Parking Lot)', 'Cleaning', ''),
    ('Tissue Boxes', 'Cleaning', ''),
    ('Washing Machine Cleaner Tablets', 'Cleaning', ''),
    ('Scrubbing Bubbles Bathroom Disinfectant', 'Cleaning', ''),
    ('Dry Mop Heads', 'Cleaning', ''),
    ('Parmesan Cheese', 'Enticements', ''),
    ('Peanut Butter', 'Enticements', ''),
    ('Chicken Breast', 'Enticements', ''),
    ('Salmon Packets (Chicken of the Sea)', 'Enticements', ''),
    ('White Rice', 'Enticements', ''),
    ('Under the Weather - Beef & Rice', 'Enticements', ''),
    ('Under the Weather - Anti-Diarrhea Liquid', 'Enticements', ''),
    ('Beef Broth', 'Enticements', ''),
    ('Vedco Chlor-A-Clens', 'Medical', ''),
    ('Zymox Enzymatic Ear Solution', 'Medical', ''),
    ('Vetericyn Hot Spot Spray', 'Medical', ''),
    ('Pet Bandages', 'Medical', ''),
    ('Hydrogen Peroxide', 'Medical', ''),
    ('Ibuprofen', 'Medical', ''),
    ('Benadryl', 'Medical', ''),
    ('Print Paper (Hammermill)', 'Office/Lobby Supplies', ''),
    ('Paperclips', 'Office/Lobby Supplies', ''),
    ('Binder Clips', 'Office/Lobby Supplies', ''),
    ('Post-its', 'Office/Lobby Supplies', ''),
    ('Wite-Out Correction Tape', 'Office/Lobby Supplies', ''),
    ('Glue Tape', 'Office/Lobby Supplies', ''),
    ('Pens', 'Office/Lobby Supplies', ''),
    ('Expo Markers', 'Office/Lobby Supplies', ''),
    ('Permanent Markers', 'Office/Lobby Supplies', ''),
    ('Tour Brochures', 'K9 Items', ''),
    ('Price Inserts', 'K9 Items', ''),
    ('K9 Blue Canvas Tote Bags', 'K9 Items', ''),
    ('K9 Business Cards', 'K9 Items', ''),
    ('Timeout Cards', 'K9 Items', ''),
    ('Black Non-Slip Mats', 'Misc', '')
),
target_locations AS (
  SELECT DISTINCT location_id
  FROM public.inventory_catalog
),
rows_to_insert AS (
  SELECT
    tl.location_id,
    si.item_name,
    si.category,
    NULLIF(si.subcategory, '') AS subcategory,
    COALESCE((
      SELECT MAX(existing.sort_order)
      FROM public.inventory_catalog existing
      WHERE existing.location_id = tl.location_id
    ), 0) + (ROW_NUMBER() OVER (PARTITION BY tl.location_id ORDER BY si.category, si.item_name) * 10) AS sort_order
  FROM target_locations tl
  CROSS JOIN source_items si
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.inventory_catalog existing
    WHERE existing.location_id = tl.location_id
      AND LOWER(TRIM(existing.item_name)) = LOWER(TRIM(si.item_name))
  )
)
INSERT INTO public.inventory_catalog (
  location_id,
  item_name,
  size,
  vendor,
  category,
  subcategory,
  gl_account,
  par_level,
  min_reorder,
  unit_price,
  vendor_link,
  is_active,
  sort_order
)
SELECT
  location_id,
  item_name,
  NULL,
  NULL,
  category,
  subcategory,
  NULL,
  0,
  NULL,
  0,
  NULL,
  TRUE,
  sort_order
FROM rows_to_insert;

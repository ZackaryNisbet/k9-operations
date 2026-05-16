BEGIN;

WITH source_templates AS (
  SELECT *
  FROM (
    VALUES
      (
        'building-maintenance-monthly',
        'Monthly Building Maintenance Checklist',
        'Monthly checklist due by the end of each month. Tip: Do one or two items each evening the first week of the month.',
        'Monthly Building Maintenance Checklist.xlsx',
        jsonb_build_array(
          jsonb_build_object('key','monthly-hair-trap','label',$$Hair Trap inspection (if applicable) - refer to manufacturer's suggested maintenance plan. Utilize pump-out service as needed.$$, 'sort_order',1,'is_required',true),
          jsonb_build_object('key','monthly-fence-inspection','label',$$Fence Inspection: Looking for cracks, structure damage, or weakness in posts. Check close functionality of door hinges and gate closures (Inspect both sides of the fence)$$, 'sort_order',2,'is_required',true),
          jsonb_build_object('key','monthly-k9-grass','label',$$K9 Grass inspection: look for small pulls or tears that may become a bigger issue.$$, 'sort_order',3,'is_required',true),
          jsonb_build_object('key','monthly-light-bulbs','label',$$Light bulb inspection - check all interior and exterior lighting for proper functionality.$$, 'sort_order',4,'is_required',true),
          jsonb_build_object('key','monthly-room-safety','label',$$Inspect each room including daycare for loose screws, loose locks, and sharp materials, corners, etc. This is best performed after closing.$$, 'sort_order',5,'is_required',true),
          jsonb_build_object('key','monthly-washer-dryer-vents','label',$$Inspect and clean out any clothes Washer and Dryer vents or filters. The lint filter should be cleaned out with each use. Follow maintenance protocol outlined in owner's manual.$$, 'sort_order',6,'is_required',true),
          jsonb_build_object('key','monthly-ceiling-tiles','label',$$Inspect ceiling tiles for dust, sagging, water spots, and misalignment with ceiling grid.$$, 'sort_order',7,'is_required',true),
          jsonb_build_object('key','monthly-grout-lines','label',$$Inspect grout lines for wear and tear. Repair as needed.$$, 'sort_order',8,'is_required',true),
          jsonb_build_object('key','monthly-doors','label',$$Inspect all doors in the Lobby, manager's office, tour hall doors, luxury suite, executive rooms, compartments, vestibule, emergency exits, large daycare, small daycare, and private play entrance doors, entrance gates, and fence gates are functioning properly.
o Inspect door handle.
o Inspect that all push bars (if applicable) are NOT locked in the open position.
o Inspect door closures have the right amount of tension required to open the door.
o Inspect locks are working.
o Inspect doors, trim, and other areas for wear and tear. IE: rusting, rotting, warping, mold
etc...$$, 'sort_order',9,'is_required',true),
          jsonb_build_object('key','monthly-fire-extinguishers-visual','label',$$Visually inspect fire extinguishers$$, 'sort_order',10,'is_required',true),
          jsonb_build_object('key','monthly-emergency-lighting','label',$$Test emergency lighting$$, 'sort_order',11,'is_required',true),
          jsonb_build_object('key','monthly-scent-air','label',$$Confirm Scent Air is functional$$, 'sort_order',12,'is_required',true)
        )
      ),
      (
        'building-maintenance-quarterly',
        'Quarterly Building Maintenance Checklist',
        'Quarterly checklist due by the end of each quarter.',
        'Quarterly Building Maintenance Checklist.xlsx',
        jsonb_build_array(
          jsonb_build_object('key','quarterly-hvac-service','label',$$Service of RTUs, ERVs, Dehumidifiers, and other HVAC components. This should include basics such as filter changes, belt changes, and adjustments to the system. It should also include any manufacturer-suggested maintenance protocols found in the owner's manual for your particular model units.$$, 'sort_order',1,'is_required',true),
          jsonb_build_object('key','quarterly-filter-return-grills','label',$$Change filter-backed return grills (if applicable)$$, 'sort_order',2,'is_required',true),
          jsonb_build_object('key','quarterly-water-filtration','label',$$Water Filtration system inspection (if applicable) - change filter according to manufactures requirements.$$, 'sort_order',3,'is_required',true),
          jsonb_build_object('key','quarterly-seasonal-contracts','label',$$Renew and schedule service for any seasonal service contracts.
o Landscaping - trim bushes, trim trees, cut grass, replace plants or shrubbery as needed.
o Snow removal - Contract with a local service provider that can plow the parking lot
during snowstorms if this service is not included in CAM.
o Trash removal - Confirm the size dumpster you have is appropriate for your trash
needs.$$, 'sort_order',4,'is_required',true),
          jsonb_build_object('key','quarterly-roof-inspection','label',$$Perform roof inspection for any signs of wear and tear. Proactively repair as needed.$$, 'sort_order',5,'is_required',true)
        )
      ),
      (
        'building-maintenance-semi-annual',
        'Semi-Annual Building Maintenance Checklist',
        'Semi-annual checklist defaulting to January-June and July-December. Start month is configurable by template.',
        'Semi-Annual Building Maintenance Checklist.xlsx',
        jsonb_build_array(
          jsonb_build_object('key','semiannual-gutters','label',$$Clean gutters (Spring and Fall)$$, 'sort_order',1,'is_required',true),
          jsonb_build_object('key','semiannual-paint-touchups','label',$$Paint touch-ups (Spring and Fall) - This could include spackling deep scratches, painting marked, or chipped areas, and replacing trim pieces.$$, 'sort_order',2,'is_required',true),
          jsonb_build_object('key','semiannual-caulk','label',$$Inspect caulk in dog rooms and daycare. Replace as needed. (Pecora Dynaflex SC)$$, 'sort_order',3,'is_required',true)
        )
      ),
      (
        'building-maintenance-annual',
        'Annual Building Maintenance Checklist',
        'Annual checklist due by the end of the year by default.',
        'Annual Building Maintenance Checklist.xlsx',
        jsonb_build_array(
          jsonb_build_object('key','annual-ductwork-uv-lights','label',$$Replacement of UV lights in ductwork or at RTU unit. This is either PetAirapy or Renewaire.$$, 'sort_order',1,'is_required',true),
          jsonb_build_object('key','annual-ceiling-uv-lights','label',$$Replacement of UV lights in ceiling mounted PetAirapy units.$$, 'sort_order',2,'is_required',true),
          jsonb_build_object('key','annual-hvac-ducts','label',$$Inspect HVAC ducts for dust build-up and have cleaned/sanitized as needed by an ASCS certified company.$$, 'sort_order',3,'is_required',true),
          jsonb_build_object('key','annual-power-wash','label',$$Power wash exterior (Spring)$$, 'sort_order',4,'is_required',true),
          jsonb_build_object('key','annual-alarm-inspection','label',$$ADT or (Other) alarm inspection. Call service provider and ask them to place in test mode. Test alarm, panic buttons, cameras, and anything else tied to the security system.$$, 'sort_order',5,'is_required',true),
          jsonb_build_object('key','annual-fire-alarms','label',$$Inspect all fire alarms and fire monitoring equipment (pull stations, fire panel, fire panel battery, smoke detectors, heat detectors, strobes, horns, tamper valve)$$, 'sort_order',6,'is_required',true),
          jsonb_build_object('key','annual-sprinkler-system','label',$$Inspect sprinkler system.$$, 'sort_order',7,'is_required',true),
          jsonb_build_object('key','annual-fire-extinguishers-professional','label',$$Professionally inspect fire extinguishers according to local requirements$$, 'sort_order',8,'is_required',true),
          jsonb_build_object('key','annual-parking-sidewalk','label',$$Parking lot and sidewalk inspection. (if applicable) - Look for cracks, holes, and quality of parking lines. Seal as needed. Typically, seal coating is recommended every 3 years to provide adequate pavement protection as well as attractive curb appeal for your commercial property.$$, 'sort_order',9,'is_required',true),
          jsonb_build_object('key','annual-masonry-pavers','label',$$Inspection exterior masonry/pavers (if applicable) - (Spring)$$, 'sort_order',10,'is_required',true),
          jsonb_build_object('key','annual-stucco','label',$$Inspect exterior surfaces such as Stucco, and repair as needed with a manufacturer-certified stucco installer. (This is also critical to maintaining the manufacturer's warranty of your stucco)$$, 'sort_order',11,'is_required',true),
          jsonb_build_object('key','annual-front-door','label',$$Thoroughly inspect front door, looking for scratches, rust, and hinge challenges developing. Have professionally repainted/restored as needed.$$, 'sort_order',12,'is_required',true),
          jsonb_build_object('key','annual-water-heater','label',$$Water heater inspection and maintenance/service$$, 'sort_order',13,'is_required',true),
          jsonb_build_object('key','annual-ir-electrical','label',$$You may want to consider regular infrared (IR) electrical inspection of your electrical system including panels, switches, disconnects, and motors. This could help identify electrical challenges before an active problem is seen or safety hazard emerges.$$, 'sort_order',14,'is_required',true)
        )
      )
  ) AS rows(slug, name, description, source_file_name, items)
),
target_templates AS (
  UPDATE public.resort_upkeep_templates t
  SET
    name = s.name,
    description = s.description,
    metadata = COALESCE(t.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'source_file_name', s.source_file_name,
        'source_text_reconciled_at', '2026-05-16'
      ),
    updated_at = now()
  FROM source_templates s
  WHERE t.location_id IS NULL
    AND t.slug = s.slug
    AND t.module = 'building_maintenance'
  RETURNING t.id, t.slug
),
latest_versions AS (
  SELECT template_id, COALESCE(max(version_number), 0) + 1 AS next_version_number
  FROM public.resort_upkeep_template_versions
  WHERE template_id IN (SELECT id FROM target_templates)
  GROUP BY template_id
),
inserted_versions AS (
  INSERT INTO public.resort_upkeep_template_versions (
    template_id,
    version_number,
    status,
    items,
    source_file_name,
    changelog,
    published_at
  )
  SELECT
    t.id,
    lv.next_version_number,
    'published',
    s.items,
    s.source_file_name,
    'Reconciled task wording against the attached source checklist file.',
    now()
  FROM target_templates t
  JOIN source_templates s ON s.slug = t.slug
  JOIN latest_versions lv ON lv.template_id = t.id
  RETURNING id, template_id, items
),
activated AS (
  UPDATE public.resort_upkeep_templates t
  SET active_version_id = v.id,
      updated_at = now()
  FROM inserted_versions v
  WHERE t.id = v.template_id
  RETURNING t.id, t.slug, v.id AS version_id, v.items
)
UPDATE public.resort_upkeep_periods p
SET
  template_version_id = a.version_id,
  items_snapshot = a.items,
  updated_at = now(),
  lock_version = lock_version + 1
FROM activated a
WHERE p.template_id = a.id
  AND p.template_slug = a.slug
  AND p.status IN ('open', 'in_progress', 'amending')
  AND p.first_submitted_at IS NULL;

INSERT INTO public.resort_upkeep_troubleshooting_articles (
  slug,
  title,
  category,
  body,
  sort_order,
  source_file_name,
  metadata
)
VALUES
  (
    'repair-maintenance-contact',
    'Repair and Maintenance Trouble Shooting Tips',
    'Contact',
    $$If ever there is a situation where additional guidance is needed, please feel free to reach out to Facilities Vendor (CDO). In an emergency/same day service situation please call Hayden at 623-261-3294. If not an emergency situation please e-mail Hayden at facilities@example.com.$$,
    1,
    'Trouble Shooting.docx',
    '{"source_paragraphs":[0,1],"source_text_reconciled_at":"2026-05-16"}'::jsonb
  ),
  (
    'electrical-troubleshooting',
    'Electrical',
    'Electrical',
    $$Check to see if a GFI outlet has tripped (generally an outlet around water, may have a light on the outlet indicating GFI tripped)
Check the electric panel to see if a breaker has tripped
If outlet is not working, try plugging something else into the outlet to see if that item works
If it is a light fixture that is not working, replace bulbs
Confirm light switch is turned on
If issue with lights (inside or out) not turning on, check to the set schedule, exterior lights may be on a timer that needs to be adjusted
Should the resort experience a full power outage, go outside and see if other neighbors have power on. If power is out to the area, call into power company to see if they are aware and what the ETA is to having power back on
If power is on to neighboring space, call the power company to see what they show (may be an issue with past due invoice)$$,
    2,
    'Trouble Shooting.docx',
    '{"source_paragraphs":[3,4,5,6,7,8,9,10,11],"source_text_reconciled_at":"2026-05-16"}'::jsonb
  ),
  (
    'plumbing-troubleshooting',
    'Plumbing',
    'Plumbing',
    $$Toilet not flushing, use plunger multiple times
Ensure water is turned on to the fixture
Water hose not working, ensure spigot it turned on
Should water not be on to the entire building, confirm if main water line is turned on (see Resort Emergency Information sheet for location of main water valve)
If valve on, go to neighbor or two, to see if they have water
If neighbors have water and valve is on, call water company (see Vendor list for phone number and account number)
Call water department to see what they show (may be an issue with past due invoice)$$,
    3,
    'Trouble Shooting.docx',
    '{"source_paragraphs":[13,14,15,16,17,18,19,20],"source_text_reconciled_at":"2026-05-16"}'::jsonb
  ),
  (
    'roof-leaks-troubleshooting',
    'Roof Leaks',
    'Roof Leaks',
    $$Refer to Vendor List to see roofer that is noted. Many times the Landlord is responsible for roof repairs. If Landlord is responsible to maintain the roof and if we use another vendor outside of the Landlord's vendor, LPHI may be faced with serious financial implications
If the Landlord is responsible to maintain the roof and if the roof leaks cause damages to our ceiling tiles, inform the Landlord that we are requesting them to replace the damaged ceiling tiles$$,
    4,
    'Trouble Shooting.docx',
    '{"source_paragraphs":[21,22,23],"source_text_reconciled_at":"2026-05-16"}'::jsonb
  ),
  (
    'dispatch-guidance',
    'Other Recommendations',
    'Dispatch Guidance',
    $$If and when possible, it is recommended for the GM to hold off on requesting a work order for one off non-urgent issues. If the item meets the below qualifications, it's recommended to hold off on dispatching work for a one off and to wait till there are a few items that a tech can address during one visit.
If the noted issue(s) are not of an urgent manner that if delayed will not hinder the daily activities of the resort
If the noted issue(s) do not pose a health or injury risk to staff and or customers
If the noted issue(s) are not temperature related
If the noted issue(s) is not corrected in the near future, the issue may become larger and increase the cost of addressing it$$,
    5,
    'Trouble Shooting.docx',
    '{"source_paragraphs":[24,25,26,27,28,29],"source_text_reconciled_at":"2026-05-16"}'::jsonb
  )
ON CONFLICT (slug) DO UPDATE
SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  body = EXCLUDED.body,
  sort_order = EXCLUDED.sort_order,
  source_file_name = EXCLUDED.source_file_name,
  metadata = EXCLUDED.metadata,
  is_active = true,
  updated_at = now();

COMMIT;

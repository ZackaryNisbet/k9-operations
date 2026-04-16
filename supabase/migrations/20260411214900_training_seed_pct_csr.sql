-- Training Module — Seed Adair Forsythe PCT and CSR Training Plans
-- Only these two training_plan templates are activated in wave 1.
-- Other templates (written certs, live evals, etc.) are seeded as inactive for phase 2.

DO $$
DECLARE
  -- Template IDs
  v_pct_template_id uuid;
  v_csr_template_id uuid;
  -- Version IDs
  v_pct_version_id uuid;
  v_csr_version_id uuid;
  -- Section/item IDs (reusable within loops)
  v_section_id uuid;
  v_child_section_id uuid;
  v_item_seq integer;
BEGIN

-- ═══════════════════════════════════════════════════════════════════════════
-- PCT Training Plan
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO training_templates (id, slug, name, template_class, role_scopes, is_active)
VALUES (gen_random_uuid(), 'pct_training_plan', 'Training Plan - PCT', 'training_plan', ARRAY['PCT'], true)
RETURNING id INTO v_pct_template_id;

INSERT INTO training_template_versions (id, template_id, version_no, status, is_current, source_seed_key, source_packet, published_snapshot, metadata, published_at)
VALUES (gen_random_uuid(), v_pct_template_id, 1, 'published', true, 'pct_training_plan', 'K9-CH-Certifications.pdf',
  '{"seed_version":"v1","template_key":"pct_training_plan"}'::jsonb,
  '{"qa_flags":["PCT Day 6 time block should be manually verified against original packet before production use."]}'::jsonb,
  now())
RETURNING id INTO v_pct_version_id;

-- ── PCT Pre-Training Section ──
INSERT INTO training_template_sections (id, template_version_id, section_key, title, section_type, sequence_order, instructions)
VALUES (gen_random_uuid(), v_pct_version_id, 'pct_pre_training', 'Pre-Training (5 hrs - Onsite or At Home)', 'phase', 0, 'Online / pre-hire requirements')
RETURNING id INTO v_section_id;

v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order, completion_mode) VALUES
  (v_pct_version_id, v_section_id, 'pct_pre_intro_canines', 'Introduction to Canines - Learning Portal', 'checkbox', (v_item_seq := v_item_seq + 1), 'complete_only'),
  (v_pct_version_id, v_section_id, 'pct_pre_ext_disorders', 'External Disorders', 'checkbox', (v_item_seq := v_item_seq + 1), 'complete_only'),
  (v_pct_version_id, v_section_id, 'pct_pre_int_disorders', 'Internal Disorders', 'checkbox', (v_item_seq := v_item_seq + 1), 'complete_only'),
  (v_pct_version_id, v_section_id, 'pct_pre_parasites', 'Parasites', 'checkbox', (v_item_seq := v_item_seq + 1), 'complete_only'),
  (v_pct_version_id, v_section_id, 'pct_pre_toxicities', 'Toxicities', 'checkbox', (v_item_seq := v_item_seq + 1), 'complete_only'),
  (v_pct_version_id, v_section_id, 'pct_pre_nutrition', 'Nutrition', 'checkbox', (v_item_seq := v_item_seq + 1), 'complete_only'),
  (v_pct_version_id, v_section_id, 'pct_pre_vaccinations', 'Vaccinations', 'checkbox', (v_item_seq := v_item_seq + 1), 'complete_only'),
  (v_pct_version_id, v_section_id, 'pct_pre_boarding_senior', 'Boarding Senior Pets', 'checkbox', (v_item_seq := v_item_seq + 1), 'complete_only'),
  (v_pct_version_id, v_section_id, 'pct_pre_anatomy', 'Anatomy of a Dog', 'checkbox', (v_item_seq := v_item_seq + 1), 'complete_only'),
  (v_pct_version_id, v_section_id, 'pct_pre_pro_pet_hero', 'Pro Pet Hero Class - First Aid & CPR - Online', 'checkbox', (v_item_seq := v_item_seq + 1), 'complete_only'),
  (v_pct_version_id, v_section_id, 'pct_pre_application', 'Completed Application', 'checkbox', (v_item_seq := v_item_seq + 1), 'complete_only'),
  (v_pct_version_id, v_section_id, 'pct_pre_job_desc', 'Sign Job Description', 'checkbox', (v_item_seq := v_item_seq + 1), 'complete_only'),
  (v_pct_version_id, v_section_id, 'pct_pre_confidentiality', 'Confidentiality Agreement (exhibit 5a)', 'checkbox', (v_item_seq := v_item_seq + 1), 'complete_only'),
  (v_pct_version_id, v_section_id, 'pct_pre_direct_deposit', 'Direct Deposit Form (optional)', 'checkbox', (v_item_seq := v_item_seq + 1), 'complete_only'),
  (v_pct_version_id, v_section_id, 'pct_pre_uniform', 'Uniform Size', 'checkbox', (v_item_seq := v_item_seq + 1), 'complete_only'),
  (v_pct_version_id, v_section_id, 'pct_pre_benefits', 'Benefits (if applicable)', 'checkbox', (v_item_seq := v_item_seq + 1), 'complete_only');

-- ── PCT Day 1 ──
INSERT INTO training_template_sections (id, template_version_id, section_key, title, section_type, sequence_order, day_number, time_block_start, time_block_end)
VALUES (gen_random_uuid(), v_pct_version_id, 'pct_day_1', 'Day 1 - Orientation / All Team Members', 'day', 1, 1, '09:00', '17:00')
RETURNING id INTO v_section_id;

-- Day 1 modules as child sections
INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_pct_version_id, v_section_id, 'pct_day1_welcome', 'Meet and Greet / Facility Tour', 'module', 1)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_pct_version_id, v_child_section_id, 'pct_d1_welcome_1', 'Meet and greet team', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d1_welcome_2', 'Facility tour', 'checkbox', (v_item_seq := v_item_seq + 1));

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_pct_version_id, v_section_id, 'pct_day1_hr', 'Human Resources Related', 'module', 2)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_pct_version_id, v_child_section_id, 'pct_d1_hr_1', 'Employee handbook review and signoff', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d1_hr_2', 'Review scheduling/setup with scheduling software', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d1_hr_3', 'Provide time clock credentials', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d1_hr_4', 'Provide scripts and daily lists for position-specific training', 'checkbox', (v_item_seq := v_item_seq + 1));

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_pct_version_id, v_section_id, 'pct_day1_resort_basics', 'Resort Basics', 'module', 3)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_pct_version_id, v_child_section_id, 'pct_d1_rb_1', 'Dog handling', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d1_rb_2', 'Safety', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d1_rb_3', 'Services and accommodations', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d1_rb_4', 'Universal procedures', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d1_rb_5', 'K9 Resorts policies', 'checkbox', (v_item_seq := v_item_seq + 1));

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_pct_version_id, v_section_id, 'pct_day1_behavior_videos', 'Dog Behavior Videos', 'module', 4)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_pct_version_id, v_child_section_id, 'pct_d1_bv_1', 'How not to get bitten', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d1_bv_2', 'Dog communication', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d1_bv_3', 'Calming signals', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d1_bv_4', 'Managing a pack', 'checkbox', (v_item_seq := v_item_seq + 1));

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_pct_version_id, v_section_id, 'pct_day1_daycare_evaluations', 'Performing Daycare Evaluations', 'module', 5)
RETURNING id INTO v_child_section_id;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_pct_version_id, v_child_section_id, 'pct_d1_de_1', 'Performing daycare evaluations overview', 'checkbox', 1);

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_pct_version_id, v_section_id, 'pct_day1_red_binder', 'Red Binder', 'module', 6)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_pct_version_id, v_child_section_id, 'pct_d1_red_1', 'Emergency protocol', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d1_red_2', 'First Aid response', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d1_red_3', 'Heat stroke, bloat, seizures', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d1_red_4', 'Canine cough', 'checkbox', (v_item_seq := v_item_seq + 1));

-- ── PCT Day 2 - Sanitation ──
INSERT INTO training_template_sections (id, template_version_id, section_key, title, section_type, sequence_order, day_number, time_block_start, time_block_end)
VALUES (gen_random_uuid(), v_pct_version_id, 'pct_day_2', 'Day 2 - Sanitation', 'day', 2, 2, '09:00', '17:00')
RETURNING id INTO v_section_id;

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_pct_version_id, v_section_id, 'pct_day2_sanitation_intro', 'Sanitation Introduction', 'module', 1)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_pct_version_id, v_child_section_id, 'pct_d2_si_1', 'Chemicals', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_si_2', 'Safety review', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_si_3', 'Tools and equipment', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_si_4', 'Cleaning basics', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_si_5', 'Cleaning, sanitizing and disinfecting', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_si_6', 'Mopping technique', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_si_7', 'Mop head longevity', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_si_8', 'Linen', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_si_9', 'Lobby', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_si_10', 'Restroom', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_si_11', 'Kitchen', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_si_12', 'Solid and liquid waste', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_si_13', 'Garbage removal', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_si_14', 'Hair interceptor', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_si_15', 'Spot cleaning', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_si_16', 'Great room cleaning / room cleaning reference', 'checkbox', (v_item_seq := v_item_seq + 1));

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_pct_version_id, v_section_id, 'pct_day2_sanitation_interior', 'Sanitation - Disinfecting Interior', 'module', 2)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_pct_version_id, v_child_section_id, 'pct_d2_int_1', 'Cage-free accommodations', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_int_2', 'Compartments - single and double', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_int_3', 'Dryer', 'checkbox', (v_item_seq := v_item_seq + 1));

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_pct_version_id, v_section_id, 'pct_day2_sanitation_exterior', 'Sanitation - Disinfecting Exterior', 'module', 3)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_pct_version_id, v_child_section_id, 'pct_d2_ext_1', 'Wysiwash operations', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_ext_2', 'Foamer operations', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_ext_3', 'K9 Grass / Turf', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_ext_4', 'Fencing', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_ext_5', 'Parking lot', 'checkbox', (v_item_seq := v_item_seq + 1));

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_pct_version_id, v_section_id, 'pct_day2_sanitation_extras', 'Sanitation - Disinfecting Extras', 'module', 4)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_pct_version_id, v_child_section_id, 'pct_d2_extra_1', 'Leads', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_extra_2', 'Boots', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_extra_3', 'Aprons', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_extra_4', 'Food bowls', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_extra_5', 'Food cart', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_extra_6', 'Water jugs', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d2_extra_7', 'Weekly tasks', 'checkbox', (v_item_seq := v_item_seq + 1));

-- ── PCT Day 3 - Bathing and Daycare ──
INSERT INTO training_template_sections (id, template_version_id, section_key, title, section_type, sequence_order, day_number, time_block_start, time_block_end)
VALUES (gen_random_uuid(), v_pct_version_id, 'pct_day_3', 'Day 3 - Bathing and Daycare', 'day', 3, 3, '09:00', '17:00')
RETURNING id INTO v_section_id;

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_pct_version_id, v_section_id, 'pct_day3_bathing', 'Bathing', 'module', 1)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_pct_version_id, v_child_section_id, 'pct_d3_bath_1', 'Bathing overview', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d3_bath_2', 'Dryer operations', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d3_bath_3', 'Shampoo and perfume', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d3_bath_4', 'Bathing technique + knot', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d3_bath_5', 'Brushing', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d3_bath_6', 'Towel dry', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d3_bath_7', 'Blow dryer', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d3_bath_8', 'Ears and eyes', 'checkbox', (v_item_seq := v_item_seq + 1));

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_pct_version_id, v_section_id, 'pct_day3_bath_samples', 'Bath Samples', 'module', 2)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_pct_version_id, v_child_section_id, 'pct_d3_bs_1', 'Short-haired dog', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d3_bs_2', 'Long-haired dog', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d3_bs_3', 'Double coat dog', 'checkbox', (v_item_seq := v_item_seq + 1));

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_pct_version_id, v_section_id, 'pct_day3_bathing_cleanup', 'Bathing Room Cleaning', 'module', 3)
RETURNING id INTO v_child_section_id;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_pct_version_id, v_child_section_id, 'pct_d3_bc_1', 'Bathing room cleaning', 'checkbox', 1);

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_pct_version_id, v_section_id, 'pct_day3_daycare_rules', 'Daycare Rules and Policies', 'module', 4)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_pct_version_id, v_child_section_id, 'pct_d3_dr_1', 'Broom policy', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d3_dr_2', 'Dog behavior / health and wellness', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d3_dr_3', 'Entering daycare', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d3_dr_4', 'Gates and garage doors', 'checkbox', (v_item_seq := v_item_seq + 1));

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_pct_version_id, v_section_id, 'pct_day3_daycare_procedures', 'Daycare Procedures', 'module', 5)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_pct_version_id, v_child_section_id, 'pct_d3_dp_1', 'Entering daycare', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d3_dp_2', 'Shift change', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d3_dp_3', 'Desensitization', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d3_dp_4', 'Time checks', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d3_dp_5', 'Daycare pickup procedure', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d3_dp_6', 'Daycare evaluations - front and back of house', 'checkbox', (v_item_seq := v_item_seq + 1));

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_pct_version_id, v_section_id, 'pct_day3_small_daycare_live', 'Small Daycare Live', 'module', 6)
RETURNING id INTO v_child_section_id;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_pct_version_id, v_child_section_id, 'pct_d3_sdl_1', 'Small daycare live practical', 'checkbox', 1);

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_pct_version_id, v_section_id, 'pct_day3_large_daycare_live', 'Large Daycare Live', 'module', 7)
RETURNING id INTO v_child_section_id;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_pct_version_id, v_child_section_id, 'pct_d3_ldl_1', 'Large daycare live practical', 'checkbox', 1);

-- ── PCT Day 4 ──
INSERT INTO training_template_sections (id, template_version_id, section_key, title, section_type, sequence_order, day_number, time_block_start, time_block_end)
VALUES (gen_random_uuid(), v_pct_version_id, 'pct_day_4', 'Day 4 - Shadow Opening Shift', 'day', 4, 4, '06:00', '13:00')
RETURNING id INTO v_section_id;
INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_pct_version_id, v_section_id, 'pct_day4_shadow', 'Shadow Position (PCT) and Perform Tasks', 'module', 1)
RETURNING id INTO v_child_section_id;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_pct_version_id, v_child_section_id, 'pct_d4_shadow_1', 'Follow daily checklist items', 'checkbox', 1);

-- ── PCT Day 5 ──
INSERT INTO training_template_sections (id, template_version_id, section_key, title, section_type, sequence_order, day_number, time_block_start, time_block_end)
VALUES (gen_random_uuid(), v_pct_version_id, 'pct_day_5', 'Day 5 - Shadow Later Shift', 'day', 5, 5, '13:00', '19:00')
RETURNING id INTO v_section_id;
INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_pct_version_id, v_section_id, 'pct_day5_shadow', 'Shadow Position (PCT) and Perform Tasks', 'module', 1)
RETURNING id INTO v_child_section_id;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_pct_version_id, v_child_section_id, 'pct_d5_shadow_1', 'Follow daily checklist items', 'checkbox', 1);

-- ── PCT Day 6 - Test Day ──
INSERT INTO training_template_sections (id, template_version_id, section_key, title, section_type, sequence_order, day_number, time_block_start, time_block_end, time_block_note)
VALUES (gen_random_uuid(), v_pct_version_id, 'pct_day_6', 'Day 6 - Test Day', 'day', 6, 6, '21:00', '13:00', 'Keep original packet wording until manually verified.')
RETURNING id INTO v_section_id;
INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_pct_version_id, v_section_id, 'pct_day6_required_exams', 'Required Exams', 'module', 1)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_pct_version_id, v_child_section_id, 'pct_d6_exam_1', 'Sanitation - written and live exam', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d6_exam_2', 'Bathing - written and live exam', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_pct_version_id, v_child_section_id, 'pct_d6_exam_3', 'Daycare - written and live exam', 'checkbox', (v_item_seq := v_item_seq + 1));

-- ── PCT Adair Forsythe Operational Additions ──
INSERT INTO training_template_sections (id, template_version_id, section_key, title, section_type, sequence_order, completion_mode)
VALUES (gen_random_uuid(), v_pct_version_id, 'pct_cherry_hill_additions', 'Adair Forsythe Operational Additions', 'module', 7, 'observe_participate_demonstrate')
RETURNING id INTO v_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order, completion_mode) VALUES
  (v_pct_version_id, v_section_id, 'pct_ch_1', 'Morning let outs', 'task', (v_item_seq := v_item_seq + 1), 'observe_participate_demonstrate'),
  (v_pct_version_id, v_section_id, 'pct_ch_2', 'POD pass', 'task', (v_item_seq := v_item_seq + 1), 'observe_participate_demonstrate'),
  (v_pct_version_id, v_section_id, 'pct_ch_3', 'Changing mop heads', 'task', (v_item_seq := v_item_seq + 1), 'observe_participate_demonstrate'),
  (v_pct_version_id, v_section_id, 'pct_ch_4', 'Cleaning compartment grates', 'task', (v_item_seq := v_item_seq + 1), 'observe_participate_demonstrate'),
  (v_pct_version_id, v_section_id, 'pct_ch_5', 'Full disinfect vs room refresh vs sanitize', 'task', (v_item_seq := v_item_seq + 1), 'observe_participate_demonstrate'),
  (v_pct_version_id, v_section_id, 'pct_ch_6', 'End-of-day tasks', 'task', (v_item_seq := v_item_seq + 1), 'observe_participate_demonstrate'),
  (v_pct_version_id, v_section_id, 'pct_ch_7', 'Large daycare shifts', 'task', (v_item_seq := v_item_seq + 1), 'observe_participate_demonstrate'),
  (v_pct_version_id, v_section_id, 'pct_ch_8', 'Small daycare shifts', 'task', (v_item_seq := v_item_seq + 1), 'observe_participate_demonstrate'),
  (v_pct_version_id, v_section_id, 'pct_ch_9', 'Closing a daycare', 'task', (v_item_seq := v_item_seq + 1), 'observe_participate_demonstrate'),
  (v_pct_version_id, v_section_id, 'pct_ch_10', 'Radio protocols', 'task', (v_item_seq := v_item_seq + 1), 'observe_participate_demonstrate'),
  (v_pct_version_id, v_section_id, 'pct_ch_11', 'Private play sessions', 'task', (v_item_seq := v_item_seq + 1), 'observe_participate_demonstrate'),
  (v_pct_version_id, v_section_id, 'pct_ch_12', 'Boxes vs no boxes', 'task', (v_item_seq := v_item_seq + 1), 'observe_participate_demonstrate'),
  (v_pct_version_id, v_section_id, 'pct_ch_13', 'Closing private play', 'task', (v_item_seq := v_item_seq + 1), 'observe_participate_demonstrate'),
  (v_pct_version_id, v_section_id, 'pct_ch_14', 'Pull boarding dogs back to rooms', 'task', (v_item_seq := v_item_seq + 1), 'observe_participate_demonstrate'),
  (v_pct_version_id, v_section_id, 'pct_ch_15', 'End-of-day resets', 'task', (v_item_seq := v_item_seq + 1), 'observe_participate_demonstrate');


-- ═══════════════════════════════════════════════════════════════════════════
-- CSR Training Plan
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO training_templates (id, slug, name, template_class, role_scopes, is_active)
VALUES (gen_random_uuid(), 'csr_training_plan', 'Training Plan - CSR', 'training_plan', ARRAY['CSR'], true)
RETURNING id INTO v_csr_template_id;

INSERT INTO training_template_versions (id, template_id, version_no, status, is_current, source_seed_key, source_packet, published_snapshot, metadata, published_at)
VALUES (gen_random_uuid(), v_csr_template_id, 1, 'published', true, 'csr_training_plan', 'K9-CH-Certifications.pdf',
  '{"seed_version":"v1","template_key":"csr_training_plan"}'::jsonb,
  '{"qa_flags":["CSR Day 6 time block should be manually verified against original packet before production use."]}'::jsonb,
  now())
RETURNING id INTO v_csr_version_id;

-- ── CSR Pre-Training Section ──
INSERT INTO training_template_sections (id, template_version_id, section_key, title, section_type, sequence_order, instructions)
VALUES (gen_random_uuid(), v_csr_version_id, 'csr_pre_training', 'Pre-Training (5 hrs - Onsite or At Home)', 'phase', 0, 'Online / pre-hire requirements')
RETURNING id INTO v_section_id;

v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_csr_version_id, v_section_id, 'csr_pre_intro_canines', 'Introduction to Canines - Learning Portal', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_section_id, 'csr_pre_ext_disorders', 'External Disorders', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_section_id, 'csr_pre_int_disorders', 'Internal Disorders', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_section_id, 'csr_pre_parasites', 'Parasites', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_section_id, 'csr_pre_toxicities', 'Toxicities', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_section_id, 'csr_pre_nutrition', 'Nutrition', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_section_id, 'csr_pre_vaccinations', 'Vaccinations', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_section_id, 'csr_pre_boarding_senior', 'Boarding Senior Pets', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_section_id, 'csr_pre_anatomy', 'Anatomy of a Dog', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_section_id, 'csr_pre_pro_pet_hero', 'Pro Pet Hero Class - First Aid & CPR - Online', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_section_id, 'csr_pre_application', 'Completed Application', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_section_id, 'csr_pre_job_desc', 'Sign Job Description', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_section_id, 'csr_pre_confidentiality', 'Confidentiality Agreement (exhibit 5a)', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_section_id, 'csr_pre_direct_deposit', 'Direct Deposit Form (optional)', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_section_id, 'csr_pre_uniform', 'Uniform Size', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_section_id, 'csr_pre_benefits', 'Benefits (if applicable)', 'checkbox', (v_item_seq := v_item_seq + 1));

-- ── CSR Day 1 ──
INSERT INTO training_template_sections (id, template_version_id, section_key, title, section_type, sequence_order, day_number, time_block_start, time_block_end)
VALUES (gen_random_uuid(), v_csr_version_id, 'csr_day_1', 'Day 1 - Orientation / All Team Members', 'day', 1, 1, '09:00', '17:00')
RETURNING id INTO v_section_id;

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_csr_version_id, v_section_id, 'csr_day1_welcome', 'Welcome to K9 Resorts', 'module', 1)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_csr_version_id, v_child_section_id, 'csr_d1_welcome_1', 'Meet and greet team', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d1_welcome_2', 'Facility tour', 'checkbox', (v_item_seq := v_item_seq + 1));

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_csr_version_id, v_section_id, 'csr_day1_hr', 'Human Resources Related', 'module', 2)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_csr_version_id, v_child_section_id, 'csr_d1_hr_1', 'Employee handbook review and signoff', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d1_hr_2', 'Review scheduling/setup with scheduling software', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d1_hr_3', 'Provide time clock credentials', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d1_hr_4', 'Provide scripts and daily lists for position-specific training', 'checkbox', (v_item_seq := v_item_seq + 1));

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_csr_version_id, v_section_id, 'csr_day1_resort_basics', 'Resort Basics', 'module', 3)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_csr_version_id, v_child_section_id, 'csr_d1_rb_1', 'Intro', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d1_rb_2', 'Dog handling', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d1_rb_3', 'Safety', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d1_rb_4', 'Services and accommodations', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d1_rb_5', 'Universal procedures', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d1_rb_6', 'K9 Resorts policies', 'checkbox', (v_item_seq := v_item_seq + 1));

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_csr_version_id, v_section_id, 'csr_day1_behavior_videos', 'Dog Behavior Videos', 'module', 4)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_csr_version_id, v_child_section_id, 'csr_d1_bv_1', 'How not to get bitten', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d1_bv_2', 'Dog communication', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d1_bv_3', 'Calming signals', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d1_bv_4', 'Managing a pack', 'checkbox', (v_item_seq := v_item_seq + 1));

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_csr_version_id, v_section_id, 'csr_day1_daycare_evaluations', 'Performing Daycare Evaluations', 'module', 5)
RETURNING id INTO v_child_section_id;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_csr_version_id, v_child_section_id, 'csr_d1_de_1', 'Performing daycare evaluations overview', 'checkbox', 1);

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_csr_version_id, v_section_id, 'csr_day1_red_binder', 'Red Binder', 'module', 6)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_csr_version_id, v_child_section_id, 'csr_d1_red_1', 'Emergency protocol', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d1_red_2', 'First Aid response', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d1_red_3', 'Heat stroke, bloat, seizures', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d1_red_4', 'Canine cough', 'checkbox', (v_item_seq := v_item_seq + 1));

-- ── CSR Day 2 ──
INSERT INTO training_template_sections (id, template_version_id, section_key, title, section_type, sequence_order, day_number, time_block_start, time_block_end)
VALUES (gen_random_uuid(), v_csr_version_id, 'csr_day_2', 'Day 2 - CSR Role Training', 'day', 2, 2, '09:00', '17:00')
RETURNING id INTO v_section_id;

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_csr_version_id, v_section_id, 'csr_day2_customer_service_1', 'Customer Service', 'module', 1)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_csr_version_id, v_child_section_id, 'csr_d2_cs1_1', 'Important policies', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_cs1_2', 'Monitoring and reporting', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_cs1_3', 'Customer emails and updates', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_cs1_4', 'Scenarios', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_cs1_5', 'Vaccinations', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_cs1_6', 'First-time customer calls', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_cs1_7', 'Rooms - rate, size and capacity', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_cs1_8', 'Existing customer calls', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_cs1_9', 'Pricing policy', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_cs1_10', 'Complaint about bath quality', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_cs1_11', 'Phone etiquette and scripts', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_cs1_12', 'Why are there no public cameras?', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_cs1_13', 'Are there people here overnight?', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_cs1_14', 'Luxury Suite is booked for the date requested', 'checkbox', (v_item_seq := v_item_seq + 1));

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_csr_version_id, v_section_id, 'csr_day2_customer_service_2', 'Customer Service Role Play', 'module', 2)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_csr_version_id, v_child_section_id, 'csr_d2_cs2_1', 'Why can I not bring my blanket', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_cs2_2', 'Handling complaints and irate customers', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_cs2_3', 'Role-play scenarios', 'checkbox', (v_item_seq := v_item_seq + 1));

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_csr_version_id, v_section_id, 'csr_day2_tours', 'Tours', 'module', 3)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_csr_version_id, v_child_section_id, 'csr_d2_tour_1', 'Information sheets', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_tour_2', 'Personalization', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_tour_3', 'Tour path', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_tour_4', 'Key points', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_tour_5', 'Code word', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_tour_6', 'Closing', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_tour_7', 'Sales', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_tour_8', 'Follow-up', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_tour_9', 'Trainer performs tour', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_tour_10', 'Each trainee performs a tour', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_tour_11', 'Group review', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_tour_12', 'Second set of group tours', 'checkbox', (v_item_seq := v_item_seq + 1));

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_csr_version_id, v_section_id, 'csr_day2_playtimes', 'Playtimes', 'module', 4)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_csr_version_id, v_child_section_id, 'csr_d2_play_1', 'Do''s and don''ts of playtimes', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_play_2', 'Monitoring, documenting and reporting', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_play_3', 'Trainer performs playtime', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d2_play_4', 'Each trainee performs a playtime', 'checkbox', (v_item_seq := v_item_seq + 1));

-- ── CSR Day 3 ──
INSERT INTO training_template_sections (id, template_version_id, section_key, title, section_type, sequence_order, day_number, time_block_start, time_block_end)
VALUES (gen_random_uuid(), v_csr_version_id, 'csr_day_3', 'Day 3', 'day', 3, 3, '09:00', '17:00')
RETURNING id INTO v_section_id;

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_csr_version_id, v_section_id, 'csr_day3_pos_1', 'Point of Sale System', 'module', 1)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_csr_version_id, v_child_section_id, 'csr_d3_pos1_1', 'Set up new customer account', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d3_pos1_2', 'Review customer and pet accounts', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d3_pos1_3', 'Check availability', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d3_pos1_4', 'Create reservation', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d3_pos1_5', 'Invoices', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d3_pos1_6', 'Run deposit', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d3_pos1_7', 'Run balance', 'checkbox', (v_item_seq := v_item_seq + 1));

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_csr_version_id, v_section_id, 'csr_day3_pos_2', 'Point of Sale System Advanced', 'module', 2)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_csr_version_id, v_child_section_id, 'csr_d3_pos2_1', 'Assign daycare booklet', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d3_pos2_2', 'Prepare documents for the next day', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d3_pos2_3', 'Add bath to departure services', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d3_pos2_4', 'Update vaccines', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d3_pos2_5', 'Change checkout to afternoon pickup', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d3_pos2_6', 'Edit boarding stay', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d3_pos2_7', 'Boarding cancellation', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d3_pos2_8', 'Issue refund and credit accounts', 'checkbox', (v_item_seq := v_item_seq + 1));

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_csr_version_id, v_section_id, 'csr_day3_daycare_eval', 'Daycare Evaluations', 'module', 3)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_csr_version_id, v_child_section_id, 'csr_d3_de_1', 'Manage daycare environment', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d3_de_2', 'Positive and negative behavior / red-yellow-green lights', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d3_de_3', 'Internal reporting throughout the day', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d3_de_4', 'Internal and customer reporting of results', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d3_de_5', 'Perform daycare evaluation live', 'checkbox', (v_item_seq := v_item_seq + 1));

INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_csr_version_id, v_section_id, 'csr_day3_food_medication', 'Food and Medication', 'module', 4)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_csr_version_id, v_child_section_id, 'csr_d3_fm_1', 'Read run card and feeding instructions', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d3_fm_2', 'Food reporting and feeding stages', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d3_fm_3', 'Food aggression and separation', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d3_fm_4', 'Administer pills / pill pockets', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d3_fm_5', 'Administer eye and ear medication', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d3_fm_6', 'Review feeding cart', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d3_fm_7', 'Perform evening feedings with trainer', 'checkbox', (v_item_seq := v_item_seq + 1));

-- ── CSR Day 4 ──
INSERT INTO training_template_sections (id, template_version_id, section_key, title, section_type, sequence_order, day_number, time_block_start, time_block_end)
VALUES (gen_random_uuid(), v_csr_version_id, 'csr_day_4', 'Day 4 - Shadow Shift', 'day', 4, 4, '06:00', '14:00')
RETURNING id INTO v_section_id;
INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_csr_version_id, v_section_id, 'csr_day4_shadow', 'Shadow Position (CSR) and Perform Tasks', 'module', 1)
RETURNING id INTO v_child_section_id;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_csr_version_id, v_child_section_id, 'csr_d4_shadow_1', 'Follow daily checklist items', 'checkbox', 1);

-- ── CSR Day 5 ──
INSERT INTO training_template_sections (id, template_version_id, section_key, title, section_type, sequence_order, day_number, time_block_start, time_block_end)
VALUES (gen_random_uuid(), v_csr_version_id, 'csr_day_5', 'Day 5 - Shadow Shift', 'day', 5, 5, '14:00', '19:00')
RETURNING id INTO v_section_id;
INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_csr_version_id, v_section_id, 'csr_day5_shadow', 'Shadow Position (CSR) and Perform Tasks', 'module', 1)
RETURNING id INTO v_child_section_id;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_csr_version_id, v_child_section_id, 'csr_d5_shadow_1', 'Follow daily checklist items', 'checkbox', 1);

-- ── CSR Day 6 - Test Day ──
INSERT INTO training_template_sections (id, template_version_id, section_key, title, section_type, sequence_order, day_number, time_block_start, time_block_end, time_block_note)
VALUES (gen_random_uuid(), v_csr_version_id, 'csr_day_6', 'Day 6 - Test Day', 'day', 6, 6, '21:00', '13:00', 'Keep original packet wording until manually verified.')
RETURNING id INTO v_section_id;
INSERT INTO training_template_sections (id, template_version_id, parent_section_id, section_key, title, section_type, sequence_order)
VALUES (gen_random_uuid(), v_csr_version_id, v_section_id, 'csr_day6_required_exams', 'Required Exams', 'module', 1)
RETURNING id INTO v_child_section_id;
v_item_seq := 0;
INSERT INTO training_template_items (template_version_id, template_section_id, item_key, label, item_type, sequence_order) VALUES
  (v_csr_version_id, v_child_section_id, 'csr_d6_exam_1', 'Customer Service - written exam', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d6_exam_2', 'Food and Medication - written exam', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d6_exam_3', 'Daycare Eval - written and live exam', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d6_exam_4', 'Tours - live exam', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d6_exam_5', 'Point of Sale System - live exam', 'checkbox', (v_item_seq := v_item_seq + 1)),
  (v_csr_version_id, v_child_section_id, 'csr_d6_exam_6', 'Playtime certification or re-test if needed', 'checkbox', (v_item_seq := v_item_seq + 1));

END $$;

-- Seed the remaining distinct Cherry Hill packet families as editable templates
-- and normalize the packet source catalog with page-level family rows.

CREATE OR REPLACE FUNCTION public.training_seed_ensure_template(
  p_slug text,
  p_name text,
  p_template_class public.training_template_class,
  p_role_scopes text[],
  p_source_seed_key text,
  p_source_packet text,
  p_changelog text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (out_template_id uuid, out_version_id uuid)
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.training_templates (
    slug,
    name,
    template_class,
    role_scopes,
    is_active
  )
  VALUES (
    p_slug,
    p_name,
    p_template_class,
    p_role_scopes,
    true
  )
  ON CONFLICT (slug) DO UPDATE
  SET
    name = EXCLUDED.name,
    template_class = EXCLUDED.template_class,
    role_scopes = EXCLUDED.role_scopes,
    is_active = true
  RETURNING id
  INTO out_template_id;

  INSERT INTO public.training_template_versions (
    template_id,
    version_no,
    status,
    is_current,
    source_seed_key,
    source_packet,
    changelog,
    metadata,
    published_at
  )
  VALUES (
    out_template_id,
    1,
    'published',
    true,
    p_source_seed_key,
    p_source_packet,
    p_changelog,
    COALESCE(p_metadata, '{}'::jsonb),
    now()
  )
  ON CONFLICT (template_id, version_no) DO UPDATE
  SET
    status = 'published',
    is_current = true,
    source_seed_key = EXCLUDED.source_seed_key,
    source_packet = EXCLUDED.source_packet,
    changelog = EXCLUDED.changelog,
    metadata = EXCLUDED.metadata,
    published_at = COALESCE(public.training_template_versions.published_at, now())
  RETURNING id
  INTO out_version_id;

  UPDATE public.training_template_versions
  SET is_current = (id = out_version_id)
  WHERE public.training_template_versions.template_id = out_template_id;

  DELETE FROM public.training_template_dependencies
  WHERE template_version_id = out_version_id;

  DELETE FROM public.training_template_items
  WHERE template_version_id = out_version_id;

  DELETE FROM public.training_template_sections
  WHERE template_version_id = out_version_id;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.training_seed_add_section(
  p_version_id uuid,
  p_parent_section_id uuid,
  p_section_key text,
  p_title text,
  p_section_type public.training_section_type,
  p_sequence integer,
  p_completion_mode public.training_completion_mode,
  p_instructions text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_section_id uuid;
BEGIN
  INSERT INTO public.training_template_sections (
    template_version_id,
    parent_section_id,
    section_key,
    title,
    section_type,
    sequence_order,
    completion_mode,
    instructions
  )
  VALUES (
    p_version_id,
    p_parent_section_id,
    p_section_key,
    p_title,
    p_section_type,
    p_sequence,
    p_completion_mode,
    p_instructions
  )
  RETURNING id
  INTO v_section_id;

  RETURN v_section_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.training_seed_add_item(
  p_version_id uuid,
  p_section_id uuid,
  p_item_key text,
  p_label text,
  p_description text,
  p_item_type public.training_item_type,
  p_sequence integer,
  p_required boolean DEFAULT true,
  p_completion_mode public.training_completion_mode DEFAULT 'complete_only',
  p_policy_reference text DEFAULT NULL,
  p_safety_sensitive boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.training_template_items (
    template_version_id,
    template_section_id,
    item_key,
    label,
    description,
    item_type,
    sequence_order,
    required,
    completion_mode,
    policy_reference,
    safety_sensitive
  )
  VALUES (
    p_version_id,
    p_section_id,
    p_item_key,
    p_label,
    p_description,
    p_item_type,
    p_sequence,
    p_required,
    p_completion_mode,
    p_policy_reference,
    p_safety_sensitive
  );
END;
$$;

DO $$
DECLARE
  v_template_id uuid;
  v_version_id uuid;
  v_section_id uuid;
BEGIN
  -- The earlier generic placeholders are superseded by named packet families.
  UPDATE public.training_templates
  SET is_active = false
  WHERE slug IN ('written_certification', 'live_certification');

  -- Supervisor Certification Checklist
  SELECT out_template_id, out_version_id
  INTO v_template_id, v_version_id
  FROM public.training_seed_ensure_template(
    'supervisor_certification_checklist',
    'Supervisor Certification Checklist',
    'master_dependency_checklist',
    ARRAY['Supervisor', 'Assistant Manager', 'General Manager'],
    'supervisor_certification_checklist',
    'K9 CH Certifications.pdf',
    'Seeded from Cherry Hill packet pages 1-2 with dependency-style supervisor readiness requirements.',
    jsonb_build_object(
      'source_family', 'supervisor_certification_checklist',
      'page_range', '1-2',
      'qa_flags', jsonb_build_array('ocr-assisted family mapping', 'manual QA recommended')
    )
  );

  v_section_id := public.training_seed_add_section(v_version_id, NULL, 'supervisor_prerequisites', 'Prerequisites & Required Documents', 'dependency_group', 10, 'dependency_rollup', 'Verify the employee has completed the required learning portal and supporting document requirements before supervisor certification is approved.');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'supervisor_intro_canines', 'Introduction to Canines learning portal completed', 'Confirm the introductory Canines / learning portal coursework is complete.', 'status_gate', 10, true, 'dependency_rollup');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'supervisor_pet_hero', 'Pet Hero First Aid & CPR certificate attached', 'An active Pet Hero First Aid & CPR certificate should be linked or documented before supervisor sign-off.', 'attachment', 20, true, 'dependency_rollup');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'supervisor_hr_docs', 'HR document packet reviewed', 'Verify the supervisor packet, handbook, and onboarding paperwork were completed and reviewed.', 'checkbox', 30, true, 'dependency_rollup');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'supervisor_role_shadow', 'Leadership shadowing completed', 'Confirm the employee has shadowed leadership responsibilities and can run shift basics.', 'checkbox', 40, true, 'dependency_rollup');

  v_section_id := public.training_seed_add_section(v_version_id, NULL, 'supervisor_csr_completion', 'CSR Foundation Requirements', 'dependency_group', 20, 'dependency_rollup', 'Supervisor candidates must first complete the CSR learning path and the guest-facing certifications.');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'supervisor_csr_plan', 'CSR training plan completed', 'Confirm the CSR onboarding plan was completed in full.', 'status_gate', 10, true, 'dependency_rollup');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'supervisor_customer_service_exam', 'Customer Service Certification passed', 'Customer communication, policy, and complaint-recovery certification must be complete.', 'status_gate', 20, true, 'dependency_rollup');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'supervisor_tour_cert', 'Tour Certification Test passed', 'The employee should be able to run a full tour and close appropriately.', 'status_gate', 30, true, 'dependency_rollup');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'supervisor_gingr_guide', 'Gingr Training Guide competency verified', 'Confirm reservation, POS, and portal workflows are understood well enough to support the team.', 'status_gate', 40, true, 'dependency_rollup');

  v_section_id := public.training_seed_add_section(v_version_id, NULL, 'supervisor_pct_completion', 'PCT Foundation Requirements', 'dependency_group', 30, 'dependency_rollup', 'Supervisor candidates must also understand the back-of-house training and certification workflows.');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'supervisor_pct_plan', 'PCT training plan completed', 'Confirm the PCT onboarding training plan is complete.', 'status_gate', 10, true, 'dependency_rollup');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'supervisor_bathing_cert', 'Bathing Certification passed', 'The employee should be able to verify bathing standards and observe safe execution.', 'status_gate', 20, true, 'dependency_rollup');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'supervisor_daycare_cert', 'Daycare Certification passed', 'The employee should understand daycare room control, safety, and policy enforcement.', 'status_gate', 30, true, 'dependency_rollup');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'supervisor_sanitation_cert', 'Sanitation Certification passed', 'The employee must understand cleaning vs sanitizing vs disinfecting and live sanitation technique.', 'status_gate', 40, true, 'dependency_rollup');

  v_section_id := public.training_seed_add_section(v_version_id, NULL, 'supervisor_final_readiness', 'Supervisor Readiness & External Coursework', 'checklist', 40, 'pass_fail', 'Complete the final written exam and verify any external certifications or franchise coursework that the packet requires.');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'supervisor_written_exam', 'Supervisor written exam passed', 'Document the supervisor-specific written assessment outcome.', 'question_single_choice', 10, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'supervisor_ppbc', 'PPBC / outside certification progress documented', 'Capture external certifications such as PPBC levels or related franchise coursework if required.', 'attachment', 20, false, 'complete_only');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'supervisor_heroes_for_health', 'Heroes for Health modules documented', 'Record the completion status of any required health or safety modules.', 'attachment', 30, false, 'complete_only');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'supervisor_ready_for_signoff', 'Supervisor certification approved for live operations', 'Final approval to operate in the supervisor role after all dependencies and external coursework are satisfied.', 'status_gate', 40, true, 'pass_fail');

  -- Gingr Training Guide
  SELECT out_template_id, out_version_id
  INTO v_template_id, v_version_id
  FROM public.training_seed_ensure_template(
    'gingr_training_guide',
    'Gingr Training Guide',
    'competency_guide',
    ARRAY['CSR', 'Supervisor', 'Assistant Manager', 'General Manager'],
    'gingr_training_guide',
    'K9 CH Certifications.pdf',
    'Seeded from Cherry Hill packet pages 12-14 as a structured Gingr competency guide.',
    jsonb_build_object(
      'source_family', 'gingr_training_guide',
      'page_range', '12-14',
      'qa_flags', jsonb_build_array('ocr-assisted family mapping')
    )
  );

  v_section_id := public.training_seed_add_section(v_version_id, NULL, 'gingr_login_navigation', 'Login, Dashboard, and Navigation', 'module', 10, 'complete_only', 'Cover the basic entry points, dashboard areas, and navigation flows the packet highlights.');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'gingr_login', 'Log into Gingr and reach the dashboard', 'Verify the trainee can sign in, find the dashboard, and understand the reservation request area.', 'task', 10, true, 'complete_only');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'gingr_vaccine_flags', 'Locate expired vaccine indicators and guest alerts', 'Use the dashboard and reservations views to identify expired vaccines and important icons.', 'task', 20, true, 'complete_only');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'gingr_requests', 'Review reservation and portal requests', 'Open reservation requests and explain how portal submissions are reviewed and approved.', 'task', 30, true, 'complete_only');

  v_section_id := public.training_seed_add_section(v_version_id, NULL, 'gingr_owner_pet_profiles', 'Owners and Pet Profiles', 'module', 20, 'complete_only', 'Create, update, and review owner/pet data accurately.');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'gingr_owner_create', 'Create or search owner profiles', 'Find an owner, confirm identity, or create a new owner account when needed.', 'task', 10, true, 'complete_only');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'gingr_pet_update', 'Update pet profile details, vaccines, notes, and icons', 'Maintain accurate pet records, markings, vaccinations, notes, and any operational icons.', 'task', 20, true, 'complete_only');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'gingr_agreements', 'Send agreements or forms to device', 'Demonstrate how to push forms or agreements to a guest device when required.', 'task', 30, true, 'complete_only');

  v_section_id := public.training_seed_add_section(v_version_id, NULL, 'gingr_pos_cart', 'Shopping Cart and Point of Sale', 'module', 30, 'complete_only', 'The packet covers invoice closeout, refunds, store credit, packages, coupons, and discounts.');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'gingr_invoice_close', 'Close invoices and explain balances', 'Take payment, close the invoice, and explain open balances or deposits correctly.', 'task', 10, true, 'complete_only');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'gingr_refund_credit', 'Issue refunds, store credit, or gift certificates correctly', 'Use the correct flow for refunds, store credit, gift certificates, and account adjustments.', 'task', 20, true, 'complete_only');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'gingr_discounts', 'Apply packages, coupons, and approved discounts', 'Handle daycare packages, coupon codes, and approved special discounts correctly.', 'task', 30, true, 'complete_only');

  v_section_id := public.training_seed_add_section(v_version_id, NULL, 'gingr_reservations_reporting', 'Reservations, Calendar, Reporting, and Portal', 'module', 40, 'complete_only', 'Finish with end-to-end reservation work, facility calendar use, and core reporting.');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'gingr_boarding_reservation', 'Create, edit, and cancel reservations', 'Manage boarding, daycare, deposits, services, and cancellation scenarios in the reservation workflow.', 'task', 10, true, 'complete_only');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'gingr_calendar_filters', 'Use the lodging and facility calendars', 'Filter, review, and explain the calendar views used in resort operations.', 'task', 20, true, 'complete_only');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'gingr_reports', 'Run revenue, feeding, and medication reports', 'Generate the core reports covered in the packet and explain when each is used.', 'task', 30, true, 'complete_only');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'gingr_customer_portal', 'Work portal requests and explain the customer portal flow', 'Handle boarding/daycare requests and explain the guest-facing portal flow accurately.', 'task', 40, true, 'complete_only');

  -- Customer Service Certification
  SELECT out_template_id, out_version_id
  INTO v_template_id, v_version_id
  FROM public.training_seed_ensure_template(
    'customer_service_certification',
    'Customer Service Certification',
    'written_certification',
    ARRAY['CSR', 'Assistant Manager', 'General Manager'],
    'customer_service_certification',
    'K9 CH Certifications.pdf',
    'Seeded from Cherry Hill packet pages 18-23 as a customer service written certification.',
    jsonb_build_object(
      'source_family', 'customer_service_certification',
      'page_range', '18-23',
      'qa_flags', jsonb_build_array('ocr-assisted family mapping', 'some scenario text remains partially manual')
    )
  );

  v_section_id := public.training_seed_add_section(v_version_id, NULL, 'customer_service_foundations', 'Service First Foundations', 'written_exam', 10, 'pass_fail', 'The packet starts with culture, communication, and guest-service fundamentals.');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'customer_service_service_first', 'Explain the five principles of Service First', 'Demonstrate understanding of the packet’s core Service First framework.', 'scenario_prompt', 10, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'customer_service_beat_greet', 'Define “Beat the Greet” and customer amazement', 'Explain the resort’s expected guest greeting standard and how it shows up operationally.', 'scenario_prompt', 20, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'customer_service_positive_communication', 'Use open questions and positive communication', 'Show how client and dog names, open questions, and positive phrasing improve the experience.', 'scenario_prompt', 30, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'customer_service_guest_memory', 'Explain why positive recovery and thank-you follow-up matter', 'Cover the packet’s emphasis on guest memory, thank-you notes, and fan reinforcement.', 'scenario_prompt', 40, true, 'pass_fail');

  v_section_id := public.training_seed_add_section(v_version_id, NULL, 'customer_service_policy_knowledge', 'Policy and Reservation Knowledge', 'written_exam', 20, 'pass_fail', 'Confirm the trainee can explain the boarding, daycare, and reservation policies the packet calls out.');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'customer_service_boarding_disclosures', 'State the essential boarding disclosures', 'Explain the core disclosures a CSR must make during the reservation process.', 'scenario_prompt', 10, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'customer_service_pickup_hours', 'Explain daycare-only hours vs boarding pickup rules', 'Clarify why boarding guests cannot use daycare-only pickup and drop-off patterns.', 'scenario_prompt', 20, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'customer_service_not_know_answer', 'Handle a question when you do not know the answer', 'Show the expected response when a CSR does not yet know the right answer.', 'scenario_prompt', 30, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'customer_service_value_add', 'Identify value-add and upsell opportunities appropriately', 'Explain examples of value-added service without sounding pushy or careless.', 'scenario_prompt', 40, true, 'pass_fail');

  v_section_id := public.training_seed_add_section(v_version_id, NULL, 'customer_service_recovery', 'Complaint Recovery Scenarios', 'written_exam', 30, 'pass_fail', 'The packet closes with real-world scenarios around complaints, symptoms after boarding, and guest frustration.');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'customer_service_complaint_phone', 'Respond to a complaint in person or on the phone', 'Walk through the first response when a guest is upset.', 'scenario_prompt', 10, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'customer_service_rainy_dropoff', 'Handle a rainy drop-off or other stressful arrival', 'Explain how to keep the interaction calm and guest-centered during a rough arrival.', 'scenario_prompt', 20, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'customer_service_loose_stool', 'Respond when a guest reports loose stool after boarding', 'Use policy language and empathy while avoiding overpromising.', 'scenario_prompt', 30, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'customer_service_cough_after_boarding', 'Respond when a guest reports a cough after boarding', 'Show the correct escalation and explanation pattern from the packet.', 'scenario_prompt', 40, true, 'pass_fail');

  -- Daycare Certification
  SELECT out_template_id, out_version_id
  INTO v_template_id, v_version_id
  FROM public.training_seed_ensure_template(
    'daycare_certification',
    'Daycare Certification',
    'live_evaluation',
    ARRAY['PCT', 'Supervisor'],
    'daycare_certification',
    'K9 CH Certifications.pdf',
    'Seeded from Cherry Hill packet pages 24-27 as a written + live daycare certification.',
    jsonb_build_object(
      'source_family', 'daycare_certification',
      'page_range', '24-27',
      'qa_flags', jsonb_build_array('ocr-assisted family mapping', 'manual QA recommended for a few written prompts')
    )
  );

  v_section_id := public.training_seed_add_section(v_version_id, NULL, 'daycare_written_rules', 'Written Safety and Room Rules', 'written_exam', 10, 'pass_fail', 'The written section focuses on room control, policy compliance, emergency communication, and monitoring standards.');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'daycare_focus_room_scan', 'Explain why you cannot focus on only one dog in daycare', 'The answer should emphasize constant room scanning and balanced awareness.', 'scenario_prompt', 10, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'daycare_call_for_help', 'Explain how to call for help when you cannot speak safely', 'Use the backup communication process described in the packet.', 'scenario_prompt', 20, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'daycare_timeout_reasons', 'Identify behaviors that require a timeout', 'Explain why and when timeout is appropriate in group play.', 'scenario_prompt', 30, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'daycare_fight_breakup', 'Describe how to break up a fight without getting hurt', 'Explain the escalation and physical-safety expectations from the packet.', 'scenario_prompt', 40, true, 'pass_fail');

  v_section_id := public.training_seed_add_section(v_version_id, NULL, 'daycare_written_operations', 'Operational Policy Knowledge', 'written_exam', 20, 'pass_fail', 'Confirm cleanup, garage door, duplicate dog names, and environment restrictions are understood.');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'daycare_food_phone_policy', 'Explain food, drink, and phone restrictions inside daycare', 'The trainee should know what cannot be carried or used inside the room.', 'scenario_prompt', 10, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'daycare_cleaning_frequency', 'Explain mopping and cleanup frequency expectations', 'Cover when the room must be cleaned and how often monitoring staff should react to messes.', 'scenario_prompt', 20, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'daycare_duplicate_name', 'Handle duplicate dog names safely', 'Explain how to identify the correct dog before moving them when names overlap.', 'scenario_prompt', 30, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'daycare_gate_weather', 'Explain garage-door safety and outdoor temperature limits', 'Cover gate discipline and temperature-based outdoor limits from the packet.', 'scenario_prompt', 40, true, 'pass_fail');

  v_section_id := public.training_seed_add_section(v_version_id, NULL, 'daycare_live_room_control', 'Live Room Control Evaluation', 'live_eval', 30, 'observe_participate_demonstrate', 'The live portion focuses on confident entry, room control, policy enforcement, and continuous scanning.');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'daycare_enter_confident', 'Enter the room confidently and set boundaries', 'Do not let the dogs overwhelm you at the gate or on entry.', 'observation_check', 10, true, 'observe_participate_demonstrate', NULL, true);
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'daycare_room_scan_live', 'Continuously scan and redirect behavior', 'Show active monitoring rather than clustering or zoning out.', 'observation_check', 20, true, 'observe_participate_demonstrate', NULL, true);
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'daycare_water_cleanliness', 'Maintain water and cleanliness standards', 'Keep bowls maintained, clean up the room, and preserve order during live operations.', 'observation_check', 30, true, 'observe_participate_demonstrate', NULL, true);
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'daycare_issue_reporting', 'Escalate and document issues appropriately', 'Report problem dogs or safety concerns to the front desk or leadership correctly.', 'observation_check', 40, true, 'observe_participate_demonstrate', NULL, true);

  -- Daycare Evaluation Certification
  SELECT out_template_id, out_version_id
  INTO v_template_id, v_version_id
  FROM public.training_seed_ensure_template(
    'daycare_evaluation_certification',
    'Daycare Evaluation Certification',
    'live_evaluation',
    ARRAY['PCT', 'CSR', 'Supervisor'],
    'daycare_evaluation_certification',
    'K9 CH Certifications.pdf',
    'Seeded from Cherry Hill packet pages 28-31 as the daycare evaluation certification.',
    jsonb_build_object(
      'source_family', 'daycare_evaluation_certification',
      'page_range', '28-31',
      'qa_flags', jsonb_build_array('ocr-assisted family mapping')
    )
  );

  v_section_id := public.training_seed_add_section(v_version_id, NULL, 'daycare_eval_written_standards', 'Written Evaluation Standards', 'written_exam', 10, 'pass_fail', 'The written portion covers timing, staffing, pass/fail criteria, yellow-light behaviors, and guest communication.');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'daycare_eval_staffing', 'Explain required staffing and timing for a daycare evaluation', 'State how long an evaluation typically takes and how many employees must be present.', 'scenario_prompt', 10, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'daycare_eval_fail_indicators', 'Identify fail indicators', 'Explain the behaviors that should cause the dog to fail the evaluation immediately.', 'scenario_prompt', 20, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'daycare_eval_yellow_lights', 'Identify yellow-light behaviors', 'Explain the warning signs that require caution and extra judgment during the evaluation.', 'scenario_prompt', 30, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'daycare_eval_pass_indicators', 'Identify pass indicators and customer debrief points', 'Explain the body language and guest-facing summary expected when the dog passes.', 'scenario_prompt', 40, true, 'pass_fail');

  v_section_id := public.training_seed_add_section(v_version_id, NULL, 'daycare_eval_guest_communication', 'Client Communication and Alternatives', 'written_exam', 20, 'pass_fail', 'The packet requires a clear, accurate guest explanation whether the dog passes or fails.');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'daycare_eval_failure_offer', 'Explain what to offer if the dog does not pass', 'Communicate the approved boarding/playtime alternative instead of group play.', 'scenario_prompt', 10, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'daycare_eval_fight_response', 'Explain how to handle a fight during an evaluation', 'Use the correct escalation language if an evaluation turns unsafe.', 'scenario_prompt', 20, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'daycare_eval_steps', 'Walk through the full evaluation sequence', 'Describe the step-by-step evaluation flow from clear hallways through the guest call.', 'scenario_prompt', 30, true, 'pass_fail');

  v_section_id := public.training_seed_add_section(v_version_id, NULL, 'daycare_eval_live_portion', 'Live Evaluation Rubric', 'live_eval', 30, 'observe_participate_demonstrate', 'The live portion focuses on safe introductions, accurate interpretation, and proper final communication.');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'daycare_eval_clear_room', 'Clear the room and identify the new dog before entry', 'Remove daycare dogs, identify the new dog to staff, and set the room before starting.', 'observation_check', 10, true, 'observe_participate_demonstrate', NULL, true);
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'daycare_eval_one_dog_intro', 'Introduce one dog at a time and allow enough time between introductions', 'Use controlled introductions instead of flooding the room.', 'observation_check', 20, true, 'observe_participate_demonstrate', NULL, true);
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'daycare_eval_interpretation', 'Interpret interactions correctly and choose pass/fail appropriately', 'The evaluator should distinguish true risk from normal adjustment behavior.', 'observation_check', 30, true, 'observe_participate_demonstrate', NULL, true);
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'daycare_eval_front_desk_call', 'Communicate the result to the front desk and guest', 'The evaluator must close the loop with front desk/EOD and call the customer if needed.', 'observation_check', 40, true, 'observe_participate_demonstrate', NULL, true);

  -- Feeding & Medication Certification
  SELECT out_template_id, out_version_id
  INTO v_template_id, v_version_id
  FROM public.training_seed_ensure_template(
    'feeding_medication_certification',
    'Feeding & Medication Certification',
    'written_certification',
    ARRAY['PCT', 'Supervisor'],
    'feeding_medication_certification',
    'K9 CH Certifications.pdf',
    'Seeded from Cherry Hill packet pages 32-35 as the feeding and medication certification.',
    jsonb_build_object(
      'source_family', 'feeding_medication_certification',
      'page_range', '32-35',
      'qa_flags', jsonb_build_array('ocr-assisted family mapping', 'one medication prompt remains slightly fuzzy')
    )
  );

  v_section_id := public.training_seed_add_section(v_version_id, NULL, 'feeding_basics', 'House Food and Meal Workflow', 'written_exam', 10, 'pass_fail', 'Start with house food standards, feeding stages, and meal safety.');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'feeding_house_food', 'Explain the house food standard and why the resort uses it', 'Cover the default house food and the guest-facing explanation for sudden food changes.', 'scenario_prompt', 10, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'feeding_stages', 'Explain the feeding stages and missed-meal escalation', 'Cover meal timing, the third missed meal rule, and when to escalate concerns.', 'scenario_prompt', 20, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'feeding_aggression', 'Explain how to handle food aggression safely', 'Separate dogs appropriately and keep staff safe during feeding.', 'scenario_prompt', 30, true, 'pass_fail');

  v_section_id := public.training_seed_add_section(v_version_id, NULL, 'medication_administration', 'Medication Administration Standards', 'written_exam', 20, 'pass_fail', 'The medication section focuses on identification, delivery accuracy, and proper technique.');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'medication_verification', 'Explain how to verify the correct dog and medication every time', 'Use run cards, labels, and packaging details to prevent errors.', 'scenario_prompt', 10, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'medication_ensure_delivery', 'Explain how to ensure the dog actually receives the medication', 'Do not assume ingestion happened without confirming it.', 'scenario_prompt', 20, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'medication_ear_eye', 'Describe correct ear and eye medication technique', 'Explain correct handling for ear meds and eye meds without contaminating the product or hurting the dog.', 'scenario_prompt', 30, true, 'pass_fail');

  v_section_id := public.training_seed_add_section(v_version_id, NULL, 'feeding_labeling_escalation', 'Labeling, Packaging, and Escalation', 'written_exam', 30, 'pass_fail', 'Finish with packaging, mold, unclear instructions, and escalation scenarios.');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'medication_packaging', 'Explain how home food and meds must be packaged and labeled', 'Home items should be clearly labeled and organized before staff accept them.', 'scenario_prompt', 10, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'medication_unclear_run_card', 'Explain what to do when run-card information is unclear', 'Escalate before acting when the feeding or medication instructions do not make sense.', 'scenario_prompt', 20, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'medication_mold', 'Explain what to do when mold or spoiled food is found', 'Follow the resort’s escalation path and do not serve questionable food.', 'scenario_prompt', 30, true, 'pass_fail');

  -- Sanitation Certification
  SELECT out_template_id, out_version_id
  INTO v_template_id, v_version_id
  FROM public.training_seed_ensure_template(
    'sanitation_certification',
    'Sanitation Certification',
    'live_evaluation',
    ARRAY['PCT', 'Supervisor'],
    'sanitation_certification',
    'K9 CH Certifications.pdf',
    'Seeded from Cherry Hill packet pages 36-39 as the sanitation certification.',
    jsonb_build_object(
      'source_family', 'sanitation_certification',
      'page_range', '36-39',
      'qa_flags', jsonb_build_array('ocr-assisted family mapping')
    )
  );

  v_section_id := public.training_seed_add_section(v_version_id, NULL, 'sanitation_written_standards', 'Written Chemical and Contact-Time Standards', 'written_exam', 10, 'pass_fail', 'The written portion covers Rescue, Wysiwash/Foamer usage, contact time, and the difference between cleaning, sanitizing, and disinfecting.');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'sanitation_rescue', 'Explain the primary disinfecting solutions and what Rescue is', 'Describe the resort’s main disinfecting solution and when Rescue is used.', 'scenario_prompt', 10, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'sanitation_contact_time', 'Explain contact time and why it matters', 'Define contact time and explain why staff cannot rush the disinfecting process.', 'scenario_prompt', 20, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'sanitation_lobby_solution', 'Choose the correct solution for lobby and tour areas', 'Identify the correct cleaning/disinfecting approach before the building opens.', 'scenario_prompt', 30, true, 'pass_fail');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'sanitation_tools_jugs', 'Explain how to sanitize shared tools and water jugs', 'Cover shared-tool sanitation and identify what products are not actually disinfectants.', 'scenario_prompt', 40, true, 'pass_fail');

  v_section_id := public.training_seed_add_section(v_version_id, NULL, 'sanitation_live_rooms', 'Live Room Sanitation Evaluation', 'live_eval', 20, 'observe_participate_demonstrate', 'Assess live sanitation technique for accommodations, compartments, and water disposal.');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'sanitation_cage_free', 'Sanitize a cage-free accommodation correctly', 'Remove items, use the correct solution, allow proper contact time, and restore the room to standard.', 'observation_check', 10, true, 'observe_participate_demonstrate', NULL, true);
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'sanitation_compartment', 'Sanitize a compartment correctly', 'Follow the same chemical, contact-time, and finishing standards in a compartment environment.', 'observation_check', 20, true, 'observe_participate_demonstrate', NULL, true);
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'sanitation_drain_disposal', 'Dispose of water and debris in the correct location', 'Dump waste and dirty water where the SOP expects rather than wherever is convenient.', 'observation_check', 30, true, 'observe_participate_demonstrate', NULL, true);

  v_section_id := public.training_seed_add_section(v_version_id, NULL, 'sanitation_live_equipment', 'Drying Cage and Equipment Sanitation', 'live_eval', 30, 'observe_participate_demonstrate', 'The final live portion covers the drying cage and shared equipment.');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'sanitation_drying_cage', 'Sanitize the drying cage correctly', 'Clean the cage, use the correct solution, and confirm contact time.', 'observation_check', 10, true, 'observe_participate_demonstrate', NULL, true);
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'sanitation_hair_motor', 'Remove hair and debris from motor / plug areas safely', 'Clear hair from equipment safely before returning it to service.', 'observation_check', 20, true, 'observe_participate_demonstrate', NULL, true);
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'sanitation_restore_equipment', 'Return the station to ready-to-use condition', 'Restore bowls, bedding, windows, vented areas, and equipment to standard.', 'observation_check', 30, true, 'observe_participate_demonstrate', NULL, true);

  -- Tour Certification Test
  SELECT out_template_id, out_version_id
  INTO v_template_id, v_version_id
  FROM public.training_seed_ensure_template(
    'tour_certification_test',
    'Tour Certification Test',
    'live_evaluation',
    ARRAY['CSR', 'Assistant Manager', 'General Manager'],
    'tour_certification_test',
    'K9 CH Certifications.pdf',
    'Seeded from Cherry Hill packet pages 40-42 as the tour certification test.',
    jsonb_build_object(
      'source_family', 'tour_certification_test',
      'page_range', '40-42',
      'qa_flags', jsonb_build_array('ocr-assisted family mapping')
    )
  );

  v_section_id := public.training_seed_add_section(v_version_id, NULL, 'tour_opening', 'Greeting and Tour Setup', 'live_eval', 10, 'observe_participate_demonstrate', 'The live tour starts with the greeting, contact sheet, radio language, and setting expectations.');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'tour_greeting', 'Greet with a smile and use guest / pet names', 'Open the conversation warmly and personalize the interaction immediately.', 'observation_check', 10, true, 'observe_participate_demonstrate');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'tour_info_sheet', 'Have the guest complete the information sheet and clear the hallway', 'Use the packet’s hallway-clearing phrase and tour setup process.', 'observation_check', 20, true, 'observe_participate_demonstrate');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'tour_determine_need', 'Ask whether the guest needs boarding or daycare and tailor the tour', 'Start the tour from the guest need instead of reciting a generic script.', 'observation_check', 30, true, 'observe_participate_demonstrate');

  v_section_id := public.training_seed_add_section(v_version_id, NULL, 'tour_product_knowledge', 'Tour Path, Pricing, and Objection Handling', 'live_eval', 20, 'observe_participate_demonstrate', 'The middle section tests whether the trainee knows the route, accommodations, marketing points, and objections.');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'tour_route', 'Follow the correct tour path and identify accommodations accurately', 'Show the resort in the correct order and describe each accommodation accurately.', 'observation_check', 10, true, 'observe_participate_demonstrate');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'tour_pricing', 'Explain all-inclusive pricing and key resort differentiators', 'Cover the core marketing points, what is included, and how daycare works.', 'observation_check', 20, true, 'observe_participate_demonstrate');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'tour_objections', 'Answer common objections and policy questions accurately', 'Address cameras, bedding/toys, flu shots, daycare fights, deposits, and vaccination requirements without guessing.', 'observation_check', 30, true, 'observe_participate_demonstrate');

  v_section_id := public.training_seed_add_section(v_version_id, NULL, 'tour_close', 'Closing and Booking Conversion', 'live_eval', 30, 'observe_participate_demonstrate', 'The tour should end with a clear booking close, contact handoff, and thank-you.');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'tour_card_and_price_sheet', 'Provide the price sheet and business card', 'Leave the guest with the expected handoff materials.', 'observation_check', 10, true, 'observe_participate_demonstrate');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'tour_close_booking', 'Invite the guest to book now or schedule a daycare evaluation', 'Close directly instead of ending passively.', 'observation_check', 20, true, 'observe_participate_demonstrate');
  PERFORM public.training_seed_add_item(v_version_id, v_section_id, 'tour_gift_certificate_followup', 'Offer the approved follow-up incentive and thank the guest', 'Use the $50 gift certificate follow-up only where appropriate and end warmly.', 'observation_check', 30, true, 'observe_participate_demonstrate');
END;
$$;

UPDATE public.labor_source_document_catalog
SET
  page_range = '1-42',
  normalized_target = 'training_templates:supervisor_certification_checklist, training_templates:pct_training_plan, training_templates:csr_training_plan, training_templates:gingr_training_guide, training_templates:bathing_certification, training_templates:customer_service_certification, training_templates:daycare_certification, training_templates:daycare_evaluation_certification, training_templates:feeding_medication_certification, training_templates:sanitation_certification, training_templates:tour_certification_test',
  qa_flags = '["scan-based packet","ocr-assisted family mapping","manual QA still recommended"]'::jsonb,
  notes = 'Cherry Hill training packet normalized into discrete editable training and certification families.'
WHERE source_file_name = 'K9 CH Certifications.pdf'
  AND document_family = 'training_packet';

DELETE FROM public.labor_source_document_catalog
WHERE source_file_name = 'K9 CH Certifications.pdf'
  AND document_family IN (
    'supervisor_certification_checklist',
    'gingr_training_guide',
    'customer_service_certification',
    'daycare_certification',
    'daycare_evaluation_certification',
    'feeding_medication_certification',
    'sanitation_certification',
    'tour_certification_test'
  );

UPDATE public.labor_source_document_catalog
SET
  page_range = '2-6',
  extraction_status = 'seeded_ocr_assisted',
  normalized_target = 'training_templates:csr_training_plan',
  qa_flags = '["ocr-assisted family mapping"]'::jsonb,
  notes = 'CSR onboarding training plan from Cherry Hill packet pages 2-6.'
WHERE source_file_name = 'K9 CH Certifications.pdf'
  AND document_family = 'onboarding_training_plan'
  AND role_scope = 'CSR';

UPDATE public.labor_source_document_catalog
SET
  page_range = '7-11',
  extraction_status = 'seeded_ocr_assisted',
  normalized_target = 'training_templates:pct_training_plan',
  qa_flags = '["ocr-assisted family mapping"]'::jsonb,
  notes = 'PCT onboarding training plan from Cherry Hill packet pages 7-11.'
WHERE source_file_name = 'K9 CH Certifications.pdf'
  AND document_family = 'onboarding_training_plan'
  AND role_scope = 'PCT';

UPDATE public.labor_source_document_catalog
SET
  page_range = '15-17',
  extraction_status = 'seeded_ocr_assisted',
  normalized_target = 'training_templates:bathing_certification',
  qa_flags = '["ocr-assisted family mapping","manual QA recommended"]'::jsonb,
  notes = 'Bathing written + live certification family from packet pages 15-17.'
WHERE source_file_name = 'K9 CH Certifications.pdf'
  AND document_family = 'bathing_certification';

INSERT INTO public.labor_source_document_catalog (
  source_file_name,
  source_path,
  page_range,
  document_family,
  document_class,
  role_scope,
  extraction_status,
  normalized_target,
  qa_flags,
  notes
)
VALUES
  (
    'K9 CH Certifications.pdf',
    '/Users/zacknisbet/Downloads/K9 CH Certifications.pdf',
    '1-2',
    'supervisor_certification_checklist',
    'master_dependency_checklist',
    'Supervisor',
    'seeded_ocr_assisted',
    'training_templates:supervisor_certification_checklist',
    '["ocr-assisted family mapping","manual QA recommended"]'::jsonb,
    'Supervisor checklist and prerequisite packet.'
  ),
  (
    'K9 CH Certifications.pdf',
    '/Users/zacknisbet/Downloads/K9 CH Certifications.pdf',
    '12-14',
    'gingr_training_guide',
    'competency_guide',
    'CSR',
    'seeded_ocr_assisted',
    'training_templates:gingr_training_guide',
    '["ocr-assisted family mapping"]'::jsonb,
    'Shared Gingr workflow guide covering owners, pets, POS, reservations, and reports.'
  ),
  (
    'K9 CH Certifications.pdf',
    '/Users/zacknisbet/Downloads/K9 CH Certifications.pdf',
    '18-23',
    'customer_service_certification',
    'written_certification',
    'CSR',
    'seeded_ocr_assisted',
    'training_templates:customer_service_certification',
    '["ocr-assisted family mapping","some scenario wording manually normalized"]'::jsonb,
    'Customer Service Certification written/scenario assessment.'
  ),
  (
    'K9 CH Certifications.pdf',
    '/Users/zacknisbet/Downloads/K9 CH Certifications.pdf',
    '24-27',
    'daycare_certification',
    'live_evaluation',
    'PCT',
    'seeded_ocr_assisted',
    'training_templates:daycare_certification',
    '["ocr-assisted family mapping","manual QA recommended"]'::jsonb,
    'Daycare written + live certification packet.'
  ),
  (
    'K9 CH Certifications.pdf',
    '/Users/zacknisbet/Downloads/K9 CH Certifications.pdf',
    '28-31',
    'daycare_evaluation_certification',
    'live_evaluation',
    'PCT/CSR',
    'seeded_ocr_assisted',
    'training_templates:daycare_evaluation_certification',
    '["ocr-assisted family mapping"]'::jsonb,
    'Daycare evaluation certification with pass/fail criteria and live evaluation rubric.'
  ),
  (
    'K9 CH Certifications.pdf',
    '/Users/zacknisbet/Downloads/K9 CH Certifications.pdf',
    '32-35',
    'feeding_medication_certification',
    'written_certification',
    'PCT',
    'seeded_ocr_assisted',
    'training_templates:feeding_medication_certification',
    '["ocr-assisted family mapping","one medication prompt slightly fuzzy"]'::jsonb,
    'Feeding and medication workflow certification.'
  ),
  (
    'K9 CH Certifications.pdf',
    '/Users/zacknisbet/Downloads/K9 CH Certifications.pdf',
    '36-39',
    'sanitation_certification',
    'live_evaluation',
    'PCT',
    'seeded_ocr_assisted',
    'training_templates:sanitation_certification',
    '["ocr-assisted family mapping"]'::jsonb,
    'Sanitation written + live certification family.'
  ),
  (
    'K9 CH Certifications.pdf',
    '/Users/zacknisbet/Downloads/K9 CH Certifications.pdf',
    '40-42',
    'tour_certification_test',
    'live_evaluation',
    'CSR',
    'seeded_ocr_assisted',
    'training_templates:tour_certification_test',
    '["ocr-assisted family mapping"]'::jsonb,
    'Tour certification live rubric and conversion close.'
  );

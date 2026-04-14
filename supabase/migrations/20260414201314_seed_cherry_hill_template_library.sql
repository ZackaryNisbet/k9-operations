-- Cherry Hill Certification Template Library Seed
-- Expands the Cherry Hill packet catalog from placeholder rows into actual seeded
-- certification families and pragmatic editable template structures.

DO $$
DECLARE
  v_template_id uuid;
  v_version_id uuid;
  v_section_id uuid;
  v_item_seq integer;
BEGIN
  -- Bathing Certification - PCT

  INSERT INTO training_templates (
    id,
    slug,
    name,
    template_class,
    role_scopes,
    is_active
  )
  VALUES (
    gen_random_uuid(),
    'bathing_certification',
    'Bathing Certification - PCT',
    'live_evaluation',
    ARRAY['PCT'],
    true
  )
  ON CONFLICT (slug) DO UPDATE
  SET
    name = EXCLUDED.name,
    template_class = EXCLUDED.template_class,
    role_scopes = EXCLUDED.role_scopes,
    is_active = EXCLUDED.is_active
  RETURNING id
  INTO v_template_id;

  INSERT INTO training_template_versions (
    id,
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
    gen_random_uuid(),
    v_template_id,
    1,
    'published',
    true,
    'bathing_certification',
    'K9 CH Certifications.pdf',
    'Seeded from the Cherry Hill packet map as a pragmatic bathing certification scaffold.',
    jsonb_build_object(
      'seed_version', 'v1',
      'template_key', 'bathing_certification',
      'source_family', 'bathing_certification',
      'qa_flags', jsonb_build_array('scan-based packet', 'manual QA required', 'OCR page map pending')
    ),
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
    published_at = EXCLUDED.published_at
  RETURNING id
  INTO v_version_id;

  UPDATE training_template_versions
  SET is_current = (id = v_version_id)
  WHERE template_id = v_template_id;

  DELETE FROM training_template_dependencies WHERE template_version_id = v_version_id;
  DELETE FROM training_template_items WHERE template_version_id = v_version_id;
  DELETE FROM training_template_sections WHERE template_version_id = v_version_id;

  INSERT INTO training_template_sections (
    id,
    template_version_id,
    section_key,
    title,
    section_type,
    sequence_order,
    completion_mode,
    instructions
  )
  VALUES (
    gen_random_uuid(),
    v_version_id,
    'bathing_setup_and_safety',
    'Setup and Safety',
    'live_eval',
    10,
    'observe_participate_demonstrate',
    'Verify the dog, the service request, and the work area before the bath starts.'
  )
  RETURNING id
  INTO v_section_id;

  v_item_seq := 0;
  INSERT INTO training_template_items (
    template_version_id,
    template_section_id,
    item_key,
    label,
    description,
    item_type,
    sequence_order,
    required,
    safety_sensitive,
    completion_mode
  )
  VALUES
    (
      v_version_id,
      v_section_id,
      'bathing_intake_identity',
      'Verify dog identity and service notes',
      'Confirm the dog, service ticket, and any handling notes before the bath starts.',
      'observation_check',
      (v_item_seq := v_item_seq + 1),
      true,
      true,
      'observe_participate_demonstrate'
    ),
    (
      v_version_id,
      v_section_id,
      'bathing_intake_station',
      'Set up the bathing station',
      'Prepare PPE, towels, shampoo, and safe footing before bringing the dog in.',
      'observation_check',
      (v_item_seq := v_item_seq + 1),
      true,
      true,
      'observe_participate_demonstrate'
    ),
    (
      v_version_id,
      v_section_id,
      'bathing_intake_temp',
      'Check water temperature and pressure',
      'Use safe water temperature and controlled pressure throughout the bath.',
      'observation_check',
      (v_item_seq := v_item_seq + 1),
      true,
      true,
      'observe_participate_demonstrate'
    ),
    (
      v_version_id,
      v_section_id,
      'bathing_intake_handling',
      'Transfer the dog safely',
      'Use calm leash handling and secure transfers between kennel and tub.',
      'observation_check',
      (v_item_seq := v_item_seq + 1),
      true,
      true,
      'observe_participate_demonstrate'
    );

  INSERT INTO training_template_sections (
    id,
    template_version_id,
    section_key,
    title,
    section_type,
    sequence_order,
    completion_mode,
    instructions
  )
  VALUES (
    gen_random_uuid(),
    v_version_id,
    'bathing_wash_and_finish',
    'Wash and Finish',
    'live_eval',
    20,
    'observe_participate_demonstrate',
    'Complete the wash, dry, brush, and final coat check with safe technique.'
  )
  RETURNING id
  INTO v_section_id;

  v_item_seq := 0;
  INSERT INTO training_template_items (
    template_version_id,
    template_section_id,
    item_key,
    label,
    description,
    item_type,
    sequence_order,
    required,
    safety_sensitive,
    completion_mode
  )
  VALUES
    (
      v_version_id,
      v_section_id,
      'bathing_finish_shampoo',
      'Select the correct shampoo or treatment',
      'Choose the product that matches the coat or skin need in the bath notes.',
      'observation_check',
      (v_item_seq := v_item_seq + 1),
      true,
      false,
      'observe_participate_demonstrate'
    ),
    (
      v_version_id,
      v_section_id,
      'bathing_finish_rinse',
      'Rinse thoroughly and protect ears and eyes',
      'Rinse all soap from the coat without irritating the dog or leaving residue.',
      'observation_check',
      (v_item_seq := v_item_seq + 1),
      true,
      true,
      'observe_participate_demonstrate'
    ),
    (
      v_version_id,
      v_section_id,
      'bathing_finish_dry',
      'Dry the coat safely',
      'Use towel and dryer technique appropriate to the dog and coat type.',
      'observation_check',
      (v_item_seq := v_item_seq + 1),
      true,
      true,
      'observe_participate_demonstrate'
    ),
    (
      v_version_id,
      v_section_id,
      'bathing_finish_brush',
      'Brush and finish the coat',
      'Complete brushing, detangling, and the final coat check before handoff.',
      'observation_check',
      (v_item_seq := v_item_seq + 1),
      true,
      false,
      'observe_participate_demonstrate'
    );

  INSERT INTO training_template_sections (
    id,
    template_version_id,
    section_key,
    title,
    section_type,
    sequence_order,
    completion_mode,
    instructions
  )
  VALUES (
    gen_random_uuid(),
    v_version_id,
    'bathing_cleanup_and_signoff',
    'Cleanup and Signoff',
    'signoff',
    30,
    'complete_only',
    'Reset the station, close out the service, and capture evaluator signoff.'
  )
  RETURNING id
  INTO v_section_id;

  v_item_seq := 0;
  INSERT INTO training_template_items (
    template_version_id,
    template_section_id,
    item_key,
    label,
    description,
    item_type,
    sequence_order,
    required,
    completion_mode
  )
  VALUES
    (
      v_version_id,
      v_section_id,
      'bathing_cleanup_station',
      'Clean and disinfect the station',
      'Return the bathing area to ready status.',
      'task',
      (v_item_seq := v_item_seq + 1),
      true,
      'complete_only'
    ),
    (
      v_version_id,
      v_section_id,
      'bathing_cleanup_supply',
      'Return supplies and note issues',
      'Record any supply or equipment issues that need follow-up.',
      'free_text',
      (v_item_seq := v_item_seq + 1),
      false,
      'complete_only'
    ),
    (
      v_version_id,
      v_section_id,
      'bathing_cleanup_signoff',
      'Evaluator final signoff',
      'Evaluator confirms the bathing certification practical is complete.',
      'signoff',
      (v_item_seq := v_item_seq + 1),
      true,
      'complete_only'
    );

  UPDATE training_template_versions
  SET published_snapshot = public.build_training_template_published_snapshot(v_version_id)
  WHERE id = v_version_id;

  -- Written Certification - PCT / CSR

  INSERT INTO training_templates (
    id,
    slug,
    name,
    template_class,
    role_scopes,
    is_active
  )
  VALUES (
    gen_random_uuid(),
    'written_certification',
    'Written Certification - PCT / CSR',
    'written_certification',
    ARRAY['PCT', 'CSR'],
    true
  )
  ON CONFLICT (slug) DO UPDATE
  SET
    name = EXCLUDED.name,
    template_class = EXCLUDED.template_class,
    role_scopes = EXCLUDED.role_scopes,
    is_active = EXCLUDED.is_active
  RETURNING id
  INTO v_template_id;

  INSERT INTO training_template_versions (
    id,
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
    gen_random_uuid(),
    v_template_id,
    1,
    'published',
    true,
    'written_certification',
    'K9 CH Certifications.pdf',
    'Seeded from the Cherry Hill packet map as a pragmatic written certification scaffold.',
    jsonb_build_object(
      'seed_version', 'v1',
      'template_key', 'written_certification',
      'source_family', 'written_certification',
      'qa_flags', jsonb_build_array('scan-based packet', 'manual QA required', 'OCR page map pending')
    ),
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
    published_at = EXCLUDED.published_at
  RETURNING id
  INTO v_version_id;

  UPDATE training_template_versions
  SET is_current = (id = v_version_id)
  WHERE template_id = v_template_id;

  DELETE FROM training_template_dependencies WHERE template_version_id = v_version_id;
  DELETE FROM training_template_items WHERE template_version_id = v_version_id;
  DELETE FROM training_template_sections WHERE template_version_id = v_version_id;

  INSERT INTO training_template_sections (
    id,
    template_version_id,
    section_key,
    title,
    section_type,
    sequence_order,
    completion_mode,
    instructions
  )
  VALUES (
    gen_random_uuid(),
    v_version_id,
    'written_core_knowledge',
    'Core Knowledge',
    'written_exam',
    10,
    'pass_fail',
    'Select the best answer for each question. Managers can add coaching notes alongside the responses.'
  )
  RETURNING id
  INTO v_section_id;

  v_item_seq := 0;
  INSERT INTO training_template_items (
    template_version_id,
    template_section_id,
    item_key,
    label,
    description,
    item_type,
    sequence_order,
    required,
    completion_mode,
    answer_options,
    correct_answer,
    expected_response
  )
  VALUES
    (
      v_version_id,
      v_section_id,
      'written_core_escalate',
      'What should you do if a dog becomes distressed during a service?',
      'Confirm the employee understands when to stop the service and escalate to a manager.',
      'question_single_choice',
      (v_item_seq := v_item_seq + 1),
      true,
      'score_based',
      jsonb_build_array(
        'Stop the service and escalate to a manager',
        'Keep going as long as the dog is still moving',
        'Finish quickly and note it later'
      ),
      jsonb_build_array('Stop the service and escalate to a manager'),
      'Stop the service and escalate immediately.'
    ),
    (
      v_version_id,
      v_section_id,
      'written_core_identity',
      'What should be verified before starting the service?',
      'Confirm the employee knows how to check the dog, the service request, and the handling notes.',
      'question_single_choice',
      (v_item_seq := v_item_seq + 1),
      true,
      'score_based',
      jsonb_build_array(
        'Dog identity, service request, and handling notes',
        'Only the kennel number',
        'The shift lead''s preference'
      ),
      jsonb_build_array('Dog identity, service request, and handling notes'),
      'Verify the dog identity, the service request, and the notes.'
    ),
    (
      v_version_id,
      v_section_id,
      'written_core_ppe',
      'Which practice is most important when preparing the bath station?',
      'Assess whether the candidate understands PPE and station readiness before handling dogs.',
      'question_single_choice',
      (v_item_seq := v_item_seq + 1),
      true,
      'score_based',
      jsonb_build_array(
        'Prepare PPE, tools, and safe footing',
        'Start with the strongest shampoo first',
        'Ask the next person to decide'
      ),
      jsonb_build_array('Prepare PPE, tools, and safe footing'),
      'Prepare PPE, tools, and safe footing before the dog enters.'
    ),
    (
      v_version_id,
      v_section_id,
      'written_core_sanitation',
      'What should happen after each bath is finished?',
      'Confirm the employee knows the sanitation expectation between dogs.',
      'question_single_choice',
      (v_item_seq := v_item_seq + 1),
      true,
      'score_based',
      jsonb_build_array(
        'Clean and disinfect the station before the next dog',
        'Leave the station for the next shift',
        'Rinse only if the area looks dirty'
      ),
      jsonb_build_array('Clean and disinfect the station before the next dog'),
      'Clean and disinfect the station before the next dog arrives.'
    );

  INSERT INTO training_template_sections (
    id,
    template_version_id,
    section_key,
    title,
    section_type,
    sequence_order,
    completion_mode,
    instructions
  )
  VALUES (
    gen_random_uuid(),
    v_version_id,
    'written_policy_and_guest_care',
    'Policy and Guest Care',
    'written_exam',
    20,
    'pass_fail',
    'Evaluate how well the employee understands policy, communication, and follow-up expectations.'
  )
  RETURNING id
  INTO v_section_id;

  v_item_seq := 0;
  INSERT INTO training_template_items (
    template_version_id,
    template_section_id,
    item_key,
    label,
    description,
    item_type,
    sequence_order,
    required,
    completion_mode,
    answer_options,
    correct_answer,
    expected_response
  )
  VALUES
    (
      v_version_id,
      v_section_id,
      'written_policy_notes',
      'What should be documented when a dog has a concern or exception?',
      'Check whether the employee knows to capture the issue in the notes before the shift ends.',
      'question_single_choice',
      (v_item_seq := v_item_seq + 1),
      true,
      'score_based',
      jsonb_build_array(
        'The concern, the action taken, and any follow-up needed',
        'Only the dog name',
        'Nothing if the issue was handled verbally'
      ),
      jsonb_build_array('The concern, the action taken, and any follow-up needed'),
      'Document the concern, action taken, and follow-up.'
    ),
    (
      v_version_id,
      v_section_id,
      'written_guest_comm',
      'How should the employee communicate policy or safety concerns to a guest?',
      'Assess communication tone and clarity for pet parent interactions.',
      'question_single_choice',
      (v_item_seq := v_item_seq + 1),
      true,
      'score_based',
      jsonb_build_array(
        'Calmly, clearly, and professionally',
        'Use a short text message only',
        'Avoid the conversation'
      ),
      jsonb_build_array('Calmly, clearly, and professionally'),
      'Communicate calmly, clearly, and professionally.'
    ),
    (
      v_version_id,
      v_section_id,
      'written_policy_help',
      'When should the employee ask for help or escalation?',
      'Confirm the employee knows to escalate when a dog or guest issue is outside their authority.',
      'question_single_choice',
      (v_item_seq := v_item_seq + 1),
      true,
      'score_based',
      jsonb_build_array(
        'Whenever a safety or policy concern is outside their authority',
        'Only after the shift is over',
        'Never, unless a manager notices first'
      ),
      jsonb_build_array('Whenever a safety or policy concern is outside their authority'),
      'Ask for help as soon as the concern is outside their authority.'
    ),
    (
      v_version_id,
      v_section_id,
      'written_policy_wrapup',
      'What is the final review expectation before signoff?',
      'Check that the employee can summarize the key safety and sanitation rules back to the evaluator.',
      'question_single_choice',
      (v_item_seq := v_item_seq + 1),
      true,
      'score_based',
      jsonb_build_array(
        'Summarize the main rules back to the evaluator',
        'Skip the recap if all questions were answered',
        'Ask the next trainee to handle the recap'
      ),
      jsonb_build_array('Summarize the main rules back to the evaluator'),
      'Summarize the main rules and open questions back to the evaluator.'
    );

  INSERT INTO training_template_sections (
    id,
    template_version_id,
    section_key,
    title,
    section_type,
    sequence_order,
    completion_mode,
    instructions
  )
  VALUES (
    gen_random_uuid(),
    v_version_id,
    'written_signoff',
    'Manager Signoff',
    'signoff',
    30,
    'complete_only',
    'Capture manager notes and the final certification signoff.'
  )
  RETURNING id
  INTO v_section_id;

  v_item_seq := 0;
  INSERT INTO training_template_items (
    template_version_id,
    template_section_id,
    item_key,
    label,
    description,
    item_type,
    sequence_order,
    required,
    completion_mode
  )
  VALUES
    (
      v_version_id,
      v_section_id,
      'written_manager_notes',
      'Manager notes',
      'Add any coaching notes or caveats that should stay attached to the certification.',
      'free_text',
      (v_item_seq := v_item_seq + 1),
      false,
      'complete_only'
    ),
    (
      v_version_id,
      v_section_id,
      'written_manager_signoff',
      'Evaluator final signoff',
      'Evaluator confirms the written certification is complete.',
      'signoff',
      (v_item_seq := v_item_seq + 1),
      true,
      'complete_only'
    );

  UPDATE training_template_versions
  SET published_snapshot = public.build_training_template_published_snapshot(v_version_id)
  WHERE id = v_version_id;

  -- Live Certification - PCT / CSR

  INSERT INTO training_templates (
    id,
    slug,
    name,
    template_class,
    role_scopes,
    is_active
  )
  VALUES (
    gen_random_uuid(),
    'live_certification',
    'Live Certification - PCT / CSR',
    'live_evaluation',
    ARRAY['PCT', 'CSR'],
    true
  )
  ON CONFLICT (slug) DO UPDATE
  SET
    name = EXCLUDED.name,
    template_class = EXCLUDED.template_class,
    role_scopes = EXCLUDED.role_scopes,
    is_active = EXCLUDED.is_active
  RETURNING id
  INTO v_template_id;

  INSERT INTO training_template_versions (
    id,
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
    gen_random_uuid(),
    v_template_id,
    1,
    'published',
    true,
    'live_certification',
    'K9 CH Certifications.pdf',
    'Seeded from the Cherry Hill packet map as a pragmatic live certification scaffold.',
    jsonb_build_object(
      'seed_version', 'v1',
      'template_key', 'live_certification',
      'source_family', 'live_certification',
      'qa_flags', jsonb_build_array('scan-based packet', 'manual QA required', 'OCR page map pending')
    ),
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
    published_at = EXCLUDED.published_at
  RETURNING id
  INTO v_version_id;

  UPDATE training_template_versions
  SET is_current = (id = v_version_id)
  WHERE template_id = v_template_id;

  DELETE FROM training_template_dependencies WHERE template_version_id = v_version_id;
  DELETE FROM training_template_items WHERE template_version_id = v_version_id;
  DELETE FROM training_template_sections WHERE template_version_id = v_version_id;

  INSERT INTO training_template_sections (
    id,
    template_version_id,
    section_key,
    title,
    section_type,
    sequence_order,
    completion_mode,
    instructions
  )
  VALUES (
    gen_random_uuid(),
    v_version_id,
    'live_setup_and_readiness',
    'Setup and Readiness',
    'live_eval',
    10,
    'observe_participate_demonstrate',
    'Verify the station is ready and the employee is prepared to handle the dog safely.'
  )
  RETURNING id
  INTO v_section_id;

  v_item_seq := 0;
  INSERT INTO training_template_items (
    template_version_id,
    template_section_id,
    item_key,
    label,
    description,
    item_type,
    sequence_order,
    required,
    safety_sensitive,
    completion_mode
  )
  VALUES
    (
      v_version_id,
      v_section_id,
      'live_setup_ppe',
      'Prepare PPE and tools',
      'Ensure the candidate has the right tools, towels, and protective equipment ready.',
      'observation_check',
      (v_item_seq := v_item_seq + 1),
      true,
      true,
      'observe_participate_demonstrate'
    ),
    (
      v_version_id,
      v_section_id,
      'live_setup_handle_notes',
      'Review handling notes',
      'Verify the candidate checks the dog notes before contact.',
      'observation_check',
      (v_item_seq := v_item_seq + 1),
      true,
      true,
      'observe_participate_demonstrate'
    ),
    (
      v_version_id,
      v_section_id,
      'live_setup_station',
      'Set up the work area safely',
      'Confirm the station is clear, clean, and ready for the practical.',
      'observation_check',
      (v_item_seq := v_item_seq + 1),
      true,
      true,
      'observe_participate_demonstrate'
    ),
    (
      v_version_id,
      v_section_id,
      'live_setup_readiness',
      'Confirm readiness before beginning',
      'The evaluator should see the candidate pause and confirm readiness before starting.',
      'observation_check',
      (v_item_seq := v_item_seq + 1),
      true,
      false,
      'observe_participate_demonstrate'
    );

  INSERT INTO training_template_sections (
    id,
    template_version_id,
    section_key,
    title,
    section_type,
    sequence_order,
    completion_mode,
    instructions
  )
  VALUES (
    gen_random_uuid(),
    v_version_id,
    'live_handling_and_finish',
    'Handling and Finish',
    'live_eval',
    20,
    'observe_participate_demonstrate',
    'Observe the candidate handle the dog, communicate concerns, and finish the service cleanly.'
  )
  RETURNING id
  INTO v_section_id;

  v_item_seq := 0;
  INSERT INTO training_template_items (
    template_version_id,
    template_section_id,
    item_key,
    label,
    description,
    item_type,
    sequence_order,
    required,
    safety_sensitive,
    completion_mode
  )
  VALUES
    (
      v_version_id,
      v_section_id,
      'live_handling_transfer',
      'Transfer the dog safely',
      'Observe safe kennel, tub, and table transfers where relevant.',
      'observation_check',
      (v_item_seq := v_item_seq + 1),
      true,
      true,
      'observe_participate_demonstrate'
    ),
    (
      v_version_id,
      v_section_id,
      'live_handling_control',
      'Maintain calm handling and control',
      'Confirm the candidate uses calm voice, leash handling, and safe body positioning.',
      'observation_check',
      (v_item_seq := v_item_seq + 1),
      true,
      true,
      'observe_participate_demonstrate'
    ),
    (
      v_version_id,
      v_section_id,
      'live_handling_escalate',
      'Escalate concerns appropriately',
      'Observe whether the candidate pauses and escalates when the dog needs help.',
      'observation_check',
      (v_item_seq := v_item_seq + 1),
      true,
      true,
      'observe_participate_demonstrate'
    ),
    (
      v_version_id,
      v_section_id,
      'live_handling_finish',
      'Complete the finish and handoff',
      'Confirm the dog is finished safely and the handoff is clear.',
      'observation_check',
      (v_item_seq := v_item_seq + 1),
      true,
      false,
      'observe_participate_demonstrate'
    );

  INSERT INTO training_template_sections (
    id,
    template_version_id,
    section_key,
    title,
    section_type,
    sequence_order,
    completion_mode,
    instructions
  )
  VALUES (
    gen_random_uuid(),
    v_version_id,
    'live_cleanup_and_signoff',
    'Cleanup and Signoff',
    'signoff',
    30,
    'complete_only',
    'Reset the station and capture final evaluator signoff.'
  )
  RETURNING id
  INTO v_section_id;

  v_item_seq := 0;
  INSERT INTO training_template_items (
    template_version_id,
    template_section_id,
    item_key,
    label,
    description,
    item_type,
    sequence_order,
    required,
    completion_mode
  )
  VALUES
    (
      v_version_id,
      v_section_id,
      'live_cleanup_station',
      'Reset and disinfect the station',
      'Return the work area to ready status after the practical.',
      'task',
      (v_item_seq := v_item_seq + 1),
      true,
      'complete_only'
    ),
    (
      v_version_id,
      v_section_id,
      'live_cleanup_notes',
      'Record any follow-up notes',
      'Capture coaching or equipment follow-up details for the manager.',
      'free_text',
      (v_item_seq := v_item_seq + 1),
      false,
      'complete_only'
    ),
    (
      v_version_id,
      v_section_id,
      'live_cleanup_signoff',
      'Evaluator final signoff',
      'Evaluator confirms the live certification practical is complete.',
      'signoff',
      (v_item_seq := v_item_seq + 1),
      true,
      'complete_only'
    );

  UPDATE training_template_versions
  SET published_snapshot = public.build_training_template_published_snapshot(v_version_id)
  WHERE id = v_version_id;
END;
$$;

UPDATE public.labor_source_document_catalog
SET
  extraction_status = 'cataloged_scan_requires_ocr',
  normalized_target = 'training_templates:bathing_certification, training_templates:written_certification, training_templates:live_certification',
  qa_flags = '["scan-based packet","manual QA required","family seeds now mapped to editable templates"]'::jsonb,
  notes = 'Cherry Hill master packet for the certification library. The bathing, written, and live families are now seeded as editable templates; exact page-to-section OCR mapping still needs QA.'
WHERE source_file_name = 'K9 CH Certifications.pdf'
  AND document_family = 'training_packet'
  AND document_class = 'scan_pdf'
  AND role_scope = 'all';

UPDATE public.labor_source_document_catalog
SET
  extraction_status = 'seeded_manual_parse',
  normalized_target = 'training_templates:bathing_certification',
  qa_flags = '["pragmatic structured seed","OCR page map pending"]'::jsonb,
  notes = 'Manual packet-map reconstruction for the bathing certification family. Seeded as a live-evaluation scaffold with editable sections and items; page-level OCR still needs a pass.'
WHERE source_file_name = 'K9 CH Certifications.pdf'
  AND document_family = 'bathing_certification'
  AND document_class = 'live_evaluation'
  AND role_scope = 'PCT';

UPDATE public.labor_source_document_catalog
SET
  extraction_status = 'seeded_manual_parse',
  normalized_target = 'training_templates:written_certification',
  qa_flags = '["pragmatic structured seed","OCR page map pending"]'::jsonb,
  notes = 'Manual packet-map reconstruction for the written certification family. Seeded with editable written-exam sections, question items, and signoff.'
WHERE source_file_name = 'K9 CH Certifications.pdf'
  AND document_family = 'written_certification'
  AND document_class = 'written_certification'
  AND role_scope = 'PCT/CSR';

UPDATE public.labor_source_document_catalog
SET
  extraction_status = 'seeded_manual_parse',
  normalized_target = 'training_templates:live_certification',
  qa_flags = '["pragmatic structured seed","OCR page map pending"]'::jsonb,
  notes = 'Manual packet-map reconstruction for the live certification family. Seeded with editable live-evaluation sections, observation items, and signoff.'
WHERE source_file_name = 'K9 CH Certifications.pdf'
  AND document_family = 'live_certification'
  AND document_class = 'live_evaluation'
  AND role_scope = 'PCT/CSR';

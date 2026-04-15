-- Seed structured 30 / 60 / 90 day review templates from the provided DOCX files.

CREATE OR REPLACE FUNCTION public.review_seed_ensure_template(
  p_slug text,
  p_name text,
  p_role_scope text,
  p_source_document text
)
RETURNS TABLE (out_template_id uuid, out_version_id uuid)
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.review_templates (
    slug,
    name,
    role_scopes,
    is_active
  )
  VALUES (
    p_slug,
    p_name,
    ARRAY[p_role_scope],
    true
  )
  ON CONFLICT (slug) DO UPDATE
  SET
    name = EXCLUDED.name,
    role_scopes = EXCLUDED.role_scopes,
    is_active = true
  RETURNING id
  INTO out_template_id;

  INSERT INTO public.review_template_versions (
    template_id,
    version_no,
    status,
    is_current,
    source_document_name,
    published_snapshot,
    metadata,
    published_at
  )
  VALUES (
    out_template_id,
    1,
    'published',
    true,
    p_source_document,
    jsonb_build_object(
      'seed_source', p_source_document,
      'role_scope', p_role_scope
    ),
    jsonb_build_object(
      'seeded_from_docx', true,
      'source_document_name', p_source_document
    ),
    now()
  )
  ON CONFLICT (template_id, version_no) DO UPDATE
  SET
    status = 'published',
    is_current = true,
    source_document_name = EXCLUDED.source_document_name,
    published_snapshot = EXCLUDED.published_snapshot,
    metadata = EXCLUDED.metadata,
    published_at = COALESCE(public.review_template_versions.published_at, now())
  RETURNING id
  INTO out_version_id;

  UPDATE public.review_template_versions
  SET is_current = (id = out_version_id)
  WHERE review_template_versions.template_id = out_template_id;

  DELETE FROM public.review_items
  WHERE template_version_id = out_version_id;

  DELETE FROM public.review_sections
  WHERE template_version_id = out_version_id;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_seed_add_section(
  p_version_id uuid,
  p_section_key text,
  p_title text,
  p_sequence integer,
  p_instructions text
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_section_id uuid;
BEGIN
  INSERT INTO public.review_sections (
    template_version_id,
    section_key,
    title,
    sequence_order,
    instructions
  )
  VALUES (
    p_version_id,
    p_section_key,
    p_title,
    p_sequence,
    p_instructions
  )
  RETURNING id
  INTO v_section_id;

  RETURN v_section_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_seed_add_item(
  p_version_id uuid,
  p_section_id uuid,
  p_item_key text,
  p_prompt text,
  p_item_type review_item_type,
  p_sequence integer,
  p_options jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.review_items (
    template_version_id,
    review_section_id,
    item_key,
    prompt,
    item_type,
    sequence_order,
    options
  )
  VALUES (
    p_version_id,
    p_section_id,
    p_item_key,
    p_prompt,
    p_item_type,
    p_sequence,
    p_options
  );
END;
$$;

DO $$
DECLARE
  v_template_id uuid;
  v_version_id uuid;
  v_section_id uuid;
  v_rating_options jsonb := '["Meets Expectations","Needs Improvement","Exceeds Expectations"]'::jsonb;
BEGIN
  -- Assistant Manager
  SELECT out_template_id, out_version_id
  INTO v_template_id, v_version_id
  FROM public.review_seed_ensure_template(
    'assistant_manager_30_60_90',
    'Assistant Manager 30 / 60 / 90 Day Review',
    'Assistant Manager',
    'Assistant Manager 30, 60, 90 day review template.docx'
  );

  v_section_id := public.review_seed_add_section(v_version_id, 'assistant_manager_30_day', '30-Day Review', 10, 'Foundations & First Impressions. Focus: Learning Systems, Leadership, and Team Operations.');
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'assistant_manager_30_q1', 'Has the employee completed all required onboarding, safety, and compliance training?', 'rating', 10, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'assistant_manager_30_q2', 'Are they demonstrating a positive attitude and willingness to learn?', 'rating', 20, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'assistant_manager_30_q3', 'How effectively have they learned and applied their core responsibilities?', 'rating', 30, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'assistant_manager_30_q4', 'Are they aligning with team culture and communication standards?', 'rating', 40, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'assistant_manager_30_q5', 'What early leadership behaviors have you observed?', 'rating', 50, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'assistant_manager_30_notes', 'Manager Notes & Action Plan', 'long_text', 60);

  v_section_id := public.review_seed_add_section(v_version_id, 'assistant_manager_60_day', '60-Day Review', 20, 'Performance & Confidence. Focus: Leading Shifts, Coaching Accountability, and Handling Customer Escalations.');
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'assistant_manager_60_q1', 'How consistently does the employee perform daily tasks independently?', 'rating', 10, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'assistant_manager_60_q2', 'Are they accountable and detail-oriented in their work?', 'rating', 20, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'assistant_manager_60_q3', 'How effectively do they communicate with peers and management?', 'rating', 30, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'assistant_manager_60_q4', 'Are they applying feedback and showing improvement since the first review?', 'rating', 40, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'assistant_manager_60_q5', 'Have they begun to mentor or coach team members?', 'rating', 50, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'assistant_manager_60_notes', 'Manager Notes & Action Plan', 'long_text', 60);

  v_section_id := public.review_seed_add_section(v_version_id, 'assistant_manager_90_day', '90-Day Review', 30, 'Readiness & Growth. Focus: Full Ownership of Resort Operations and Staff Management.');
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'assistant_manager_90_q1', 'Is the employee fully capable of performing core responsibilities independently?', 'rating', 10, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'assistant_manager_90_q2', 'Have they shown initiative beyond assigned duties?', 'rating', 20, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'assistant_manager_90_q3', 'How do they contribute to team morale and guest experience?', 'rating', 30, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'assistant_manager_90_q4', 'Are they maintaining attendance, safety, and performance standards consistently?', 'rating', 40, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'assistant_manager_90_q5', 'Are they ready for continued leadership development?', 'rating', 50, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'assistant_manager_90_notes', 'Manager Notes & Development Plan', 'long_text', 60);

  v_section_id := public.review_seed_add_section(v_version_id, 'assistant_manager_overall', 'Overall Performance Summary', 40, 'Complete the overall rating and summary comments.');
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'assistant_manager_overall_rating', 'Overall Rating', 'rating', 10, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'assistant_manager_overall_comments', 'Summary Comments', 'long_text', 20);

  -- CSR
  SELECT out_template_id, out_version_id
  INTO v_template_id, v_version_id
  FROM public.review_seed_ensure_template(
    'csr_30_60_90',
    'CSR 30 / 60 / 90 Day Review',
    'CSR',
    'CSR 30^LJ 60^LJ 90 day review template.docx'
  );

  v_section_id := public.review_seed_add_section(v_version_id, 'csr_30_day', '30-Day Review', 10, 'Foundations and First Impressions. Focus: Reservation Systems, Phone Etiquette, Tours, and Guest Experience.');
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'csr_30_q1', 'Has the employee completed all required onboarding, safety, and compliance training?', 'rating', 10, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'csr_30_q2', 'Are they demonstrating professional and friendly communication with clients?', 'rating', 20, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'csr_30_q3', 'How accurate are their reservations, billing, and guest notes?', 'rating', 30, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'csr_30_q4', 'Are they building positive rapport with pet parents and team members?', 'rating', 40, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'csr_30_q5', 'Do they understand K9 Resorts’ policies and guest service standards?', 'rating', 50, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'csr_30_notes', 'Manager Notes & Action Plan', 'long_text', 60);

  v_section_id := public.review_seed_add_section(v_version_id, 'csr_60_day', '60-Day Review', 20, 'Performance & Confidence. Focus: Billing Accuracy, Policy Communication, and Cross-Department Support.');
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'csr_60_q1', 'How reliably does the employee manage transactions and client data accurately?', 'rating', 10, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'csr_60_q2', 'Are they communicating policies clearly and professionally to guests?', 'rating', 20, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'csr_60_q3', 'Do they collaborate effectively with PCTs and Supervisors?', 'rating', 30, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'csr_60_q4', 'How do they handle guest concerns or special requests?', 'rating', 40, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'csr_60_q5', 'Are they demonstrating consistency and confident in tours and front desk tasks?', 'rating', 50, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'csr_60_notes', 'Manager Notes & Action Plan', 'long_text', 60);

  v_section_id := public.review_seed_add_section(v_version_id, 'csr_90_day', '90-Day Review', 30, 'Readiness & Growth. Focus: Independent Performance and Sales Confidence.');
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'csr_90_q1', 'Is the employee handling all front-desk duties independently and accurately?', 'rating', 10, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'csr_90_q2', 'Do they consistently deliver five-star guest experience and follow-up professionally?', 'rating', 20, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'csr_90_q3', 'Are they proactively selling, upselling, overcoming objections and/or educating guests on services?', 'rating', 30, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'csr_90_q4', 'Do they maintain positive and calm demeanor under pressure?', 'rating', 40, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'csr_90_q5', 'Have they demonstrated growth in system mastery and policy knowledge?', 'rating', 50, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'csr_90_notes', 'Manager Notes & Development Plan', 'long_text', 60);

  v_section_id := public.review_seed_add_section(v_version_id, 'csr_overall', 'Overall Performance Summary', 40, 'Complete the overall rating and summary comments.');
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'csr_overall_rating', 'Overall Rating', 'rating', 10, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'csr_overall_comments', 'Summary Comments', 'long_text', 20);

  -- General Manager
  SELECT out_template_id, out_version_id
  INTO v_template_id, v_version_id
  FROM public.review_seed_ensure_template(
    'general_manager_30_60_90',
    'General Manager 30 / 60 / 90 Day Review',
    'General Manager',
    'General Manager 30^J 60^J 90 day review template.docx'
  );

  v_section_id := public.review_seed_add_section(v_version_id, 'general_manager_30_day', '30-Day Review', 10, 'Foundations & First Impressions. Focus: Leadership Integration, Operational Mastery, and Culture Immersion.');
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'general_manager_30_q1', 'Has the GM completed all required onboarding and training, including franchise training, reviewing SOP’s, and aligned on operational standards?', 'rating', 10, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'general_manager_30_q2', 'How effectively have they integrated with the department leads and established credibility across the team?', 'rating', 20, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'general_manager_30_q3', 'Are they demonstrating a clear understanding of LPHI | K9 Resorts’ mission, standards, and Culture of Care?', 'rating', 30, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'general_manager_30_q4', 'Have they conducted initial team meetings/huddles and established clear communication channels?', 'rating', 40, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'general_manager_30_q5', 'How familiar are they with key systems (WIW, ADP, CRM, POS) and confident in daily operations oversight?', 'rating', 50, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'general_manager_30_notes', 'Regional Manager Notes & Action Plan', 'long_text', 60);

  v_section_id := public.review_seed_add_section(v_version_id, 'general_manager_60_day', '60-Day Review', 20, 'Performance & Confidence. Focus: Operational Accountability, Team Development, and Community Leadership.');
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'general_manager_60_q1', 'Has the GM developed effective staffing schedules and labor plans aligned with business demands?', 'rating', 10, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'general_manager_60_q2', 'Are they actively coaching supervisors and assistant managers through performance feedback and accountability?', 'rating', 20, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'general_manager_60_q3', 'Have they demonstrated strong financial awareness through weekly labor and revenue reviews?', 'rating', 30, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'general_manager_60_q4', 'Are they maintaining resort standards for cleanliness, safety, and guest experience with consistency?', 'rating', 40, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'general_manager_60_q5', 'Have they begun representing the brand externally through grassroots local partnerships or outreach (veterinarians, groomers, community partners)?', 'rating', 50, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'general_manager_60_notes', 'Regional Manager Notes & Action Plan', 'long_text', 60);

  v_section_id := public.review_seed_add_section(v_version_id, 'general_manager_90_day', '90-Day Review', 30, 'Readiness & Growth. Focus: Strategic Leadership, Financial Control, and Brand Stewardship.');
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'general_manager_90_q1', 'Has the GM demonstrated full ownership for resort operations, including independent decision-making?', 'rating', 10, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'general_manager_90_q2', 'Are they managing and analyzing P&L performance, identifying trends, and implementing corrective actions?', 'rating', 20, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'general_manager_90_q3', 'Have they built a self-sufficient leadership team capable of sustaining performance standards?', 'rating', 30, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'general_manager_90_q4', 'Are they upholding the LPHI | K9 Resorts brand reputation through service excellence and grassroots efforts?', 'rating', 40, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'general_manager_90_q5', 'Are they demonstrating the vision, composure, and adaptability of a business leader?', 'rating', 50, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'general_manager_90_notes', 'Regional Manager Notes & Development Plan', 'long_text', 60);

  v_section_id := public.review_seed_add_section(v_version_id, 'general_manager_overall', 'Overall Performance Summary', 40, 'Complete the overall rating and summary comments.');
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'general_manager_overall_rating', 'Overall Rating', 'rating', 10, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'general_manager_overall_comments', 'Summary Comments', 'long_text', 20);

  -- PCT
  SELECT out_template_id, out_version_id
  INTO v_template_id, v_version_id
  FROM public.review_seed_ensure_template(
    'pct_30_60_90',
    'PCT 30 / 60 / 90 Day Review',
    'PCT',
    'PCT 30^LLJ 60^LLJ 90 day review template.docx'
  );

  v_section_id := public.review_seed_add_section(v_version_id, 'pct_30_day', '30-Day Review', 10, 'Foundations and First Impressions. Focus: Safety, Sanitation, and Dog Handling.');
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'pct_30_q1', 'Has the employee completed all required onboarding, safety, and compliance training?', 'rating', 10, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'pct_30_q2', 'Are they following proper walking, POD, bathing, and cleaning procedures consistently?', 'rating', 20, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'pct_30_q3', 'How comfortable are they with dog handling and behavior observation?', 'rating', 30, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'pct_30_q4', 'Are they maintaining the expected level of care, compassion, and attentiveness?', 'rating', 40, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'pct_30_q5', 'Do they communicate effectively with CSRs and Supervisors about pet needs or incidents?', 'rating', 50, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'pct_30_notes', 'Manager Notes & Action Plan', 'long_text', 60);

  v_section_id := public.review_seed_add_section(v_version_id, 'pct_60_day', '60-Day Review', 20, 'Performance & Confidence. Focus: Efficiency, Teamwork, and Communication.');
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'pct_60_q1', 'Is the employee demonstrating improved speed and consistency without compromising care?', 'rating', 10, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'pct_60_q2', 'Do they collaborate effectively with team members during busy times?', 'rating', 20, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'pct_60_q3', 'Are they maintaining cleanliness and safety in all assigned areas?', 'rating', 30, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'pct_60_q4', 'Do they communicate clearly about pet health or behavior concerns?', 'rating', 40, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'pct_60_q5', 'Are they taking initiative in daily tasks or team support?', 'rating', 50, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'pct_60_notes', 'Manager Notes & Action Plan', 'long_text', 60);

  v_section_id := public.review_seed_add_section(v_version_id, 'pct_90_day', '90-Day Review', 30, 'Readiness & Growth. Focus: Mastery of Care Routines and Dog Handling.');
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'pct_90_q1', 'Has the employee mastered daily care routines and resort cleanliness standards?', 'rating', 10, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'pct_90_q2', 'Do they show leadership potential by mentoring or supporting new hires?', 'rating', 20, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'pct_90_q3', 'Are they consistent in following protocols and maintaining safety compliance?', 'rating', 30, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'pct_90_q4', 'Are they confident and compassionate in managing dog behavior in the group play settings?', 'rating', 40, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'pct_90_q5', 'How do they contribute to a positive and team-focused work environment?', 'rating', 50, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'pct_90_notes', 'Manager Notes & Development Plan', 'long_text', 60);

  v_section_id := public.review_seed_add_section(v_version_id, 'pct_overall', 'Overall Performance Summary', 40, 'Complete the overall rating and summary comments.');
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'pct_overall_rating', 'Overall Rating', 'rating', 10, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'pct_overall_comments', 'Summary Comments', 'long_text', 20);

  -- Supervisor
  SELECT out_template_id, out_version_id
  INTO v_template_id, v_version_id
  FROM public.review_seed_ensure_template(
    'supervisor_30_60_90',
    'Supervisor 30 / 60 / 90 Day Review',
    'Supervisor',
    'Supervisor 30^J 60^J 90 day review template.docx'
  );

  v_section_id := public.review_seed_add_section(v_version_id, 'supervisor_30_day', '30-Day Review', 10, 'Foundations and First Impressions. Focus: Shift Flow, SOP Consistency, and Cleanliness Checks.');
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'supervisor_30_q1', 'Has the employee completed all required onboarding, safety, and compliance training?', 'rating', 10, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'supervisor_30_q2', 'How well are they learning and following operational checklists and cleaning standards?', 'rating', 20, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'supervisor_30_q3', 'Are they punctual, dependable, and engaged during shifts?', 'rating', 30, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'supervisor_30_q4', 'How effectively are they communicating with team members and management?', 'rating', 40, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'supervisor_30_q5', 'Are they demonstrating a professional and proactive attitude?', 'rating', 50, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'supervisor_30_notes', 'Manager Notes & Action Plan', 'long_text', 60);

  v_section_id := public.review_seed_add_section(v_version_id, 'supervisor_60_day', '60-Day Review', 20, 'Performance & Confidence. Focus: Team Accountability, Documentation, and Communication.');
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'supervisor_60_q1', 'How consistently does the employee ensure completion of shift tasks and cleanliness standards?', 'rating', 10, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'supervisor_60_q2', 'Are they improving in time management and delegation?', 'rating', 20, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'supervisor_60_q3', 'How effectively do they support peers and communicate expectations?', 'rating', 30, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'supervisor_60_q4', 'Are they following through on assigned responsibilities without reminders?', 'rating', 40, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'supervisor_60_q5', 'Are they developing stronger leadership presence on their shifts?', 'rating', 50, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'supervisor_60_notes', 'Manager Notes & Action Plan', 'long_text', 60);

  v_section_id := public.review_seed_add_section(v_version_id, 'supervisor_90_day', '90-Day Review', 30, 'Readiness & Growth. Focus: MOD Readiness and Leadership Consistency.');
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'supervisor_90_q1', 'Is the employee independently managing daily operations on their shifts?', 'rating', 10, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'supervisor_90_q2', 'Have they shown initiative in problem solving or coaching peers?', 'rating', 20, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'supervisor_90_q3', 'Are they modeling accountability and supporting resort standards?', 'rating', 30, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'supervisor_90_q4', 'Do they maintain professionalism and composure under pressure?', 'rating', 40, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'supervisor_90_q5', 'Are they ready for higher responsibility?', 'rating', 50, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'supervisor_90_notes', 'Manager Notes & Development Plan', 'long_text', 60);

  v_section_id := public.review_seed_add_section(v_version_id, 'supervisor_overall', 'Overall Performance Summary', 40, 'Complete the overall rating and summary comments.');
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'supervisor_overall_rating', 'Overall Rating', 'rating', 10, v_rating_options);
  PERFORM public.review_seed_add_item(v_version_id, v_section_id, 'supervisor_overall_comments', 'Summary Comments', 'long_text', 20);
END $$;

DROP FUNCTION public.review_seed_add_item(uuid, uuid, text, text, review_item_type, integer, jsonb);
DROP FUNCTION public.review_seed_add_section(uuid, text, text, integer, text);
DROP FUNCTION public.review_seed_ensure_template(text, text, text, text);

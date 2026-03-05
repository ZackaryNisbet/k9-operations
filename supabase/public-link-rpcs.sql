-- © 2026 K9 Operations LLC. All Rights Reserved.
-- Public Link RPCs for Agreement Signing and Questionnaire Submission
-- These functions are SECURITY DEFINER and callable by anonymous users
--
-- outbound_links column types (verified):
--   id UUID, link_type TEXT, related_id UUID, client_id UUID,
--   expires_at TIMESTAMPTZ, first_viewed_at TIMESTAMPTZ,
--   view_count INTEGER, created_at TIMESTAMPTZ, location_id UUID

-- Drop ALL prior versions to start clean
DROP FUNCTION IF EXISTS get_public_link_data(UUID);
DROP FUNCTION IF EXISTS get_public_link_data(TEXT);
DROP FUNCTION IF EXISTS sign_public_agreement(UUID, TEXT);
DROP FUNCTION IF EXISTS sign_public_agreement(TEXT, TEXT);
DROP FUNCTION IF EXISTS submit_public_questionnaire(UUID, JSONB);
DROP FUNCTION IF EXISTS submit_public_questionnaire(TEXT, JSONB);

-- Recreate questionnaire_submissions with correct UUID types
DROP TABLE IF EXISTS questionnaire_submissions;
CREATE TABLE questionnaire_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  dog_id UUID,
  location_id UUID NOT NULL,
  questionnaire_id TEXT NOT NULL,
  link_id UUID,
  responses JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qs_client ON questionnaire_submissions(client_id, location_id);

-- ============================================================
-- 1. get_public_link_data(p_link_id TEXT)
--    PostgREST sends params as TEXT, so we accept TEXT and cast to UUID
-- ============================================================
CREATE OR REPLACE FUNCTION get_public_link_data(p_link_id TEXT)
RETURNS JSONB AS $$
DECLARE
  v_lid UUID;
  v_link RECORD;
  v_client RECORD;
  v_location RECORD;
  v_dog_names TEXT;
  v_agr JSONB;
  v_quest JSONB;
  v_already_signed BOOLEAN;
  v_already_submitted BOOLEAN;
BEGIN
  -- Cast input to UUID
  BEGIN
    v_lid := p_link_id::UUID;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid link format');
  END;

  -- Fetch outbound link
  SELECT * INTO v_link FROM outbound_links WHERE id = v_lid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'This link is invalid or has expired');
  END IF;

  -- Check expiration
  IF v_link.expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'message', 'This link has expired. Please contact the resort.', 'expired', true);
  END IF;

  -- Bump view count
  UPDATE outbound_links SET first_viewed_at = COALESCE(first_viewed_at, NOW()), view_count = COALESCE(view_count, 0) + 1 WHERE id = v_lid;

  -- Fetch client
  SELECT * INTO v_client FROM k9_clients WHERE id = v_link.client_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Client not found');
  END IF;

  -- Fetch location
  SELECT * INTO v_location FROM locations WHERE id = v_link.location_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Location not found');
  END IF;

  -- Dog names
  SELECT STRING_AGG(name, ', ' ORDER BY created_at) INTO v_dog_names
  FROM k9_dogs WHERE client_id = v_link.client_id AND location_id = v_link.location_id;
  v_dog_names := COALESCE(v_dog_names, '');

  -- ── AGREEMENT ──
  IF v_link.link_type = 'agreement' THEN
    SELECT EXISTS(
      SELECT 1 FROM agreement_log
      WHERE client_id = v_link.client_id
        AND agreement_id = v_link.related_id
        AND location_id = v_link.location_id
        AND status = 'signed'
    ) INTO v_already_signed;

    SELECT jsonb_build_object('id', a.id::TEXT, 'name', a.title, 'body', a.content)
    INTO v_agr FROM agreements a
    WHERE a.id::TEXT = v_link.related_id::TEXT AND a.location_id = v_link.location_id;

    RETURN jsonb_build_object(
      'success', true, 'linkType', 'agreement', 'expired', false,
      'alreadySigned', COALESCE(v_already_signed, false),
      'locationName', v_location.name,
      'clientFirstName', v_client.first_name,
      'clientName', TRIM(v_client.first_name || ' ' || COALESCE(v_client.last_name, '')),
      'dogNames', v_dog_names,
      'agreementId', v_link.related_id::TEXT,
      'agreement', COALESCE(v_agr, '{}'::jsonb),
      'linkId', p_link_id
    );

  -- ── QUESTIONNAIRE ──
  ELSIF v_link.link_type = 'questionnaire' THEN
    SELECT EXISTS(
      SELECT 1 FROM questionnaire_submissions WHERE link_id = v_lid
    ) INTO v_already_submitted;

    SELECT jsonb_build_object('id', q.id::TEXT, 'title', q.title, 'questions', COALESCE(q.questions, '[]'::jsonb), 'version', q.version)
    INTO v_quest FROM questionnaires q
    WHERE q.id::TEXT = v_link.related_id::TEXT AND q.location_id = v_link.location_id;

    RETURN jsonb_build_object(
      'success', true, 'linkType', 'questionnaire', 'expired', false,
      'alreadySubmitted', COALESCE(v_already_submitted, false),
      'locationName', v_location.name,
      'clientFirstName', v_client.first_name,
      'clientName', TRIM(v_client.first_name || ' ' || COALESCE(v_client.last_name, '')),
      'dogNames', v_dog_names,
      'questionnaireId', v_link.related_id::TEXT,
      'questionnaire', COALESCE(v_quest, '{}'::jsonb),
      'linkId', p_link_id
    );

  ELSE
    RETURN jsonb_build_object('success', false, 'message', 'Invalid link type');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 2. sign_public_agreement
-- ============================================================
CREATE OR REPLACE FUNCTION sign_public_agreement(p_link_id TEXT, p_signature TEXT)
RETURNS JSONB AS $$
DECLARE
  v_lid UUID;
  v_link RECORD;
BEGIN
  BEGIN v_lid := p_link_id::UUID;
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'message', 'Invalid link'); END;

  SELECT * INTO v_link FROM outbound_links WHERE id = v_lid;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Invalid link'); END IF;
  IF v_link.link_type != 'agreement' THEN RETURN jsonb_build_object('success', false, 'message', 'Not an agreement link'); END IF;
  IF v_link.expires_at < NOW() THEN RETURN jsonb_build_object('success', false, 'message', 'This link has expired'); END IF;

  -- Already signed?
  IF EXISTS(SELECT 1 FROM agreement_log WHERE client_id = v_link.client_id AND agreement_id = v_link.related_id AND location_id = v_link.location_id AND status = 'signed') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Already signed', 'alreadySigned', true);
  END IF;

  -- Update existing log entry
  UPDATE agreement_log SET status = 'signed', signed_at = NOW(), sent_via = 'online_' || p_signature
  WHERE client_id = v_link.client_id AND agreement_id = v_link.related_id AND location_id = v_link.location_id AND status != 'signed';

  -- Or insert new
  IF NOT FOUND THEN
    INSERT INTO agreement_log (id, agreement_id, client_id, location_id, status, signed_at, sent_via)
    VALUES (gen_random_uuid(), v_link.related_id, v_link.client_id, v_link.location_id, 'signed', NOW(), 'online_' || p_signature);
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Agreement signed successfully');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 3. submit_public_questionnaire
-- ============================================================
CREATE OR REPLACE FUNCTION submit_public_questionnaire(p_link_id TEXT, p_responses JSONB)
RETURNS JSONB AS $$
DECLARE
  v_lid UUID;
  v_link RECORD;
  v_dog_id UUID;
BEGIN
  BEGIN v_lid := p_link_id::UUID;
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'message', 'Invalid link'); END;

  SELECT * INTO v_link FROM outbound_links WHERE id = v_lid;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Invalid link'); END IF;
  IF v_link.link_type != 'questionnaire' THEN RETURN jsonb_build_object('success', false, 'message', 'Not a questionnaire link'); END IF;
  IF v_link.expires_at < NOW() THEN RETURN jsonb_build_object('success', false, 'message', 'This link has expired'); END IF;

  IF EXISTS(SELECT 1 FROM questionnaire_submissions WHERE link_id = v_lid) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Already submitted', 'alreadySubmitted', true);
  END IF;

  SELECT id INTO v_dog_id FROM k9_dogs WHERE client_id = v_link.client_id AND location_id = v_link.location_id ORDER BY created_at LIMIT 1;

  INSERT INTO questionnaire_submissions (client_id, dog_id, location_id, questionnaire_id, link_id, responses)
  VALUES (v_link.client_id, v_dog_id, v_link.location_id, v_link.related_id::TEXT, v_lid, p_responses);

  RETURN jsonb_build_object('success', true, 'message', 'Questionnaire submitted successfully');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Grants
GRANT EXECUTE ON FUNCTION get_public_link_data(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION sign_public_agreement(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION submit_public_questionnaire(TEXT, JSONB) TO anon;

-- Force PostgREST schema refresh
NOTIFY pgrst, 'reload schema';

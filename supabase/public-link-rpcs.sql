-- © 2026 K9 Operations LLC. All Rights Reserved.
-- Public Link RPCs for Agreement Signing and Questionnaire Submission
-- These functions are SECURITY DEFINER and callable by anonymous users
-- Run this in Supabase SQL Editor

-- ============================================================
-- NOTE: outbound_links table already exists (created by app).
-- NOTE: agreement_log table already exists (used by useData.js).
-- We only need: questionnaire_submissions table + 3 RPC functions.
-- ============================================================

-- Questionnaire submissions table (if not already created)
CREATE TABLE IF NOT EXISTS questionnaire_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES k9_clients(id) ON DELETE CASCADE,
  dog_id UUID REFERENCES k9_dogs(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  questionnaire_id TEXT NOT NULL,
  link_id UUID REFERENCES outbound_links(id),
  responses JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questionnaire_sub_client ON questionnaire_submissions(client_id, location_id);
CREATE INDEX IF NOT EXISTS idx_questionnaire_sub_dog ON questionnaire_submissions(dog_id);

-- ============================================================
-- 1. get_public_link_data(p_link_id UUID)
-- Fetches link data, client/dog info, and agreement/questionnaire content
-- NO AUTH REQUIRED — callable by anonymous users
-- ============================================================
CREATE OR REPLACE FUNCTION get_public_link_data(p_link_id TEXT)
RETURNS JSONB AS $$
DECLARE
  v_link_uuid UUID;
  v_link RECORD;
  v_client RECORD;
  v_location RECORD;
  v_dog_names TEXT;
  v_agreement_data JSONB;
  v_questionnaire_data JSONB;
  v_already_signed BOOLEAN;
  v_already_submitted BOOLEAN;
BEGIN
  -- Cast text to UUID
  BEGIN
    v_link_uuid := p_link_id::UUID;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid link format');
  END;

  -- Fetch the outbound link
  SELECT * INTO v_link FROM outbound_links WHERE id = v_link_uuid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'This link is invalid or has expired'
    );
  END IF;

  -- Check expiration
  IF v_link.expires_at < NOW() THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'This link has expired. Please contact the resort.',
      'expired', true
    );
  END IF;

  -- Update first_viewed_at and view_count
  UPDATE outbound_links
  SET
    first_viewed_at = COALESCE(first_viewed_at, NOW()),
    view_count = view_count + 1
  WHERE id = v_link_uuid;

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

  -- Fetch dog names for this client at this location
  SELECT STRING_AGG(name, ', ' ORDER BY created_at) INTO v_dog_names
  FROM k9_dogs
  WHERE client_id = v_link.client_id AND location_id = v_link.location_id;
  v_dog_names := COALESCE(v_dog_names, '');

  -- ── AGREEMENT LINK ──
  IF v_link.link_type = 'agreement' THEN

    -- Check if already signed via agreement_log
    SELECT EXISTS(
      SELECT 1 FROM agreement_log
      WHERE client_id = v_link.client_id
        AND agreement_id = v_link.related_id
        AND location_id = v_link.location_id
        AND status = 'signed'
    ) INTO v_already_signed;

    -- Fetch agreement content from the `agreements` table
    -- Columns: id, location_id, title, content, version, is_current, created_at
    SELECT jsonb_build_object(
      'id', a.id::TEXT,
      'name', a.title,
      'body', a.content
    ) INTO v_agreement_data
    FROM agreements a
    WHERE a.id::TEXT = v_link.related_id
      AND a.location_id = v_link.location_id;

    RETURN jsonb_build_object(
      'success', true,
      'linkType', 'agreement',
      'expired', false,
      'alreadySigned', COALESCE(v_already_signed, false),
      'locationName', v_location.name,
      'clientFirstName', v_client.first_name,
      'clientName', TRIM(v_client.first_name || ' ' || COALESCE(v_client.last_name, '')),
      'dogNames', v_dog_names,
      'agreementId', v_link.related_id,
      'agreement', COALESCE(v_agreement_data, '{}'::jsonb),
      'linkId', p_link_id
    );

  -- ── QUESTIONNAIRE LINK ──
  ELSIF v_link.link_type = 'questionnaire' THEN

    -- Check if already submitted
    SELECT EXISTS(
      SELECT 1 FROM questionnaire_submissions
      WHERE link_id = v_link_uuid
    ) INTO v_already_submitted;

    -- Fetch questionnaire template from the `questionnaires` table
    -- Columns: id, location_id, title, version, questions (JSONB), is_current, created_by, created_at
    SELECT jsonb_build_object(
      'id', q.id::TEXT,
      'title', q.title,
      'questions', COALESCE(q.questions, '[]'::jsonb),
      'version', q.version
    ) INTO v_questionnaire_data
    FROM questionnaires q
    WHERE q.id::TEXT = v_link.related_id
      AND q.location_id = v_link.location_id;

    RETURN jsonb_build_object(
      'success', true,
      'linkType', 'questionnaire',
      'expired', false,
      'alreadySubmitted', COALESCE(v_already_submitted, false),
      'locationName', v_location.name,
      'clientFirstName', v_client.first_name,
      'clientName', TRIM(v_client.first_name || ' ' || COALESCE(v_client.last_name, '')),
      'dogNames', v_dog_names,
      'questionnaireId', v_link.related_id,
      'questionnaire', COALESCE(v_questionnaire_data, '{}'::jsonb),
      'linkId', p_link_id
    );

  ELSE
    RETURN jsonb_build_object('success', false, 'message', 'Invalid link type');
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 2. sign_public_agreement(p_link_id UUID, p_signature TEXT)
-- Signs an agreement via public link
-- Updates the existing agreement_log entry (or inserts new one)
-- Matches the schema used by useData.js saveAgreementSignings()
-- agreement_log columns: id, agreement_id, client_id, location_id, status, signed_at, sent_via, message_id, sent_at, created_at
-- ============================================================
CREATE OR REPLACE FUNCTION sign_public_agreement(p_link_id TEXT, p_signature TEXT)
RETURNS JSONB AS $$
DECLARE
  v_link_uuid UUID;
  v_link RECORD;
  v_existing RECORD;
BEGIN
  -- Cast text to UUID
  BEGIN
    v_link_uuid := p_link_id::UUID;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid link format');
  END;

  -- Fetch the outbound link
  SELECT * INTO v_link FROM outbound_links WHERE id = v_link_uuid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid link');
  END IF;

  IF v_link.link_type != 'agreement' THEN
    RETURN jsonb_build_object('success', false, 'message', 'This link is not for an agreement');
  END IF;

  -- Check expiration
  IF v_link.expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'message', 'This link has expired');
  END IF;

  -- Check if already signed
  SELECT * INTO v_existing FROM agreement_log
  WHERE client_id = v_link.client_id
    AND agreement_id = v_link.related_id
    AND location_id = v_link.location_id
    AND status = 'signed';

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'This agreement has already been signed',
      'alreadySigned', true
    );
  END IF;

  -- Try to update existing log entry (created when SMS was sent)
  UPDATE agreement_log
  SET
    status = 'signed',
    signed_at = NOW(),
    sent_via = 'online_' || p_signature
  WHERE client_id = v_link.client_id
    AND agreement_id = v_link.related_id
    AND location_id = v_link.location_id
    AND status != 'signed';

  -- If no existing entry was updated, insert a new one
  IF NOT FOUND THEN
    INSERT INTO agreement_log (
      id, agreement_id, client_id, location_id,
      status, signed_at, sent_via
    ) VALUES (
      gen_random_uuid(), v_link.related_id, v_link.client_id, v_link.location_id,
      'signed', NOW(), 'online_' || p_signature
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Agreement signed successfully'
  );

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 3. submit_public_questionnaire(p_link_id UUID, p_responses JSONB)
-- Submits questionnaire responses via public link
-- ============================================================
CREATE OR REPLACE FUNCTION submit_public_questionnaire(p_link_id TEXT, p_responses JSONB)
RETURNS JSONB AS $$
DECLARE
  v_link_uuid UUID;
  v_link RECORD;
  v_dog_id UUID;
BEGIN
  -- Cast text to UUID
  BEGIN
    v_link_uuid := p_link_id::UUID;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid link format');
  END;

  -- Fetch the outbound link
  SELECT * INTO v_link FROM outbound_links WHERE id = v_link_uuid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid link');
  END IF;

  IF v_link.link_type != 'questionnaire' THEN
    RETURN jsonb_build_object('success', false, 'message', 'This link is not for a questionnaire');
  END IF;

  -- Check expiration
  IF v_link.expires_at < NOW() THEN
    RETURN jsonb_build_object('success', false, 'message', 'This link has expired');
  END IF;

  -- Check for duplicate submission
  IF EXISTS(SELECT 1 FROM questionnaire_submissions WHERE link_id = v_link_uuid) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'This questionnaire has already been submitted',
      'alreadySubmitted', true
    );
  END IF;

  -- Get the first dog for this client at this location
  SELECT id INTO v_dog_id FROM k9_dogs
  WHERE client_id = v_link.client_id AND location_id = v_link.location_id
  ORDER BY created_at LIMIT 1;

  -- Insert submission
  INSERT INTO questionnaire_submissions (
    client_id, dog_id, location_id, questionnaire_id, link_id, responses
  ) VALUES (
    v_link.client_id, v_dog_id, v_link.location_id,
    v_link.related_id, v_link_uuid, p_responses
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Questionnaire submitted successfully'
  );

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- Grant execute permissions to anon role
-- ============================================================
-- Drop old UUID-signature functions if they exist (from prior deploy)
DROP FUNCTION IF EXISTS get_public_link_data(UUID);
DROP FUNCTION IF EXISTS sign_public_agreement(UUID, TEXT);
DROP FUNCTION IF EXISTS submit_public_questionnaire(UUID, JSONB);

GRANT EXECUTE ON FUNCTION get_public_link_data(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION sign_public_agreement(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION submit_public_questionnaire(TEXT, JSONB) TO anon;

-- ============================================================
-- IGNITE LEAD IMPORT: Supabase RPC function
-- Receives parsed Ignite email fields, deduplicates, and
-- creates a new client in the Conversion tab if not found.
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================

CREATE OR REPLACE FUNCTION process_ignite_lead(p_to_email TEXT, p_fields JSONB)
RETURNS JSONB AS $$
DECLARE
  loc RECORD;
  loc_slug TEXT;
  profile_name TEXT;
  existing_data JSONB;
  clients_arr JSONB;
  leads_arr JSONB;
  client_email TEXT;
  client_phone TEXT;
  existing_client JSONB;
  new_client JSONB;
  new_id TEXT;
  today TEXT;
  tomorrow TEXT;
  lead_log JSONB;
BEGIN
  -- ────────────────────────────────────────────────────────
  -- 1. Extract location identifier from the "to" email
  --    e.g. "leads-deerfield@parse.k9operations.com" → "deerfield"
  --    or   "deerfield@parse.k9operations.com" → "deerfield"
  -- ────────────────────────────────────────────────────────
  loc_slug := '';

  -- Extract email address from "to" field (handle "Name <email>" format)
  DECLARE
    email_addr TEXT;
    local_part TEXT;
  BEGIN
    -- Extract email from angle brackets if present
    IF p_to_email LIKE '%<%>%' THEN
      email_addr := substring(p_to_email FROM '<([^>]+)>');
    ELSE
      email_addr := trim(split_part(p_to_email, ',', 1));
    END IF;

    -- Get local part (before @)
    local_part := lower(split_part(email_addr, '@', 1));

    -- Remove common prefixes: "leads-", "ignite-", etc.
    IF local_part LIKE 'leads-%' THEN
      loc_slug := substring(local_part FROM 7);
    ELSIF local_part LIKE 'ignite-%' THEN
      loc_slug := substring(local_part FROM 8);
    ELSE
      loc_slug := local_part;
    END IF;
  END;

  -- Fallback: use the "profile" field from the Ignite email body
  profile_name := lower(trim(COALESCE(p_fields->>'profile', '')));
  IF loc_slug = '' OR loc_slug IS NULL THEN
    loc_slug := profile_name;
  END IF;

  -- ────────────────────────────────────────────────────────
  -- 2. Find the matching location
  -- ────────────────────────────────────────────────────────
  SELECT id, name, data INTO loc
  FROM locations
  WHERE lower(slug) = loc_slug
  LIMIT 1;

  -- If slug didn't match, try matching against location name
  IF NOT FOUND AND profile_name != '' THEN
    SELECT id, name, data INTO loc
    FROM locations
    WHERE lower(name) LIKE '%' || profile_name || '%'
    LIMIT 1;
  END IF;

  -- If still no match, try slug partial match
  IF NOT FOUND AND loc_slug != '' THEN
    SELECT id, name, data INTO loc
    FROM locations
    WHERE lower(name) LIKE '%' || loc_slug || '%'
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'location_not_found',
      'slug', loc_slug,
      'profile', profile_name
    );
  END IF;

  -- ────────────────────────────────────────────────────────
  -- 3. Normalize client email and phone for deduplication
  -- ────────────────────────────────────────────────────────
  client_email := lower(trim(COALESCE(p_fields->>'email', '')));
  client_phone := regexp_replace(COALESCE(p_fields->>'phone', ''), '\D', '', 'g');

  existing_data := COALESCE(loc.data, '{}'::jsonb);
  clients_arr := COALESCE(existing_data->'clients', '[]'::jsonb);
  leads_arr := COALESCE(existing_data->'igniteLeads', '[]'::jsonb);

  -- ────────────────────────────────────────────────────────
  -- 4. Check for existing client by email or phone
  -- ────────────────────────────────────────────────────────
  SELECT elem INTO existing_client
  FROM jsonb_array_elements(clients_arr) elem
  WHERE (
    client_email != ''
    AND lower(trim(COALESCE(elem->'fields'->>'email', ''))) = client_email
  )
  OR (
    client_phone != ''
    AND length(client_phone) >= 7
    AND regexp_replace(COALESCE(elem->'fields'->>'phone', ''), '\D', '', 'g') = client_phone
  )
  LIMIT 1;

  IF existing_client IS NOT NULL THEN
    -- Log the duplicate
    lead_log := jsonb_build_object(
      'receivedAt', now()::text,
      'firstName', COALESCE(p_fields->>'firstName', ''),
      'lastName', COALESCE(p_fields->>'lastName', ''),
      'email', COALESCE(p_fields->>'email', ''),
      'phone', COALESCE(p_fields->>'phone', ''),
      'source', COALESCE(p_fields->>'source', ''),
      'action', 'duplicate',
      'matchedClientId', existing_client->>'id',
      'leadId', COALESCE(p_fields->>'leadId', '')
    );

    UPDATE locations
    SET data = jsonb_set(
      existing_data,
      '{igniteLeads}',
      leads_arr || jsonb_build_array(lead_log)
    )
    WHERE id = loc.id;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'duplicate',
      'clientId', existing_client->>'id',
      'message', 'Client already exists'
    );
  END IF;

  -- ────────────────────────────────────────────────────────
  -- 5. Create new client
  -- ────────────────────────────────────────────────────────
  new_id := substr(md5(random()::text || clock_timestamp()::text), 1, 9);
  today := to_char(NOW() AT TIME ZONE 'America/New_York', 'YYYY-MM-DD');
  tomorrow := to_char((NOW() AT TIME ZONE 'America/New_York') + INTERVAL '1 day', 'YYYY-MM-DD');

  -- Build notes from Ignite fields
  new_client := jsonb_build_object(
    'id', new_id,
    'fields', jsonb_build_object(
      'first_name', COALESCE(p_fields->>'firstName', ''),
      'last_name', COALESCE(p_fields->>'lastName', ''),
      'email', COALESCE(p_fields->>'email', ''),
      'phone', client_phone,
      'notes', concat_ws(E'\n',
        'Ignite Lead (' || COALESCE(p_fields->>'source', 'unknown source') || ')',
        CASE WHEN COALESCE(p_fields->>'reason', '') != ''
          THEN 'Reason: ' || (p_fields->>'reason') END,
        CASE WHEN COALESCE(p_fields->>'message', '') != ''
          THEN 'Message: ' || (p_fields->>'message') END,
        CASE WHEN COALESCE(p_fields->>'zip', '') != ''
          THEN 'Zip: ' || (p_fields->>'zip') END,
        CASE WHEN COALESCE(p_fields->>'city', '') != '' OR COALESCE(p_fields->>'state', '') != ''
          THEN 'Location: ' || COALESCE(p_fields->>'city', '') || ', ' || COALESCE(p_fields->>'state', '') END
      ),
      'referral_source', 'Ignite'
    ),
    'createdAt', today,
    'agreements', '{}'::jsonb,
    'lifecycle', jsonb_build_object(
      'conversion', jsonb_build_object(
        'notes', '',
        'followUpDate', tomorrow,
        'updates', '[]'::jsonb,
        'source', 'ignite',
        'sourceDate', today,
        'sourceReservationId', ''
      ),
      'retention', jsonb_build_object(
        'notes', '',
        'followUpDate', '',
        'updates', '[]'::jsonb
      ),
      'cold', false,
      'coldDate', '',
      'coldFrom', ''
    ),
    'lifecycleEvents', jsonb_build_array(
      jsonb_build_object(
        'event', 'ignite_lead',
        'date', today,
        'details', 'Auto-imported from Ignite (' || COALESCE(p_fields->>'source', 'unknown') || ')'
      )
    )
  );

  -- ────────────────────────────────────────────────────────
  -- 6. Save: append client + log the lead
  -- ────────────────────────────────────────────────────────
  lead_log := jsonb_build_object(
    'receivedAt', now()::text,
    'firstName', COALESCE(p_fields->>'firstName', ''),
    'lastName', COALESCE(p_fields->>'lastName', ''),
    'email', COALESCE(p_fields->>'email', ''),
    'phone', COALESCE(p_fields->>'phone', ''),
    'source', COALESCE(p_fields->>'source', ''),
    'action', 'created',
    'clientId', new_id,
    'leadId', COALESCE(p_fields->>'leadId', '')
  );

  UPDATE locations
  SET data = jsonb_set(
    jsonb_set(
      existing_data,
      '{clients}',
      clients_arr || jsonb_build_array(new_client)
    ),
    '{igniteLeads}',
    leads_arr || jsonb_build_array(lead_log)
  )
  WHERE id = loc.id;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'created',
    'clientId', new_id,
    'name', COALESCE(p_fields->>'firstName', '') || ' ' || COALESCE(p_fields->>'lastName', '')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

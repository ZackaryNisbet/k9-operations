CREATE OR REPLACE FUNCTION public.resort_upkeep_can_access(p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.labor_has_lite_permission(p_location_id, 'Resort Upkeep Access')
    OR public.labor_has_lite_permission(p_location_id, 'Resort Upkeep Complete')
    OR public.labor_has_lite_permission(p_location_id, 'Resort Upkeep Manage');
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_can_complete(p_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    public.labor_has_lite_permission(p_location_id, 'Resort Upkeep Complete')
    OR public.labor_has_lite_permission(p_location_id, 'Resort Upkeep Manage');
$$;

WITH local_templates_to_restore AS (
  SELECT
    t.id AS template_id,
    t.location_id,
    t.slug,
    previous_version.id AS version_id,
    previous_version.items
  FROM public.resort_upkeep_templates t
  JOIN public.resort_upkeep_template_versions active_version
    ON active_version.id = t.active_version_id
  JOIN LATERAL (
    SELECT v.id, v.items
    FROM public.resort_upkeep_template_versions v
    WHERE v.template_id = t.id
      AND v.status = 'published'
      AND v.id <> t.active_version_id
      AND COALESCE(v.changelog, '') NOT IN (
        'Reconciled task wording against the attached source checklist file.',
        'Repaired active template source wording for open period snapshots.'
      )
    ORDER BY v.version_number DESC, v.published_at DESC NULLS LAST
    LIMIT 1
  ) previous_version ON true
  WHERE t.location_id IS NOT NULL
    AND t.module = 'building_maintenance'
    AND active_version.changelog IN (
      'Reconciled task wording against the attached source checklist file.',
      'Repaired active template source wording for open period snapshots.'
    )
),
restored_templates AS (
  UPDATE public.resort_upkeep_templates t
  SET active_version_id = r.version_id,
      updated_at = now()
  FROM local_templates_to_restore r
  WHERE t.id = r.template_id
  RETURNING r.template_id, r.location_id, r.slug, r.version_id, r.items
)
UPDATE public.resort_upkeep_periods p
SET
  template_id = r.template_id,
  template_version_id = r.version_id,
  items_snapshot = r.items,
  updated_at = now(),
  lock_version = lock_version + 1
FROM restored_templates r
WHERE p.location_id = r.location_id
  AND p.template_slug = r.slug
  AND p.status IN ('open', 'in_progress', 'amending')
  AND p.first_submitted_at IS NULL
  AND (
    p.template_id IS DISTINCT FROM r.template_id
    OR p.template_version_id IS DISTINCT FROM r.version_id
    OR p.items_snapshot IS DISTINCT FROM r.items
  );

CREATE OR REPLACE FUNCTION public.resort_upkeep_save_item_state(
  p_period_id uuid,
  p_item_key text,
  p_checked boolean,
  p_notes text DEFAULT '',
  p_actor_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_period public.resort_upkeep_periods%ROWTYPE;
  v_before public.resort_upkeep_item_states%ROWTYPE;
  v_after public.resort_upkeep_item_states%ROWTYPE;
  v_progress jsonb;
BEGIN
  SELECT *
  INTO v_period
  FROM public.resort_upkeep_periods
  WHERE id = p_period_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checklist period was not found' USING ERRCODE = '22023';
  END IF;

  IF NOT public.resort_upkeep_can_complete(v_period.location_id) THEN
    RAISE EXCEPTION 'Not authorized to update this checklist' USING ERRCODE = '42501';
  END IF;

  IF NOT public.resort_upkeep_period_can_edit(v_period.status, v_period.period_end, v_period.first_submitted_at, CURRENT_DATE) THEN
    RAISE EXCEPTION 'Submitted prior checklist periods are immutable' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_period.items_snapshot) item
    WHERE item->>'key' = p_item_key
  ) THEN
    RAISE EXCEPTION 'Checklist item % is not part of this period', p_item_key USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_before
  FROM public.resort_upkeep_item_states
  WHERE period_id = p_period_id
    AND item_key = p_item_key;

  PERFORM set_config('app.resort_upkeep_rpc_write', 'on', true);

  INSERT INTO public.resort_upkeep_item_states (
    period_id,
    location_id,
    item_key,
    checked,
    notes,
    completed_at,
    completed_by_user_id,
    completed_by_name,
    updated_by_user_id,
    updated_by_name
  )
  VALUES (
    p_period_id,
    v_period.location_id,
    p_item_key,
    COALESCE(p_checked, false),
    COALESCE(p_notes, ''),
    CASE WHEN COALESCE(p_checked, false) THEN now() ELSE NULL END,
    CASE WHEN COALESCE(p_checked, false) THEN auth.uid() ELSE NULL END,
    CASE WHEN COALESCE(p_checked, false) THEN COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email') ELSE NULL END,
    auth.uid(),
    COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email')
  )
  ON CONFLICT (period_id, item_key) DO UPDATE
  SET
    checked = EXCLUDED.checked,
    notes = EXCLUDED.notes,
    completed_at = CASE WHEN EXCLUDED.checked THEN COALESCE(public.resort_upkeep_item_states.completed_at, EXCLUDED.completed_at, now()) ELSE NULL END,
    completed_by_user_id = CASE WHEN EXCLUDED.checked THEN COALESCE(public.resort_upkeep_item_states.completed_by_user_id, auth.uid()) ELSE NULL END,
    completed_by_name = CASE WHEN EXCLUDED.checked THEN COALESCE(public.resort_upkeep_item_states.completed_by_name, COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email')) ELSE NULL END,
    updated_by_user_id = auth.uid(),
    updated_by_name = COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email'),
    updated_at = now()
  RETURNING * INTO v_after;

  UPDATE public.resort_upkeep_periods
  SET
    status = CASE
      WHEN status IN ('submitted', 'late_submitted') THEN 'amending'::public.resort_upkeep_period_status
      WHEN status = 'open' THEN 'in_progress'::public.resort_upkeep_period_status
      ELSE status
    END,
    lock_version = lock_version + 1
  WHERE id = p_period_id
  RETURNING * INTO v_period;

  v_progress := public.resort_upkeep_period_progress(p_period_id);

  INSERT INTO public.resort_upkeep_audit_events (
    location_id,
    entity_type,
    entity_id,
    event_type,
    summary,
    actor_user_id,
    actor_name,
    before_snapshot,
    after_snapshot,
    metadata
  )
  VALUES (
    v_period.location_id,
    'resort_upkeep_item_state',
    v_after.id,
    CASE WHEN v_period.status = 'amending' THEN 'post_submit_item_changed' ELSE 'item_changed' END,
    'Checklist item updated',
    auth.uid(),
    COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email'),
    CASE WHEN v_before.id IS NULL THEN NULL ELSE to_jsonb(v_before) END,
    to_jsonb(v_after),
    jsonb_build_object('period_id', p_period_id, 'item_key', p_item_key, 'progress', v_progress)
  );

  RETURN jsonb_build_object(
    'period', to_jsonb(v_period),
    'itemState', to_jsonb(v_after),
    'progress', v_progress,
    'computedStatus', public.resort_upkeep_computed_status(v_period.status, v_period.due_date, v_period.period_end, v_progress, CURRENT_DATE),
    'canEdit', public.resort_upkeep_period_can_edit(v_period.status, v_period.period_end, v_period.first_submitted_at, CURRENT_DATE),
    'canReopen', public.resort_upkeep_period_can_reopen(v_period.status, v_period.period_end, CURRENT_DATE)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_submit_period(
  p_period_id uuid,
  p_actor_name text DEFAULT NULL,
  p_note text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_period public.resort_upkeep_periods%ROWTYPE;
  v_before public.resort_upkeep_periods%ROWTYPE;
  v_progress jsonb;
  v_status public.resort_upkeep_period_status;
BEGIN
  SELECT *
  INTO v_period
  FROM public.resort_upkeep_periods
  WHERE id = p_period_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checklist period was not found' USING ERRCODE = '22023';
  END IF;

  IF NOT public.resort_upkeep_can_complete(v_period.location_id) THEN
    RAISE EXCEPTION 'Not authorized to submit this checklist' USING ERRCODE = '42501';
  END IF;

  IF v_period.first_submitted_at IS NOT NULL
    AND CURRENT_DATE > v_period.period_end
  THEN
    RAISE EXCEPTION 'Submitted prior checklist periods are immutable' USING ERRCODE = '42501';
  END IF;

  IF v_period.status IN ('submitted', 'late_submitted') THEN
    RAISE EXCEPTION 'Checklist is already submitted. Use Make edits before submitting another revision.' USING ERRCODE = '22023';
  END IF;

  v_progress := public.resort_upkeep_period_progress(p_period_id);
  IF NOT COALESCE((v_progress->>'isComplete')::boolean, false) THEN
    RAISE EXCEPTION 'Checklist cannot be submitted until all required items are complete' USING ERRCODE = '22023';
  END IF;

  v_before := v_period;
  v_status := CASE WHEN CURRENT_DATE > v_period.due_date THEN 'late_submitted'::public.resort_upkeep_period_status ELSE 'submitted'::public.resort_upkeep_period_status END;

  PERFORM set_config('app.resort_upkeep_rpc_write', 'on', true);

  UPDATE public.resort_upkeep_periods
  SET
    status = v_status,
    first_submitted_at = COALESCE(first_submitted_at, now()),
    last_submitted_at = now(),
    submitted_by_user_id = auth.uid(),
    submitted_by_name = COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email'),
    completed_late = completed_late OR CURRENT_DATE > due_date,
    revision_number = revision_number + 1,
    lock_version = lock_version + 1,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('last_submit_note', COALESCE(p_note, ''))
  WHERE id = p_period_id
  RETURNING * INTO v_period;

  INSERT INTO public.resort_upkeep_audit_events (
    location_id,
    entity_type,
    entity_id,
    event_type,
    summary,
    actor_user_id,
    actor_name,
    before_snapshot,
    after_snapshot,
    metadata
  )
  VALUES (
    v_period.location_id,
    'resort_upkeep_period',
    v_period.id,
    CASE WHEN v_period.revision_number > 1 THEN 'period_resubmitted' ELSE 'period_submitted' END,
    CASE WHEN v_status = 'late_submitted' THEN 'Checklist submitted late' ELSE 'Checklist submitted' END,
    auth.uid(),
    COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email'),
    to_jsonb(v_before),
    to_jsonb(v_period),
    jsonb_build_object('progress', v_progress, 'note', COALESCE(p_note, ''))
  );

  RETURN jsonb_build_object(
    'period', to_jsonb(v_period),
    'progress', v_progress,
    'computedStatus', public.resort_upkeep_computed_status(v_period.status, v_period.due_date, v_period.period_end, v_progress, CURRENT_DATE),
    'canEdit', public.resort_upkeep_period_can_edit(v_period.status, v_period.period_end, v_period.first_submitted_at, CURRENT_DATE),
    'canReopen', public.resort_upkeep_period_can_reopen(v_period.status, v_period.period_end, CURRENT_DATE)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_save_vendor(
  p_vendor jsonb,
  p_actor_name text DEFAULT NULL
)
RETURNS public.resort_upkeep_vendors
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := NULLIF(p_vendor->>'id', '')::uuid;
  v_location_id uuid := NULLIF(p_vendor->>'location_id', '')::uuid;
  v_existing public.resort_upkeep_vendors%ROWTYPE;
  v_vendor public.resort_upkeep_vendors%ROWTYPE;
  v_actor_name text := COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email');
  v_business_name text := trim(COALESCE(p_vendor->>'business_name', ''));
  v_has_contract boolean := COALESCE(NULLIF(p_vendor->>'has_contract', '')::boolean, false);
  v_contact_info jsonb := CASE WHEN jsonb_typeof(p_vendor->'contact_info') = 'array' THEN p_vendor->'contact_info' ELSE '[]'::jsonb END;
  v_metadata jsonb := CASE WHEN jsonb_typeof(p_vendor->'metadata') = 'object' THEN p_vendor->'metadata' ELSE '{}'::jsonb END;
BEGIN
  PERFORM set_config('app.resort_upkeep_rpc_write', 'on', true);

  IF v_id IS NOT NULL THEN
    SELECT *
    INTO v_existing
    FROM public.resort_upkeep_vendors
    WHERE id = v_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Vendor was not found' USING ERRCODE = '22023';
    END IF;

    IF v_location_id IS NOT NULL AND v_location_id <> v_existing.location_id THEN
      RAISE EXCEPTION 'Vendor location cannot be changed' USING ERRCODE = '42501';
    END IF;

    v_location_id := v_existing.location_id;
  END IF;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'location_id is required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.resort_upkeep_can_manage(v_location_id) THEN
    RAISE EXCEPTION 'Not authorized to save this vendor' USING ERRCODE = '42501';
  END IF;

  IF v_business_name = '' THEN
    RAISE EXCEPTION 'Business name is required' USING ERRCODE = '22023';
  END IF;

  IF v_has_contract AND v_id IS NULL THEN
    RAISE EXCEPTION 'Contract upload is required before marking a new vendor contract on file' USING ERRCODE = '22023';
  END IF;

  IF v_has_contract AND v_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.resort_upkeep_attachments a
    WHERE a.vendor_id = v_id
      AND a.location_id = v_location_id
      AND a.attachment_scope = 'vendor_contract'
      AND a.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Contract upload is required before marking this vendor contract on file' USING ERRCODE = '22023';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.resort_upkeep_vendors (
      location_id,
      business_name,
      business_address,
      address_line_1,
      address_line_2,
      address_city,
      address_state,
      address_postal_code,
      address_country,
      google_place_id,
      website,
      has_contract,
      contract_effective_start,
      contract_effective_end,
      contact_info,
      notes,
      metadata,
      created_by_user_id,
      created_by_name,
      updated_by_user_id,
      updated_by_name
    )
    VALUES (
      v_location_id,
      v_business_name,
      NULLIF(p_vendor->>'business_address', ''),
      NULLIF(p_vendor->>'address_line_1', ''),
      NULLIF(p_vendor->>'address_line_2', ''),
      NULLIF(p_vendor->>'address_city', ''),
      NULLIF(p_vendor->>'address_state', ''),
      NULLIF(p_vendor->>'address_postal_code', ''),
      COALESCE(NULLIF(p_vendor->>'address_country', ''), 'US'),
      NULLIF(p_vendor->>'google_place_id', ''),
      NULLIF(p_vendor->>'website', ''),
      v_has_contract,
      NULLIF(p_vendor->>'contract_effective_start', '')::date,
      NULLIF(p_vendor->>'contract_effective_end', '')::date,
      v_contact_info,
      COALESCE(p_vendor->>'notes', ''),
      v_metadata,
      auth.uid(),
      v_actor_name,
      auth.uid(),
      v_actor_name
    )
    RETURNING * INTO v_vendor;
  ELSE
    UPDATE public.resort_upkeep_vendors
    SET
      business_name = v_business_name,
      business_address = NULLIF(p_vendor->>'business_address', ''),
      address_line_1 = NULLIF(p_vendor->>'address_line_1', ''),
      address_line_2 = NULLIF(p_vendor->>'address_line_2', ''),
      address_city = NULLIF(p_vendor->>'address_city', ''),
      address_state = NULLIF(p_vendor->>'address_state', ''),
      address_postal_code = NULLIF(p_vendor->>'address_postal_code', ''),
      address_country = COALESCE(NULLIF(p_vendor->>'address_country', ''), 'US'),
      google_place_id = NULLIF(p_vendor->>'google_place_id', ''),
      website = NULLIF(p_vendor->>'website', ''),
      has_contract = v_has_contract,
      contract_effective_start = NULLIF(p_vendor->>'contract_effective_start', '')::date,
      contract_effective_end = NULLIF(p_vendor->>'contract_effective_end', '')::date,
      contact_info = v_contact_info,
      notes = COALESCE(p_vendor->>'notes', ''),
      metadata = v_metadata,
      updated_by_user_id = auth.uid(),
      updated_by_name = v_actor_name,
      updated_at = now()
    WHERE id = v_id
    RETURNING * INTO v_vendor;
  END IF;

  RETURN v_vendor;
END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_add_vendor_log(
  p_log jsonb,
  p_actor_name text DEFAULT NULL
)
RETURNS public.resort_upkeep_vendor_logs
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_vendor_id uuid := NULLIF(p_log->>'vendor_id', '')::uuid;
  v_location_id uuid := NULLIF(p_log->>'location_id', '')::uuid;
  v_vendor public.resort_upkeep_vendors%ROWTYPE;
  v_log public.resort_upkeep_vendor_logs%ROWTYPE;
  v_actor_name text := COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email');
  v_summary text := trim(COALESCE(p_log->>'summary', ''));
  v_metadata jsonb := CASE WHEN jsonb_typeof(p_log->'metadata') = 'object' THEN p_log->'metadata' ELSE '{}'::jsonb END;
BEGIN
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'vendor_id is required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_vendor
  FROM public.resort_upkeep_vendors
  WHERE id = v_vendor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor was not found' USING ERRCODE = '22023';
  END IF;

  IF v_location_id IS NOT NULL AND v_location_id <> v_vendor.location_id THEN
    RAISE EXCEPTION 'Vendor log location does not match vendor' USING ERRCODE = '42501';
  END IF;

  v_location_id := v_vendor.location_id;

  IF NOT public.resort_upkeep_can_manage(v_location_id) THEN
    RAISE EXCEPTION 'Not authorized to add vendor logs' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.resort_upkeep_rpc_write', 'on', true);

  INSERT INTO public.resort_upkeep_vendor_logs (
    location_id,
    vendor_id,
    log_date,
    summary,
    notes,
    created_by_user_id,
    created_by_name,
    metadata
  )
  VALUES (
    v_location_id,
    v_vendor_id,
    COALESCE(NULLIF(p_log->>'log_date', '')::date, CURRENT_DATE),
    COALESCE(NULLIF(v_summary, ''), 'Vendor development'),
    COALESCE(p_log->>'notes', ''),
    auth.uid(),
    v_actor_name,
    v_metadata
  )
  RETURNING * INTO v_log;

  RETURN v_log;
END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_save_license(
  p_license jsonb,
  p_actor_name text DEFAULT NULL
)
RETURNS public.resort_upkeep_licenses
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := NULLIF(p_license->>'id', '')::uuid;
  v_location_id uuid := NULLIF(p_license->>'location_id', '')::uuid;
  v_existing public.resort_upkeep_licenses%ROWTYPE;
  v_license public.resort_upkeep_licenses%ROWTYPE;
  v_actor_name text := COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email');
  v_requirement_name text := trim(COALESCE(p_license->>'requirement_name', ''));
  v_status public.resort_upkeep_compliance_status := COALESCE(NULLIF(p_license->>'status', '')::public.resort_upkeep_compliance_status, 'non_compliant'::public.resort_upkeep_compliance_status);
  v_contact_info jsonb := CASE WHEN jsonb_typeof(p_license->'contact_info') = 'array' THEN p_license->'contact_info' ELSE '[]'::jsonb END;
  v_website_links jsonb := CASE WHEN jsonb_typeof(p_license->'website_links') = 'array' THEN p_license->'website_links' ELSE '[]'::jsonb END;
  v_metadata jsonb := CASE WHEN jsonb_typeof(p_license->'metadata') = 'object' THEN p_license->'metadata' ELSE '{}'::jsonb END;
BEGIN
  PERFORM set_config('app.resort_upkeep_rpc_write', 'on', true);

  IF v_id IS NOT NULL THEN
    SELECT *
    INTO v_existing
    FROM public.resort_upkeep_licenses
    WHERE id = v_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'License was not found' USING ERRCODE = '22023';
    END IF;

    IF v_location_id IS NOT NULL AND v_location_id <> v_existing.location_id THEN
      RAISE EXCEPTION 'License location cannot be changed' USING ERRCODE = '42501';
    END IF;

    v_location_id := v_existing.location_id;
  END IF;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'location_id is required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.resort_upkeep_can_manage(v_location_id) THEN
    RAISE EXCEPTION 'Not authorized to save this license' USING ERRCODE = '42501';
  END IF;

  IF v_requirement_name = '' THEN
    RAISE EXCEPTION 'Requirement name is required' USING ERRCODE = '22023';
  END IF;

  IF v_status = 'compliant' AND v_id IS NULL THEN
    RAISE EXCEPTION 'Proof of compliance must be uploaded before marking a new license compliant' USING ERRCODE = '22023';
  END IF;

  IF v_status = 'compliant' AND v_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.resort_upkeep_attachments a
    WHERE a.license_id = v_id
      AND a.location_id = v_location_id
      AND a.attachment_scope = 'license_evidence'
      AND a.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Proof of compliance must be uploaded before marking this license compliant' USING ERRCODE = '22023';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.resort_upkeep_licenses (
      location_id,
      requirement_name,
      issuing_organization,
      contact_info,
      website_links,
      status,
      expiration_date,
      cadence_months,
      next_expected_date,
      notes,
      metadata,
      created_by_user_id,
      created_by_name,
      updated_by_user_id,
      updated_by_name
    )
    VALUES (
      v_location_id,
      v_requirement_name,
      NULLIF(p_license->>'issuing_organization', ''),
      v_contact_info,
      v_website_links,
      v_status,
      NULLIF(p_license->>'expiration_date', '')::date,
      NULLIF(p_license->>'cadence_months', '')::integer,
      NULLIF(p_license->>'next_expected_date', '')::date,
      COALESCE(p_license->>'notes', ''),
      v_metadata,
      auth.uid(),
      v_actor_name,
      auth.uid(),
      v_actor_name
    )
    RETURNING * INTO v_license;
  ELSE
    UPDATE public.resort_upkeep_licenses
    SET
      requirement_name = v_requirement_name,
      issuing_organization = NULLIF(p_license->>'issuing_organization', ''),
      contact_info = v_contact_info,
      website_links = v_website_links,
      status = v_status,
      expiration_date = NULLIF(p_license->>'expiration_date', '')::date,
      cadence_months = NULLIF(p_license->>'cadence_months', '')::integer,
      next_expected_date = NULLIF(p_license->>'next_expected_date', '')::date,
      notes = COALESCE(p_license->>'notes', ''),
      metadata = v_metadata,
      updated_by_user_id = auth.uid(),
      updated_by_name = v_actor_name,
      updated_at = now()
    WHERE id = v_id
    RETURNING * INTO v_license;
  END IF;

  RETURN v_license;
END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_add_license_log(
  p_log jsonb,
  p_actor_name text DEFAULT NULL
)
RETURNS public.resort_upkeep_license_logs
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_license_id uuid := NULLIF(p_log->>'license_id', '')::uuid;
  v_location_id uuid := NULLIF(p_log->>'location_id', '')::uuid;
  v_license public.resort_upkeep_licenses%ROWTYPE;
  v_log public.resort_upkeep_license_logs%ROWTYPE;
  v_actor_name text := COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email');
  v_summary text := trim(COALESCE(p_log->>'summary', ''));
  v_status public.resort_upkeep_compliance_status := NULLIF(p_log->>'status_snapshot', '')::public.resort_upkeep_compliance_status;
  v_metadata jsonb := CASE WHEN jsonb_typeof(p_log->'metadata') = 'object' THEN p_log->'metadata' ELSE '{}'::jsonb END;
BEGIN
  IF v_license_id IS NULL THEN
    RAISE EXCEPTION 'license_id is required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_license
  FROM public.resort_upkeep_licenses
  WHERE id = v_license_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'License was not found' USING ERRCODE = '22023';
  END IF;

  IF v_location_id IS NOT NULL AND v_location_id <> v_license.location_id THEN
    RAISE EXCEPTION 'License log location does not match license' USING ERRCODE = '42501';
  END IF;

  v_location_id := v_license.location_id;

  IF NOT public.resort_upkeep_can_manage(v_location_id) THEN
    RAISE EXCEPTION 'Not authorized to add license logs' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.resort_upkeep_rpc_write', 'on', true);

  INSERT INTO public.resort_upkeep_license_logs (
    location_id,
    license_id,
    log_date,
    summary,
    notes,
    status_snapshot,
    created_by_user_id,
    created_by_name,
    metadata
  )
  VALUES (
    v_location_id,
    v_license_id,
    COALESCE(NULLIF(p_log->>'log_date', '')::date, CURRENT_DATE),
    COALESCE(NULLIF(v_summary, ''), 'License development'),
    COALESCE(p_log->>'notes', ''),
    v_status,
    auth.uid(),
    v_actor_name,
    v_metadata
  )
  RETURNING * INTO v_log;

  RETURN v_log;
END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_record_attachment(
  p_attachment jsonb,
  p_actor_name text DEFAULT NULL
)
RETURNS public.resort_upkeep_attachments
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_location_id uuid := NULLIF(p_attachment->>'location_id', '')::uuid;
  v_attachment public.resort_upkeep_attachments%ROWTYPE;
  v_actor_name text := COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email');
  v_storage_bucket text := COALESCE(NULLIF(p_attachment->>'storage_bucket', ''), 'resort-upkeep-attachments');
  v_storage_path text := NULLIF(p_attachment->>'storage_path', '');
  v_attachment_scope text := COALESCE(NULLIF(p_attachment->>'attachment_scope', ''), 'attachment');
  v_period_id uuid := NULLIF(p_attachment->>'period_id', '')::uuid;
  v_item_state_id uuid := NULLIF(p_attachment->>'item_state_id', '')::uuid;
  v_vendor_id uuid := NULLIF(p_attachment->>'vendor_id', '')::uuid;
  v_vendor_log_id uuid := NULLIF(p_attachment->>'vendor_log_id', '')::uuid;
  v_license_id uuid := NULLIF(p_attachment->>'license_id', '')::uuid;
  v_license_log_id uuid := NULLIF(p_attachment->>'license_log_id', '')::uuid;
  v_metadata jsonb := CASE WHEN jsonb_typeof(p_attachment->'metadata') = 'object' THEN p_attachment->'metadata' ELSE '{}'::jsonb END;
  v_is_maintenance_attachment boolean;
BEGIN
  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'location_id is required' USING ERRCODE = '22023';
  END IF;

  v_is_maintenance_attachment :=
    v_attachment_scope IN ('maintenance_item_photo', 'maintenance_item_attachment')
    AND v_period_id IS NOT NULL
    AND v_item_state_id IS NOT NULL
    AND v_vendor_id IS NULL
    AND v_vendor_log_id IS NULL
    AND v_license_id IS NULL
    AND v_license_log_id IS NULL;

  IF NOT (
    public.resort_upkeep_can_manage(v_location_id)
    OR (v_is_maintenance_attachment AND public.resort_upkeep_can_complete(v_location_id))
  ) THEN
    RAISE EXCEPTION 'Not authorized to record attachments' USING ERRCODE = '42501';
  END IF;

  IF v_storage_bucket <> 'resort-upkeep-attachments' THEN
    RAISE EXCEPTION 'Invalid Resort Upkeep attachment bucket' USING ERRCODE = '22023';
  END IF;

  IF v_storage_path IS NULL OR split_part(v_storage_path, '/', 1) <> v_location_id::text THEN
    RAISE EXCEPTION 'Attachment path must begin with location_id' USING ERRCODE = '22023';
  END IF;

  IF v_is_maintenance_attachment AND split_part(v_storage_path, '/', 2) <> 'maintenance' THEN
    RAISE EXCEPTION 'Maintenance attachment paths must use the maintenance folder' USING ERRCODE = '22023';
  END IF;

  IF v_attachment_scope IN ('vendor_contract', 'vendor_log_attachment') AND split_part(v_storage_path, '/', 2) <> 'vendors' THEN
    RAISE EXCEPTION 'Vendor attachment paths must use the vendors folder' USING ERRCODE = '22023';
  END IF;

  IF v_attachment_scope IN ('license_evidence', 'license_log_attachment') AND split_part(v_storage_path, '/', 2) <> 'licenses' THEN
    RAISE EXCEPTION 'License attachment paths must use the licenses folder' USING ERRCODE = '22023';
  END IF;

  IF NOT (
    (
      v_attachment_scope IN ('maintenance_item_photo', 'maintenance_item_attachment')
      AND v_period_id IS NOT NULL
      AND v_item_state_id IS NOT NULL
      AND v_vendor_id IS NULL
      AND v_vendor_log_id IS NULL
      AND v_license_id IS NULL
      AND v_license_log_id IS NULL
    )
    OR (
      v_attachment_scope = 'vendor_contract'
      AND v_vendor_id IS NOT NULL
      AND v_period_id IS NULL
      AND v_item_state_id IS NULL
      AND v_vendor_log_id IS NULL
      AND v_license_id IS NULL
      AND v_license_log_id IS NULL
    )
    OR (
      v_attachment_scope = 'vendor_log_attachment'
      AND v_vendor_log_id IS NOT NULL
      AND v_period_id IS NULL
      AND v_item_state_id IS NULL
      AND v_vendor_id IS NULL
      AND v_license_id IS NULL
      AND v_license_log_id IS NULL
    )
    OR (
      v_attachment_scope = 'license_evidence'
      AND v_license_id IS NOT NULL
      AND v_period_id IS NULL
      AND v_item_state_id IS NULL
      AND v_vendor_id IS NULL
      AND v_vendor_log_id IS NULL
      AND v_license_log_id IS NULL
    )
    OR (
      v_attachment_scope = 'license_log_attachment'
      AND v_license_log_id IS NOT NULL
      AND v_period_id IS NULL
      AND v_item_state_id IS NULL
      AND v_vendor_id IS NULL
      AND v_vendor_log_id IS NULL
      AND v_license_id IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Attachment scope does not match exactly one supported parent entity' USING ERRCODE = '22023';
  END IF;

  IF v_period_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.resort_upkeep_periods p WHERE p.id = v_period_id AND p.location_id = v_location_id) THEN
    RAISE EXCEPTION 'Attachment period does not match location' USING ERRCODE = '42501';
  END IF;

  IF v_item_state_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.resort_upkeep_item_states s
    WHERE s.id = v_item_state_id
      AND s.location_id = v_location_id
      AND (v_period_id IS NULL OR s.period_id = v_period_id)
  ) THEN
    RAISE EXCEPTION 'Attachment item state does not match location' USING ERRCODE = '42501';
  END IF;

  IF v_is_maintenance_attachment AND NOT EXISTS (
    SELECT 1
    FROM public.resort_upkeep_periods p
    WHERE p.id = v_period_id
      AND p.location_id = v_location_id
      AND public.resort_upkeep_period_can_edit(p.status, p.period_end, p.first_submitted_at, CURRENT_DATE)
  ) THEN
    RAISE EXCEPTION 'Maintenance attachments cannot be added to locked checklist periods' USING ERRCODE = '42501';
  END IF;

  IF v_vendor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.resort_upkeep_vendors v WHERE v.id = v_vendor_id AND v.location_id = v_location_id) THEN
    RAISE EXCEPTION 'Attachment vendor does not match location' USING ERRCODE = '42501';
  END IF;

  IF v_vendor_log_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.resort_upkeep_vendor_logs vl WHERE vl.id = v_vendor_log_id AND vl.location_id = v_location_id AND (v_vendor_id IS NULL OR vl.vendor_id = v_vendor_id)) THEN
    RAISE EXCEPTION 'Attachment vendor log does not match location' USING ERRCODE = '42501';
  END IF;

  IF v_license_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.resort_upkeep_licenses l WHERE l.id = v_license_id AND l.location_id = v_location_id) THEN
    RAISE EXCEPTION 'Attachment license does not match location' USING ERRCODE = '42501';
  END IF;

  IF v_license_log_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.resort_upkeep_license_logs ll WHERE ll.id = v_license_log_id AND ll.location_id = v_location_id AND (v_license_id IS NULL OR ll.license_id = v_license_id)) THEN
    RAISE EXCEPTION 'Attachment license log does not match location' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.resort_upkeep_rpc_write', 'on', true);

  INSERT INTO public.resort_upkeep_attachments (
    location_id,
    attachment_scope,
    period_id,
    item_state_id,
    vendor_id,
    vendor_log_id,
    license_id,
    license_log_id,
    file_name,
    storage_bucket,
    storage_path,
    mime_type,
    file_size_bytes,
    uploaded_by_user_id,
    uploaded_by_name,
    metadata
  )
  VALUES (
    v_location_id,
    v_attachment_scope,
    v_period_id,
    v_item_state_id,
    v_vendor_id,
    v_vendor_log_id,
    v_license_id,
    v_license_log_id,
    COALESCE(NULLIF(p_attachment->>'file_name', ''), 'attachment'),
    v_storage_bucket,
    v_storage_path,
    COALESCE(NULLIF(p_attachment->>'mime_type', ''), 'application/octet-stream'),
    NULLIF(p_attachment->>'file_size_bytes', '')::bigint,
    auth.uid(),
    v_actor_name,
    v_metadata
  )
  RETURNING * INTO v_attachment;

  RETURN v_attachment;
END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_archive_vendor(
  p_vendor_id uuid,
  p_reason text DEFAULT '',
  p_actor_name text DEFAULT NULL
)
RETURNS public.resort_upkeep_vendors
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_vendor public.resort_upkeep_vendors%ROWTYPE;
BEGIN
  PERFORM set_config('app.resort_upkeep_rpc_write', 'on', true);

  SELECT *
  INTO v_vendor
  FROM public.resort_upkeep_vendors
  WHERE id = p_vendor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor was not found' USING ERRCODE = '22023';
  END IF;

  IF NOT public.resort_upkeep_can_manage(v_vendor.location_id) THEN
    RAISE EXCEPTION 'Not authorized to archive this vendor' USING ERRCODE = '42501';
  END IF;

  UPDATE public.resort_upkeep_vendors
  SET
    is_archived = true,
    archived_at = now(),
    archived_by_user_id = auth.uid(),
    archived_by_name = COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email'),
    archive_reason = NULLIF(p_reason, ''),
    updated_by_user_id = auth.uid(),
    updated_by_name = COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email'),
    notes = trim(concat_ws(E'\n', NULLIF(notes, ''), NULLIF('Archive note: ' || COALESCE(p_reason, ''), 'Archive note: '))),
    updated_at = now()
  WHERE id = p_vendor_id
  RETURNING * INTO v_vendor;

  RETURN v_vendor;
END;
$$;

CREATE OR REPLACE FUNCTION public.resort_upkeep_deactivate_license(
  p_license_id uuid,
  p_reason text DEFAULT '',
  p_actor_name text DEFAULT NULL
)
RETURNS public.resort_upkeep_licenses
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_license public.resort_upkeep_licenses%ROWTYPE;
BEGIN
  PERFORM set_config('app.resort_upkeep_rpc_write', 'on', true);

  SELECT *
  INTO v_license
  FROM public.resort_upkeep_licenses
  WHERE id = p_license_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'License was not found' USING ERRCODE = '22023';
  END IF;

  IF NOT public.resort_upkeep_can_manage(v_license.location_id) THEN
    RAISE EXCEPTION 'Not authorized to deactivate this license' USING ERRCODE = '42501';
  END IF;

  UPDATE public.resort_upkeep_licenses
  SET
    is_active = false,
    deactivated_at = now(),
    deactivated_by_user_id = auth.uid(),
    deactivated_by_name = COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email'),
    deactivate_reason = NULLIF(p_reason, ''),
    updated_by_user_id = auth.uid(),
    updated_by_name = COALESCE(NULLIF(p_actor_name, ''), auth.jwt() ->> 'email'),
    notes = trim(concat_ws(E'\n', NULLIF(notes, ''), NULLIF('Deactivation note: ' || COALESCE(p_reason, ''), 'Deactivation note: '))),
    updated_at = now()
  WHERE id = p_license_id
  RETURNING * INTO v_license;

  RETURN v_license;
END;
$$;

DROP POLICY IF EXISTS resort_upkeep_item_states_write ON public.resort_upkeep_item_states;
CREATE POLICY resort_upkeep_item_states_write ON public.resort_upkeep_item_states
  FOR INSERT
  WITH CHECK (
    current_setting('app.resort_upkeep_rpc_write', true) = 'on'
    AND public.resort_upkeep_can_complete(location_id)
    AND EXISTS (
      SELECT 1
      FROM public.resort_upkeep_periods p
      WHERE p.id = resort_upkeep_item_states.period_id
        AND p.location_id = resort_upkeep_item_states.location_id
    )
  );

DROP POLICY IF EXISTS resort_upkeep_item_states_update ON public.resort_upkeep_item_states;
CREATE POLICY resort_upkeep_item_states_update ON public.resort_upkeep_item_states
  FOR UPDATE
  USING (
    current_setting('app.resort_upkeep_rpc_write', true) = 'on'
    AND public.resort_upkeep_can_complete(location_id)
  )
  WITH CHECK (
    current_setting('app.resort_upkeep_rpc_write', true) = 'on'
    AND public.resort_upkeep_can_complete(location_id)
    AND EXISTS (
      SELECT 1
      FROM public.resort_upkeep_periods p
      WHERE p.id = resort_upkeep_item_states.period_id
        AND p.location_id = resort_upkeep_item_states.location_id
    )
  );

DROP POLICY IF EXISTS resort_upkeep_vendors_write ON public.resort_upkeep_vendors;
CREATE POLICY resort_upkeep_vendors_write ON public.resort_upkeep_vendors
  FOR INSERT
  WITH CHECK (
    current_setting('app.resort_upkeep_rpc_write', true) = 'on'
    AND public.resort_upkeep_can_manage(location_id)
  );

DROP POLICY IF EXISTS resort_upkeep_vendors_update ON public.resort_upkeep_vendors;
CREATE POLICY resort_upkeep_vendors_update ON public.resort_upkeep_vendors
  FOR UPDATE
  USING (
    current_setting('app.resort_upkeep_rpc_write', true) = 'on'
    AND public.resort_upkeep_can_manage(location_id)
  )
  WITH CHECK (
    current_setting('app.resort_upkeep_rpc_write', true) = 'on'
    AND public.resort_upkeep_can_manage(location_id)
  );

DROP POLICY IF EXISTS resort_upkeep_vendor_logs_write ON public.resort_upkeep_vendor_logs;
CREATE POLICY resort_upkeep_vendor_logs_write ON public.resort_upkeep_vendor_logs
  FOR INSERT
  WITH CHECK (
    current_setting('app.resort_upkeep_rpc_write', true) = 'on'
    AND public.resort_upkeep_can_manage(location_id)
    AND EXISTS (
      SELECT 1
      FROM public.resort_upkeep_vendors v
      WHERE v.id = resort_upkeep_vendor_logs.vendor_id
        AND v.location_id = resort_upkeep_vendor_logs.location_id
    )
  );

DROP POLICY IF EXISTS resort_upkeep_licenses_write ON public.resort_upkeep_licenses;
CREATE POLICY resort_upkeep_licenses_write ON public.resort_upkeep_licenses
  FOR INSERT
  WITH CHECK (
    current_setting('app.resort_upkeep_rpc_write', true) = 'on'
    AND public.resort_upkeep_can_manage(location_id)
  );

DROP POLICY IF EXISTS resort_upkeep_licenses_update ON public.resort_upkeep_licenses;
CREATE POLICY resort_upkeep_licenses_update ON public.resort_upkeep_licenses
  FOR UPDATE
  USING (
    current_setting('app.resort_upkeep_rpc_write', true) = 'on'
    AND public.resort_upkeep_can_manage(location_id)
  )
  WITH CHECK (
    current_setting('app.resort_upkeep_rpc_write', true) = 'on'
    AND public.resort_upkeep_can_manage(location_id)
  );

DROP POLICY IF EXISTS resort_upkeep_license_logs_write ON public.resort_upkeep_license_logs;
CREATE POLICY resort_upkeep_license_logs_write ON public.resort_upkeep_license_logs
  FOR INSERT
  WITH CHECK (
    current_setting('app.resort_upkeep_rpc_write', true) = 'on'
    AND public.resort_upkeep_can_manage(location_id)
    AND EXISTS (
      SELECT 1
      FROM public.resort_upkeep_licenses l
      WHERE l.id = resort_upkeep_license_logs.license_id
        AND l.location_id = resort_upkeep_license_logs.location_id
    )
  );

DROP POLICY IF EXISTS resort_upkeep_attachments_insert ON public.resort_upkeep_attachments;
CREATE POLICY resort_upkeep_attachments_insert ON public.resort_upkeep_attachments
  FOR INSERT
  WITH CHECK (
    current_setting('app.resort_upkeep_rpc_write', true) = 'on'
    AND storage_bucket = 'resort-upkeep-attachments'
    AND split_part(storage_path, '/', 1) = location_id::text
    AND (
      public.resort_upkeep_can_manage(location_id)
      OR (
        public.resort_upkeep_can_complete(location_id)
        AND attachment_scope IN ('maintenance_item_photo', 'maintenance_item_attachment')
        AND period_id IS NOT NULL
        AND item_state_id IS NOT NULL
        AND vendor_id IS NULL
        AND vendor_log_id IS NULL
        AND license_id IS NULL
        AND license_log_id IS NULL
        AND split_part(storage_path, '/', 2) = 'maintenance'
        AND EXISTS (
          SELECT 1
          FROM public.resort_upkeep_periods p
          WHERE p.id = resort_upkeep_attachments.period_id
            AND p.location_id = resort_upkeep_attachments.location_id
            AND public.resort_upkeep_period_can_edit(p.status, p.period_end, p.first_submitted_at, CURRENT_DATE)
        )
      )
    )
    AND (
      (
        attachment_scope IN ('maintenance_item_photo', 'maintenance_item_attachment')
        AND period_id IS NOT NULL
        AND item_state_id IS NOT NULL
        AND vendor_id IS NULL
        AND vendor_log_id IS NULL
        AND license_id IS NULL
        AND license_log_id IS NULL
        AND split_part(storage_path, '/', 2) = 'maintenance'
        AND EXISTS (
          SELECT 1
          FROM public.resort_upkeep_periods p
          WHERE p.id = resort_upkeep_attachments.period_id
            AND p.location_id = resort_upkeep_attachments.location_id
            AND public.resort_upkeep_period_can_edit(p.status, p.period_end, p.first_submitted_at, CURRENT_DATE)
        )
      )
      OR (
        attachment_scope = 'vendor_contract'
        AND vendor_id IS NOT NULL
        AND split_part(storage_path, '/', 2) = 'vendors'
        AND period_id IS NULL
        AND item_state_id IS NULL
        AND vendor_log_id IS NULL
        AND license_id IS NULL
        AND license_log_id IS NULL
      )
      OR (
        attachment_scope = 'vendor_log_attachment'
        AND vendor_log_id IS NOT NULL
        AND split_part(storage_path, '/', 2) = 'vendors'
        AND period_id IS NULL
        AND item_state_id IS NULL
        AND vendor_id IS NULL
        AND license_id IS NULL
        AND license_log_id IS NULL
      )
      OR (
        attachment_scope = 'license_evidence'
        AND license_id IS NOT NULL
        AND split_part(storage_path, '/', 2) = 'licenses'
        AND period_id IS NULL
        AND item_state_id IS NULL
        AND vendor_id IS NULL
        AND vendor_log_id IS NULL
        AND license_log_id IS NULL
      )
      OR (
        attachment_scope = 'license_log_attachment'
        AND license_log_id IS NOT NULL
        AND split_part(storage_path, '/', 2) = 'licenses'
        AND period_id IS NULL
        AND item_state_id IS NULL
        AND vendor_id IS NULL
        AND vendor_log_id IS NULL
        AND license_id IS NULL
      )
    )
    AND (period_id IS NULL OR EXISTS (SELECT 1 FROM public.resort_upkeep_periods p WHERE p.id = resort_upkeep_attachments.period_id AND p.location_id = resort_upkeep_attachments.location_id))
    AND (item_state_id IS NULL OR EXISTS (SELECT 1 FROM public.resort_upkeep_item_states s WHERE s.id = resort_upkeep_attachments.item_state_id AND s.location_id = resort_upkeep_attachments.location_id AND (resort_upkeep_attachments.period_id IS NULL OR s.period_id = resort_upkeep_attachments.period_id)))
    AND (vendor_id IS NULL OR EXISTS (SELECT 1 FROM public.resort_upkeep_vendors v WHERE v.id = resort_upkeep_attachments.vendor_id AND v.location_id = resort_upkeep_attachments.location_id))
    AND (vendor_log_id IS NULL OR EXISTS (SELECT 1 FROM public.resort_upkeep_vendor_logs vl WHERE vl.id = resort_upkeep_attachments.vendor_log_id AND vl.location_id = resort_upkeep_attachments.location_id AND (resort_upkeep_attachments.vendor_id IS NULL OR vl.vendor_id = resort_upkeep_attachments.vendor_id)))
    AND (license_id IS NULL OR EXISTS (SELECT 1 FROM public.resort_upkeep_licenses l WHERE l.id = resort_upkeep_attachments.license_id AND l.location_id = resort_upkeep_attachments.location_id))
    AND (license_log_id IS NULL OR EXISTS (SELECT 1 FROM public.resort_upkeep_license_logs ll WHERE ll.id = resort_upkeep_attachments.license_log_id AND ll.location_id = resort_upkeep_attachments.location_id AND (resort_upkeep_attachments.license_id IS NULL OR ll.license_id = resort_upkeep_attachments.license_id)))
  );

DROP POLICY IF EXISTS resort_upkeep_attachments_update ON public.resort_upkeep_attachments;
CREATE POLICY resort_upkeep_attachments_update ON public.resort_upkeep_attachments
  FOR UPDATE
  USING (
    current_setting('app.resort_upkeep_rpc_write', true) = 'on'
    AND storage_bucket = 'resort-upkeep-attachments'
    AND split_part(storage_path, '/', 1) = location_id::text
    AND (
      public.resort_upkeep_can_manage(location_id)
      OR (
        public.resort_upkeep_can_complete(location_id)
        AND attachment_scope IN ('maintenance_item_photo', 'maintenance_item_attachment')
        AND period_id IS NOT NULL
        AND item_state_id IS NOT NULL
        AND vendor_id IS NULL
        AND vendor_log_id IS NULL
        AND license_id IS NULL
        AND license_log_id IS NULL
        AND split_part(storage_path, '/', 2) = 'maintenance'
        AND EXISTS (
          SELECT 1
          FROM public.resort_upkeep_periods p
          WHERE p.id = resort_upkeep_attachments.period_id
            AND p.location_id = resort_upkeep_attachments.location_id
            AND public.resort_upkeep_period_can_edit(p.status, p.period_end, p.first_submitted_at, CURRENT_DATE)
        )
      )
    )
    AND (
      (
        attachment_scope IN ('maintenance_item_photo', 'maintenance_item_attachment')
        AND period_id IS NOT NULL
        AND item_state_id IS NOT NULL
        AND vendor_id IS NULL
        AND vendor_log_id IS NULL
        AND license_id IS NULL
        AND license_log_id IS NULL
        AND split_part(storage_path, '/', 2) = 'maintenance'
        AND EXISTS (
          SELECT 1
          FROM public.resort_upkeep_periods p
          WHERE p.id = resort_upkeep_attachments.period_id
            AND p.location_id = resort_upkeep_attachments.location_id
            AND public.resort_upkeep_period_can_edit(p.status, p.period_end, p.first_submitted_at, CURRENT_DATE)
        )
      )
      OR (
        attachment_scope = 'vendor_contract'
        AND vendor_id IS NOT NULL
        AND split_part(storage_path, '/', 2) = 'vendors'
        AND period_id IS NULL
        AND item_state_id IS NULL
        AND vendor_log_id IS NULL
        AND license_id IS NULL
        AND license_log_id IS NULL
      )
      OR (
        attachment_scope = 'vendor_log_attachment'
        AND vendor_log_id IS NOT NULL
        AND split_part(storage_path, '/', 2) = 'vendors'
        AND period_id IS NULL
        AND item_state_id IS NULL
        AND vendor_id IS NULL
        AND license_id IS NULL
        AND license_log_id IS NULL
      )
      OR (
        attachment_scope = 'license_evidence'
        AND license_id IS NOT NULL
        AND split_part(storage_path, '/', 2) = 'licenses'
        AND period_id IS NULL
        AND item_state_id IS NULL
        AND vendor_id IS NULL
        AND vendor_log_id IS NULL
        AND license_log_id IS NULL
      )
      OR (
        attachment_scope = 'license_log_attachment'
        AND license_log_id IS NOT NULL
        AND split_part(storage_path, '/', 2) = 'licenses'
        AND period_id IS NULL
        AND item_state_id IS NULL
        AND vendor_id IS NULL
        AND vendor_log_id IS NULL
        AND license_id IS NULL
      )
    )
  )
  WITH CHECK (
    current_setting('app.resort_upkeep_rpc_write', true) = 'on'
    AND storage_bucket = 'resort-upkeep-attachments'
    AND split_part(storage_path, '/', 1) = location_id::text
    AND (
      public.resort_upkeep_can_manage(location_id)
      OR (
        public.resort_upkeep_can_complete(location_id)
        AND attachment_scope IN ('maintenance_item_photo', 'maintenance_item_attachment')
        AND period_id IS NOT NULL
        AND item_state_id IS NOT NULL
        AND vendor_id IS NULL
        AND vendor_log_id IS NULL
        AND license_id IS NULL
        AND license_log_id IS NULL
        AND split_part(storage_path, '/', 2) = 'maintenance'
        AND EXISTS (
          SELECT 1
          FROM public.resort_upkeep_periods p
          WHERE p.id = resort_upkeep_attachments.period_id
            AND p.location_id = resort_upkeep_attachments.location_id
            AND public.resort_upkeep_period_can_edit(p.status, p.period_end, p.first_submitted_at, CURRENT_DATE)
        )
      )
    )
    AND (
      (
        attachment_scope IN ('maintenance_item_photo', 'maintenance_item_attachment')
        AND period_id IS NOT NULL
        AND item_state_id IS NOT NULL
        AND vendor_id IS NULL
        AND vendor_log_id IS NULL
        AND license_id IS NULL
        AND license_log_id IS NULL
        AND split_part(storage_path, '/', 2) = 'maintenance'
        AND EXISTS (
          SELECT 1
          FROM public.resort_upkeep_periods p
          WHERE p.id = resort_upkeep_attachments.period_id
            AND p.location_id = resort_upkeep_attachments.location_id
            AND public.resort_upkeep_period_can_edit(p.status, p.period_end, p.first_submitted_at, CURRENT_DATE)
        )
      )
      OR (
        attachment_scope = 'vendor_contract'
        AND vendor_id IS NOT NULL
        AND split_part(storage_path, '/', 2) = 'vendors'
        AND period_id IS NULL
        AND item_state_id IS NULL
        AND vendor_log_id IS NULL
        AND license_id IS NULL
        AND license_log_id IS NULL
      )
      OR (
        attachment_scope = 'vendor_log_attachment'
        AND vendor_log_id IS NOT NULL
        AND split_part(storage_path, '/', 2) = 'vendors'
        AND period_id IS NULL
        AND item_state_id IS NULL
        AND vendor_id IS NULL
        AND license_id IS NULL
        AND license_log_id IS NULL
      )
      OR (
        attachment_scope = 'license_evidence'
        AND license_id IS NOT NULL
        AND split_part(storage_path, '/', 2) = 'licenses'
        AND period_id IS NULL
        AND item_state_id IS NULL
        AND vendor_id IS NULL
        AND vendor_log_id IS NULL
        AND license_log_id IS NULL
      )
      OR (
        attachment_scope = 'license_log_attachment'
        AND license_log_id IS NOT NULL
        AND split_part(storage_path, '/', 2) = 'licenses'
        AND period_id IS NULL
        AND item_state_id IS NULL
        AND vendor_id IS NULL
        AND vendor_log_id IS NULL
        AND license_id IS NULL
      )
    )
    AND (period_id IS NULL OR EXISTS (SELECT 1 FROM public.resort_upkeep_periods p WHERE p.id = resort_upkeep_attachments.period_id AND p.location_id = resort_upkeep_attachments.location_id))
    AND (item_state_id IS NULL OR EXISTS (SELECT 1 FROM public.resort_upkeep_item_states s WHERE s.id = resort_upkeep_attachments.item_state_id AND s.location_id = resort_upkeep_attachments.location_id AND (resort_upkeep_attachments.period_id IS NULL OR s.period_id = resort_upkeep_attachments.period_id)))
    AND (vendor_id IS NULL OR EXISTS (SELECT 1 FROM public.resort_upkeep_vendors v WHERE v.id = resort_upkeep_attachments.vendor_id AND v.location_id = resort_upkeep_attachments.location_id))
    AND (vendor_log_id IS NULL OR EXISTS (SELECT 1 FROM public.resort_upkeep_vendor_logs vl WHERE vl.id = resort_upkeep_attachments.vendor_log_id AND vl.location_id = resort_upkeep_attachments.location_id AND (resort_upkeep_attachments.vendor_id IS NULL OR vl.vendor_id = resort_upkeep_attachments.vendor_id)))
    AND (license_id IS NULL OR EXISTS (SELECT 1 FROM public.resort_upkeep_licenses l WHERE l.id = resort_upkeep_attachments.license_id AND l.location_id = resort_upkeep_attachments.location_id))
    AND (license_log_id IS NULL OR EXISTS (SELECT 1 FROM public.resort_upkeep_license_logs ll WHERE ll.id = resort_upkeep_attachments.license_log_id AND ll.location_id = resort_upkeep_attachments.location_id AND (resort_upkeep_attachments.license_id IS NULL OR ll.license_id = resort_upkeep_attachments.license_id)))
  );

REVOKE ALL ON FUNCTION public.labor_lite_role_has_default_permission(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.labor_has_lite_permission(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_can_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_can_complete(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_can_manage(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_has_any_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_touch_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_period_bounds(public.resort_upkeep_frequency, integer, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_period_can_edit(public.resort_upkeep_period_status, date, timestamptz, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_period_can_reopen(public.resort_upkeep_period_status, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_ensure_period(uuid, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_ensure_period_window(uuid, text, date, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_period_progress(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_computed_status(public.resort_upkeep_period_status, date, date, jsonb, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_get_dashboard(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_list_periods(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_get_period_snapshot(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_save_item_state(uuid, text, boolean, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_submit_period(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_reopen_period(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_publish_template_version(uuid, uuid, jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_publish_template_version(uuid, uuid, jsonb, text, text, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_save_vendor(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_add_vendor_log(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_archive_vendor(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_save_license(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_add_license_log(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_deactivate_license(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resort_upkeep_record_attachment(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.labor_lite_role_has_default_permission(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.labor_has_lite_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_can_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_can_complete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_can_manage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_has_any_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_period_bounds(public.resort_upkeep_frequency, integer, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_period_can_edit(public.resort_upkeep_period_status, date, timestamptz, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_period_can_reopen(public.resort_upkeep_period_status, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_ensure_period(uuid, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_ensure_period_window(uuid, text, date, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_period_progress(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_computed_status(public.resort_upkeep_period_status, date, date, jsonb, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_get_dashboard(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_list_periods(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_get_period_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_save_item_state(uuid, text, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_submit_period(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_reopen_period(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_publish_template_version(uuid, uuid, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_publish_template_version(uuid, uuid, jsonb, text, text, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_save_vendor(jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_add_vendor_log(jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_archive_vendor(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_save_license(jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_add_license_log(jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_deactivate_license(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resort_upkeep_record_attachment(jsonb, text) TO authenticated;

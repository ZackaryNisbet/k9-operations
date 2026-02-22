-- Enterprise Package Push RPC
-- SECURITY DEFINER bypasses RLS so enterprise admins can write packages to any child location
-- Run this in your Supabase SQL Editor

CREATE OR REPLACE FUNCTION push_enterprise_package(
  p_pkg JSONB,
  p_location_id UUID
)
RETURNS JSONB AS $$
DECLARE
  existing_count INT;
  ent_source_id TEXT;
BEGIN
  -- Only allow owners/enterprise_admin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'enterprise_admin')) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Only enterprise admins can push packages');
  END IF;

  -- Check if already pushed (avoid duplicates)
  ent_source_id := p_pkg->>'enterpriseSourceId';
  IF ent_source_id IS NOT NULL THEN
    SELECT COUNT(*) INTO existing_count
    FROM k9_packages
    WHERE location_id = p_location_id
      AND fields->>'enterpriseSourceId' = ent_source_id;
    IF existing_count > 0 THEN
      RETURN jsonb_build_object('success', false, 'message', 'Package already pushed to this location');
    END IF;
  END IF;

  -- Insert the package
  INSERT INTO k9_packages (
    id, location_id, name, description,
    service_category, service_name, quantity,
    package_price, retail_value, unit_price,
    savings, savings_per_unit,
    discount_pct, discount_dollar,
    expiration_type, expiration_days,
    available_online, fields
  ) VALUES (
    p_pkg->>'id',
    p_location_id,
    p_pkg->>'name',
    p_pkg->>'description',
    p_pkg->>'serviceCategory',
    p_pkg->>'serviceName',
    (p_pkg->>'quantity')::INT,
    (p_pkg->>'packagePrice')::DECIMAL,
    (p_pkg->>'retailValue')::DECIMAL,
    (p_pkg->>'unitRate')::DECIMAL,
    (p_pkg->>'savings')::DECIMAL,
    (p_pkg->>'savingsPerUnit')::DECIMAL,
    CASE WHEN p_pkg->>'discountType' = 'percent' THEN (p_pkg->>'discountValue')::DECIMAL ELSE NULL END,
    CASE WHEN p_pkg->>'discountType' = 'fixed' THEN (p_pkg->>'discountValue')::DECIMAL ELSE NULL END,
    p_pkg->>'expirationType',
    (p_pkg->>'expirationDays')::INT,
    COALESCE((p_pkg->>'availableOnline')::BOOLEAN, false),
    p_pkg
  );

  RETURN jsonb_build_object('success', true, 'message', 'Package pushed successfully');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

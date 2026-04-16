-- ============================================================================
-- K9 Operations Lite — Permissions, Checklist Templates, Settings Tables
-- ============================================================================
-- Run in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================================

-- ─── lite_permissions ─────────────────────────────────────────────────────────
-- Stores per-role permission overrides for the Lite app.
-- Default permissions come from the LEAN_PERMISSION_MATRIX in code;
-- rows here override those defaults.
-- ============================================================================
CREATE TABLE IF NOT EXISTS lite_permissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id     TEXT,                                     -- NULL = global default
  role_id         TEXT NOT NULL,                            -- 'pct', 'csr', 'supervisor', 'manager', 'location_admin', 'enterprise_admin'
  permission_key  TEXT NOT NULL,                            -- e.g. 'Operations Hub', 'Customer Lifecycle', etc.
  granted         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(role_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_lite_permissions_role     ON lite_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_lite_permissions_location ON lite_permissions(location_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_lite_permissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lite_permissions_updated_at ON lite_permissions;
CREATE TRIGGER trg_lite_permissions_updated_at
  BEFORE UPDATE ON lite_permissions
  FOR EACH ROW EXECUTE FUNCTION update_lite_permissions_updated_at();


-- ─── lite_checklist_templates ─────────────────────────────────────────────────
-- Stores customized checklist templates (opening, fe, be, closing).
-- Each row = one template for one location. If no row exists, the app
-- falls back to DEF_*_TEMPLATE constants in code.
-- ============================================================================
CREATE TABLE IF NOT EXISTS lite_checklist_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id     TEXT NOT NULL,                            -- e.g. 'cherry-hill'
  template_type   TEXT NOT NULL,                            -- 'opening', 'fe', 'be', 'closing'
  template_name   TEXT,                                     -- Custom display name (optional)
  items           JSONB NOT NULL DEFAULT '[]'::jsonb,       -- [{id, label, time?, dayOfWeek?}]
  updated_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(location_id, template_type)
);

CREATE INDEX IF NOT EXISTS idx_lite_checklist_templates_location ON lite_checklist_templates(location_id);
CREATE INDEX IF NOT EXISTS idx_lite_checklist_templates_type     ON lite_checklist_templates(template_type);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_lite_checklist_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lite_checklist_templates_updated_at ON lite_checklist_templates;
CREATE TRIGGER trg_lite_checklist_templates_updated_at
  BEFORE UPDATE ON lite_checklist_templates
  FOR EACH ROW EXECUTE FUNCTION update_lite_checklist_templates_updated_at();


-- ─── lite_settings ────────────────────────────────────────────────────────────
-- Key-value store for location-level Lite app settings.
-- Examples: required_fields config, Gingr integration prefs, feature flags.
-- ============================================================================
CREATE TABLE IF NOT EXISTS lite_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id     TEXT NOT NULL,                            -- e.g. 'cherry-hill'
  setting_key     TEXT NOT NULL,                            -- e.g. 'required_fields', 'gingr_sync_interval'
  setting_value   JSONB NOT NULL DEFAULT '{}'::jsonb,       -- flexible JSON value
  updated_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(location_id, setting_key)
);

CREATE INDEX IF NOT EXISTS idx_lite_settings_location ON lite_settings(location_id);
CREATE INDEX IF NOT EXISTS idx_lite_settings_key      ON lite_settings(setting_key);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_lite_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lite_settings_updated_at ON lite_settings;
CREATE TRIGGER trg_lite_settings_updated_at
  BEFORE UPDATE ON lite_settings
  FOR EACH ROW EXECUTE FUNCTION update_lite_settings_updated_at();


-- ─── Row Level Security ───────────────────────────────────────────────────────

-- lite_permissions
ALTER TABLE lite_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lite_permissions_select" ON lite_permissions;
CREATE POLICY lite_permissions_select ON lite_permissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM lite_profiles
      WHERE user_id = auth.uid() AND is_active = TRUE
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS "lite_permissions_insert" ON lite_permissions;
CREATE POLICY lite_permissions_insert ON lite_permissions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM lite_profiles
      WHERE user_id = auth.uid() AND role IN ('location_admin', 'enterprise_admin') AND is_active = TRUE
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS "lite_permissions_update" ON lite_permissions;
CREATE POLICY lite_permissions_update ON lite_permissions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM lite_profiles
      WHERE user_id = auth.uid() AND role IN ('location_admin', 'enterprise_admin') AND is_active = TRUE
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS "lite_permissions_delete" ON lite_permissions;
CREATE POLICY lite_permissions_delete ON lite_permissions
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM lite_profiles
      WHERE user_id = auth.uid() AND role = 'enterprise_admin' AND is_active = TRUE
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );


-- lite_checklist_templates
ALTER TABLE lite_checklist_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lite_checklist_templates_select" ON lite_checklist_templates;
CREATE POLICY lite_checklist_templates_select ON lite_checklist_templates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM lite_profiles
      WHERE user_id = auth.uid() AND (location_id = lite_checklist_templates.location_id OR role = 'enterprise_admin') AND is_active = TRUE
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS "lite_checklist_templates_insert" ON lite_checklist_templates;
CREATE POLICY lite_checklist_templates_insert ON lite_checklist_templates
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM lite_profiles
      WHERE user_id = auth.uid() AND (location_id = lite_checklist_templates.location_id OR role = 'enterprise_admin')
        AND role IN ('manager', 'location_admin', 'enterprise_admin') AND is_active = TRUE
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS "lite_checklist_templates_update" ON lite_checklist_templates;
CREATE POLICY lite_checklist_templates_update ON lite_checklist_templates
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM lite_profiles
      WHERE user_id = auth.uid() AND (location_id = lite_checklist_templates.location_id OR role = 'enterprise_admin')
        AND role IN ('manager', 'location_admin', 'enterprise_admin') AND is_active = TRUE
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS "lite_checklist_templates_delete" ON lite_checklist_templates;
CREATE POLICY lite_checklist_templates_delete ON lite_checklist_templates
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM lite_profiles
      WHERE user_id = auth.uid() AND role IN ('location_admin', 'enterprise_admin') AND is_active = TRUE
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );


-- lite_settings
ALTER TABLE lite_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lite_settings_select" ON lite_settings;
CREATE POLICY lite_settings_select ON lite_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM lite_profiles
      WHERE user_id = auth.uid() AND (location_id = lite_settings.location_id OR role = 'enterprise_admin') AND is_active = TRUE
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS "lite_settings_insert" ON lite_settings;
CREATE POLICY lite_settings_insert ON lite_settings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM lite_profiles
      WHERE user_id = auth.uid() AND (location_id = lite_settings.location_id OR role = 'enterprise_admin')
        AND role IN ('manager', 'location_admin', 'enterprise_admin') AND is_active = TRUE
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS "lite_settings_update" ON lite_settings;
CREATE POLICY lite_settings_update ON lite_settings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM lite_profiles
      WHERE user_id = auth.uid() AND (location_id = lite_settings.location_id OR role = 'enterprise_admin')
        AND role IN ('manager', 'location_admin', 'enterprise_admin') AND is_active = TRUE
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

DROP POLICY IF EXISTS "lite_settings_delete" ON lite_settings;
CREATE POLICY lite_settings_delete ON lite_settings
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM lite_profiles
      WHERE user_id = auth.uid() AND role IN ('location_admin', 'enterprise_admin') AND is_active = TRUE
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'role_owner')
    )
  );

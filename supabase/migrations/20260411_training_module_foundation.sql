-- Training Module Foundation — Wave 1
-- Creates enums, template tables, record tables, notes, signatures, and events.
-- Follows schema: k9_training_module_schema_v1.md

-- ─── Enums ──────────────────────────────────────────────────────────────────

CREATE TYPE training_template_class AS ENUM (
  'training_plan',
  'written_certification',
  'live_evaluation',
  'competency_guide',
  'master_dependency_checklist'
);

CREATE TYPE training_template_status AS ENUM (
  'draft',
  'published',
  'archived'
);

CREATE TYPE training_section_type AS ENUM (
  'header',
  'phase',
  'day',
  'module',
  'written_exam',
  'live_eval',
  'checklist',
  'signoff',
  'dependency_group',
  'supporting_doc'
);

CREATE TYPE training_item_type AS ENUM (
  'checkbox',
  'task',
  'question_single_choice',
  'question_multi_select',
  'free_text',
  'observation_check',
  'signoff',
  'attachment',
  'scenario_prompt',
  'status_gate'
);

CREATE TYPE training_completion_mode AS ENUM (
  'complete_only',
  'pass_fail',
  'observe_participate_demonstrate',
  'score_based',
  'dependency_rollup'
);

CREATE TYPE training_record_status AS ENUM (
  'not_started',
  'in_progress',
  'complete',
  'passed',
  'failed',
  'needs_follow_up',
  'retest_required',
  'archived'
);

CREATE TYPE training_item_status AS ENUM (
  'not_started',
  'in_progress',
  'complete',
  'passed',
  'failed',
  'needs_coaching',
  'blocked',
  'waived'
);

CREATE TYPE training_skill_stage AS ENUM (
  'observe',
  'participate',
  'demonstrate',
  'certified'
);

CREATE TYPE training_dependency_type AS ENUM (
  'internal_template_completion',
  'internal_template_pass',
  'external_certificate_upload',
  'manager_approval'
);

CREATE TYPE training_signature_role AS ENUM (
  'employee',
  'trainer',
  'evaluator',
  'manager'
);

CREATE TYPE training_signature_mode AS ENUM (
  'typed_name'
);

CREATE TYPE training_attachment_type AS ENUM (
  'supporting_document',
  'external_certificate',
  'item_evidence'
);

CREATE TYPE training_event_type AS ENUM (
  'record_created',
  'item_status_changed',
  'item_scored',
  'note_added',
  'attachment_added',
  'signature_added',
  'dependency_evaluated',
  'record_completed',
  'record_reopened'
);

-- ─── 1) training_templates ──────────────────────────────────────────────────

CREATE TABLE training_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  template_class training_template_class NOT NULL,
  role_scopes text[] NOT NULL DEFAULT '{}'::text[],
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  updated_by_user_id uuid,
  CONSTRAINT training_templates_slug_unique UNIQUE (slug)
);

CREATE INDEX idx_training_templates_class_active ON training_templates (template_class, is_active);
CREATE INDEX idx_training_templates_location_active ON training_templates (location_id, is_active);

-- ─── 2) training_template_versions ──────────────────────────────────────────

CREATE TABLE training_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES training_templates(id) ON DELETE RESTRICT,
  version_no integer NOT NULL,
  status training_template_status NOT NULL DEFAULT 'draft',
  is_current boolean NOT NULL DEFAULT false,
  source_seed_key text,
  source_packet text,
  changelog text,
  published_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  published_at timestamptz,
  archived_at timestamptz,
  CONSTRAINT training_tv_template_version_unique UNIQUE (template_id, version_no)
);

CREATE UNIQUE INDEX idx_training_tv_current ON training_template_versions (template_id) WHERE is_current = true;
CREATE INDEX idx_training_tv_template_status ON training_template_versions (template_id, status);

-- ─── 3) training_template_sections ──────────────────────────────────────────

CREATE TABLE training_template_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_version_id uuid NOT NULL REFERENCES training_template_versions(id) ON DELETE RESTRICT,
  parent_section_id uuid REFERENCES training_template_sections(id) ON DELETE SET NULL,
  section_key text NOT NULL,
  title text NOT NULL,
  section_type training_section_type NOT NULL,
  sequence_order integer NOT NULL,
  day_number integer,
  phase_name text,
  time_block_start time,
  time_block_end time,
  time_block_note text,
  completion_mode training_completion_mode,
  instructions text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT training_ts_version_key_unique UNIQUE (template_version_id, section_key)
);

CREATE INDEX idx_training_ts_order ON training_template_sections (template_version_id, parent_section_id, sequence_order);

-- ─── 4) training_template_items ─────────────────────────────────────────────

CREATE TABLE training_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_version_id uuid NOT NULL REFERENCES training_template_versions(id) ON DELETE RESTRICT,
  template_section_id uuid NOT NULL REFERENCES training_template_sections(id) ON DELETE RESTRICT,
  item_key text NOT NULL,
  label text NOT NULL,
  description text,
  item_type training_item_type NOT NULL,
  sequence_order integer NOT NULL,
  required boolean NOT NULL DEFAULT true,
  safety_sensitive boolean NOT NULL DEFAULT false,
  completion_mode training_completion_mode NOT NULL DEFAULT 'complete_only',
  answer_options jsonb,
  correct_answer jsonb,
  expected_response text,
  requires_attachment boolean NOT NULL DEFAULT false,
  linked_template_id uuid REFERENCES training_templates(id) ON DELETE SET NULL,
  policy_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT training_ti_version_key_unique UNIQUE (template_version_id, item_key)
);

CREATE INDEX idx_training_ti_section_order ON training_template_items (template_section_id, sequence_order);
CREATE INDEX idx_training_ti_version_type ON training_template_items (template_version_id, item_type);

-- ─── 5) training_template_dependencies ──────────────────────────────────────

CREATE TABLE training_template_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_version_id uuid NOT NULL REFERENCES training_template_versions(id) ON DELETE RESTRICT,
  template_item_id uuid REFERENCES training_template_items(id) ON DELETE SET NULL,
  dependency_type training_dependency_type NOT NULL,
  required_template_id uuid REFERENCES training_templates(id) ON DELETE SET NULL,
  required_external_name text,
  required_attachment_type training_attachment_type,
  required_record_status training_record_status,
  requirement_rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  sequence_order integer NOT NULL DEFAULT 0,
  is_required boolean NOT NULL DEFAULT true
);

CREATE INDEX idx_training_td_version_order ON training_template_dependencies (template_version_id, sequence_order);
CREATE INDEX idx_training_td_item ON training_template_dependencies (template_item_id);

-- ─── 6) training_records ────────────────────────────────────────────────────

CREATE TABLE training_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES training_templates(id) ON DELETE RESTRICT,
  template_version_id uuid NOT NULL REFERENCES training_template_versions(id) ON DELETE RESTRICT,
  template_name_snapshot text NOT NULL,
  template_class_snapshot training_template_class NOT NULL,
  employee_id uuid,
  employee_name_first text,
  employee_name_last text,
  employee_full_name text NOT NULL,
  target_role text NOT NULL,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  hire_date date,
  training_start_date date,
  target_end_date date,
  actual_completion_date date,
  assigned_trainer_user_id uuid,
  assigned_trainer_name text,
  assigned_manager_user_id uuid,
  assigned_manager_name text,
  overall_status training_record_status NOT NULL DEFAULT 'not_started',
  progress_percent numeric(5,2) NOT NULL DEFAULT 0,
  required_item_count integer NOT NULL DEFAULT 0,
  required_item_completed_count integer NOT NULL DEFAULT 0,
  manager_approved boolean NOT NULL DEFAULT false,
  is_locked boolean NOT NULL DEFAULT false,
  template_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  updated_by_user_id uuid
);

CREATE INDEX idx_training_records_location_status ON training_records (location_id, overall_status);
CREATE INDEX idx_training_records_template ON training_records (template_id, created_at DESC);
CREATE INDEX idx_training_records_employee ON training_records (employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX idx_training_records_due ON training_records (target_end_date) WHERE overall_status IN ('not_started', 'in_progress', 'needs_follow_up', 'retest_required');

-- ─── 7) training_record_item_results ────────────────────────────────────────

CREATE TABLE training_record_item_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES training_records(id) ON DELETE CASCADE,
  template_item_id uuid NOT NULL REFERENCES training_template_items(id) ON DELETE RESTRICT,
  template_section_id uuid NOT NULL REFERENCES training_template_sections(id) ON DELETE RESTRICT,
  status training_item_status NOT NULL DEFAULT 'not_started',
  stage training_skill_stage,
  score numeric(5,2),
  passed boolean,
  selected_answers jsonb,
  free_text_response text,
  evaluated_by_user_id uuid,
  evaluated_by_name text,
  completed_by_user_id uuid,
  completed_by_name text,
  completed_at timestamptz,
  signed_off_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_rir_record_item_unique UNIQUE (record_id, template_item_id)
);

CREATE INDEX idx_training_rir_record_section ON training_record_item_results (record_id, template_section_id, status);
CREATE INDEX idx_training_rir_record_status ON training_record_item_results (record_id, status);

-- ─── 8) training_record_notes ───────────────────────────────────────────────

CREATE TABLE training_record_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES training_records(id) ON DELETE CASCADE,
  template_section_id uuid REFERENCES training_template_sections(id) ON DELETE SET NULL,
  template_item_id uuid REFERENCES training_template_items(id) ON DELETE SET NULL,
  note_text text NOT NULL,
  initials text NOT NULL,
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_notes_record ON training_record_notes (record_id, created_at DESC);

-- ─── 9) training_signatures ─────────────────────────────────────────────────

CREATE TABLE training_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES training_records(id) ON DELETE CASCADE,
  template_item_id uuid REFERENCES training_template_items(id) ON DELETE SET NULL,
  signature_role training_signature_role NOT NULL,
  signature_mode training_signature_mode NOT NULL DEFAULT 'typed_name',
  signer_user_id uuid,
  signer_name text NOT NULL,
  signer_title text,
  signature_text text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  note_text text,
  revoked_at timestamptz
);

CREATE INDEX idx_training_sig_record ON training_signatures (record_id, signed_at DESC);
CREATE INDEX idx_training_sig_record_role ON training_signatures (record_id, signature_role);

-- ─── 10) training_record_attachments ────────────────────────────────────────

CREATE TABLE training_record_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES training_records(id) ON DELETE CASCADE,
  template_item_id uuid REFERENCES training_template_items(id) ON DELETE SET NULL,
  attachment_type training_attachment_type NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'training',
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  byte_size bigint,
  checksum_sha256 text,
  uploaded_by_user_id uuid,
  uploaded_by_name text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  verified_by_user_id uuid,
  verified_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT training_att_bucket_path_unique UNIQUE (storage_bucket, storage_path)
);

CREATE INDEX idx_training_att_record ON training_record_attachments (record_id, uploaded_at DESC);

-- ─── 11) training_record_events ─────────────────────────────────────────────

CREATE TABLE training_record_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES training_records(id) ON DELETE CASCADE,
  template_item_id uuid REFERENCES training_template_items(id) ON DELETE SET NULL,
  event_type training_event_type NOT NULL,
  actor_user_id uuid,
  actor_name text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_events_record ON training_record_events (record_id, created_at DESC);

-- ─── updated_at triggers ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION training_updated_at_trigger()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_training_templates_updated
  BEFORE UPDATE ON training_templates
  FOR EACH ROW EXECUTE FUNCTION training_updated_at_trigger();

CREATE TRIGGER trg_training_records_updated
  BEFORE UPDATE ON training_records
  FOR EACH ROW EXECUTE FUNCTION training_updated_at_trigger();

CREATE TRIGGER trg_training_rir_updated
  BEFORE UPDATE ON training_record_item_results
  FOR EACH ROW EXECUTE FUNCTION training_updated_at_trigger();

-- ─── RLS policies (permissive v1 — tighten in wave 2) ──────────────────────

ALTER TABLE training_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_template_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_template_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_record_item_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_record_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_record_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_record_events ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all training template data
CREATE POLICY training_templates_read ON training_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY training_tv_read ON training_template_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY training_ts_read ON training_template_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY training_ti_read ON training_template_items FOR SELECT TO authenticated USING (true);
CREATE POLICY training_td_read ON training_template_dependencies FOR SELECT TO authenticated USING (true);

-- Authenticated users can read/write training records for their location
CREATE POLICY training_records_read ON training_records FOR SELECT TO authenticated USING (true);
CREATE POLICY training_records_insert ON training_records FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY training_records_update ON training_records FOR UPDATE TO authenticated USING (true);

CREATE POLICY training_rir_read ON training_record_item_results FOR SELECT TO authenticated USING (true);
CREATE POLICY training_rir_insert ON training_record_item_results FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY training_rir_update ON training_record_item_results FOR UPDATE TO authenticated USING (true);

CREATE POLICY training_notes_read ON training_record_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY training_notes_insert ON training_record_notes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY training_sig_read ON training_signatures FOR SELECT TO authenticated USING (true);
CREATE POLICY training_sig_insert ON training_signatures FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY training_att_read ON training_record_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY training_att_insert ON training_record_attachments FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY training_events_read ON training_record_events FOR SELECT TO authenticated USING (true);
CREATE POLICY training_events_insert ON training_record_events FOR INSERT TO authenticated WITH CHECK (true);

-- Admin write policies for templates
CREATE POLICY training_templates_write ON training_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY training_tv_write ON training_template_versions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY training_ts_write ON training_template_sections FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY training_ti_write ON training_template_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY training_td_write ON training_template_dependencies FOR ALL TO authenticated USING (true) WITH CHECK (true);

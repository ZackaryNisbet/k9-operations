import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../../supabase/migrations/20260525050000_labor_compliance_policy_spine.sql", import.meta.url),
  "utf8"
);
const reviewEvidenceSql = readFileSync(
  new URL("../../supabase/migrations/20260525113005_labor_review_evidence_completion.sql", import.meta.url),
  "utf8"
);
const uploadRlsSql = readFileSync(
  new URL("../../supabase/migrations/20260526160513_compliance_evidence_upload_rls.sql", import.meta.url),
  "utf8"
);
const reviewWaiverCleanupSql = readFileSync(
  new URL("../../supabase/migrations/20260526180700_complete_review_clears_waiver_state.sql", import.meta.url),
  "utf8"
);
const reviewWaiverRepairSql = readFileSync(
  new URL("../../supabase/migrations/20260526181930_repair_completed_review_waiver_state.sql", import.meta.url),
  "utf8"
);

describe("labor compliance policy spine migration", () => {
  it("creates scoped dynamic policy tables instead of global hardcoded requirements", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.labor_compliance_requirements");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.labor_compliance_role_applicability");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.labor_compliance_evidence_links");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.labor_compliance_exceptions");
    expect(sql).toContain("requirement_kind IN ('training', 'review_checkpoint')");
    expect(sql).toContain("scope_type IN ('enterprise', 'location')");
    expect(sql).toContain("parent_requirement_id uuid REFERENCES public.labor_compliance_requirements(id)");
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS labor_compliance_requirements_scope_slug_idx");
    expect(sql).not.toMatch(/slug\s+text\s+not\s+null\s+unique/i);
  });

  it("models evidence, renewal due date, column order, and historical cleanup as data", () => {
    expect(sql).toContain("evidence_policy text NOT NULL DEFAULT 'checkbox_only'");
    expect(sql).toContain("evidence_policy IN ('checkbox_only', 'file_required', 'url_or_reference', 'internal_module')");
    expect(sql).toContain("renewal_due_date_required boolean NOT NULL DEFAULT false");
    expect(sql).toContain("due_rule jsonb NOT NULL DEFAULT '{}'::jsonb");
    expect(sql).toContain("display_group text NOT NULL DEFAULT 'training'");
    expect(sql).toContain("display_order integer NOT NULL DEFAULT 0");
    expect(sql).toContain("original_due_date date");
    expect(sql).toContain("exception_kind IN ('historical_cleanup', 'waived', 'not_applicable_override')");
    expect(sql).toContain("CHECK (completed_on IS NULL OR renewal_due_date IS NULL OR renewal_due_date >= completed_on)");
  });

  it("adds server-side permission helpers and resolver RPC contract", () => {
    [
      "labor_compliance_can_view",
      "labor_compliance_can_update_evidence",
      "labor_compliance_can_manage_policy",
      "labor_compliance_can_historical_cleanup",
      "get_labor_compliance_board",
    ].forEach((functionName) => {
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${functionName}`);
    });

    expect(sql).toContain("public.labor_has_lite_permission(p_location_id, 'Labor Compliance View')");
    expect(sql).toContain("public.labor_has_lite_permission(p_location_id, 'Labor Compliance Update Evidence')");
    expect(sql).toContain("public.labor_has_lite_permission(p_location_id, 'Labor Compliance Manage Policy')");
    expect(sql).toContain("public.labor_has_lite_permission(p_location_id, 'Labor Compliance Historical Cleanup')");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.get_labor_compliance_board(uuid, date) FROM PUBLIC");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.get_labor_compliance_board(uuid, date) TO authenticated");
  });

  it("audits policy, evidence, and cleanup mutations with before/after snapshots", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.labor_compliance_audit_events");
    expect(sql).toContain("actor_user_id uuid NOT NULL DEFAULT auth.uid()");
    expect(sql).toContain("before_snapshot jsonb");
    expect(sql).toContain("after_snapshot jsonb");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.audit_labor_compliance_mutation()");
    expect(sql).toContain("INSERT INTO public.labor_compliance_audit_events");
    expect(sql).toContain("trg_labor_compliance_requirements_audit");
    expect(sql).toContain("trg_labor_compliance_evidence_links_audit");
    expect(sql).toContain("trg_labor_compliance_exceptions_audit");
  });

  it("guards location overrides and evidence writes against malformed or foreign policy rows", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.validate_labor_compliance_requirement_parent()");
    expect(sql).toContain("location override parent must be an enterprise requirement");
    expect(sql).toContain("location override requirement_kind must match parent requirement_kind");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.labor_compliance_requirement_matches_employee_location");
    expect(sql).toContain("public.labor_compliance_requirement_matches_employee_location(labor_employee_id, requirement_id)");
    expect(sql).toContain("exception_kind <> 'historical_cleanup' OR original_due_date IS NOT NULL");
    expect(sql).toContain("superseded_at timestamptz");
    expect(sql).not.toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.labor_compliance_exceptions TO authenticated");
  });

  it("seeds K9's current defaults as configurable rows, not active rendering constants", () => {
    [
      "franchisor_training_guide",
      "dog_cpr",
      "ppbc_level_1",
      "ppbc_level_2",
      "review_30_day",
      "review_60_day",
      "review_90_day",
    ].forEach((slug) => {
      expect(sql).toContain(slug);
    });

    expect(sql).toContain("'Supervisor'");
    expect(sql).toContain("'Assistant Manager'");
    expect(sql).toContain("'General Manager'");
    expect(sql).toContain("'renewal_due_date_required', true");
    expect(sql).toContain("'file_required'");
    expect(sql).toContain("'offset_days', 30");
    expect(sql).toContain("'offset_days', 60");
    expect(sql).toContain("'offset_days', 90");
  });

  it("requires local review evidence before completing policy-backed review checkpoints", () => {
    expect(reviewEvidenceSql).toContain("DROP FUNCTION IF EXISTS public.complete_employee_review_instance(uuid, uuid, text)");
    expect(reviewEvidenceSql).toContain("p_labor_employee_document_id uuid DEFAULT NULL");
    expect(reviewEvidenceSql).toContain("Review completion requires a local evidence PDF");
    expect(reviewEvidenceSql).toContain("document_type <> 'performance_review_evidence'");
    expect(reviewEvidenceSql).toContain("INSERT INTO public.labor_compliance_evidence_links");
    expect(reviewEvidenceSql).toContain("'employee_review_instances'");
    expect(reviewEvidenceSql).toContain("'completion_evidence'");
    expect(reviewEvidenceSql).toContain("GRANT EXECUTE ON FUNCTION public.complete_employee_review_instance(uuid, uuid, text, uuid, date) TO authenticated");
  });

  it("clears waiver state when a review checkpoint is completed after being waived", () => {
    expect(reviewWaiverCleanupSql).toContain("CREATE OR REPLACE FUNCTION public.complete_employee_review_instance");
    expect(reviewWaiverCleanupSql).toContain("UPDATE public.labor_compliance_exceptions");
    expect(reviewWaiverCleanupSql).toContain("AND superseded_at IS NULL");
    expect(reviewWaiverCleanupSql).toContain("completed_at = v_completed_on::timestamptz");
    expect(reviewWaiverCleanupSql).toContain("metadata = (COALESCE(metadata, '{}'::jsonb) - 'completion_waiver' - 'completion_mode')");
    expect(reviewWaiverCleanupSql).toContain("'completion_mode', 'completed'");
  });

  it("repairs already-completed evidence rows that retained stale waiver state", () => {
    expect(reviewWaiverRepairSql).toContain("completed_review_requirements");
    expect(reviewWaiverRepairSql).toContain("eri.metadata ? 'completion_evidence'");
    expect(reviewWaiverRepairSql).toContain("ex.exception_kind = 'waived'");
    expect(reviewWaiverRepairSql).toContain("AND ex.superseded_at IS NULL");
    expect(reviewWaiverRepairSql).toContain("metadata = (COALESCE(metadata, '{}'::jsonb) - 'completion_waiver' - 'completion_mode')");
    expect(reviewWaiverRepairSql).toContain("'completion_mode', 'completed'");
  });

  it("allows compliance evidence PDF uploads through compliance evidence permissions", () => {
    expect(uploadRlsSql).toContain("labor_employee_attachments_requirement_evidence_insert");
    expect(uploadRlsSql).toContain("array_length(storage.foldername(name), 1) >= 3");
    expect(uploadRlsSql).toContain("(storage.foldername(name))[2] = 'requirements'");
    expect(uploadRlsSql).toContain("(storage.foldername(name))[3] LIKE 'performance-review-%'");
    expect(uploadRlsSql).toContain("public.labor_compliance_can_update_evidence(e.location_id)");
    expect(uploadRlsSql).toContain("labor_employee_documents_compliance_evidence_insert");
    expect(uploadRlsSql).toContain("document_type = 'performance_review_evidence'");
    expect(uploadRlsSql).toContain("storage_path LIKE (labor_employee_id::text || '/requirements/performance-review-%')");
    expect(uploadRlsSql).toContain("COALESCE(metadata->>'source_module', '') IN ('performance_reviews', 'compliance_requirements')");
    expect(uploadRlsSql).toContain("'Labor Compliance View PDFs'");
  });
});

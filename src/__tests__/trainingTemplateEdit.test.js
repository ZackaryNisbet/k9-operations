import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("../supabaseClient", () => ({ supabase: {} }));

import {
  buildTemplatePreviewVersionStats,
  getEditableTemplateDraftVersion,
  normalizeTemplateRequiredTextInput,
  validateTemplateVersionForPublish,
} from "../kol/pages/TrainingPage.jsx";

const trainingPageSource = readFileSync(new URL("../kol/pages/TrainingPage.jsx", import.meta.url), "utf8");
const standardReadinessCompletionModeSql = readFileSync(
  new URL("../../supabase/migrations/20260526192657_standardize_training_readiness_completion_mode.sql", import.meta.url),
  "utf8"
);

describe("labor training template edit helpers", () => {
  it("counts sections and items from the selected training template version", () => {
    const stats = buildTemplatePreviewVersionStats({
      kind: "training",
      versionId: "draft-v2",
      sections: [
        { id: "current-section", template_version_id: "current-v1", parent_section_id: null },
        { id: "draft-section", template_version_id: "draft-v2", parent_section_id: null },
        { id: "draft-module", template_version_id: "draft-v2", parent_section_id: "draft-section" },
      ],
      items: [
        { id: "old-task", template_version_id: "current-v1", template_section_id: "current-section" },
        { id: "draft-task-1", template_version_id: "draft-v2", template_section_id: "draft-section" },
        { id: "draft-task-2", template_version_id: "draft-v2", template_section_id: "draft-module" },
      ],
    });

    expect(stats).toEqual({ sectionCount: 1, itemCount: 2 });
  });

  it("counts review prompts from the selected review template version", () => {
    const stats = buildTemplatePreviewVersionStats({
      kind: "review",
      versionId: "draft-review-v2",
      reviewSections: [
        { id: "old-section", template_version_id: "current-review-v1" },
        { id: "draft-section", template_version_id: "draft-review-v2" },
      ],
      reviewItems: [
        { id: "old-prompt", template_version_id: "current-review-v1", review_section_id: "old-section" },
        { id: "draft-prompt", template_version_id: "draft-review-v2", review_section_id: "draft-section" },
      ],
    });

    expect(stats).toEqual({ sectionCount: 1, itemCount: 1 });
  });

  it("resumes the newest existing draft instead of creating duplicate drafts", () => {
    expect(
      getEditableTemplateDraftVersion([
        { id: "published", template_id: "tpl-1", status: "published", version_no: 3, created_at: "2026-01-01T00:00:00Z" },
        { id: "older-draft", template_id: "tpl-1", status: "draft", version_no: 4, created_at: "2026-01-02T00:00:00Z" },
        { id: "newer-draft", template_id: "tpl-1", status: "draft", version_no: 5, created_at: "2026-01-03T00:00:00Z" },
        { id: "other-draft", template_id: "tpl-2", status: "draft", version_no: 9, created_at: "2026-01-04T00:00:00Z" },
      ], "tpl-1")
    ).toMatchObject({ id: "newer-draft" });
  });

  it("blocks publishing draft templates with missing names, structure, or required labels", () => {
    const invalid = validateTemplateVersionForPublish({
      name: "  ",
      kind: "training",
      version: { id: "draft-v1", status: "draft" },
      sections: [
        {
          id: "section-1",
          title: "  ",
          children: [],
          directItems: [{ id: "task-1", label: "  " }],
        },
      ],
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toEqual([
      "Template name is required.",
      "Every section needs a title before publishing.",
      "Every task needs a label before publishing.",
    ]);

    expect(
      validateTemplateVersionForPublish({
        name: "PCT Training",
        kind: "training",
        version: { id: "published-v1", status: "published" },
        sections: [
          {
            id: "section-1",
            title: "Day 1",
            children: [],
            directItems: [{ id: "task-1", label: "Greet dogs safely" }],
          },
        ],
      })
    ).toEqual({
      valid: false,
      errors: ["Only draft versions can be published."],
    });

    expect(
      validateTemplateVersionForPublish({
        name: "PCT Training",
        kind: "training",
        version: { id: "empty-draft", status: "draft" },
        sections: [{ id: "section-1", title: "Day 1", children: [], directItems: [] }],
      })
    ).toEqual({
      valid: false,
      errors: ["Add at least one task before publishing."],
    });

    const valid = validateTemplateVersionForPublish({
      name: "PCT Training",
      kind: "training",
      version: { id: "draft-v2", status: "draft" },
      sections: [
        {
          id: "section-1",
          title: "Day 1",
          children: [],
          directItems: [{ id: "task-1", label: "Greet dogs safely" }],
        },
      ],
    });

    expect(valid).toEqual({ valid: true, errors: [] });
  });

  it("blocks publishing empty review drafts", () => {
    expect(
      validateTemplateVersionForPublish({
        name: "30 Day Review",
        kind: "review",
        version: { id: "review-draft", status: "draft" },
        sections: [{ id: "section-1", title: "Role fit", items: [] }],
      })
    ).toEqual({
      valid: false,
      errors: ["Add at least one review prompt before publishing."],
    });
  });

  it("validates required edit fields before autosaving them", () => {
    expect(normalizeTemplateRequiredTextInput("  New Section  ", "Old Section", "Section title")).toEqual({
      valid: true,
      changed: true,
      value: "New Section",
      error: "",
    });
    expect(normalizeTemplateRequiredTextInput("   ", "Old Section", "Section title")).toEqual({
      valid: false,
      changed: false,
      value: "Old Section",
      error: "Section title is required.",
    });
    expect(normalizeTemplateRequiredTextInput("Old Section", "Old Section", "Section title")).toEqual({
      valid: true,
      changed: false,
      value: "Old Section",
      error: "",
    });
  });

  it("surfaces edit/resume actions and current/draft badges in the template UI", () => {
    expect(trainingPageSource).toContain("Resume Draft");
    expect(trainingPageSource).toContain("Edit Template");
    expect(trainingPageSource).toContain("Draft available");
    expect(trainingPageSource).toContain("Current v");
    expect(trainingPageSource).not.toContain('"New Draft"');
  });

  it("blocks publish while saves are pending and confirms destructive template deletes", () => {
    expect(trainingPageSource).toContain("Finish pending template saves before publishing");
    expect(trainingPageSource).toContain("disabled={templateActionPending || !templatePublishValidation.valid}");
    expect(trainingPageSource).toContain("Fix before publishing");
    expect(trainingPageSource).toContain("This cannot be undone.");
    expect(trainingPageSource).toContain("Delete this draft version? Published versions will not be changed.");
  });

  it("surfaces failed-save errors and clears template edit pending state", () => {
    expect(trainingPageSource).toContain("Failed to update template name");
    expect(trainingPageSource).toContain("Failed to update section");
    expect(trainingPageSource).toContain('Failed to update ${previewTemplateKind === "review" ? "review item" : "task"}');
    expect(trainingPageSource).toContain("Failed to create template shell");
    expect(trainingPageSource).toContain("Failed to create template draft");
    expect(trainingPageSource).toContain("Saving template edits…");
    expect(trainingPageSource).toContain("setSavingTemplateFieldCount((count) => count + 1)");
    expect(trainingPageSource).toContain("setSavingTemplateFieldCount((count) => Math.max(0, count - 1))");
  });

  it("keeps template creation and viewing workflows wired with premium choices", () => {
    expect(trainingPageSource).toContain('onClick={() => setShowCreateTemplateModal(true)}>New Template</Btn>');
    expect(trainingPageSource).toContain('<Modal title="Create Template" onClose={resetCreateTemplateModal}>');
    expect(trainingPageSource).toContain('{ value: "training", label: "Training Template" }');
    expect(trainingPageSource).toContain('{ value: "review", label: "30 / 60 / 90 Review Template" }');
    expect(trainingPageSource).toContain('{ value: "written_certification", label: "Written Certification" }');
    expect(trainingPageSource).toContain('{ value: "live_evaluation", label: "Live Evaluation" }');
    expect(trainingPageSource).toContain('placeholder="Pet Care Technician, Customer Service Representative, Supervisor"');
    expect(trainingPageSource).toContain("The template will open as a draft immediately");
    expect(trainingPageSource).toContain("Template created");
    expect(trainingPageSource).toContain("Template Builder");
    expect(trainingPageSource).toContain("Version Control");
    expect(trainingPageSource).toContain('onClick={() => setPreviewTemplateVersionId(version.id)}');
    expect(trainingPageSource).toContain("Template Structure");
    expect(trainingPageSource).toContain("Back to Template Library");
    expect(trainingPageSource).toContain("Bulk Configuration");
    expect(trainingPageSource).toContain("Question type");
    expect(trainingPageSource).toContain("Task type");
    expect(trainingPageSource).toContain("template-builder-layout");
  });

  it("uses the standard readiness status set for training task completion modes", () => {
    expect(trainingPageSource).toContain("PCT_READINESS_STATUS_OPTIONS.map");
    expect(trainingPageSource).toContain('completion_mode: "observe_participate_demonstrate"');
    expect(trainingPageSource).toContain("Readiness statuses");
    expect(trainingPageSource).toContain("Use Standard");
    expect(trainingPageSource).not.toContain('{ value: "complete_only", label: "Complete only" }');
    expect(trainingPageSource).not.toContain('{ value: "pass_fail", label: "Pass / fail" }');
    expect(trainingPageSource).not.toContain('{ value: "score_based", label: "Score based" }');
    expect(trainingPageSource).not.toContain("All tasks set to pass / fail");
  });

  it("standardizes existing training templates to the readiness completion mode", () => {
    expect(standardReadinessCompletionModeSql).toContain("UPDATE public.training_template_items item");
    expect(standardReadinessCompletionModeSql).toContain("UPDATE public.training_template_sections section");
    expect(standardReadinessCompletionModeSql).toContain("'observe_participate_demonstrate'::public.training_completion_mode");
  });

  it("hides template management actions from users without template permissions", () => {
    expect(trainingPageSource).toContain('if (tab === "templates" && canManageTemplates)');
    expect(trainingPageSource).toContain('{canManageTemplates && (');
    expect(trainingPageSource).toContain('{canManageTemplates && showCreateTemplateModal && (');
    expect(trainingPageSource).toContain('{canManageTemplates && previewTemplate.version?.status === "draft" && (');
  });
});

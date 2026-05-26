# Labor Template Edit Workflow

## Scope

This runbook documents the Labor Management template editor used for both training templates and 30 / 60 / 90 review templates. It reflects the current behavior implemented in `src/kol/pages/TrainingPage.jsx` and is intended for support, managers, and internal QA.

The template editor is reached from Labor Management > Training by using the template settings action. The Templates surface is intentionally a management surface rather than a normal employee workflow tab.

## Permissions and entry points

- A user must have `Labor Management` plus `Labor Templates` permission to open the Templates surface or change templates.
- Users without `Labor Templates` can still use the Labor areas they are separately allowed to access, but they will not see the template management gear or edit controls.
- Template rows show `Edit Template` when no editable draft exists.
- Template rows and the preview header show `Resume Draft` when an editable draft already exists for that template.
- The editor supports both active and inactive templates. The Templates list can be filtered to All, Active, or Inactive.

## Version model

Templates are versioned. Published/current versions are treated as read-only structure previews; edits happen in draft versions.

- `Edit Template` on a published/current version creates a draft from the selected version, then opens that draft for editing.
- If a draft already exists, the button changes to `Resume Draft` and opens the existing draft instead of creating a duplicate draft.
- The editor chooses the newest existing draft for the template when resuming.
- `Version History` shows available versions and lets support or managers inspect the selected version.
- `Restore To Draft` clones a selected historical/non-draft version into a new draft only when there is no existing draft. If a draft already exists, the workflow opens that draft instead.
- `Delete Draft` removes only the draft version and its draft sections/items/prompts. Published versions are not changed.
- `Publish Draft` publishes the draft as the current version after validation passes.
- `Mark Active` / `Mark Inactive` toggles template availability at the template level; it is independent from the draft-vs-published version status.

## Creating a new template

Managers with template permission can use `Add Template` from the Templates surface.

Required and optional creation fields:

- Template Type: `Training Template` or `30 / 60 / 90 Review Template`.
- Template Class for training templates: Training Plan, Written Certification, Live Evaluation, Competency Guide, or Master Dependency Checklist.
- Template Name: required. The name must contain letters or numbers so a slug can be generated.
- Role Scopes: optional comma-separated roles. Leave blank to make the template available to all roles.

After creation, the new template opens as an initial draft so the manager can add sections, tasks/prompts, and publish when ready.

## What can be edited in a draft

Editing controls only appear when the selected version is a draft and the user has template-management permission.

Common draft edits:

- Rename the template.
- Rename sections and edit section descriptions/instructions.
- Add, move, and delete sections.
- Use `Manage Structure` to keep sections expanded while editing; `Done Managing` returns to normal preview behavior.

Training template draft edits:

- Add top-level sections.
- Add modules under a section.
- Add tasks to a section or module.
- Rename sections, modules, and tasks.
- Edit task descriptions.
- Add or update an optional resource link on a task.
- Mark a task required or optional.
- Move sections/modules up or down.
- Move tasks up or down inside their section/module.
- Move tasks to another section or module.
- Delete tasks, modules, or sections. Deleting a section also deletes its draft modules/tasks.

Review template draft edits:

- Add review sections.
- Add review prompts to a section.
- Rename sections and prompts.
- Edit section descriptions/instructions.
- Change prompt response type: Long Text, Short Text, or Rating.
- For Rating prompts, edit comma-separated rating options.
- Move sections up or down.
- Move prompts up or down or to another section.
- Delete prompts or sections. Deleting a section also deletes its draft prompts.

## Autosave and pending-action behavior

Draft fields autosave as managers edit.

- Required text fields, such as template name, section title, module title, task label, and review prompt, are trimmed on commit.
- Blank required text is rejected, the prior value is restored in the field, and an error toast explains which field is required.
- Optional descriptions, instructions, resource links, and rating options may be cleared.
- While a field save is in progress, the page shows `Saving template edits...`.
- Publish, restore, delete-draft, activate/deactivate, and draft-create/resume actions are disabled while template saves or actions are pending.
- If publish is attempted while saves are pending, the UI tells the manager to finish pending template saves before publishing.
- Destructive deletes require confirmation and warn that the delete cannot be undone. Deleting a draft explicitly confirms that published versions will not be changed.

## Publish validation

Publish validation applies only to draft versions. Published/current versions are read-only for structure and do not run publish validation until a draft is opened.

A draft cannot be published unless all applicable checks pass:

Common checks:

- Template name is required.
- A draft version must be selected.
- Only draft versions can be published.

Training template checks:

- At least one task is required before publishing.
- Every top-level section needs a title.
- Every module needs a title.
- Every task needs a label.

Review template checks:

- At least one review prompt is required before publishing.
- Every review section needs a title.
- Every review prompt needs text.

When validation fails, `Publish Draft` is disabled and the preview header shows `Fix before publishing:` followed by the validation messages. The first validation error is also shown as a toast when publish is attempted programmatically or from a stale UI state.

## Support notes and troubleshooting

- If a manager expects `Edit Template` but sees `Resume Draft`, an unpublished draft already exists. Open that draft, publish it, or delete it before restoring a different historical version into a draft.
- If the manager cannot find the Templates surface, verify both `Labor Management` and `Labor Templates` permissions.
- If `Publish Draft` is disabled, check the validation message in the preview header and wait for any `Saving template edits...` status to clear.
- If a draft needs to be discarded, use `Delete Draft`; the current published template remains unchanged.
- Inactive templates can still be inspected and managed by authorized users, but inactive status controls whether the template is available for normal use.

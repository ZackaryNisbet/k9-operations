# Performance Review Signing Spec

## Goal

Labor Management should support manager-completed 30/60/90 performance review packets that can be reviewed with an employee, sent to the employee for an audited e-signature, and saved back to the employee profile.

This is not an in-house e-signature system. K9 Operations remains the canonical review data source; an external audited signing provider handles the signing ceremony and signed PDF artifact.

## Provider Decision

Use DocuSeal as the preferred v1 signing provider.

Reasons:

- Open-source/self-hostable path.
- API-driven submission creation.
- Typed, drawn, or uploaded signature support.
- Email/shared-link signing flows.
- Phone/SMS OTP and email OTP identity verification options.
- Signed PDF plus audit/completion evidence.

## Source Templates

Cherry Hill HR source templates live in:

`/Users/zacknisbet/Library/CloudStorage/GoogleDrive-zack.nisbet@lphik9.com/Shared drives/1 - Luxury Pet Hotel Investments LLC/7 - Operations/Cherry Hill/Performance Reviews`

Current roles:

- Assistant Manager
- Customer Service Representative
- General Manager
- Pet Care Technician
- Supervisor

The source PDFs have no embedded AcroForm fields. K9 should render overlays onto the fixed PDF pages rather than trying to fill native PDF form fields.

Canonical coordinate artifacts are stored outside this repo at:

`/Users/zacknisbet/Documents/Codex/business-logic/performance-reviews/pdf-field-verification`

## Data Ownership

Supabase/K9 records should store structured review data:

- labor employee id
- role template key
- checkpoint: 30, 60, or 90
- due date
- review date
- manager rating
- manager notes/action plan
- development plan
- summary comments
- draft/sent/signed/completed status
- DocuSeal submission id
- signer email and/or phone used
- identity verification method
- signed PDF storage reference
- audit/certificate reference
- completed timestamp

The generated PDF is an artifact. It should be reproducible from the canonical review data and the versioned template manifest until the signing step.

## PDF Overlay Rules

The HR PDFs do not provide employee identity fields. K9 must overlay a consistent identity header on page 1:

- employee name
- position title
- review checkpoint
- start date
- review date
- location

Manager-visible signed fields:

- rating for the applicable checkpoint
- manager notes/action plan for the applicable checkpoint
- development plan/summary comments when closing the review packet

Private/internal manager notes must not render into the signed employee-facing PDF.

## Signing Flow

1. Manager opens the employee's Performance Review record.
2. K9 auto-selects the role template from normalized employee position/title.
3. K9 auto-populates identity fields from the labor employee record.
4. Manager fills the applicable rating and notes/action plan.
5. Manager previews the generated PDF before the employee meeting.
6. After the meeting, manager sends for signature.
7. K9 creates a DocuSeal submission for the generated PDF.
8. Employee verifies identity by configured OTP method and signs.
9. K9 receives signed status via webhook or provider polling.
10. K9 stores signed artifact and audit references on the employee profile.
11. Labor roster compliance rollup updates from the canonical review status.

## Compliance Rollup

Roster should eventually replace the separate 30/60/90 columns with one `Performance Reviews` status.

- `Compliant`: no required checkpoint is overdue and unsigned/incomplete.
- `Non-compliant`: at least one required checkpoint is overdue and unsigned/incomplete.
- `Needs setup`: start date, role mapping, or template mapping is missing.

Future checkpoints can be incomplete without making the employee non-compliant until their due date has passed.

## Implementation Notes

- Keep DocuSeal credentials server-side only.
- Never expose service-role Supabase keys or signing provider API keys in the browser/mobile app.
- Treat signed PDFs as employee HR documents. Storage policies must restrict access to authorized managers/admins.
- Use immutable template hashes from `review-template-summary.json` to detect when HR changes a source PDF.
- Run a visual PDF rendering verification pass for every role before production signing is enabled.

# Adair Forsythe Labor Source Catalog

This file mirrors the seeded `labor_source_document_catalog` entries and adds operator-readable QA context.

| Source file | Page range | Family | Class | Role scope | Extraction status | Normalized target | QA flags |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `K9 CH Certifications.pdf` | `1-42` | `training_packet` | `scan_pdf` | `all` | `cataloged_scan_requires_ocr` | `training_templates:bathing_certification, training_templates:written_certification, training_templates:live_certification` | `scan-based packet`, `manual QA required`, `family seeds now mapped to editable templates` |
| `K9 CH Certifications.pdf` | `unknown subset` | `onboarding_training_plan` | `training_plan` | `PCT` | `seeded_manual_parse` | `training_templates:pct_training_plan` | none |
| `K9 CH Certifications.pdf` | `unknown subset` | `onboarding_training_plan` | `training_plan` | `CSR` | `seeded_manual_parse` | `training_templates:csr_training_plan` | none |
| `K9 CH Certifications.pdf` | `unknown subset` | `bathing_certification` | `live_evaluation` | `PCT` | `seeded_manual_parse` | `training_templates:bathing_certification` | `pragmatic structured seed`, `OCR page map pending` |
| `K9 CH Certifications.pdf` | `unknown subset` | `written_certification` | `written_certification` | `PCT/CSR` | `seeded_manual_parse` | `training_templates:written_certification` | `pragmatic structured seed`, `OCR page map pending` |
| `K9 CH Certifications.pdf` | `unknown subset` | `live_certification` | `live_evaluation` | `PCT/CSR` | `seeded_manual_parse` | `training_templates:live_certification` | `pragmatic structured seed`, `OCR page map pending` |
| `Assistant Manager 30, 60, 90 day review template.docx` | `full document` | `performance_review` | `review_template` | `Assistant Manager` | `parsed_docx_ready_for_seed` | `review_templates:assistant_manager_30_60_90` | none |
| `CSR 30^LJ 60^LJ 90 day review template.docx` | `full document` | `performance_review` | `review_template` | `CSR` | `parsed_docx_ready_for_seed` | `review_templates:csr_30_60_90` | none |
| `General Manager 30^J 60^J 90 day review template.docx` | `full document` | `performance_review` | `review_template` | `General Manager` | `parsed_docx_ready_for_seed` | `review_templates:general_manager_30_60_90` | none |
| `PCT 30^LLJ 60^LLJ 90 day review template.docx` | `full document` | `performance_review` | `review_template` | `PCT` | `parsed_docx_ready_for_seed` | `review_templates:pct_30_60_90` | none |
| `Supervisor 30^J 60^J 90 day review template.docx` | `full document` | `performance_review` | `review_template` | `Supervisor` | `parsed_docx_ready_for_seed` | `review_templates:supervisor_30_60_90` | none |

## Notes

- The Adair Forsythe PDF is scan-based and still needs OCR/manual QA for exact page-to-section mapping, but the bathing, written, and live certification families are now seeded as editable templates.
- The role-specific 30/60/90 review DOCX files were parsed manually and are safe to seed into structured review templates.
- Existing PCT and CSR onboarding plans are already present in the training domain, but they still need full draft/version authoring tooling so managers can maintain them in-app.

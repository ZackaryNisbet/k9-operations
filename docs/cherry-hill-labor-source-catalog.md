# Cherry Hill Labor Source Catalog

This file mirrors the seeded `labor_source_document_catalog` entries and records the current packet-family normalization status for Labor Management.

| Source file | Page range | Family | Class | Role scope | Extraction status | Confidence | Normalized target | QA flags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `K9 CH Certifications.pdf` | `1-42` | `training_packet` | `scan_pdf` | `all` | `cataloged_scan_requires_ocr` | `packet-level` | `training_templates:supervisor_certification_checklist, training_templates:pct_training_plan, training_templates:csr_training_plan, training_templates:gingr_training_guide, training_templates:bathing_certification, training_templates:customer_service_certification, training_templates:daycare_certification, training_templates:daycare_evaluation_certification, training_templates:feeding_medication_certification, training_templates:sanitation_certification, training_templates:tour_certification_test` | `scan-based packet`, `ocr-assisted family mapping`, `manual QA still recommended` |
| `K9 CH Certifications.pdf` | `1` | `supervisor_certification_checklist` | `master_dependency_checklist` | `Supervisor` | `seeded_ocr_assisted` | `medium` | `training_templates:supervisor_certification_checklist` | `page 1 is noisy`, `manual QA recommended` |
| `K9 CH Certifications.pdf` | `2-6` | `onboarding_training_plan` | `training_plan` | `CSR` | `seeded_ocr_assisted` | `high` | `training_templates:csr_training_plan` | none |
| `K9 CH Certifications.pdf` | `7-11` | `onboarding_training_plan` | `training_plan` | `PCT` | `seeded_ocr_assisted` | `high` | `training_templates:pct_training_plan` | `page 11 slightly noisy` |
| `K9 CH Certifications.pdf` | `12-14` | `gingr_training_guide` | `competency_guide` | `CSR` | `seeded_ocr_assisted` | `high` | `training_templates:gingr_training_guide` | `menu labels lightly OCR-soft` |
| `K9 CH Certifications.pdf` | `15-17` | `bathing_certification` | `live_evaluation` | `PCT` | `seeded_ocr_assisted` | `high` | `training_templates:bathing_certification` | `answer choices lightly OCR-noisy` |
| `K9 CH Certifications.pdf` | `18-23` | `customer_service_certification` | `written_certification` | `CSR` | `seeded_ocr_assisted` | `medium-high` | `training_templates:customer_service_certification` | `dense answer pages create OCR artifacts` |
| `K9 CH Certifications.pdf` | `24-27` | `daycare_certification` | `live_evaluation` | `PCT` | `seeded_ocr_assisted` | `medium` | `training_templates:daycare_certification` | `page 27 noisy`, `manual QA recommended` |
| `K9 CH Certifications.pdf` | `28-31` | `daycare_evaluation_certification` | `live_evaluation` | `PCT/CSR` | `seeded_ocr_assisted` | `medium-high` | `training_templates:daycare_evaluation_certification` | `pages 29-30 mildly fuzzy` |
| `K9 CH Certifications.pdf` | `32-35` | `feeding_medication_certification` | `written_certification` | `PCT` | `seeded_ocr_assisted` | `medium` | `training_templates:feeding_medication_certification` | `medication lines noisy`, `one prompt slightly fuzzy` |
| `K9 CH Certifications.pdf` | `36-39` | `sanitation_certification` | `live_evaluation` | `PCT` | `seeded_ocr_assisted` | `medium` | `training_templates:sanitation_certification` | `pages 37-39 noisy` |
| `K9 CH Certifications.pdf` | `40-42` | `tour_certification_test` | `live_evaluation` | `CSR` | `seeded_ocr_assisted` | `high` | `training_templates:tour_certification_test` | `minor OCR artifacts only` |
| `Assistant Manager 30, 60, 90 day review template.docx` | `full document` | `performance_review` | `review_template` | `Assistant Manager` | `parsed_docx_ready_for_seed` | `high` | `review_templates:assistant_manager_30_60_90` | none |
| `CSR 30^LJ 60^LJ 90 day review template.docx` | `full document` | `performance_review` | `review_template` | `CSR` | `parsed_docx_ready_for_seed` | `high` | `review_templates:csr_30_60_90` | none |
| `General Manager 30^J 60^J 90 day review template.docx` | `full document` | `performance_review` | `review_template` | `General Manager` | `parsed_docx_ready_for_seed` | `high` | `review_templates:general_manager_30_60_90` | none |
| `PCT 30^LLJ 60^LLJ 90 day review template.docx` | `full document` | `performance_review` | `review_template` | `PCT` | `parsed_docx_ready_for_seed` | `high` | `review_templates:pct_30_60_90` | none |
| `Supervisor 30^J 60^J 90 day review template.docx` | `full document` | `performance_review` | `review_template` | `Supervisor` | `parsed_docx_ready_for_seed` | `high` | `review_templates:supervisor_30_60_90` | none |
| `Section 10 - Red Binder.pdf` | `66` | `red_binder_appendix` | `appendix_divider` | `all` | `cataloged_manual_review` | `high` | `client_management:red_binder_appendix` | `appendix starts on next page` |
| `Section 10 - Red Binder.pdf` | `67` | `red_binder_appendix` | `client_management_form` | `all` | `structured_seeded` | `high` | `client_management:red_binder:vet_visit_form` | none |
| `Section 10 - Red Binder.pdf` | `68` | `red_binder_appendix` | `client_management_form` | `all` | `structured_seeded` | `high` | `client_management:red_binder:animal_incident_report` | none |
| `Section 10 - Red Binder.pdf` | `69` | `red_binder_appendix` | `client_management_form` | `all` | `structured_seeded` | `high` | `client_management:red_binder:serious_animal_event_report` | none |
| `Section 10 - Red Binder.pdf` | `70` | `red_binder_appendix` | `client_management_form` | `all` | `structured_seeded` | `high` | `client_management:red_binder:employee_injury_report` | none |
| `Section 10 - Red Binder.pdf` | `71-72` | `red_binder_appendix` | `client_management_form` | `all` | `structured_seeded` | `high` | `client_management:red_binder:gm_accident_investigation` | none |
| `Section 10 - Red Binder.pdf` | `72-74` | `red_binder_appendix` | `client_management_form` | `all` | `structured_seeded` | `high` | `client_management:red_binder:incident_investigation_report` | none |

## OCR-Derived Packet Notes

- The packet is not text-native; OCR was required for family mapping.
- The cleanest family boundaries are at pages `2`, `7`, `12`, `15`, `18`, `24`, `28`, `32`, `36`, and `40`.
- The noisiest OCR pages are `1`, `27`, `29-35`, and `37-39`, so those families still deserve manual QA before anyone treats them as perfect transcriptions.
- There are no hidden extra packet families beyond the 11 listed above.
- Section 10 Red Binder appendix form families begin immediately after the appendix divider on page `66`.

## Template Family Summary

- `Supervisor Certification Checklist`: HR docs, learning portal, First Aid/CPR, CSR/PCT completion, supervisor written exam, outside certifications.
- `CSR Training Plan`: online prereqs, HR docs, orientation, customer service, tours, POS, daycare evaluations, food & medication, shadow shifts, test day.
- `PCT Training Plan`: online prereqs, HR docs, orientation, sanitation, bathing, daycare, shadow shifts, test day.
- `Gingr Training Guide`: owners/pets, notes/incidents, reservations, cart/POS, packages, refunds, dashboard, reports, customer portal.
- `Bathing Certification`: written quiz plus live bath observation rubric.
- `Customer Service Certification`: service principles, complaint handling, communication standards, policy/scenario prompts.
- `Daycare Certification`: written room-safety and behavior prompts plus a live daycare-room rubric.
- `Daycare Evaluation Certification`: staffing/timing, pass-fail/yellow-light criteria, guest messaging, live evaluation rubric.
- `Feeding & Medication Certification`: house food, feeding workflow, missed meals, medication handling, packaging and escalation.
- `Sanitation Certification`: disinfectants, contact time, cleaning vs sanitizing vs disinfecting, live sanitation rubrics.
- `Tour Certification Test`: greeting, tour path, pricing, objections, booking close, thank-you.
- `Red Binder Vet Visit Form`: outside-vet follow-up for an animal incident.
- `Red Binder Animal Incident Report`: first report for dog-on-dog or similar animal safety incidents.
- `Red Binder Serious Animal Event Report`: severe animal injury, illness, or death escalation.
- `Red Binder Employee Injury Report`: employee self-report for workplace injury or near miss.
- `Red Binder GM Accident Investigation`: manager investigation and corrective-action review.
- `Red Binder Incident Investigation Report`: full witness, PPE, attachment, and prevention report.

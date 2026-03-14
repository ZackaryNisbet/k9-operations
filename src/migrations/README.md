# Supabase Migrations — Data Expansion (DE-001 through DE-003)

Run these migrations in order against your Supabase instance.

## Migration Files

| File | Ticket | Phase | Description |
|------|--------|-------|-------------|
| `001_de001_form_reference_tables.sql` | DE-001 | Phase 0 | Form field definitions (`gingr_form_definitions`) and icon templates (`gingr_icon_templates`) |
| `002_de002_reference_tables.sql` | DE-002 | Phase 1 | Breed, species, temperament lookup tables + immunization_types enhancements |
| `003_de003_financial_tables.sql` | DE-003 | Phase 2 | Invoices (`gingr_invoices`), transactions (`gingr_transactions`), and revenue views |

## Prerequisites

- Existing tables: `locations`, `user_locations`, `gingr_sync_state`, `gingr_immunization_types`
- All tables use `location_id` scoping and RLS policies

## New Tables Created

- `gingr_form_definitions` — Form field configs from Gingr
- `gingr_icon_templates` — Animal icon templates
- `gingr_breeds` — Breed reference data
- `gingr_species` — Species types
- `gingr_temperaments` — Temperament classifications
- `gingr_invoices` — Invoice records
- `gingr_transactions` — Payment/transaction records

## New Views

- `v_daily_revenue` — Daily revenue summary by location
- `v_client_lifetime_value` — Total spent per client by location

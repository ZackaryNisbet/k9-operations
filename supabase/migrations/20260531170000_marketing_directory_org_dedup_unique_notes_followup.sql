-- Dedup duplicate marketing-directory organizations, add a uniqueness guard so it
-- can't happen again, and add an optional follow-up date to logged updates (notes)
-- so the directory's Updates composer matches the marketing tracker's.
BEGIN;

-- 1) Merge duplicate orgs (same location + case/space-insensitive name): keep the
--    richest row (most filled fields, then oldest), reassign children, drop the rest.
CREATE TEMP TABLE _md_org_dupes ON COMMIT DROP AS
SELECT id AS dup_id, keeper_id FROM (
  SELECT id, first_value(id) OVER (
    PARTITION BY location_id, lower(btrim(name))
    ORDER BY (
      (email IS NOT NULL)::int + (phone IS NOT NULL)::int + (website IS NOT NULL)::int +
      (org_type IS NOT NULL)::int + (btrim(coalesce(address, address_line_1, '')) <> '')::int
    ) DESC, created_at, id
  ) AS keeper_id
  FROM public.marketing_directory_orgs
  WHERE btrim(name) <> ''
) ranked
WHERE id <> keeper_id;

UPDATE public.marketing_directory_contacts c SET org_id = d.keeper_id FROM _md_org_dupes d WHERE c.org_id = d.dup_id;
UPDATE public.marketing_directory_attachments a SET org_id = d.keeper_id FROM _md_org_dupes d WHERE a.org_id = d.dup_id;
UPDATE public.marketing_directory_notes n SET org_id = d.keeper_id FROM _md_org_dupes d WHERE n.org_id = d.dup_id;
DELETE FROM public.marketing_directory_orgs o USING _md_org_dupes d WHERE o.id = d.dup_id;

-- 2) Prevent future duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS marketing_directory_orgs_name_uidx
  ON public.marketing_directory_orgs (location_id, lower(btrim(name)))
  WHERE btrim(name) <> '';

-- 3) Optional follow-up date on a logged update (matches the tracker's composer).
ALTER TABLE public.marketing_directory_notes
  ADD COLUMN IF NOT EXISTS next_contact_date date;

COMMIT;

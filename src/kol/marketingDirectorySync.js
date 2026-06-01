// Live sync between the marketing tracker (GrassrootsPage) and the Marketing
// Directory. When an organizer is set on an event or a business is created on a
// visit, the matching organization is mirrored into the directory; the tracker
// also reads directory org names to suggest them as you type. Best-effort and
// idempotent by normalized name — directory hiccups never block a tracker save.
import { supabase } from "../supabaseClient";
import { buildDirectoryOrgPayload, makeBlankDirectoryOrg } from "./marketingDirectoryData";

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export async function fetchDirectoryOrgNames(locationId) {
  if (!locationId) return [];
  const { data, error } = await supabase
    .from("marketing_directory_orgs")
    .select("name")
    .eq("location_id", locationId);
  if (error) return [];
  return (data || []).map((row) => String(row.name || "").trim()).filter(Boolean);
}

// Ensure a directory organization with this name exists for the location. If one
// already exists (matched case/punctuation-insensitively), backfill its tracker
// link when missing; otherwise insert a lightweight org. Returns the org id or
// null. Never throws.
export async function ensureDirectoryOrgByName({
  locationId,
  name,
  actor = {},
  orgType = "",
  grassrootsTargetId = "",
  address = "",
  addressParts = {},
  phone = "",
  email = "",
} = {}) {
  try {
    const cleanName = String(name || "").trim();
    if (!locationId || !cleanName) return null;

    const { data: existing, error: selectError } = await supabase
      .from("marketing_directory_orgs")
      .select("id, name, grassroots_target_id")
      .eq("location_id", locationId);
    if (selectError) return null;

    const key = normalizeName(cleanName);
    const match = (existing || []).find((org) => normalizeName(org.name) === key);
    if (match) {
      if (grassrootsTargetId && !match.grassroots_target_id) {
        await supabase
          .from("marketing_directory_orgs")
          .update({ grassroots_target_id: grassrootsTargetId })
          .eq("id", match.id);
      }
      return match.id;
    }

    const draft = {
      ...makeBlankDirectoryOrg(locationId),
      isDraft: true,
      name: cleanName,
      org_type: orgType || "",
      address,
      ...addressParts,
      phone,
      email,
      grassroots_target_id: grassrootsTargetId || "",
    };
    const { data, error } = await supabase
      .from("marketing_directory_orgs")
      .insert(buildDirectoryOrgPayload(draft, locationId, actor))
      .select("id")
      .single();
    if (error) return null;
    return data?.id || null;
  } catch (error) {
    console.warn("Marketing directory sync skipped:", error?.message);
    return null;
  }
}

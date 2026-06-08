// K9 Operations — ResourcesPage helpers
// Pure resource/legacy normalization helpers extracted verbatim from
// ResourcesPage.jsx. No behavior change: same inputs, same outputs.

import { RESOURCE_BUCKET } from "./constants";

export function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function sanitizeFilename(name) {
  return String(name || "file")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 120) || "file";
}

export function getResourceBucket(item) {
  return item?.metadata?.file_bucket || item?.metadata?.legacy_file_bucket || RESOURCE_BUCKET;
}

export function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function isMissingResourceTableError(error) {
  return error?.code === "PGRST205"
    || error?.code === "42P01"
    || /resource_library_(sections|items)/i.test(error?.message || "");
}

export function buildLegacySectionId(name) {
  const slug = normalizeName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `legacy-section:${slug || "section"}`;
}

export function readLegacySectionRows(settingValue) {
  if (Array.isArray(settingValue)) return settingValue;
  if (Array.isArray(settingValue?.sections)) return settingValue.sections;
  return [];
}

export function normalizeLegacyResourceItem(item, index) {
  const category = normalizeName(item?.category || "");
  const file = item?.file || null;
  const updatedAt = item?.updatedAt || item?.updated_at || new Date().toISOString();
  const filePath = normalizeName(file?.path || item?.file_path || "") || null;
  const mimeType = normalizeName(file?.type || item?.mime_type || "") || null;

  return {
    id: item?.id || `legacy-resource-${index + 1}`,
    title: normalizeName(item?.title || ""),
    description: normalizeName(item?.description || "") || null,
    url: normalizeName(item?.linkUrl || item?.url || "") || null,
    file_path: filePath,
    mime_type: mimeType,
    category: category || null,
    section_id: category ? buildLegacySectionId(category) : null,
    resource_kind: filePath ? "file" : "link",
    metadata: {
      ...(item?.metadata || {}),
      ...(filePath ? {
        legacy_file_bucket: file?.bucket || RESOURCE_BUCKET,
        legacy_file_name: file?.name || null,
        legacy_file_size: file?.size || null,
        legacy_file_type: mimeType,
      } : {}),
    },
    created_by_name: item?.updatedBy || item?.created_by_name || null,
    updated_by_name: item?.updatedBy || item?.updated_by_name || null,
    created_at: item?.updatedAt || item?.created_at || updatedAt,
    updated_at: updatedAt,
    sort_order: Number.isFinite(Number(item?.sort_order)) ? Number(item.sort_order) : (index + 1) * 10,
    is_active: true,
  };
}

export function normalizeLegacySectionRows(sectionRows, legacyItems) {
  const sectionMap = new Map();

  readLegacySectionRows(sectionRows).forEach((section, index) => {
    const name = normalizeName(section?.name || section?.label || "");
    if (!name) return;
    sectionMap.set(name.toLowerCase(), {
      id: section?.id || buildLegacySectionId(name),
      name,
      sort_order: Number.isFinite(Number(section?.sort_order ?? section?.sortOrder))
        ? Number(section?.sort_order ?? section?.sortOrder)
        : (index + 1) * 10,
    });
  });

  legacyItems.forEach((item) => {
    const name = normalizeName(item.category || "");
    if (!name || sectionMap.has(name.toLowerCase())) return;
    sectionMap.set(name.toLowerCase(), {
      id: buildLegacySectionId(name),
      name,
      sort_order: (sectionMap.size + 1) * 10,
    });
  });

  return Array.from(sectionMap.values()).sort((left, right) => {
    return Number(left.sort_order || 0) - Number(right.sort_order || 0)
      || left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
}

export function serializeLegacyResourceItem(item, fallbackActorName) {
  return {
    id: item.id,
    title: item.title || "",
    category: item.category || "",
    description: item.description || "",
    linkUrl: item.url || "",
    file: item.file_path ? {
      bucket: getResourceBucket(item),
      path: item.file_path,
      name: item.metadata?.file_name || item.metadata?.legacy_file_name || item.file_path.split("/").pop(),
      type: item.mime_type || item.metadata?.file_type || item.metadata?.legacy_file_type || "application/octet-stream",
      size: Number(item.metadata?.file_size ?? item.metadata?.legacy_file_size ?? 0) || 0,
    } : null,
    updatedAt: item.updated_at || new Date().toISOString(),
    updatedBy: item.updated_by_name || item.created_by_name || fallbackActorName,
  };
}

export function serializeLegacySections(sections) {
  return {
    sections: sections.map((section, index) => ({
      id: section.id || buildLegacySectionId(section.name),
      name: section.name,
      sort_order: Number.isFinite(Number(section.sort_order)) ? Number(section.sort_order) : (index + 1) * 10,
    })),
    updatedAt: new Date().toISOString(),
  };
}

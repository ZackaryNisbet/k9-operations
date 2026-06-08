import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C, fmtDate } from "../../shared/theme";
import { Badge, Btn, Card, Modal } from "../../shared/ui";
import { I } from "../../shared/icons";
import {
  RESOURCE_BUCKET,
  LEGACY_RESOURCE_SETTING_KEY,
  LEGACY_RESOURCE_SECTIONS_SETTING_KEY,
} from "./resources/constants";

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitizeFilename(name) {
  return String(name || "file")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 120) || "file";
}

function EmptyState({ title, subtitle }) {
  return (
    <Card style={{ padding: 36, textAlign: "center", color: C.textMut }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>{title}</div>
      {subtitle ? <div style={{ fontSize: 13 }}>{subtitle}</div> : null}
    </Card>
  );
}

function getResourceBucket(item) {
  return item?.metadata?.file_bucket || item?.metadata?.legacy_file_bucket || RESOURCE_BUCKET;
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function isMissingResourceTableError(error) {
  return error?.code === "PGRST205"
    || error?.code === "42P01"
    || /resource_library_(sections|items)/i.test(error?.message || "");
}

function buildLegacySectionId(name) {
  const slug = normalizeName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `legacy-section:${slug || "section"}`;
}

function readLegacySectionRows(settingValue) {
  if (Array.isArray(settingValue)) return settingValue;
  if (Array.isArray(settingValue?.sections)) return settingValue.sections;
  return [];
}

function normalizeLegacyResourceItem(item, index) {
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

function normalizeLegacySectionRows(sectionRows, legacyItems) {
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

function serializeLegacyResourceItem(item, fallbackActorName) {
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

function serializeLegacySections(sections) {
  return {
    sections: sections.map((section, index) => ({
      id: section.id || buildLegacySectionId(section.name),
      name: section.name,
      sort_order: Number.isFinite(Number(section.sort_order)) ? Number(section.sort_order) : (index + 1) * 10,
    })),
    updatedAt: new Date().toISOString(),
  };
}

export default function ResourcesPage({ profile, addGlobalToast = () => {} }) {
  const locationId = profile?.location_id || "";
  const actorUserId = profile?.user_id || profile?.id || null;
  const actorName = profile?.full_name || profile?.name || profile?.email || "Staff";

  const [resourceMode, setResourceMode] = useState("canonical");
  const [sections, setSections] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSectionId, setActiveSectionId] = useState("all");
  const [openingId, setOpeningId] = useState(null);

  const [showResourcesModal, setShowResourcesModal] = useState(false);
  const [showSectionsModal, setShowSectionsModal] = useState(false);
  const [showEditorModal, setShowEditorModal] = useState(false);

  const [editingItemId, setEditingItemId] = useState(null);
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceDescription, setResourceDescription] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [resourceSectionId, setResourceSectionId] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [savingResource, setSavingResource] = useState(false);

  const [sectionDrafts, setSectionDrafts] = useState([]);
  const [newSectionName, setNewSectionName] = useState("");
  const [savingSections, setSavingSections] = useState(false);
  const [draggingSectionId, setDraggingSectionId] = useState(null);
  const [savingOrder, setSavingOrder] = useState(false);

  const persistLegacyItems = useCallback(async (nextItems) => {
    const payload = {
      items: nextItems.map((item) => serializeLegacyResourceItem(item, actorName)),
      updatedAt: new Date().toISOString(),
    };
    const { error } = await supabase.from("lite_settings").upsert({
      location_id: locationId,
      setting_key: LEGACY_RESOURCE_SETTING_KEY,
      setting_value: payload,
    }, { onConflict: "location_id,setting_key" });
    if (error) throw error;
  }, [actorName, locationId]);

  const persistLegacySections = useCallback(async (nextSections) => {
    const { error } = await supabase.from("lite_settings").upsert({
      location_id: locationId,
      setting_key: LEGACY_RESOURCE_SECTIONS_SETTING_KEY,
      setting_value: serializeLegacySections(nextSections),
    }, { onConflict: "location_id,setting_key" });
    if (error) throw error;
  }, [locationId]);

  const loadLegacyData = useCallback(async () => {
    const { data, error } = await supabase
      .from("lite_settings")
      .select("setting_key, setting_value")
      .eq("location_id", locationId)
      .in("setting_key", [LEGACY_RESOURCE_SETTING_KEY, LEGACY_RESOURCE_SECTIONS_SETTING_KEY]);

    if (error) throw error;

    const rows = data || [];
    const itemSetting = rows.find((row) => row.setting_key === LEGACY_RESOURCE_SETTING_KEY)?.setting_value;
    const sectionSetting = rows.find((row) => row.setting_key === LEGACY_RESOURCE_SECTIONS_SETTING_KEY)?.setting_value;
    const baseLegacyItems = Array.isArray(itemSetting?.items) ? itemSetting.items.map(normalizeLegacyResourceItem) : [];
    const legacySections = normalizeLegacySectionRows(sectionSetting, baseLegacyItems);
    const sectionIdByName = Object.fromEntries(
      legacySections.map((section) => [section.name.toLowerCase(), section.id]),
    );
    const legacyItems = baseLegacyItems.map((item) => ({
      ...item,
      section_id: item.category ? (sectionIdByName[item.category.toLowerCase()] || item.section_id) : null,
    }));

    setResourceMode("legacy");
    setSections(legacySections);
    setSectionDrafts(legacySections.map((section) => ({ ...section })));
    setItems(legacyItems);
    setLoading(false);
  }, [locationId]);

  const loadData = useCallback(async () => {
    if (!locationId) {
      setResourceMode("canonical");
      setSections([]);
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const [sectionRes, itemRes] = await Promise.all([
      supabase
        .from("resource_library_sections")
        .select("*")
        .eq("location_id", locationId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("resource_library_items")
        .select("*")
        .eq("location_id", locationId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("updated_at", { ascending: false }),
    ]);

    if (isMissingResourceTableError(sectionRes.error) || isMissingResourceTableError(itemRes.error)) {
      try {
        await loadLegacyData();
      } catch (legacyError) {
        console.error("Failed to load legacy resources", legacyError);
        addGlobalToast("Failed to load resources", "error");
        setLoading(false);
      }
      return;
    }

    if (sectionRes.error) {
      console.error("Failed to load resource sections", sectionRes.error);
      addGlobalToast("Failed to load resource sections", "error");
      setLoading(false);
      return;
    }

    if (itemRes.error) {
      console.error("Failed to load resources", itemRes.error);
      addGlobalToast("Failed to load resources", "error");
      setLoading(false);
      return;
    }

    const nextSections = sectionRes.data || [];
    const nextItems = itemRes.data || [];
    setResourceMode("canonical");
    setSections(nextSections);
    setSectionDrafts(nextSections.map((section) => ({ ...section })));
    setItems(nextItems);
    setLoading(false);
  }, [addGlobalToast, loadLegacyData, locationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (activeSectionId !== "all" && !sections.some((section) => section.id === activeSectionId)) {
      setActiveSectionId("all");
    }
  }, [activeSectionId, sections]);

  const sectionMap = useMemo(
    () => Object.fromEntries(sections.map((section) => [section.id, section])),
    [sections],
  );

  const visibleItems = useMemo(() => {
    if (activeSectionId === "all") return items;
    return items.filter((item) => item.section_id === activeSectionId);
  }, [activeSectionId, items]);

  const counts = useMemo(() => ({
    total: items.length,
    files: items.filter((item) => item.file_path).length,
    links: items.filter((item) => item.url).length,
  }), [items]);

  const resetResourceEditor = useCallback(() => {
    setEditingItemId(null);
    setResourceTitle("");
    setResourceDescription("");
    setResourceUrl("");
    setResourceSectionId("");
    setPendingFile(null);
  }, []);

  const openCreateResource = useCallback(() => {
    resetResourceEditor();
    setShowEditorModal(true);
  }, [resetResourceEditor]);

  const openEditResource = useCallback((item) => {
    setEditingItemId(item.id);
    setResourceTitle(item.title || "");
    setResourceDescription(item.description || "");
    setResourceUrl(item.url || "");
    setResourceSectionId(item.section_id || "");
    setPendingFile(null);
    setShowEditorModal(true);
  }, []);

  const handleOpen = async (item) => {
    try {
      setOpeningId(item.id);
      if (item.url) {
        window.open(item.url, "_blank", "noopener,noreferrer");
        return;
      }
      if (item.file_path) {
        const bucket = getResourceBucket(item);
        const { data, error } = await supabase.storage.from(bucket).createSignedUrl(item.file_path, 60 * 60);
        if (error) throw error;
        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
        return;
      }
      addGlobalToast("This resource does not have a file or link yet", "warning");
    } catch (error) {
      console.error("Failed to open resource", error);
      addGlobalToast(error.message || "Failed to open resource", "error");
    } finally {
      setOpeningId(null);
    }
  };

  const handleSaveResource = async () => {
    const title = normalizeName(resourceTitle);
    const description = normalizeName(resourceDescription);
    const url = normalizeName(resourceUrl);
    const selectedSection = sectionMap[resourceSectionId] || null;
    const sectionName = selectedSection?.name || null;
    const existing = editingItemId ? items.find((item) => item.id === editingItemId) : null;
    const effectiveUrl = url || existing?.url || null;
    let nextFilePath = existing?.file_path || null;
    let nextMimeType = existing?.mime_type || null;
    let nextMetadata = { ...(existing?.metadata || {}) };

    if (!title) return;
    if (!effectiveUrl && !pendingFile && !existing?.file_path) {
      addGlobalToast("Add a link or upload a file before saving", "warning");
      return;
    }

    setSavingResource(true);

    try {
      if (pendingFile) {
        const bucket = RESOURCE_BUCKET;
        const path = `resource-library/${locationId}/${Date.now()}-${sanitizeFilename(pendingFile.name)}`;
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(path, pendingFile, { contentType: pendingFile.type || "application/octet-stream", upsert: false });
        if (uploadError) throw uploadError;

        if (existing?.file_path) {
          await supabase.storage.from(getResourceBucket(existing)).remove([existing.file_path]);
        }

        nextFilePath = path;
        nextMimeType = pendingFile.type || null;
        nextMetadata = {
          ...nextMetadata,
          file_bucket: bucket,
          file_name: pendingFile.name,
          file_size: pendingFile.size || null,
        };
      }

      const maxSort = items.reduce((max, item) => Math.max(max, Number(item.sort_order || 0)), 0);
      const payload = {
        location_id: locationId,
        title,
        description: description || null,
        url: effectiveUrl,
        file_path: nextFilePath,
        mime_type: nextMimeType,
        category: sectionName,
        section_id: resourceSectionId || null,
        resource_kind: nextFilePath ? "file" : "link",
        metadata: nextMetadata,
        updated_by_user_id: actorUserId,
        updated_by_name: actorName,
        sort_order: existing?.sort_order ?? (maxSort + 10),
      };

      if (resourceMode === "legacy") {
        const legacyPayload = {
          id: editingItemId || existing?.id || `resource_${Date.now().toString(36)}`,
          title,
          description: description || null,
          url: effectiveUrl,
          file_path: nextFilePath,
          mime_type: nextMimeType,
          category: sectionName,
          section_id: resourceSectionId || null,
          resource_kind: nextFilePath ? "file" : "link",
          metadata: nextMetadata,
          updated_by_name: actorName,
          created_by_name: existing?.created_by_name || actorName,
          created_at: existing?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
          sort_order: existing?.sort_order ?? (maxSort + 10),
        };
        const nextItems = editingItemId
          ? items.map((item) => (item.id === editingItemId ? legacyPayload : item))
          : [legacyPayload, ...items];
        await persistLegacyItems(nextItems);
      } else if (editingItemId) {
        const { error } = await supabase
          .from("resource_library_items")
          .update(payload)
          .eq("id", editingItemId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("resource_library_items").insert({
          ...payload,
          created_by_user_id: actorUserId,
          created_by_name: actorName,
        });
        if (error) throw error;
      }

      addGlobalToast(editingItemId ? "Resource updated" : "Resource added", "success");
      setShowEditorModal(false);
      resetResourceEditor();
      await loadData();
    } catch (error) {
      console.error("Failed to save resource", error);
      addGlobalToast(error.message || "Failed to save resource", "error");
    } finally {
      setSavingResource(false);
    }
  };

  const handleDeleteResource = async (itemId) => {
    const target = items.find((item) => item.id === itemId);
    if (!target) return;

    try {
      if (target.file_path) {
        await supabase.storage.from(getResourceBucket(target)).remove([target.file_path]);
      }
      if (resourceMode === "legacy") {
        await persistLegacyItems(items.filter((item) => item.id !== itemId));
      } else {
        const { error } = await supabase.from("resource_library_items").delete().eq("id", itemId);
        if (error) throw error;
      }
      addGlobalToast("Resource removed");
      await loadData();
    } catch (error) {
      console.error("Failed to delete resource", error);
      addGlobalToast(error.message || "Failed to delete resource", "error");
    }
  };

  const refreshSectionDrafts = useCallback(() => {
    setSectionDrafts(sections.map((section) => ({ ...section })));
  }, [sections]);

  const persistSectionOrder = useCallback(async (drafts) => {
    if (!drafts.length) return;
    setSavingOrder(true);
    try {
      if (resourceMode === "legacy") {
        await persistLegacySections(drafts.map((section, index) => ({
          ...section,
          sort_order: (index + 1) * 10,
        })));
      } else {
        const results = await Promise.all(drafts.map((section, index) => {
          return supabase
            .from("resource_library_sections")
            .update({
              sort_order: (index + 1) * 10,
              updated_by_user_id: actorUserId,
              updated_by_name: actorName,
            })
            .eq("id", section.id);
        }));
        const failedMutation = results.find((result) => result.error);
        if (failedMutation?.error) throw failedMutation.error;
      }
      await loadData();
    } catch (error) {
      console.error("Failed to save section order", error);
      addGlobalToast(error.message || "Failed to save section order", "error");
    } finally {
      setSavingOrder(false);
    }
  }, [actorName, actorUserId, addGlobalToast, loadData, persistLegacySections, resourceMode]);

  const handleDropSection = async (targetId) => {
    if (!draggingSectionId || draggingSectionId === targetId) return;
    const reordered = [...sectionDrafts];
    const fromIndex = reordered.findIndex((section) => section.id === draggingSectionId);
    const toIndex = reordered.findIndex((section) => section.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setDraggingSectionId(null);
    setSectionDrafts(reordered);
    await persistSectionOrder(reordered);
  };

  const handleCreateSection = async () => {
    const name = normalizeName(newSectionName);
    if (!name) return;
    if (sectionDrafts.some((section) => normalizeName(section.name).toLowerCase() === name.toLowerCase())) {
      addGlobalToast("That section already exists", "warning");
      return;
    }

    setSavingSections(true);
    try {
      const nextSort = (sectionDrafts.length + 1) * 10;
      if (resourceMode === "legacy") {
        await persistLegacySections([
          ...sectionDrafts,
          { id: buildLegacySectionId(name), name, sort_order: nextSort },
        ]);
      } else {
        const { error } = await supabase.from("resource_library_sections").insert({
          location_id: locationId,
          name,
          sort_order: nextSort,
          created_by_user_id: actorUserId,
          created_by_name: actorName,
          updated_by_user_id: actorUserId,
          updated_by_name: actorName,
        });
        if (error) throw error;
      }
      setNewSectionName("");
      addGlobalToast("Section added", "success");
      await loadData();
    } catch (error) {
      console.error("Failed to create section", error);
      addGlobalToast(error.message || "Failed to create section", "error");
    } finally {
      setSavingSections(false);
    }
  };

  const handleRenameSection = async (sectionId, name) => {
    const trimmed = normalizeName(name);
    if (!trimmed) {
      addGlobalToast("Section name cannot be blank", "warning");
      return;
    }

    setSavingSections(true);
    try {
      if (resourceMode === "legacy") {
        const nextSections = sections.map((section) => (
          section.id === sectionId
            ? { ...section, name: trimmed }
            : section
        ));
        const nextItems = items.map((item) => (
          item.section_id === sectionId
            ? { ...item, category: trimmed, section_id: sectionId, updated_by_name: actorName, updated_at: new Date().toISOString() }
            : item
        ));
        await Promise.all([
          persistLegacySections(nextSections),
          persistLegacyItems(nextItems),
        ]);
      } else {
        const { error } = await supabase
          .from("resource_library_sections")
          .update({
            name: trimmed,
            updated_by_user_id: actorUserId,
            updated_by_name: actorName,
          })
          .eq("id", sectionId);
        if (error) throw error;

        const renameResults = await Promise.all(
          items
            .filter((item) => item.section_id === sectionId)
            .map((item) => supabase
              .from("resource_library_items")
              .update({
                category: trimmed,
                updated_by_user_id: actorUserId,
                updated_by_name: actorName,
              })
              .eq("id", item.id)),
        );
        const failedRename = renameResults.find((result) => result.error);
        if (failedRename?.error) throw failedRename.error;
      }

      addGlobalToast("Section updated", "success");
      await loadData();
    } catch (error) {
      console.error("Failed to rename section", error);
      addGlobalToast(error.message || "Failed to rename section", "error");
    } finally {
      setSavingSections(false);
    }
  };

  const handleDeleteSection = async (sectionId) => {
    setSavingSections(true);
    try {
      const impactedItems = items.filter((item) => item.section_id === sectionId);
      if (resourceMode === "legacy") {
        const nextItems = items.map((item) => (
          item.section_id === sectionId
            ? { ...item, section_id: null, category: null, updated_by_name: actorName, updated_at: new Date().toISOString() }
            : item
        ));
        const nextSections = sections.filter((section) => section.id !== sectionId);
        await Promise.all([
          persistLegacyItems(nextItems),
          persistLegacySections(nextSections),
        ]);
      } else {
        const resetResults = await Promise.all(impactedItems.map((item) => (
          supabase
            .from("resource_library_items")
            .update({
              section_id: null,
              category: null,
              updated_by_user_id: actorUserId,
              updated_by_name: actorName,
            })
            .eq("id", item.id)
        )));
        const failedReset = resetResults.find((result) => result.error);
        if (failedReset?.error) throw failedReset.error;

        const { error } = await supabase.from("resource_library_sections").delete().eq("id", sectionId);
        if (error) throw error;
      }

      if (activeSectionId === sectionId) setActiveSectionId("all");
      addGlobalToast("Section deleted");
      await loadData();
    } catch (error) {
      console.error("Failed to delete section", error);
      addGlobalToast(error.message || "Failed to delete section", "error");
    } finally {
      setSavingSections(false);
    }
  };

  const resourceManagerItems = useMemo(() => {
    return [...items].sort((left, right) => {
      const leftSection = sectionMap[left.section_id]?.name || "";
      const rightSection = sectionMap[right.section_id]?.name || "";
      return leftSection.localeCompare(rightSection) || left.title.localeCompare(right.title);
    });
  }, [items, sectionMap]);

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 0 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: C.text }}>Resources</h1>
          <div style={{ fontSize: 13, color: C.textMut, marginTop: 4 }}>
            Organize SOPs, marketing files, HR links, and operational references into reusable resort sections.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn variant="secondary" onClick={() => { refreshSectionDrafts(); setShowSectionsModal(true); }}>Manage Sections</Btn>
          <Btn variant="primary" onClick={() => setShowResourcesModal(true)}>Manage Resources</Btn>
        </div>
      </div>

      {resourceMode === "legacy" ? (
        <Card style={{ padding: 14, marginBottom: 18, border: `1px solid ${C.warn}33`, background: C.warnLt }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.warn, marginBottom: 4 }}>Compatibility Mode</div>
          <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.55 }}>
            The canonical resource-section tables are not in this Supabase project yet, so this preview is using legacy settings storage until the migration is applied.
          </div>
        </Card>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 18 }}>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Total Resources</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.pri }}>{counts.total}</div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Files</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#2563EB" }}>{counts.files}</div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Links</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#8B5CF6" }}>{counts.links}</div>
        </Card>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <button
          type="button"
          onClick={() => setActiveSectionId("all")}
          style={{
            padding: "10px 16px",
            borderRadius: 12,
            border: `1.5px solid ${activeSectionId === "all" ? C.pri : C.border}`,
            background: activeSectionId === "all" ? C.priLt : "#fff",
            color: activeSectionId === "all" ? C.pri : C.textSec,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          All
        </button>
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => setActiveSectionId(section.id)}
            style={{
              padding: "10px 16px",
              borderRadius: 12,
              border: `1.5px solid ${activeSectionId === section.id ? C.pri : C.border}`,
              background: activeSectionId === section.id ? C.priLt : "#fff",
              color: activeSectionId === section.id ? C.pri : C.textSec,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {section.name}
          </button>
        ))}
      </div>

      {loading ? (
        <Card style={{ padding: 36, textAlign: "center", color: C.textMut }}>Loading resources…</Card>
      ) : visibleItems.length === 0 ? (
        <EmptyState
          title={activeSectionId === "all" ? "No resources yet" : "No resources in this section"}
          subtitle={activeSectionId === "all" ? "Use Manage Resources to add SOPs, HR links, trackers, or marketing files." : "Use Manage Resources to assign files or links into this section."}
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {visibleItems.map((item) => {
            const section = sectionMap[item.section_id] || null;
            const isFile = !!item.file_path;
            return (
              <Card key={item.id} style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{item.title}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      <Badge color="default">{section?.name || "Unsectioned"}</Badge>
                      {isFile ? <Badge color="success">File</Badge> : null}
                      {item.url ? <Badge color="warning">Link</Badge> : null}
                    </div>
                  </div>
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: isFile ? "#DBEAFE" : "#F5F3FF",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: isFile ? "#2563EB" : "#7C3AED",
                      flexShrink: 0,
                    }}
                  >
                    {isFile ? <I.FileText /> : <I.Link />}
                  </div>
                </div>
                {item.description ? (
                  <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.6 }}>{item.description}</div>
                ) : (
                  <div style={{ fontSize: 13, color: C.textMut, fontStyle: "italic" }}>No description added</div>
                )}
                <div style={{ display: "grid", gap: 4, fontSize: 12, color: C.textMut }}>
                  {item.file_path ? (
                    <div>
                      File: <strong style={{ color: C.text }}>{item.metadata?.file_name || item.metadata?.legacy_file_name || item.file_path.split("/").pop()}</strong>
                      {(item.metadata?.file_size || item.metadata?.legacy_file_size)
                        ? ` · ${formatBytes(item.metadata?.file_size || item.metadata?.legacy_file_size)}`
                        : ""}
                    </div>
                  ) : null}
                  {item.url ? (
                    <div>
                      Link: <strong style={{ color: C.text }}>{item.url.replace(/^https?:\/\//, "")}</strong>
                    </div>
                  ) : null}
                  <div>Updated {fmtDate(item.updated_at)} by {item.updated_by_name || item.created_by_name || "Staff"}</div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                  <Btn variant="primary" onClick={() => handleOpen(item)} disabled={openingId === item.id}>
                    {openingId === item.id ? "Opening…" : "Open"}
                  </Btn>
                  <Btn variant="secondary" onClick={() => openEditResource(item)}>Edit</Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {showResourcesModal ? (
        <Modal title="Manage Resources" onClose={() => setShowResourcesModal(false)}>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13, color: C.textMut }}>
                Add, edit, or delete resource records without changing the section layout.
              </div>
              <Btn variant="primary" onClick={openCreateResource}>Add Resource</Btn>
            </div>
            {resourceManagerItems.length === 0 ? (
              <EmptyState title="No resources yet" subtitle="Add your first file or link for this resort." />
            ) : (
              <div style={{ display: "grid", gap: 10, maxHeight: "60vh", overflowY: "auto", paddingRight: 4 }}>
                {resourceManagerItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      gap: 12,
                      alignItems: "center",
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: `1px solid ${C.border}`,
                      background: "#fff",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: C.textMut, marginTop: 4 }}>
                        {(sectionMap[item.section_id]?.name || "Unsectioned")} · {item.file_path ? "File" : "Link"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <Btn variant="ghost" size="sm" onClick={() => handleOpen(item)}>Open</Btn>
                      <Btn variant="secondary" size="sm" onClick={() => openEditResource(item)}>Edit</Btn>
                      <Btn variant="ghost" size="sm" onClick={() => handleDeleteResource(item.id)} style={{ color: C.dan }}>Delete</Btn>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      ) : null}

      {showSectionsModal ? (
        <Modal title="Manage Sections" onClose={() => setShowSectionsModal(false)}>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8 }}>
              <input
                value={newSectionName}
                onChange={(event) => setNewSectionName(event.target.value)}
                placeholder="HR"
                style={{ padding: "11px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, fontFamily: "inherit" }}
              />
              <Btn variant="primary" onClick={handleCreateSection} disabled={savingSections || !normalizeName(newSectionName)}>
                {savingSections ? "Saving…" : "Add Section"}
              </Btn>
            </div>
            <div style={{ fontSize: 12, color: C.textMut }}>
              Drag sections to reorder the tab strip. Deleting a section keeps its resources in <strong>All</strong> until you reassign them.
            </div>
            {sectionDrafts.length === 0 ? (
              <EmptyState title="No sections yet" subtitle="Add tabs for HR, Operations, Marketing, or any resort-specific grouping." />
            ) : (
              <div style={{ display: "grid", gap: 10, maxHeight: "60vh", overflowY: "auto", paddingRight: 4 }}>
                {sectionDrafts.map((section, index) => (
                  <div
                    key={section.id}
                    draggable
                    onDragStart={() => setDraggingSectionId(section.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleDropSection(section.id)}
                    onDragEnd={() => setDraggingSectionId(null)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto minmax(0, 1fr) auto",
                      gap: 12,
                      alignItems: "center",
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: `1px solid ${draggingSectionId === section.id ? C.pri : C.border}`,
                      background: draggingSectionId === section.id ? C.priLt : "#fff",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, color: C.textMut }}>
                      <span style={{ fontSize: 11, fontWeight: 800, minWidth: 18 }}>{index + 1}</span>
                      <span style={{ cursor: "grab", display: "inline-flex", alignItems: "center" }} title="Drag to reorder">
                        <I.GripVertical />
                      </span>
                    </div>
                    <input
                      value={section.name}
                      onChange={(event) => setSectionDrafts((current) => current.map((row) => (
                        row.id === section.id ? { ...row, name: event.target.value } : row
                      )))}
                      onBlur={(event) => {
                        if (normalizeName(event.target.value) !== normalizeName(sectionMap[section.id]?.name)) {
                          handleRenameSection(section.id, event.target.value);
                        }
                      }}
                      style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", width: "100%" }}
                    />
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <Btn variant="ghost" size="sm" onClick={() => handleDeleteSection(section.id)} style={{ color: C.dan }}>
                        Delete
                      </Btn>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {savingOrder ? <div style={{ fontSize: 11, color: C.textMut }}>Saving section order…</div> : null}
          </div>
        </Modal>
      ) : null}

      {showEditorModal ? (
        <Modal title={editingItemId ? "Edit Resource" : "Add Resource"} onClose={() => { setShowEditorModal(false); resetResourceEditor(); }}>
          <div style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Title</span>
              <input
                value={resourceTitle}
                onChange={(event) => setResourceTitle(event.target.value)}
                placeholder="Adair Forsythe Operations SOP"
                style={{ padding: "11px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, fontFamily: "inherit" }}
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Section</span>
              <select
                value={resourceSectionId}
                onChange={(event) => setResourceSectionId(event.target.value)}
                style={{ padding: "11px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", background: "#fff" }}
              >
                <option value="">No section</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>{section.name}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Description</span>
              <textarea
                value={resourceDescription}
                onChange={(event) => setResourceDescription(event.target.value)}
                placeholder="What this resource is for and when the team should use it"
                rows={4}
                style={{ padding: "11px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", resize: "vertical" }}
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>External Link</span>
              <input
                value={resourceUrl}
                onChange={(event) => setResourceUrl(event.target.value)}
                placeholder="https://…"
                style={{ padding: "11px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, fontFamily: "inherit" }}
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Upload File</span>
              <input type="file" onChange={(event) => setPendingFile(event.target.files?.[0] || null)} style={{ fontSize: 13 }} />
              <div style={{ fontSize: 12, color: C.textMut }}>
                {pendingFile
                  ? `${pendingFile.name} · ${formatBytes(pendingFile.size)}`
                  : editingItemId && items.find((item) => item.id === editingItemId)?.file_path
                    ? `Current file: ${items.find((item) => item.id === editingItemId)?.metadata?.file_name || items.find((item) => item.id === editingItemId)?.metadata?.legacy_file_name || items.find((item) => item.id === editingItemId)?.file_path.split("/").pop()}`
                    : "Optional. You can save a link, a file, or both."}
              </div>
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="ghost" onClick={() => { setShowEditorModal(false); resetResourceEditor(); }}>Cancel</Btn>
              <Btn variant="primary" onClick={handleSaveResource} disabled={savingResource || !normalizeName(resourceTitle)}>
                {savingResource ? "Saving…" : editingItemId ? "Save Changes" : "Add Resource"}
              </Btn>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

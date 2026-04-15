import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C, fmtDate } from "../../shared/theme";
import { Badge, Btn, Card, Modal } from "../../shared/ui";

const RESOURCE_SETTING_KEY = "resource_library_items";
const RESOURCE_BUCKET = "vaccine-records";

function makeId() {
  return `resource_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeFilename(name) {
  return String(name || "file")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 120) || "file";
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function EmptyState({ title, subtitle }) {
  return (
    <Card style={{ padding: 36, textAlign: "center", color: C.textMut }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>{title}</div>
      {subtitle ? <div style={{ fontSize: 13 }}>{subtitle}</div> : null}
    </Card>
  );
}

export default function ResourcesPage({ profile, addGlobalToast = () => {} }) {
  const locationId = profile?.location_id || "";
  const actorName = profile?.full_name || profile?.name || profile?.email || "Staff";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Operations");
  const [description, setDescription] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [openingId, setOpeningId] = useState(null);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const aPinned = a.category === "HR" ? 1 : 0;
      const bPinned = b.category === "HR" ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    });
  }, [items]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setTitle("");
    setCategory("Operations");
    setDescription("");
    setLinkUrl("");
    setPendingFile(null);
  }, []);

  const loadItems = useCallback(async () => {
    if (!locationId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("lite_settings")
      .select("setting_value")
      .eq("location_id", locationId)
      .eq("setting_key", RESOURCE_SETTING_KEY)
      .maybeSingle();
    if (error) {
      console.error("Failed to load resources", error);
      addGlobalToast("Failed to load resources", "error");
      setLoading(false);
      return;
    }
    const nextItems = Array.isArray(data?.setting_value?.items) ? data.setting_value.items : [];
    setItems(nextItems);
    setLoading(false);
  }, [addGlobalToast, locationId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const persistItems = useCallback(async (nextItems) => {
    const payload = {
      items: nextItems,
      updatedAt: new Date().toISOString(),
    };
    const { error } = await supabase.from("lite_settings").upsert({
      location_id: locationId,
      setting_key: RESOURCE_SETTING_KEY,
      setting_value: payload,
    }, { onConflict: "location_id,setting_key" });
    if (error) throw error;
    setItems(nextItems);
  }, [locationId]);

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setTitle(item.title || "");
    setCategory(item.category || "Operations");
    setDescription(item.description || "");
    setLinkUrl(item.linkUrl || "");
    setPendingFile(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!locationId || !title.trim()) return;
    setSaving(true);
    try {
      let fileMeta = null;
      if (pendingFile) {
        const ext = pendingFile.name.split(".").pop()?.toLowerCase() || "bin";
        const path = `resource-library/${locationId}/${Date.now()}-${sanitizeFilename(pendingFile.name)}`;
        const { error: uploadError } = await supabase.storage
          .from(RESOURCE_BUCKET)
          .upload(path, pendingFile, { contentType: pendingFile.type || "application/octet-stream", upsert: false });
        if (uploadError) throw uploadError;
        fileMeta = {
          bucket: RESOURCE_BUCKET,
          path,
          name: pendingFile.name,
          type: pendingFile.type || ext,
          size: pendingFile.size || 0,
        };
      }

      const existing = editingId ? items.find((item) => item.id === editingId) : null;
      const resourceRecord = {
        id: editingId || makeId(),
        title: title.trim(),
        category: category.trim() || "Operations",
        description: description.trim(),
        linkUrl: linkUrl.trim(),
        file: fileMeta || existing?.file || null,
        updatedAt: new Date().toISOString(),
        updatedBy: actorName,
      };
      const nextItems = editingId
        ? items.map((item) => (item.id === editingId ? resourceRecord : item))
        : [resourceRecord, ...items];
      await persistItems(nextItems);
      setShowModal(false);
      resetForm();
      addGlobalToast(editingId ? "Resource updated" : "Resource added", "success");
    } catch (error) {
      console.error("Failed to save resource", error);
      addGlobalToast(error.message || "Failed to save resource", "error");
    }
    setSaving(false);
  };

  const handleDelete = async (itemId) => {
    const target = items.find((item) => item.id === itemId);
    if (!target) return;
    try {
      if (target.file?.bucket && target.file?.path) {
        await supabase.storage.from(target.file.bucket).remove([target.file.path]);
      }
      await persistItems(items.filter((item) => item.id !== itemId));
      addGlobalToast("Resource removed");
    } catch (error) {
      console.error("Failed to delete resource", error);
      addGlobalToast(error.message || "Failed to delete resource", "error");
    }
  };

  const handleOpen = async (item) => {
    try {
      setOpeningId(item.id);
      if (item.linkUrl) {
        window.open(item.linkUrl, "_blank", "noopener,noreferrer");
        return;
      }
      if (item.file?.bucket && item.file?.path) {
        const { data, error } = await supabase.storage.from(item.file.bucket).createSignedUrl(item.file.path, 60 * 60);
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

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 0 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: C.text }}>Resources</h1>
          <div style={{ fontSize: 13, color: C.textMut, marginTop: 4 }}>
            Upload SOPs, marketing files, HR links, and other recurring operational references.
          </div>
        </div>
        <Btn variant="primary" onClick={openCreate}>Add Resource</Btn>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 18 }}>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Total Resources</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.pri }}>{items.length}</div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Files</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#2563EB" }}>{items.filter((item) => item.file?.path).length}</div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Links</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#8B5CF6" }}>{items.filter((item) => item.linkUrl).length}</div>
        </Card>
      </div>

      {loading ? (
        <Card style={{ padding: 36, textAlign: "center", color: C.textMut }}>Loading resources…</Card>
      ) : sortedItems.length === 0 ? (
        <EmptyState title="No resources yet" subtitle="Add SOPs, HR links, trackers, or marketing files for this resort." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {sortedItems.map((item) => (
            <Card key={item.id} style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{item.title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    <Badge color="default">{item.category || "Operations"}</Badge>
                    {item.file?.path ? <Badge color="success">File</Badge> : null}
                    {item.linkUrl ? <Badge color="warning">Link</Badge> : null}
                  </div>
                </div>
              </div>
              {item.description ? (
                <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.6 }}>{item.description}</div>
              ) : (
                <div style={{ fontSize: 13, color: C.textMut, fontStyle: "italic" }}>No description added</div>
              )}
              <div style={{ display: "grid", gap: 4, fontSize: 12, color: C.textMut }}>
                {item.file?.name ? <div>File: <strong style={{ color: C.text }}>{item.file.name}</strong>{item.file.size ? ` · ${formatBytes(item.file.size)}` : ""}</div> : null}
                {item.linkUrl ? <div>Link: <strong style={{ color: C.text }}>{item.linkUrl.replace(/^https?:\/\//, "")}</strong></div> : null}
                <div>Updated {fmtDate(item.updatedAt)} by {item.updatedBy || "Staff"}</div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                <Btn variant="primary" onClick={() => handleOpen(item)} disabled={openingId === item.id}>
                  {openingId === item.id ? "Opening…" : "Open"}
                </Btn>
                <Btn variant="secondary" onClick={() => openEdit(item)}>Edit</Btn>
                <Btn variant="ghost" onClick={() => handleDelete(item.id)} style={{ color: C.dan }}>Delete</Btn>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={editingId ? "Edit Resource" : "Add Resource"} onClose={() => { setShowModal(false); resetForm(); }}>
          <div style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Title</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Adair Forsythe operations SOP" style={{ padding: "11px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, fontFamily: "inherit" }} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)} style={{ padding: "11px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", background: "#fff" }}>
                {["Operations", "HR", "Marketing", "Training", "Safety", "Other"].map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Description</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What this resource is for and when the team should use it" rows={4} style={{ padding: "11px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", resize: "vertical" }} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>External Link</span>
              <input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://…" style={{ padding: "11px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, fontFamily: "inherit" }} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Upload File</span>
              <input type="file" onChange={(event) => setPendingFile(event.target.files?.[0] || null)} style={{ fontSize: 13 }} />
              <div style={{ fontSize: 12, color: C.textMut }}>
                {pendingFile
                  ? `${pendingFile.name} · ${formatBytes(pendingFile.size)}`
                  : editingId && items.find((item) => item.id === editingId)?.file?.name
                    ? `Current file: ${items.find((item) => item.id === editingId)?.file?.name}`
                    : "Optional. You can save a link, a file, or both."}
              </div>
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="ghost" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</Btn>
              <Btn variant="primary" onClick={handleSave} disabled={saving || !title.trim()}>
                {saving ? "Saving…" : editingId ? "Save Changes" : "Add Resource"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
